// 第一期 Linux 默认仅构建 AppImage；后续如需启用 deb / rpm / pacman (.pkg.tar.zst)，
// 可传入环境变量 LINUX_TARGETS=AppImage,deb,rpm,pacman 或使用预置脚本。
const linuxTargets = process.env.LINUX_TARGETS
  ? process.env.LINUX_TARGETS.split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  : ['AppImage']

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'io.github.nanagokyuu.deepseekchat',
  productName: 'DeepSeek Chat',
  copyright: 'Copyright © 2026 DeepSeek Chat Contributors (MPL-2.0 / MIT)',
  directories: {
    output: 'dist',
    buildResources: 'assets',
  },
  files: [
    'build/**/*',
    'app/**/*',
    'generated/**/*',
    'assets/**/*',
    'package.json',
    { from: 'vendor/node_modules', to: 'node_modules' },
  ],
  extraResources: [
    { from: '../LICENSE', to: 'LICENSE' },
    { from: '../LICENSE-MIT', to: 'LICENSE-MIT' },
  ],

  // ---------------- Windows: NSIS 安装器 ----------------
  win: {
    target: [{ target: 'nsis', arch: ['x64', 'arm64'] }],
    artifactName: '${productName}-${version}-${arch}-setup.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'DeepSeek Chat',
    installerLanguages: ['zh_CN', 'en_US'],
    language: '2052',
    deleteAppDataOnUninstall: false,
  },

  // ---------------- macOS: DMG 镜像 ----------------
  mac: {
    category: 'public.app-category.productivity',
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    extendInfo: {
      NSMicrophoneUsageDescription: 'Used for voice input recording',
    },
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
  dmg: {
    title: '${productName} ${version}',
    window: { width: 540, height: 380 },
    contents: [
      { x: 140, y: 190 },
      { x: 400, y: 190, type: 'link', path: '/Applications' },
    ],
  },

  // ---------------- Linux: 第一期 AppImage，二期预备 deb / rpm / pacman (.pkg.tar.zst) ----------------
  linux: {
    target: linuxTargets,
    category: 'Network;Chat;Utility;',
    synopsis: 'Multi-provider AI Chat Client',
    description:
      'Cross-platform AI chat client supporting DeepSeek, OpenAI, Anthropic, and Gemini.',
    maintainer: 'Nanagokyuu <https://github.com/Nanagokyuu/deepseek-chat>',
    vendor: 'DeepSeek Chat',
    desktop: {
      entry: {
        Name: 'DeepSeek Chat',
        Comment: 'Multi-provider AI Chat Client',
        StartupWMClass: 'deepseek-chat',
      },
    },
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
  deb: {
    depends: [
      'libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'xdg-utils',
      'libatspi2.0-0',
      'libuuid1',
      'libsecret-1-0',
    ],
  },
  rpm: {
    depends: [
      'gtk3',
      'libnotify',
      'nss',
      'libXScrnSaver',
      'libXtst',
      'xdg-utils',
      'at-spi2-core',
      'libuuid',
      'libsecret',
    ],
  },
  pacman: {
    compression: 'zstd',
  },
}
