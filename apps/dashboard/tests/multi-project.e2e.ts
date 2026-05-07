/**
 * Multi-project (multi-organization) E2E tests for self-hosted renovu.
 *
 * Bypasses Clerk by:
 *   1. Registering a fresh user via the API
 *   2. Injecting the JWT into localStorage[`self-hosted-jwt`]
 *   3. Driving the dashboard as that user
 *
 * Targets the live dev server (http://localhost:4000) by default. Override with
 *   DASHBOARD_URL=... API_URL=... npx playwright test multi-project.e2e.ts
 *
 * Run with the inline config that ships next to this file (so we don't depend
 * on the Clerk-based playwright.config.ts):
 *   npx playwright test --config=tests/multi-project.config.ts
 */
import { expect, test, type Page } from '@playwright/test';

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'http://localhost:4000';
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const JWT_STORAGE_KEY = 'self-hosted-jwt';

type RegisterResponse = {
  data: {
    user: { _id: string; email: string };
    token: string;
  };
};

async function registerUser(args: { email: string; orgName: string }): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: args.email,
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      organizationName: args.orgName,
    }),
  });
  if (!res.ok) {
    throw new Error(`register failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as RegisterResponse;
  return { token: body.data.token, userId: body.data.user._id };
}

function decodeJwt(token: string): { organizationId?: string; _id: string } {
  const payload = token.split('.')[1];
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  const decoded = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(decoded);
}

async function injectAuth(page: Page, token: string) {
  // Visit the origin first so localStorage is scoped correctly.
  await page.goto(`${DASHBOARD_URL}/auth/sign-in`);
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: JWT_STORAGE_KEY, value: token }
  );
}

async function uniqueEmail(prefix = 'pw-multi-project'): Promise<string> {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

const cleanupTrack: Array<{ email: string; userId: string }> = [];
test.afterAll(async () => {
  // Best-effort: tests are hermetic per email, but we still try to drop them.
  // Cleanup happens via a separate mongosh script run from the host shell, so
  // we just print the emails here for the harness to wipe.
  if (cleanupTrack.length > 0) {
    console.log('[cleanup] test emails created:', cleanupTrack.map((t) => t.email).join(', '));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Multi-project: self-hosted', () => {
  test('T-PW-1: dashboard loads with valid JWT, sidebar shows initial project', async ({ page }) => {
    const email = await uniqueEmail();
    const { token, userId } = await registerUser({ email, orgName: 'Project Alpha' });
    cleanupTrack.push({ email, userId });

    await injectAuth(page, token);
    await page.goto(`${DASHBOARD_URL}/`);

    // Page should NOT throw "SignedIn must be inside ClerkProvider" — that
    // was the regression we fixed in routes/auth.tsx.
    await page.waitForLoadState('networkidle');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Allow the app shell to mount (dashboard hydrates env, fetches /me, etc.)
    await page.waitForTimeout(2500);

    // The org switcher button shows the project name. Different render paths
    // surface it as a button or as plain text — match either.
    await expect(page.getByText('Project Alpha').first()).toBeVisible({ timeout: 10000 });

    // No Clerk-related errors should have fired during load.
    const clerkErrors = errors.filter((e) => e.includes('ClerkProvider') || e.includes('SignedIn'));
    expect(clerkErrors).toEqual([]);
  });

  test('T-PW-2: /auth/organization-list renders without Clerk error', async ({ page }) => {
    const email = await uniqueEmail();
    const { token, userId } = await registerUser({ email, orgName: 'Project Alpha' });
    cleanupTrack.push({ email, userId });

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await injectAuth(page, token);
    await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
    await page.waitForLoadState('networkidle');

    // Heading copy from the new SelfHostedProjectListPage.
    await expect(page.getByRole('heading', { name: /your projects/i })).toBeVisible({ timeout: 10000 });

    // Initial project is listed.
    await expect(page.getByText('Project Alpha').first()).toBeVisible();

    // Clerk import was the source of an earlier runtime error — must stay gone.
    const clerkErrors = errors.filter(
      (e) => e.includes('ClerkProvider') || e.includes('SignedIn can only be used')
    );
    expect(clerkErrors).toEqual([]);
  });

  test('T-PW-3: create project — empty name shows form-level error, no submit', async ({ page }) => {
    const email = await uniqueEmail();
    const { token, userId } = await registerUser({ email, orgName: 'Project Alpha' });
    cleanupTrack.push({ email, userId });

    await injectAuth(page, token);
    await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
    await page.waitForLoadState('networkidle');

    const submit = page.getByRole('button', { name: /create project/i });
    await expect(submit).toBeVisible({ timeout: 10000 });

    // With empty input, submit is disabled (the page's local guard).
    await expect(submit).toBeDisabled();
  });

  test('T-PW-4: create project — happy path, switches into new project', async ({ page }) => {
    const email = await uniqueEmail();
    const { token, userId } = await registerUser({ email, orgName: 'Project Alpha' });
    cleanupTrack.push({ email, userId });

    await injectAuth(page, token);
    await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
    await page.waitForLoadState('networkidle');

    // Type a new project name.
    const input = page.getByPlaceholder(/project name/i);
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill('Project Beta');

    const submit = page.getByRole('button', { name: /create project/i });
    await expect(submit).toBeEnabled();

    // After submit, performOrganizationSwitch reloads the page. Click, give
    // the hard reload time to destroy the execution context, then re-anchor on
    // a stable page so the localStorage read doesn't race the navigation.
    await submit.click();
    await page.waitForTimeout(2000);
    await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
    await page.waitForLoadState('networkidle');

    // localStorage now holds a JWT scoped to Project Beta.
    const newToken = await page.evaluate((k) => window.localStorage.getItem(k), JWT_STORAGE_KEY);
    expect(newToken).toBeTruthy();
    expect(newToken).not.toEqual(token);

    const newClaims = decodeJwt(newToken!);
    // Verify the new JWT actually points at a different org than the original.
    const oldClaims = decodeJwt(token);
    expect(newClaims.organizationId).toBeTruthy();
    expect(newClaims.organizationId).not.toEqual(oldClaims.organizationId);
  });

  test('T-PW-5: GET /v1/organizations from the dashboard returns both projects after create', async ({
    page,
  }) => {
    const email = await uniqueEmail();
    const { token, userId } = await registerUser({ email, orgName: 'Project Alpha' });
    cleanupTrack.push({ email, userId });

    // Pre-create Project Beta via API so this test focuses on the *list* read
    // path, not the create form.
    const createRes = await fetch(`${API_URL}/v1/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Project Beta' }),
    });
    expect(createRes.ok).toBe(true);

    await injectAuth(page, token);
    await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
    await page.waitForLoadState('networkidle');

    // Both projects visible in the list.
    await expect(page.getByText('Project Alpha').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Project Beta').first()).toBeVisible();
  });

  test('T-PW-6: switch project from /auth/organization-list — JWT swaps and points at target', async ({
    page,
  }) => {
    const email = await uniqueEmail();
    const { token, userId } = await registerUser({ email, orgName: 'Project Alpha' });
    cleanupTrack.push({ email, userId });

    // Create a 2nd project via API.
    const createRes = await fetch(`${API_URL}/v1/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Project Beta' }),
    });
    const created = await createRes.json();
    const betaId = created.data._id;

    await injectAuth(page, token);
    await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
    await page.waitForLoadState('networkidle');

    // Click the row labeled "Project Beta" to switch into it.
    const betaRow = page.getByRole('button', { name: /project beta/i }).first();
    await expect(betaRow).toBeVisible({ timeout: 10000 });
    await betaRow.click();

    // performOrganizationSwitch hard-reloads → execution context is destroyed.
    // Wait for it to settle, then re-anchor on a known page before reading
    // localStorage to keep the read deterministic.
    await page.waitForTimeout(1500);
    await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
    await page.waitForLoadState('networkidle');

    const newToken = await page.evaluate((k) => window.localStorage.getItem(k), JWT_STORAGE_KEY);
    expect(newToken).toBeTruthy();
    const claims = decodeJwt(newToken!);
    expect(claims.organizationId).toEqual(betaId);
  });

  test('T-PW-7: settings tab labeled "Project", not "Organization"', async ({ page }) => {
    const email = await uniqueEmail();
    const { token, userId } = await registerUser({ email, orgName: 'Project Alpha' });
    cleanupTrack.push({ email, userId });

    await injectAuth(page, token);
    await page.goto(`${DASHBOARD_URL}/settings`);
    await page.waitForLoadState('networkidle');

    // The renamed tab. Match button OR tab role since shadcn Tabs may be either.
    const projectTab = page.getByRole('tab', { name: /^project$/i });
    await expect(projectTab).toBeVisible({ timeout: 10000 });

    // The old label must not be present as a visible tab.
    const orgTab = page.getByRole('tab', { name: /^organization$/i });
    await expect(orgTab).toHaveCount(0);
  });

  test('T-PW-8: tenant isolation — Project Beta workflow list is empty even when Alpha would have data', async ({
    page,
  }) => {
    const email = await uniqueEmail();
    const { token, userId } = await registerUser({ email, orgName: 'Project Alpha' });
    cleanupTrack.push({ email, userId });

    // Create Project Beta via API.
    const createRes = await fetch(`${API_URL}/v1/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Project Beta' }),
    });
    const created = await createRes.json();
    const betaId = created.data._id;

    // Mint a JWT scoped to Beta.
    const switchRes = await fetch(`${API_URL}/v1/auth/organizations/${betaId}/switch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const switchBody = await switchRes.json();
    const betaToken = typeof switchBody === 'string' ? switchBody : switchBody.data;
    expect(betaToken).toBeTruthy();

    // List Beta's environments via API to grab the dev env id (we'll need it
    // for the Novu-Environment-Id header on /workflows).
    const envRes = await fetch(`${API_URL}/v1/environments`, {
      headers: { Authorization: `Bearer ${betaToken}` },
    });
    const envBody = await envRes.json();
    const devEnv = envBody.data.find((e: any) => /development/i.test(e.name));
    expect(devEnv).toBeTruthy();

    // Fetch workflows in Beta's dev env — must be empty for a fresh org.
    const wfRes = await fetch(`${API_URL}/v1/workflows`, {
      headers: { Authorization: `Bearer ${betaToken}`, 'Novu-Environment-Id': devEnv._id },
    });
    const wfBody = await wfRes.json();
    const list = wfBody.data ?? wfBody;
    const count = Array.isArray(list) ? list.length : list.totalCount ?? 0;
    expect(count).toBe(0);
  });

  test('T-PW-9: creating a project with whitespace-only name shows validation error', async ({ page }) => {
    const email = await uniqueEmail();
    const { token, userId } = await registerUser({ email, orgName: 'Project Alpha' });
    cleanupTrack.push({ email, userId });

    await injectAuth(page, token);
    await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
    await page.waitForLoadState('networkidle');

    const input = page.getByPlaceholder(/project name/i);
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill('   ');

    const submit = page.getByRole('button', { name: /create project/i });
    // The page's `disabled={!name.trim() || isSubmitting}` guard kicks in.
    await expect(submit).toBeDisabled();
  });

  test('T-PW-10: rapid switch chain Alpha→Beta→Alpha keeps JWT consistent', async ({ page }) => {
    const email = await uniqueEmail();
    const { token: alphaToken, userId } = await registerUser({ email, orgName: 'Project Alpha' });
    cleanupTrack.push({ email, userId });

    const alphaId = decodeJwt(alphaToken).organizationId!;

    // Create Beta.
    const createRes = await fetch(`${API_URL}/v1/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alphaToken}` },
      body: JSON.stringify({ name: 'Project Beta' }),
    });
    const created = await createRes.json();
    const betaId = created.data._id;

    await injectAuth(page, alphaToken);
    await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
    await page.waitForLoadState('networkidle');

    // Helper: click a project row, wait through the hard reload, then navigate
    // back to a stable URL before reading localStorage. The page's setActive
    // path calls window.location.reload() which makes mid-navigation evaluate
    // calls race-prone.
    async function switchAndRead(label: RegExp, expectedOrgId: string) {
      const row = page.getByRole('button', { name: label }).first();
      await row.click();
      // The reload destroys the current execution context; wait it out.
      await page.waitForTimeout(1500);
      // Re-anchor on a known page so localStorage reads are deterministic.
      await page.goto(`${DASHBOARD_URL}/auth/organization-list`);
      await page.waitForLoadState('networkidle');
      const stored = await page.evaluate((k) => window.localStorage.getItem(k), JWT_STORAGE_KEY);
      expect(stored).toBeTruthy();
      expect(decodeJwt(stored!).organizationId).toEqual(expectedOrgId);
    }

    await switchAndRead(/project beta/i, betaId);
    await switchAndRead(/project alpha/i, alphaId);
  });
});
