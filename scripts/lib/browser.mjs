// Chrome sem janela dos scripts headless, com WebGL por software.
// PW_PROFILE: pasta de perfil persistente (opcional; sem ela, um perfil temporário). PW_CHANNEL: 'chrome' (padrão) ou 'chromium'
// (precisa de `npx playwright-core install chromium`).
import { chromium } from 'playwright-core';

export { chromium };
export const openChrome = (opts) => chromium.launchPersistentContext(process.env.PW_PROFILE ?? '', {
  channel: process.env.PW_CHANNEL ?? 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...opts,
});
