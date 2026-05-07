import { IOrganizationEntity } from '@novu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { getOrganizations, switchOrganization } from '@/api/organization';
import { QueryKeys } from '@/utils/query-keys';
import { AuthContextProvider, useAuth } from './auth.resource';
import {
  OrganizationList,
  OrganizationProfile,
  RedirectToSignIn,
  SignedIn,
  SignedOut,
  SignIn,
  SignUp,
  UserProfile,
} from './components';
import { getJwtToken, isJwtValid, setAuthToken } from './jwt-manager';
import { OrganizationSwitcher } from './organization-switcher';
import { OrganizationContextProvider, useOrganization } from './organization.resource';
import { UserButton } from './user-button';
import { UserContextProvider, useUser } from './user.resource';

export type {
  Appearance,
  CheckAuthorizationWithCustomPermissions,
  OrganizationResource,
  SignInTheme,
  SignUpTheme,
  UserResource,
} from './types';

export {
  AuthContextProvider, OrganizationContextProvider, OrganizationList,
  OrganizationProfile, OrganizationSwitcher, RedirectToSignIn,
  SignedIn,
  SignedOut, SignIn,
  SignUp, UserButton, UserProfile
};

export { useAuth, useOrganization, useUser };

/**
 * Switch the active organization (a.k.a. "project") for the current user.
 *
 * Mints a fresh JWT scoped to the target org via the API, swaps it into
 * localStorage, then hard-reloads so every React Query cache (env list,
 * workflows, layouts, ...) drops and refetches under the new org context.
 *
 * Hard reload is intentional: it sidesteps any cache key that forgot to
 * include orgId, which would otherwise leak data across project contexts.
 */
async function performOrganizationSwitch(organizationId: string): Promise<void> {
  if (!organizationId) {
    throw new Error('organizationId is required to switch');
  }
  const token = await switchOrganization(organizationId);
  if (!token || typeof token !== 'string') {
    throw new Error('Switch endpoint returned no token');
  }
  setAuthToken(token);
  // Pessimistic: avoid stale per-org caches by reloading the app shell.
  window.location.reload();
}

export const useClerk = () => {
  return {
    setActive: async (args?: { organization?: string; session?: string | null }) => {
      const orgId = args?.organization;
      if (!orgId) {
        // No-op: callers that pass `null` to clear active org are not supported in
        // self-hosted mode. Org context is always derived from the JWT.
        return;
      }
      await performOrganizationSwitch(orgId);
    },
  };
};

type SelfHostedMembership = {
  id: string;
  organization: IOrganizationEntity & {
    id: string;
    imageUrl: string;
    publicMetadata: Record<string, unknown>;
  };
};

/**
 * Drop-in replacement for `@clerk/clerk-react`'s useOrganizationList, scoped to
 * what the dashboard's organization-dropdown-clerk.tsx actually consumes:
 * `userMemberships.{data, revalidate, hasNextPage, isFetching, fetchNext}` plus
 * `setActive`.
 *
 * For self-hosted (single user, no Clerk), pagination is unnecessary; we return
 * the entire org list flat with hasNextPage:false.
 */
export const useOrganizationList = (..._args: any[]) => {
  const queryClient = useQueryClient();
  const hasToken = !!getJwtToken();

  const {
    data: organizations,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<IOrganizationEntity[]>({
    queryKey: [QueryKeys.myOrganizations],
    queryFn: () => getOrganizations(),
    enabled: hasToken,
    staleTime: 5 * 60 * 1000,
  });

  const memberships: SelfHostedMembership[] = (organizations ?? []).map((org) => ({
    id: `self-hosted-membership-${org._id}`,
    organization: {
      ...org,
      id: org._id,
      imageUrl: org.branding?.logo ?? '',
      publicMetadata: ((org as { publicMetadata?: Record<string, unknown> }).publicMetadata ?? {}) as Record<
        string,
        unknown
      >,
    },
  }));

  return {
    isLoaded: !isLoading,
    organizationList: organizations ?? [],
    userMemberships: {
      data: memberships,
      revalidate: async () => {
        await refetch();
      },
      hasNextPage: false,
      isFetching,
      fetchNext: async () => {},
    },
    setActive: async (args?: { organization?: string }) => {
      const orgId = args?.organization;
      if (!orgId) return;
      // Best-effort cache invalidation before the hard reload swap.
      queryClient.removeQueries();
      await performOrganizationSwitch(orgId);
    },
  };
};

export const ClerkContext = React.createContext({});

export type ProtectProps = {
  children: React.ReactNode;
  permission?: string;
  condition?: (has: (...args: any[]) => boolean) => boolean;
  [key: string]: any;
};

export const Protect = ({ children, ...rest }: ProtectProps) => {
  return children;
};

export function ClerkProvider({ children, ...rest }: { children?: any; [key: string]: any }) {
  const value = {};

  return (
    <ClerkContext.Provider value={value}>
      <UserContextProvider>
        <AuthContextProvider>
          <OrganizationContextProvider>{children}</OrganizationContextProvider>
        </AuthContextProvider>
      </UserContextProvider>
    </ClerkContext.Provider>
  );
}

(window as any).Clerk = {
  session: {
    getToken: () => getJwtToken(),
  },
};

export type DecodedJwt = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationId: string;
  environmentId: string | null;
  roles: string[];
  iat: number;
  exp: number;
  iss: string;
};
