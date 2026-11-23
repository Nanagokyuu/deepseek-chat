# DeepSeek Chat (Multi-Provider & Cross-Platform)

English | [简体中文](README.zh-CN.md)

A cross-platform, multi-provider AI chat client built on top of [`deepseek-ai/chat-demo`](https://github.com/deepseek-ai/chat-demo). It preserves the native DeepSeek API experience while adding full support for OpenAI-compatible, Anthropic (Claude), and Google Gemini APIs, along with Capacitor mobile (Android / iOS) and Capacitor-Electron desktop (Windows / macOS / Linux) packaging.

## Highlights

- **Multi-Provider Support**: Built-in presets for **DeepSeek**, **OpenAI**, **Anthropic (Claude)**, **Google Gemini**, **OpenRouter**, **SiliconFlow**, **Alibaba DashScope**, and **Ollama**, plus custom provider endpoints and model fetching.
- **Dual-Track DeepSeek & Third-Party Capabilities**:
  - **Deep Thinking**: Native toggle for DeepSeek; adaptive effort levels (`Off` / `Low` / `Medium` / `High`) for OpenAI reasoning, Anthropic thinking budget, and Gemini thinkingConfig, plus streaming `reasoning_content` and `<think>...</think>` tag splitting.
  - **Web Search**: Native `deepseek_web_search` and Gemini `google_search` grounding; client-side **Tavily**, **Brave Search**, **Serper**, and **SearXNG** integration for other providers, reusing the built-in source panel and citations UI.
  - **Link Reading**: Native `deepseek_read_url` for DeepSeek; client-side `@mozilla/readability` extraction with automatic **Jina Reader** fallback for other providers.
  - **Voice Input (ASR) & Read Aloud (TTS)**: Supports DeepSeek native `/v1/tools/asr` & `/v1/tools/tts`, OpenAI-compatible Whisper & TTS (`/audio/transcriptions` & `/audio/speech` PCM stream), and system speech fallback with client-side Markdown filtering.
  - **Attachment Compatibility Layer**: Native Files API for DeepSeek; automatic Base64 image resizing, native PDF or client-side `pdfjs-dist` extraction, `.docx` (`mammoth`), `.pptx` / `.xlsx` (`fflate` XML parsing), and plain text / code injection for other providers.
- **Rich Chat Experience**: Multi-session management, message branching & editing, automatic title generation, Markdown, syntax highlighting, KaTeX math, Mermaid diagrams, ZIP history import/export, and light/dark themes.
- **Cross-Platform**: Runs as a static Web app, Android/iOS mobile app via **Capacitor 8**, and Windows/macOS/Linux desktop app via **`@capawesome/capacitor-electron`**.

## Getting Started

Requires **Node.js 22.12+** and **pnpm**:

```sh
git clone https://github.com/Nanagokyuu/deepseek-chat.git
cd deepseek-chat
pnpm install
pnpm dev
```

Open `http://localhost:8090`.

### Static Web Build

```sh
pnpm build
```

Output is generated in `dist/` (including `LICENSE` and `LICENSE-MIT`).

## Mobile Packaging (Capacitor)

```sh
# Build web bundle and sync Android & iOS native projects
pnpm cap:sync

# Open native IDEs
pnpm cap:android
pnpm cap:ios
```

## Desktop Packaging (Capacitor-Electron)

Install desktop dependencies once inside `electron/`:

```sh
cd electron && npm install && cd ..
```

Run or package for desktop targets:

```sh
# Run desktop app locally
pnpm desktop:start

# Windows (NSIS installer)
pnpm desktop:pack:win

# macOS (DMG image)
pnpm desktop:pack:mac

# Linux (AppImage)
pnpm desktop:pack:linux
```

> **Linux packages note**: Phase 1 targets `AppImage` by default. Configuration and metadata for `.deb`, `.rpm`, and `.pkg.tar.zst` (`pacman`) are pre-configured in [electron/electron-builder.config.js](electron/electron-builder.config.js) and [electron/packaging/arch/PKGBUILD.template](electron/packaging/arch/PKGBUILD.template), with dedicated scripts (`pack:linux:deb`, `pack:linux:rpm`, `pack:linux:pacman`) in [electron/package.json](electron/package.json).

## Development

| Command       | Description                        |
| ------------- | ---------------------------------- |
| `pnpm dev`    | Start Rspack dev server            |
| `pnpm build`  | Build production bundle to `dist/` |
| `pnpm type`   | Run TypeScript type check          |
| `pnpm lint`   | Run oxlint                         |
| `pnpm format` | Format code with oxfmt             |

## License

This project is licensed under the **Mozilla Public License Version 2.0 ([MPL-2.0](LICENSE))**, while preserving the original upstream **[MIT License](LICENSE-MIT)** from `deepseek-ai/chat-demo`. Both license files are copied to `dist/` and desktop resources during builds.
