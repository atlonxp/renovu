import type { IEnvironment, IOrganizationEntity } from '@novu/shared';
import { get, patch, post } from './api.client';

export type GetOrganizationSettingsDto = {
  removeNovuBranding: boolean;
  defaultLocale: string;
  targetLocales: string[];
};

export type UpdateOrganizationSettingsDto = {
  removeNovuBranding?: boolean;
  defaultLocale?: string;
  targetLocales?: string[];
};

export async function getOrganizationSettings({
  environment,
}: {
  environment: IEnvironment;
}): Promise<{ data: GetOrganizationSettingsDto }> {
  return get('/organizations/settings', { environment });
}

export async function updateOrganizationSettings({
  data,
  environment,
}: {
  data: UpdateOrganizationSettingsDto;
  environment: IEnvironment;
}): Promise<{ data: GetOrganizationSettingsDto }> {
  return patch('/organizations/settings', { environment, body: data });
}

/**
 * Returns every organization (a.k.a. "project" in UI copy) the current user is
 * an active member of. Used to populate the project switcher.
 */
export async function getOrganizations(): Promise<IOrganizationEntity[]> {
  const response = await get<{ data: IOrganizationEntity[] }>('/organizations');

  return response.data;
}

export type CreateOrganizationDto = {
  name: string;
  logo?: string;
  jobTitle?: string;
  domain?: string;
  productUseCases?: Record<string, boolean>;
  language?: string[];
};

/**
 * Create a new organization (a.k.a. "project") for the current user. The user
 * is added as OSS_ADMIN and dev/prod environments are bootstrapped server-side.
 */
export async function createOrganization(data: CreateOrganizationDto): Promise<IOrganizationEntity> {
  const response = await post<{ data: IOrganizationEntity }>('/organizations', { body: data });

  return response.data;
}

/**
 * Mint a new JWT scoped to the target organization. The caller must be a member
 * or the API returns 401. The returned token replaces the active session token.
 */
export async function switchOrganization(organizationId: string): Promise<string> {
  // Endpoint returns the raw token string, not wrapped in { data }.
  const response = await post<string | { data: string }>(`/auth/organizations/${organizationId}/switch`, {});

  return typeof response === 'string' ? response : response.data;
}
