/**
 * 将 Markdown 文本清洗为适合 TTS 朗读的纯文本：
 * 去除代码块、表格、公式、引用角标、图片与格式符号。
 */
export const stripMarkdownForSpeech = (input: string): string => {
  return input
    .replace(/\[citation:\d+\]/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]+\$/g, ' ')
    .replace(/^\|.*\|$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
