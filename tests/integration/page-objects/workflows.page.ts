import { type Page, expect } from '@playwright/test';

export class WorkflowsPage {
  constructor(private page: Page) {}

  async goTo() {
    await this.page.goto('/');
    // Wait for the workflows page to be ready
    await this.page.waitForSelector('text=Workflows', { timeout: 30_000 });
  }

  async clickCreateWorkflow() {
    // There are multiple "Create workflow" buttons on the page (header, empty state, etc.)
    // Use the first visible one — typically in the toolbar area
    await this.page.getByRole('button', { name: 'Create workflow' }).first().click();
    // Wait for the dialog to appear
    await this.page.getByRole('dialog').waitFor({ timeout: 10_000 });
  }

  async fillAndSubmitForm(name: string, description?: string) {
    const dialog = this.page.getByRole('dialog');
    // Fill fields inside the dialog
    await dialog.locator('input[name="name"]').fill(name);
    if (description) {
      await dialog.getByPlaceholder('Describe what this workflow does').fill(description);
    }
    // Click the "Create workflow" button inside the dialog
    await dialog.getByRole('button', { name: 'Create workflow' }).click();
    // Wait for navigation to workflow editor
    await this.page.waitForURL('**/workflows/**', { timeout: 15_000 });
  }

  async createWorkflow(name: string, description?: string) {
    await this.clickCreateWorkflow();
    await this.fillAndSubmitForm(name, description);
  }

  async verifyWorkflowExists(name: string) {
    await expect(this.page.getByRole('row').filter({ hasText: name })).toBeVisible({
      timeout: 10_000,
    });
  }

  async getWorkflowCount(): Promise<number> {
    // Count data rows (exclude header row)
    const rows = this.page.locator('tbody tr').or(this.page.getByRole('row')).filter({
      hasNotText: /^Name/,
    });
    return rows.count();
  }

  async clickWorkflow(name: string) {
    await this.page.getByRole('row').filter({ hasText: name }).first().click();
    await this.page.waitForURL('**/workflows/**', { timeout: 15_000 });
  }
}
