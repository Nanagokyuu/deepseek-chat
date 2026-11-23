import { strFromU8, unzipSync } from 'fflate'
import { resizeUploadImage } from '../utils/resizeUploadImage.js'
import { loadFile } from './chat/db.js'
import type { FileAttachment, UserMessage } from './chat/types.js'

export type ResolvedAttachment =
  | {
      kind: 'image'
      name: string
      mimeType: string
      base64: string
    }
  | {
      kind: 'pdf-binary'
      name: string
      mimeType: 'application/pdf'
      base64: string
    }
  | {
      kind: 'text'
      name: string
      text: string
    }

const MAX_TEXT_CHARS = 60_000
const MAX_INLINE_PDF_BYTES = 10 * 1024 * 1024

const getExt = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : ''
      const idx = res.indexOf(',')
      resolve(idx >= 0 ? res.slice(idx + 1) : res)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to encode file'))
    reader.readAsDataURL(blob)
  })

const extractPdfText = async (buffer: ArrayBuffer): Promise<string> => {
  const pdfjs = await import('pdfjs-dist')
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
  }).promise
  const pages: string[] = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const line = content.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .trim()
      if (line) {
        pages.push(`--- Page ${i} ---\n${line}`)
      }
      if (pages.join('\n').length >= MAX_TEXT_CHARS) {
        break
      }
    }
  } finally {
    await doc.cleanup()
  }
  return pages.join('\n\n').slice(0, MAX_TEXT_CHARS)
}

const extractDocxText = async (buffer: ArrayBuffer): Promise<string> => {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value.trim().slice(0, MAX_TEXT_CHARS)
}

const extractPptxText = (bytes: Uint8Array): string => {
  const entries = unzipSync(bytes)
  const slideNames = Object.keys(entries)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const parser = new DOMParser()
  const slides: string[] = []
  for (const name of slideNames) {
    const xml = strFromU8(entries[name])
    const doc = parser.parseFromString(xml, 'application/xml')
    const texts = Array.from(doc.getElementsByTagName('a:t'))
      .map((node) => node.textContent?.trim() ?? '')
      .filter(Boolean)
    if (texts.length > 0) {
      slides.push(`[${name.replace('ppt/slides/', '')}]\n${texts.join(' ')}`)
    }
  }
  return slides.join('\n\n').slice(0, MAX_TEXT_CHARS)
}

const extractXlsxText = (bytes: Uint8Array): string => {
  const entries = unzipSync(bytes)
  const parser = new DOMParser()
  const sharedStrings: string[] = []
  if (entries['xl/sharedStrings.xml']) {
    const ssDoc = parser.parseFromString(
      strFromU8(entries['xl/sharedStrings.xml']),
      'application/xml'
    )
    for (const si of Array.from(ssDoc.getElementsByTagName('si'))) {
      const text = Array.from(si.getElementsByTagName('t'))
        .map((n) => n.textContent ?? '')
        .join('')
      sharedStrings.push(text)
    }
  }
  const sheetNames = Object.keys(entries)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const sheets: string[] = []
  for (const name of sheetNames) {
    const doc = parser.parseFromString(strFromU8(entries[name]), 'application/xml')
    const rows: string[] = []
    for (const row of Array.from(doc.getElementsByTagName('row'))) {
      const cells = Array.from(row.getElementsByTagName('c')).map((cell) => {
        const type = cell.getAttribute('t')
        const value = cell.getElementsByTagName('v')[0]?.textContent ?? ''
        if (type === 's') {
          return sharedStrings[Number(value)] ?? ''
        }
        if (type === 'inlineStr') {
          return cell.getElementsByTagName('t')[0]?.textContent ?? ''
        }
        return value
      })
      if (cells.some(Boolean)) {
        rows.push(cells.join('\t'))
      }
    }
    if (rows.length > 0) {
      sheets.push(`[${name.replace('xl/worksheets/', '')}]\n${rows.join('\n')}`)
    }
  }
  return sheets.join('\n\n').slice(0, MAX_TEXT_CHARS)
}

/**
 * 将本地附件转换为非 DeepSeek 厂商可消费的结构（图片 Base64、原生 PDF 或客户端提取的文本）。
 */
export const resolveAttachmentForCompat = async (
  file: FileAttachment,
  preferNativePdf: boolean,
  signal?: AbortSignal
): Promise<ResolvedAttachment | null> => {
  const blob = await loadFile(file.id)
  if (!blob) {
    return null
  }
  signal?.throwIfAborted()

  if (file.isImage) {
    const rawFile =
      blob instanceof File
        ? blob
        : new File([blob], file.name, { type: file.mimeType || blob.type })
    const resized = await resizeUploadImage(rawFile, signal)
    const mimeType = resized.type || file.mimeType || 'image/png'
    const base64 = await blobToBase64(resized)
    return { kind: 'image', name: file.name, mimeType, base64 }
  }

  const ext = getExt(file.name)
  if (ext === 'pdf') {
    if (preferNativePdf && blob.size <= MAX_INLINE_PDF_BYTES) {
      const base64 = await blobToBase64(blob)
      return { kind: 'pdf-binary', name: file.name, mimeType: 'application/pdf', base64 }
    }
    const text = await extractPdfText(await blob.arrayBuffer())
    return {
      kind: 'text',
      name: file.name,
      text: text || '[PDF contains no extractable text]',
    }
  }

  if (ext === 'docx') {
    const text = await extractDocxText(await blob.arrayBuffer())
    return { kind: 'text', name: file.name, text }
  }

  if (ext === 'pptx') {
    const text = extractPptxText(new Uint8Array(await blob.arrayBuffer()))
    return { kind: 'text', name: file.name, text }
  }

  if (ext === 'xlsx') {
    const text = extractXlsxText(new Uint8Array(await blob.arrayBuffer()))
    return { kind: 'text', name: file.name, text }
  }

  // 纯文本 / 代码 / 配置 / CSV 等直接读取文本
  const text = (await blob.text()).slice(0, MAX_TEXT_CHARS)
  return { kind: 'text', name: file.name, text }
}

/**
 * 批量提取用户消息附件并按索引映射，供非 DeepSeek 适配器在构造请求体时消费。
 */
export const resolveUserAttachmentsMap = async (
  messages: UserMessage[],
  preferNativePdf: boolean,
  signal?: AbortSignal
): Promise<Map<string, ResolvedAttachment[]>> => {
  const map = new Map<string, ResolvedAttachment[]>()
  for (const msg of messages) {
    if (msg.files.length === 0) {
      continue
    }
    const resolved: ResolvedAttachment[] = []
    for (const file of msg.files) {
      const item = await resolveAttachmentForCompat(file, preferNativePdf, signal)
      if (item) {
        resolved.push(item)
      }
    }
    if (resolved.length > 0) {
      map.set(msg.id, resolved)
    }
  }
  return map
}
