export const JWT_STORAGE_KEY = 'self-hosted-jwt';

// --- Reactive auth state via useSyncExternalStore ---
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

/** Subscribe to auth state changes (for useSyncExternalStore) */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Get current auth state snapshot (for useSyncExternalStore) */
export function getAuthSnapshot(): boolean {
  return isJwtValid(getJwtToken());
}

// --- Token operations ---

export function getJwtToken(): string | null {
  return localStorage.getItem(JWT_STORAGE_KEY);
}

export function isJwtValid(token: string | null): boolean {
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expirationTime = payload.exp * 1000;
    return Date.now() < expirationTime;
  } catch {
    return false;
  }
}

/** Store token and notify subscribers */
export function setAuthToken(token: string) {
  localStorage.setItem(JWT_STORAGE_KEY, token);
  emitChange();
}

/** Clear token and notify subscribers. Returns true if state actually changed. */
export function clearAuth(): boolean {
  const hadToken = !!getJwtToken();
  localStorage.removeItem(JWT_STORAGE_KEY);
  if (hadToken) emitChange();
  return hadToken;
}
