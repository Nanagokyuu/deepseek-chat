# DeepSeek Chat（多厂商兼容 & 全平台客户端）

[English](README.md) | 简体中文

基于 [`deepseek-ai/chat-demo`](https://github.com/deepseek-ai/chat-demo) 改造的跨平台、多 AI 厂商通用聊天客户端。完整保留 DeepSeek 原生 API 体验，同时支持接入 **OpenAI 兼容、Anthropic (Claude)、Google Gemini** 等主流服务商，并集成 **Capacitor**（Android / iOS）与 **Capacitor-Electron**（Windows / macOS / Linux）全平台打包方案。

## 核心特性

- **多厂商 API 接入**：内置 **DeepSeek、OpenAI、Anthropic (Claude)、Google Gemini、OpenRouter、硅基流动 (SiliconFlow)、阿里云百炼 (DashScope)、Ollama** 预设，支持自定义 Base URL、自动拉取模型列表及连接测试。
- **DeepSeek 原生与第三方双轨兼容**：
  - **深度思考**：使用 DeepSeek 时保留原生开关；使用其他支持多档位的模型时提供 `关 / 低 / 中 / 高` 档位切换，兼容 OpenAI `reasoning_effort`、Anthropic `thinking.budget_tokens`、Gemini `thinkingConfig` 以及流式 `reasoning_content` / `<think>...</think>` 自动拆流。
  - **联网搜索**：DeepSeek 与 Gemini 优先走原生服务端搜索；其他厂商支持配置 **Tavily、Brave Search、Serper、SearXNG** 客户端搜索，无缝复用内置搜索来源面板与角标引用 UI。
  - **链接阅读**：DeepSeek 走原生 `deepseek_read_url`；其他厂商自动使用客户端 `@mozilla/readability` 提取网页正文，并在跨域或受限时回退至 **Jina Reader**。
  - **语音输入 (ASR) 与朗读 (TTS)**：支持 DeepSeek 原生接口、OpenAI 兼容 `/audio/transcriptions` 与 `/audio/speech`（24kHz PCM 流），以及系统原生语音兜底，非 DeepSeek 朗读前自动进行客户端 Markdown 清洗。
  - **文件上传兼容层**：DeepSeek 保留原生 Files API；其他厂商自动转换为 Base64 图片/原生 PDF，或通过客户端按需解析（`pdfjs-dist` 解析 PDF、`mammoth` 解析 `.docx`、`fflate` 解析 `.pptx`/`.xlsx` 以及纯文本/代码直读）。
- **完整聊天体验**：多会话管理、消息分支与编辑、首轮自动标题、Markdown、代码高亮、KaTeX 公式、Mermaid 图表、ZIP 历史导入导出、浅色/深色主题与移动端安全区适配。
- **全平台分发**：支持静态 Web 部署、Capacitor 8 移动端打包（Android / iOS）与 `@capawesome/capacitor-electron` 桌面端打包（Windows / macOS / Linux）。

## 快速开始

环境要求：**Node.js 22.12+** 与 **pnpm**：

```sh
git clone https://github.com/Nanagokyuu/deepseek-chat.git
cd deepseek-chat
pnpm install
pnpm dev
```

浏览器访问 `http://localhost:8090`。

### 静态 Web 构建

```sh
pnpm build
```

产物输出在 `dist/` 目录（自动包含 `LICENSE` 与 `LICENSE-MIT`）。

## 移动端打包 (Capacitor)

```sh
# 构建前端产物并同步至 Android / iOS 工程
pnpm cap:sync

# 打开原生 IDE 进行构建或真机调试
pnpm cap:android
pnpm cap:ios
```

## 桌面端打包 (Capacitor-Electron)

首次构建前需在 `electron/` 目录安装桌面端依赖：

```sh
cd electron && npm install && cd ..
```

运行或打包各平台安装包：

```sh
# 本地启动 Electron 桌面端
pnpm desktop:start

# 打包 Windows NSIS 安装器
pnpm desktop:pack:win

# 打包 macOS DMG 镜像
pnpm desktop:pack:mac

# 打包 Linux AppImage
pnpm desktop:pack:linux
```

> **Linux 发行版打包说明**：第一期默认构建 `AppImage`。`.deb`、`.rpm` 与 `.pkg.tar.zst`（`pacman`）的依赖元数据、入口配置及 Arch 模板已预先准备在 [electron/electron-builder.config.js](electron/electron-builder.config.js) 与 [electron/packaging/arch/PKGBUILD.template](electron/packaging/arch/PKGBUILD.template) 中，并在 [electron/package.json](electron/package.json) 预留了 `pack:linux:deb`、`pack:linux:rpm`、`pack:linux:pacman` 脚本供后续启用。

## 开发命令

| 命令          | 用途                   |
| ------------- | ---------------------- |
| `pnpm dev`    | 启动 Rspack 开发服务器 |
| `pnpm build`  | 构建生产产物到 `dist/` |
| `pnpm type`   | TypeScript 类型检查    |
| `pnpm lint`   | oxlint 代码规范检查    |
| `pnpm format` | oxfmt 代码格式化       |

## 许可证

本项目代码采用 **Mozilla Public License Version 2.0（[MPL-2.0](LICENSE)）** 开源，同时保留上游项目 `deepseek-ai/chat-demo` 的原始 **[MIT 许可证](LICENSE-MIT)**。构建静态产物与桌面端安装包时均会一并携带上述两份许可证文件。
