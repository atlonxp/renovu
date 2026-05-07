/* Capture screenshots of every multi-project surface as a real user sees it. */
import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'http://localhost:4000';
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const JWT = 'self-hosted-jwt';
const OUT = '/tmp/mp-screens';

async function register(email: string, orgName: string) {
  const r = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123!', firstName: 'Test', lastName: 'User', organizationName: orgName }),
  });
  return ((await r.json()) as any).data.token as string;
}

async function createOrg(token: string, name: string) {
  const r = await fetch(`${API_URL}/v1/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  return ((await r.json()) as any).data._id as string;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`console: ${m.text()}`);
  });

  const email = `mp-screens-${Date.now()}@example.com`;
  const token = await register(email, 'Project Alpha');
  await createOrg(token, 'Project Beta');
  await createOrg(token, 'Project Gamma');

  // Inject token
  await page.goto(`${DASHBOARD_URL}/auth/sign-in`);
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: JWT, v: token });

  const shots: Array<{ name: string; url: string; action?: () => Promise<void> }> = [
    { name: '01-root', url: '/' },
    { name: '02-organization-list', url: '/auth/organization-list' },
    { name: '03-settings-account', url: '/settings/account' },
    { name: '04-settings-organization', url: '/settings/organization' },
    { name: '05-settings-team', url: '/settings/team' },
    { name: '06-workflows', url: '/' },
    {
      name: '07-organization-list-typed',
      url: '/auth/organization-list',
      action: async () => {
        const input = page.getByPlaceholder(/project name/i);
        if (await input.count()) await input.fill('My New Project');
      },
    },
    {
      name: '08-sidebar-dropdown-open',
      url: '/',
      action: async () => {
        // Try to click anything that looks like the project switcher in the sidebar.
        const trigger = page
          .locator('button:has-text("Project Alpha"), button:has-text("Project Beta"), button:has-text("Project Gamma")')
          .first();
        if (await trigger.count()) {
          await trigger.click().catch(() => {});
        }
      },
    },
  ];

  const log: any[] = [];
  for (const s of shots) {
    errs.length = 0;
    await page.goto(`${DASHBOARD_URL}${s.url}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    if (s.action) {
      try {
        await s.action();
      } catch (e: any) {
        errs.push(`action error: ${e.message}`);
      }
      await page.waitForTimeout(800);
    }
    const file = path.join(OUT, `${s.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const title = await page.title().catch(() => '?');
    const visibleText = (await page.locator('body').innerText().catch(() => '')).slice(0, 800);
    log.push({ name: s.name, url: s.url, file, title, errs: [...errs], textPreview: visibleText });
  }

  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ outDir: OUT, count: shots.length, totalErrors: log.reduce((a, r) => a + r.errs.length, 0) }));
  await browser.close();
})();
