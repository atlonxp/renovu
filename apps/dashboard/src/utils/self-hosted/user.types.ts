import { DecodedJwt } from '.';

export interface SelfHostedUser {
  update: (...args: any[]) => Promise<null>;
  reload: () => Promise<null>;
  externalId?: string;
  firstName?: string;
  lastName?: string;
  emailAddresses: Array<{ emailAddress?: string }>;
  primaryEmailAddress?: { emailAddress?: string };
  createdAt: Date;
  publicMetadata: { newDashboardOptInStatus: string; [key: string]: any };
  unsafeMetadata: { newDashboardOptInStatus: string; newDashboardFirstVisit?: boolean; [key: string]: any };
  organizationMemberships: Array<Record<string, unknown>>;
  passwordEnabled: boolean;
}

export function createUserFromJwt(decodedJwt: DecodedJwt | null): SelfHostedUser | null {
  if (!decodedJwt) {
    return null;
  }

  return {
    update: async () => null,
    reload: async () => null,
    externalId: decodedJwt._id,
    firstName: decodedJwt.firstName,
    lastName: decodedJwt.lastName,
    emailAddresses: [{ emailAddress: decodedJwt.email }],
    primaryEmailAddress: { emailAddress: decodedJwt.email },
    createdAt: new Date(),
    publicMetadata: { newDashboardOptInStatus: 'opted_in' },
    unsafeMetadata: { newDashboardOptInStatus: 'opted_in' },
    organizationMemberships: [{}],
    passwordEnabled: true,
  };
}
