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

test.describe.serial('03 - Export & Import Workflows', () => {
  test('Export all workflows', async ({ page }) => {
    const state = getState();
    const auth = new AuthPage(page);
    const dm = new DataManagementPage(page);

    await auth.signIn(state.account1!.email, state.account1!.password);
    await dm.goTo();

    const exportPath = await dm.exportAllWorkflows(DOWNLOAD_DIR);
    setState({ exportFilePath: exportPath });

    await auth.signOut();
  });

  test('Create fresh account', async ({ page }) => {
    const auth = new AuthPage(page);

    const credentials = {
      firstName: 'Import',
      lastName: 'Tester',
      email: generateTestEmail('account3'),
      password: generatePassword(),
      organizationName: generateOrgName('Account3'),
    };

    await auth.signUp(credentials);
    setState({ account3: credentials });

    await expect(page).not.toHaveURL(/\/auth\//);
  });

  test('Import workflows', async ({ page }) => {
    const state = getState();
    const auth = new AuthPage(page);
    const dm = new DataManagementPage(page);

    await auth.signIn(state.account3!.email, state.account3!.password);
    await dm.goTo();
    await dm.importWorkflows(state.exportFilePath!, 'skip');
  });

  test('Verify workflows exist after import', async ({ page }) => {
    const state = getState();
    const auth = new AuthPage(page);
    const workflowsPage = new WorkflowsPage(page);

    await auth.signIn(state.account3!.email, state.account3!.password);
    await workflowsPage.goTo();

    for (const name of state.workflowNames) {
      await workflowsPage.verifyWorkflowExists(name);
    }
  });

  test('Test imported workflows work', async ({ page }) => {
    const state = getState();
    const auth = new AuthPage(page);
    const workflowsPage = new WorkflowsPage(page);
    const editor = new WorkflowEditorPage(page);
    const trigger = new TriggerWorkflowPage(page);

    await auth.signIn(state.account3!.email, state.account3!.password);
    await workflowsPage.goTo();

    // Open the first workflow and test it
    await workflowsPage.clickWorkflow(state.workflowNames[0]);
    await trigger.triggerAndVerify();
  });
});
