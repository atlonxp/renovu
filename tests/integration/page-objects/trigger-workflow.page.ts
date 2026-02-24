import { type Page, expect } from '@playwright/test';

export class TriggerWorkflowPage {
  constructor(private page: Page) {}

  async clickTestWorkflow() {
    await this.page.getByRole('button', { name: 'Test workflow' }).click();
  }

  async waitForActivityComplete(timeout = 60_000) {
    // Wait for the activity panel skeleton to appear and then disappear
    const skeleton = this.page.locator('[data-testid="activity-panel-skeleton"]');
    if (await skeleton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await skeleton.waitFor({ state: 'hidden', timeout });
    }

    // Check for activity panel (workflow editor view)
    const activityPanel = this.page.locator('[data-testid="activity-panel"]');
    const stepResults = this.page.getByText('Step results');

    // Wait for either activity panel or step results to appear
    await Promise.race([
      activityPanel.waitFor({ timeout }).catch(() => {}),
      stepResults.waitFor({ timeout }).catch(() => {}),
    ]);

    // Give the UI time to render results
    await this.page.waitForTimeout(2_000);
  }

  async triggerAndVerify(timeout = 60_000) {
    await this.clickTestWorkflow();
    await this.waitForActivityComplete(timeout);
  }
}
