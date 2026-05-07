/**
 * HEADED Playwright drive-through. Watch it on your screen.
 *
 *   cd apps/dashboard && npx tsx tests/multi-project-headed.ts
 *
 * Walks through the full multi-project flow at human speed (slowMo) so every
 * click is visible. Each step prints what it's about to do, then does it.
 */
import { chromium } from '@playwright/test';
import * as fs from 'fs';

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'http://localhost:4000';
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const JWT = 'self-hosted-jwt';
const OUT = '/tmp/mp-headed';
fs.mkdirSync(OUT, { recursive: true });

async function register(email: string, orgName: string) {
  const r = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      organizationName: orgName,
    }),
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

function step(n: number, msg: string) {
  console.log(`\n=== STEP ${n}: ${msg} ===`);
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 800,
    args: ['--window-size=1440,900', '--window-position=100,80'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`console: ${m.text()}`);
  });

  step(0, 'Register fresh user, pre-create 2 extra projects via API');
  const email = `mp-headed-${Date.now()}@example.com`;
  const token = await register(email, 'Project Alpha');
  await createOrg(token, 'Project Beta');
  await createOrg(token, 'Project Gamma');
  console.log(`  user: ${email}`);

  step(1, 'Inject JWT and land on dashboard root');
  await page.goto(`${DASHBOARD_URL}/auth/sign-in`);
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: JWT, v: token });
  await page.goto(`${DASHBOARD_URL}/`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });

  step(2, 'Hover over sidebar project name to reveal chevron (if any)');
  const sidebarTrigger = page.locator('button').filter({ hasText: /^Project Alpha$/i }).first();
  console.log(`  sidebar trigger count: ${await sidebarTrigger.count()}`);
  if (await sidebarTrigger.count()) {
    await sidebarTrigger.hover();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/02-sidebar-hover.png`, fullPage: true });
    step(3, 'Click sidebar project name to open dropdown');
    await sidebarTrigger.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/03-sidebar-clicked.png`, fullPage: true });
    // What did clicking actually surface?
    const dropdownText = await page.locator('[role=menu], [data-radix-popper-content-wrapper]').innerText().catch(() => '<none>');
    console.log(`  dropdown contents: ${dropdownText.slice(0, 200)}`);
    // Click away
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    console.log('  ⚠️  no sidebar trigger button matched — dropdown might be hidden behind a different selector');
  }

  step(4, 'Navigate to /auth/organization-list (the working path)');
  await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/04-list-page.png`, fullPage: true });

  step(5, 'Type a new project name in the form');
  const input = page.getByPlaceholder(/project name/i);
  if (await input.count()) {
    await input.fill('Project Delta');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/05-list-typed.png`, fullPage: true });
  }

  step(6, 'Click Create project');
  const createBtn = page.getByRole('button', { name: /create project/i });
  if (await createBtn.count()) {
    await createBtn.click();
    await page.waitForTimeout(2500); // hard reload happens here
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/06-after-create.png`, fullPage: true });
    const stored = await page.evaluate((k) => localStorage.getItem(k), JWT);
    const orgClaim = stored
      ? JSON.parse(Buffer.from(stored.split('.')[1] + '==', 'base64').toString()).organizationId
      : null;
    console.log(`  JWT after create now scoped to org: ${orgClaim}`);
  }

  step(7, 'Go back to /auth/organization-list to see all projects');
  await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/07-list-after-create.png`, fullPage: true });

  step(8, 'Click "Project Alpha" row to switch back');
  const alphaRow = page.getByRole('button', { name: /project alpha/i }).first();
  if (await alphaRow.count()) {
    await alphaRow.click();
    await page.waitForTimeout(2500);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/08-switched-back.png`, fullPage: true });
  }

  step(9, 'Walk into Settings → Project tab');
  await page.goto(`${DASHBOARD_URL}/settings/organization`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/09-settings-project.png`, fullPage: true });

  step(10, 'Walk into Settings → Team tab');
  await page.goto(`${DASHBOARD_URL}/settings/team`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/10-settings-team.png`, fullPage: true });

  console.log(`\n=== ERRORS LOGGED (${errs.length}) ===`);
  errs.slice(0, 20).forEach((e) => console.log('  ' + e));

  console.log(`\nDone. Screenshots in ${OUT}. Closing browser in 3s...`);
  await page.waitForTimeout(3000);
  await browser.close();
})();
