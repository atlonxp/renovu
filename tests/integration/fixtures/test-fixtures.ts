import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AccountCredentials {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  organizationName: string;
}

export interface SharedState {
  /** Account 1: created in test 01, used throughout */
  account1: AccountCredentials | null;
  /** Account 2: created in test 02 for backup restore */
  account2: AccountCredentials | null;
  /** Account 3: created in test 03 for workflow import */
  account3: AccountCredentials | null;
  /** Path to downloaded backup .tar.gz file */
  backupFilePath: string | null;
  /** Path to downloaded workflow export .json file */
  exportFilePath: string | null;
  /** Names of workflows created in test 01 */
  workflowNames: string[];
}

const STATE_FILE = path.join(os.tmpdir(), 'renovu-integration-test-state.json');

const DEFAULT_STATE: SharedState = {
  account1: null,
  account2: null,
  account3: null,
  backupFilePath: null,
  exportFilePath: null,
  workflowNames: [],
};

/**
 * File-based shared state that persists across test files.
 * Playwright isolates module scope per test file, so we use
 * a temp JSON file to share state across the 3 test files.
 */
export function getState(): SharedState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {
    // Corrupted file — reset
  }
  return { ...DEFAULT_STATE };
}

export function setState(updates: Partial<SharedState>): void {
  const current = getState();
  const merged = { ...current, ...updates };
  fs.writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2));
}

export function resetState(): void {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}
