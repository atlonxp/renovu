import { test, expect } from '@playwright/test';
import { getState, setState, resetState } from '../fixtures/test-fixtures';
import { generateTestEmail, generatePassword, generateOrgName, getWorkflowDefinitions } from '../helpers/test-data';
import { AuthPage } from '../page-objects/auth.page';
import { WorkflowsPage } from '../page-objects/workflows.page';
import { WorkflowEditorPage } from '../page-objects/workflow-editor.page';
import { TriggerWorkflowPage } from '../page-objects/trigger-workflow.page';

const workflows = getWorkflowDefinitions(Date.now().toString(36));

test.describe.serial('01 - Create Account & Workflows', () => {
  test('Sign up new account', async ({ page }) => {
    // Reset state at the start of the full suite
    resetState();

    const auth = new AuthPage(page);

    const credentials = {
      firstName: 'Test',
      lastName: 'User',
      email: generateTestEmail('account1'),
      password: generatePassword(),
      organizationName: generateOrgName('Account1'),
    };

    await auth.signUp(credentials);
    setState({ account1: credentials, workflowNames: [] });

    // Verify we landed on the dashboard
    await expect(page).not.toHaveURL(/\/auth\//);
  });

  test('Create in_app workflow', async ({ page }) => {
    const state = getState();
    const auth = new AuthPage(page);
    const workflowsPage = new WorkflowsPage(page);
    const editor = new WorkflowEditorPage(page);
    const trigger = new TriggerWorkflowPage(page);
    const wf = workflows[0];

    await auth.signIn(state.account1!.email, state.account1!.password);
    await workflowsPage.goTo();
    await workflowsPage.createWorkflow(wf.name, wf.description);

    // Add the step — this navigates to step editor
    await editor.addStep(wf.stepType);
    // Navigate back to workflow editor
    await editor.navigateBackToWorkflowEditor();
    // Trigger and verify
    await trigger.triggerAndVerify();

    setState({ workflowNames: [...state.workflowNames, wf.name] });
  });

  test('Create email workflow', async ({ page }) => {
    const state = getState();
    const auth = new AuthPage(page);
    const workflowsPage = new WorkflowsPage(page);
    const editor = new WorkflowEditorPage(page);
    const trigger = new TriggerWorkflowPage(page);
    const wf = workflows[1];

    await auth.signIn(state.account1!.email, state.account1!.password);
    await workflowsPage.goTo();
    await workflowsPage.createWorkflow(wf.name, wf.description);
    await editor.addStep(wf.stepType);
    await editor.navigateBackToWorkflowEditor();
    await trigger.triggerAndVerify();

    setState({ workflowNames: [...state.workflowNames, wf.name] });
  });

  test('Create push workflow', async ({ page }) => {
    const state = getState();
    const auth = new AuthPage(page);
    const workflowsPage = new WorkflowsPage(page);
    const editor = new WorkflowEditorPage(page);
    const trigger = new TriggerWorkflowPage(page);
    const wf = workflows[2];

    await auth.signIn(state.account1!.email, state.account1!.password);
    await workflowsPage.goTo();
    await workflowsPage.createWorkflow(wf.name, wf.description);
    await editor.addStep(wf.stepType);
    await editor.navigateBackToWorkflowEditor();
    await trigger.triggerAndVerify();

    setState({ workflowNames: [...state.workflowNames, wf.name] });
  });

  test('Verify all 3 workflows exist', async ({ page }) => {
    const state = getState();
    const auth = new AuthPage(page);
    const workflowsPage = new WorkflowsPage(page);

    await auth.signIn(state.account1!.email, state.account1!.password);
    await workflowsPage.goTo();

    for (const name of state.workflowNames) {
      await workflowsPage.verifyWorkflowExists(name);
    }
  });
});
