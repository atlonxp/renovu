import { type Page, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

export class DataManagementPage {
  constructor(private page: Page) {}

  async goTo() {
    await this.page.goto('/settings/data-management');
    await this.page.waitForSelector('text=Data Management', { timeout: 15_000 });
  }

  async createBackup() {
    await this.page.getByRole('button', { name: 'Create Backup' }).click();
    // Wait for success indication — toast or the backup appearing in the list
    await this.page.waitForSelector('text=Backup created', { timeout: 120_000 }).catch(() => {
      // Fallback: wait for the backup list to refresh
    });
    // Give time for the backup to be fully registered
    await this.page.waitForTimeout(2_000);
  }

  async downloadLatestBackup(downloadDir: string): Promise<string> {
    fs.mkdirSync(downloadDir, { recursive: true });

    // Start waiting for the download event before clicking
    const downloadPromise = this.page.waitForEvent('download', { timeout: 120_000 });

    // Click the download button on the first (latest) backup row
    const downloadButton = this.page.getByRole('button', { name: /download/i }).first();
    await downloadButton.click();

    const download = await downloadPromise;
    const suggestedFilename = download.suggestedFilename();
    const savePath = path.join(downloadDir, suggestedFilename);
    await download.saveAs(savePath);

    expect(fs.existsSync(savePath)).toBe(true);
    return savePath;
  }

  async restoreFromFile(filePath: string) {
    // Upload the backup file
    const fileInput = this.page.locator('input[type="file"][accept=".tar.gz,.tgz"]');
    await fileInput.setInputFiles(filePath);

    // Uncheck dry-run if it's checked (we want a real restore)
    const dryRunCheckbox = this.page.locator('#dry-run');
    if (await dryRunCheckbox.isChecked()) {
      await dryRunCheckbox.uncheck();
    }

    // Click the Restore button
    await this.page.getByRole('button', { name: 'Restore' }).click();

    // Handle confirmation dialog if present
    const confirmButton = this.page.getByRole('button', { name: /confirm|yes|restore/i });
    if (await confirmButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Wait for restore to complete (can be slow)
    await this.page.waitForSelector('text=/Collections:|Total documents:/i', {
      timeout: 180_000,
    });
  }

  async exportAllWorkflows(downloadDir: string): Promise<string> {
    fs.mkdirSync(downloadDir, { recursive: true });

    // Start waiting for the download event before clicking
    const downloadPromise = this.page.waitForEvent('download', { timeout: 60_000 });

    await this.page.getByRole('button', { name: 'Export All Workflows' }).click();

    const download = await downloadPromise;
    const suggestedFilename = download.suggestedFilename();
    const savePath = path.join(downloadDir, suggestedFilename);
    await download.saveAs(savePath);

    expect(fs.existsSync(savePath)).toBe(true);
    return savePath;
  }

  async importWorkflows(filePath: string, strategy: 'skip' | 'overwrite' = 'skip') {
    // Upload the workflow export file
    const fileInput = this.page.locator('input[type="file"][accept=".json"]');
    await fileInput.setInputFiles(filePath);

    // Select the import strategy
    const strategyRadio = this.page.locator(`input[name="import-strategy"][value="${strategy}"]`);
    await strategyRadio.check();

    // Click Import button
    await this.page.getByRole('button', { name: 'Import Workflows' }).click();

    // Wait for import results
    await this.page.waitForSelector('text=/Workflows created:|Workflows skipped:/i', {
      timeout: 60_000,
    });
  }
}
