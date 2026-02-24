import { type Page, expect } from '@playwright/test';

const STEP_LABELS: Record<string, string> = {
  in_app: 'In-App',
  email: 'Email',
  push: 'Push',
  chat: 'Chat',
  sms: 'SMS',
  delay: 'Delay',
  digest: 'Digest',
};

export class WorkflowEditorPage {
  constructor(private page: Page) {}

  async dismissActionsDialog() {
    // The "Actions Recommended" dialog may appear on fresh workflows
    const closeBtn = this.page.getByRole('dialog').filter({ hasText: 'Actions Recommended' }).getByRole('button').first();
    if (await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await closeBtn.click();
      await this.page.waitForTimeout(500);
    }
  }

  async addStep(stepType: 'in_app' | 'email' | 'push' | 'chat' | 'sms' | 'delay' | 'digest') {
    const label = STEP_LABELS[stepType];

    // Dismiss any overlay dialog first
    await this.dismissActionsDialog();

    // Click the "+" drop zone button to open the add-step menu
    await this.page.getByRole('button', { name: 'Drop here' }).click();

    // The menu appears as a dialog with channel/action items as clickable divs
    const menuDialog = this.page.getByRole('dialog').last();
    await menuDialog.waitFor({ timeout: 5_000 });
    await menuDialog.getByText(label, { exact: true }).click();

    // After clicking, the UI navigates to the step editor
    // Wait for the step editor page to load
    await this.page.waitForTimeout(2_000);
  }

  async navigateBackToWorkflowEditor() {
    // Click the workflow name link in the breadcrumb to go back
    const breadcrumb = this.page.getByRole('navigation', { name: 'breadcrumb' });
    // The breadcrumb has: Development / Workflows / {WorkflowName} / {StepName}
    // Click the workflow name (3rd link in breadcrumb)
    const workflowLink = breadcrumb.getByRole('link').nth(2);
    await workflowLink.click();

    // Wait for the workflow editor tabs to appear
    await this.page.getByRole('tab', { name: 'Workflow' }).waitFor({ timeout: 15_000 });
  }

  async waitForSave() {
    await this.page.waitForResponse(
      (response) => response.url().includes('/v2/workflows/') && response.request().method() === 'PUT',
      { timeout: 15_000 }
    );
    await this.page.waitForTimeout(500);
  }

  async goToActivityTab() {
    await this.page.getByRole('tab', { name: 'Activity' }).click();
  }
}
