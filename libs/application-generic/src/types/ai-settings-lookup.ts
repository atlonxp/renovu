/**
 * Minimal lookup contract for organization AI provider settings.
 *
 * Implemented by `AiSettingsRepository` in `apps/api`. Other packages
 * (e.g. `@novu/translation`) inject the repository via the
 * `AI_SETTINGS_REPOSITORY` token to avoid a hard dependency on the api app.
 */
export interface IAiSettingsLookup {
  findByOrganization(organizationId: string): Promise<IAiSettingsRecord | null>;
}

export interface IAiSettingsRecord {
  _id: string;
  _organizationId: string;
  provider: string;
  apiKey: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}
