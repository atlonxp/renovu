/**
 * HEADED Playwright drive-through — verifies the three fixes.
 *
 *   cd apps/dashboard && npx tsx tests/multi-project-headed-v2.ts
 *
 * Steps you'll see live:
 *  1. Land on dashboard
 *  2. Hover sidebar — chevron should be visible
 *  3. Click sidebar — rich dropdown should open with project list
 *  4. Switch to a different project from the dropdown
 *  5. Settings → Project — projects management section visible
 *  6. Settings → Team — invite form + members table visible
 */
import { chromium } from '@playwright/test';
import * as fs from 'fs';

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'http://localhost:4000';
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const JWT = 'self-hosted-jwt';
const OUT = '/tmp/mp-headed-v2';
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
    slowMo: 600,
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
  const email = `mp-v2-${Date.now()}@example.com`;
  const token = await register(email, 'Project Alpha');
  await createOrg(token, 'Project Beta');
  await createOrg(token, 'Project Gamma');
  console.log(`  user: ${email}`);

  step(1, 'Inject JWT and land on dashboard');
  await page.goto(`${DASHBOARD_URL}/auth/sign-in`);
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: JWT, v: token });
  await page.goto(`${DASHBOARD_URL}/`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });

  step(2, 'Verify sidebar dropdown — should be a real button now');
  const aside = page.locator('aside').first();
  const sidebarButtons = await aside.locator('button').count();
  console.log(`  sidebar button count: ${sidebarButtons}`);

  const projectButton = aside.locator('button').filter({ hasText: 'Project Alpha' }).first();
  const isButton = await projectButton.count();
  console.log(`  rich project button found: ${isButton ? 'YES' : 'NO'}`);

  if (isButton) {
    await projectButton.hover();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/02-sidebar-hover.png`, fullPage: true });

    step(3, 'Click the sidebar dropdown — should show Beta + Gamma + Create');
    await projectButton.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/03-sidebar-open.png`, fullPage: true });

    const menu = page.locator('[role=menu], [data-radix-popper-content-wrapper]').first();
    const menuText = await menu.innerText().catch(() => '<NONE>');
    console.log(`  dropdown contents:\n    ${menuText.replace(/\n/g, '\n    ')}`);

    const hasBeta = menuText.includes('Project Beta');
    const hasGamma = menuText.includes('Project Gamma');
    const hasCreate = /create project/i.test(menuText);
    console.log(`  Beta in menu: ${hasBeta}, Gamma in menu: ${hasGamma}, Create button: ${hasCreate}`);

    step(4, 'Click Project Beta in dropdown — hard reload, JWT swaps');
    const betaItem = menu.locator('text=Project Beta').first();
    if (await betaItem.count()) {
      await betaItem.click();
      await page.waitForTimeout(2500);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/04-after-switch.png`, fullPage: true });

      const sidebarText = await aside.innerText().catch(() => '');
      const switchedToBeta = sidebarText.includes('Project Beta');
      console.log(`  sidebar now shows Project Beta: ${switchedToBeta}`);
    } else {
      console.log('  ⚠️ no Beta item in dropdown');
    }
  } else {
    console.log('  ⚠️ rich button still missing — check vite restart');
  }

  step(5, 'Settings → Project tab — should list projects');
  await page.goto(`${DASHBOARD_URL}/settings/organization`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/05-settings-project.png`, fullPage: true });

  const settingsText = await page.locator('main, [role=main], body').first().innerText().catch(() => '');
  const hasYourProjects = /your projects/i.test(settingsText);
  const hasNewProject = /new project/i.test(settingsText);
  const hasCurrentlyActive = /currently active/i.test(settingsText);
  const hasSwitch = /switch/i.test(settingsText);
  console.log(`  "Your projects" header: ${hasYourProjects}`);
  console.log(`  "New project" button: ${hasNewProject}`);
  console.log(`  "Currently active" pill: ${hasCurrentlyActive}`);
  console.log(`  "Switch" button: ${hasSwitch}`);

  step(6, 'Settings → Team tab — should show invite form + members table');
  await page.goto(`${DASHBOARD_URL}/settings/team`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/06-settings-team.png`, fullPage: true });

  const teamText = await page.locator('main, [role=main], body').first().innerText().catch(() => '');
  const hasInviteHeader = /invite a teammate/i.test(teamText);
  const hasMembersHeader = /members \(/i.test(teamText);
  const hasSendInvite = /send invite/i.test(teamText);
  const hasYou = /\(you\)/i.test(teamText);
  console.log(`  "Invite a teammate" header: ${hasInviteHeader}`);
  console.log(`  "Members (...)" header: ${hasMembersHeader}`);
  console.log(`  "Send invite" button: ${hasSendInvite}`);
  console.log(`  "(you)" tag on self: ${hasYou}`);

  step(7, 'Try inviting a fake email');
  const inviteInput = page.getByPlaceholder('teammate@example.com');
  if (await inviteInput.count()) {
    await inviteInput.fill('teammate-fake@example.com');
    await page.waitForTimeout(500);
    const sendBtn = page.getByRole('button', { name: /send invite/i });
    if (await sendBtn.count()) {
      await sendBtn.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/07-after-invite.png`, fullPage: true });
      const afterInviteText = await page.locator('body').innerText().catch(() => '');
      console.log(`  pending invite visible: ${/pending invite/i.test(afterInviteText)}`);
    }
  }

  console.log(`\n=== JS ERRORS LOGGED (${errs.length}) ===`);
  errs.slice(0, 10).forEach((e) => console.log('  ' + e));

  console.log(`\nScreenshots in ${OUT}. Closing in 3s.`);
  await page.waitForTimeout(3000);
  await browser.close();
})();
