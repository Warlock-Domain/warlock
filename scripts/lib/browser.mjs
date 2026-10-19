// Chrome sem janela dos scripts headless: perfil fixo do Playwright (com os logins) e WebGL por software.
import { chromium } from 'file:///C:/nvm4w/nodejs/node_modules/@playwright/mcp/node_modules/playwright-core/index.mjs';

export const openChrome = (opts) => chromium.launchPersistentContext('C:/Users/ferna/AppData/Local/ms-playwright/mcp-chrome-7a379eb', {
  channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...opts,
});
