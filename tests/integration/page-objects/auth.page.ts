import { type Page, expect } from '@playwright/test';

export interface SignUpParams {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  organizationName: string;
}

export class AuthPage {
  constructor(private page: Page) {}

  async signUp({ firstName, lastName, email, password, organizationName }: SignUpParams) {
    await this.page.goto('/auth/sign-up');
    await this.page.locator('#firstName').fill(firstName);
    await this.page.locator('#lastName').fill(lastName);
    await this.page.locator('#email').fill(email);
    await this.page.locator('#password').fill(password);
    await this.page.locator('#organizationName').fill(organizationName);
    await this.page.getByRole('button', { name: 'Create Account' }).click();
    // Wait for redirect away from auth pages
    await this.page.waitForURL((url) => !url.pathname.startsWith('/auth'), {
      timeout: 30_000,
    });
  }

  async signIn(email: string, password: string) {
    await this.page.goto('/auth/sign-in');
    await this.page.locator('#email').fill(email);
    await this.page.locator('#password').fill(password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
    // Wait for redirect away from auth pages
    await this.page.waitForURL((url) => !url.pathname.startsWith('/auth'), {
      timeout: 30_000,
    });
  }

  async signOut() {
    // Click the user avatar/menu trigger in the sidebar
    // The header user menu; the sidebar project dropdown also renders an avatar, so match by test id.
    const avatarButton = this.page.getByTestId('user-profile-button').first();
    await avatarButton.click();
    await this.page.getByText('Logout').click();
    await this.page.waitForURL('**/auth/sign-in', { timeout: 15_000 });
  }
}
