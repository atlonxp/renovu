import React from 'react';
import { createContextHook } from '../context';
import { DecodedJwt } from '.';
import { getJwtToken, isJwtValid } from './jwt-manager';
import { createUserFromJwt } from './user.types';

interface AuthContextValue {
  currentUser: ReturnType<typeof createUserFromJwt>;
  has: (...args: any[]) => boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  orgId: string | null;
  [key: string]: any;
}

export const AuthContext = React.createContext<AuthContextValue>({
  currentUser: null,
  has: () => true,
  isLoaded: false,
  isSignedIn: false,
  orgId: null,
});

export function AuthContextProvider({ children }: any) {
  const jwt = getJwtToken();
  const decodedJwt: DecodedJwt | null = jwt && isJwtValid(jwt) ? JSON.parse(atob(jwt.split('.')[1])) : null;

  const value: AuthContextValue = {
    currentUser: createUserFromJwt(decodedJwt),
    has: () => true,
    isLoaded: true,
    isSignedIn: !!decodedJwt,
    orgId: decodedJwt?.organizationId || null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = createContextHook(AuthContext);
