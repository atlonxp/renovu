/**
 * Minimal type stubs replacing @clerk/types for self-hosted mode.
 * These provide type compatibility without the Clerk dependency.
 */

export type OrganizationResource = any;
export type UserResource = any;
export type SignInTheme = Record<string, any>;
export type SignUpTheme = Record<string, any>;
export type Appearance = Record<string, any>;
export type CheckAuthorizationWithCustomPermissions = (...args: any[]) => boolean;
