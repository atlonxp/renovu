import { test, expect } from '@playwright/test';
import path from 'path';
import { getState, setState } from '../fixtures/test-fixtures';
import { generateTestEmail, generatePassword, generateOrgName } from '../helpers/test-data';
import { AuthPage } from '../page-objects/auth.page';
import { WorkflowsPage } from '../page-objects/workflows.page';
import { WorkflowEditorPage } from '../page-objects/workflow-editor.page';
import { TriggerWorkflowPage } from '../page-objects/trigger-workflow.page';
import { DataManagementPage } from '../page-objects/data-management.page';

const DOWNLOAD_DIR = path.resolve(__dirname, '..', 'downloads');

test.describe.serial('02 - Backup & Restore', () => {
  test('Create and download backup', async ({ page }) => {
    const state = getState();
    const auth = new AuthPage(page);
    const dm = new DataManagementPage(page);

    await auth.signIn(state.account1!.email, state.account1!.password);
    await dm.goTo();
    await dm.createBackup();

    const backupPath = await dm.downloadLatestBackup(DOWNLOAD_DIR);
    setState({ backupFilePath: backupPath });

    await auth.signOut();
  });

  test('Create fresh account', async ({ page }) => {
    const auth = new AuthPage(page);

    const credentials = {
      firstName: 'Backup',
      lastName: 'Tester',
      email: generateTestEmail('account2'),
      password: generatePassword(),
      organizationName: generateOrgName('Account2'),
    };

    await auth.signUp(credentials);
    setState({ account2: credentials });

    await expect(page).not.toHaveURL(/\/auth\//);
  });

  test('Restore backup in new account', async ({ page }) => {
    const state = getState();
    const auth = new AuthPage(page);
    const dm = new DataManagementPage(page);

    await auth.signIn(state.account2!.email, state.account2!.password);
    await dm.goTo();
    await dm.restoreFromFile(state.backupFilePath!);
  });

  test('Verify data after restore', async ({ page }) => {
    // After restore, the entire DB is replaced — account2 is gone,
    // account1 is back as the primary account
    const state = getState();
    const auth = new AuthPage(page);
    const workflowsPage = new WorkflowsPage(page);

    await auth.signIn(state.account1!.email, state.account1!.password);
    await workflowsPage.goTo();

    for (const name of state.workflowNames) {
      await workflowsPage.verifyWorkflowExists(name);
    }
  });

  test('Test workflows work after restore', async ({ page }) => {
    const state = getState();
    const auth = new AuthPage(page);
    const workflowsPage = new WorkflowsPage(page);
    const editor = new WorkflowEditorPage(page);
    const trigger = new TriggerWorkflowPage(page);

    await auth.signIn(state.account1!.email, state.account1!.password);
    await workflowsPage.goTo();

    // Open the first workflow and test it
    await workflowsPage.clickWorkflow(state.workflowNames[0]);
    await trigger.triggerAndVerify();
  });
});
