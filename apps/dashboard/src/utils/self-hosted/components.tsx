/** biome-ignore-all lint/correctness/useUniqueElementIds: expected */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/primitives/button';
import { Input } from '../../components/primitives/input';
import { API_HOSTNAME } from '../../config';
import { useEnvironment } from '../../context/environment/hooks';
import { clearAuth, getAuthSnapshot, setAuthToken, subscribe } from './jwt-manager';

// Helper to get auth headers with environment ID
function useAuthHeaders() {
  const { currentEnvironment } = useEnvironment();
  const token = localStorage.getItem(JWT_STORAGE_KEY);

  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(currentEnvironment?._id && { 'Novu-Environment-Id': currentEnvironment._id }),
  };
}

export function OrganizationList() {
  return <></>;
}

export function OrganizationProfile({ children }: { children?: React.ReactNode }) {
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useAuthHeaders();

  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const token = localStorage.getItem(JWT_STORAGE_KEY);
        if (!token) return;

        const response = await fetch(`${API_HOSTNAME}/v1/organizations/me`, {
          headers: authHeaders,
        });

        if (response.ok) {
          const data = await response.json();
          setOrgName(data.data?.name || '');
        }
      } catch (e) {
        console.error('Failed to fetch organization:', e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrganization();
  }, []);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch(`${API_HOSTNAME}/v1/organizations`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ name: orgName.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to update organization');
      }

      setIsEditing(false);
    } catch (e: any) {
      setError(e.message || 'Failed to update organization');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return <div className="py-4 text-center text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-gray-900">Organization Name</h3>
        {isEditing ? (
          <form onSubmit={handleUpdateName} className="space-y-3">
            <Input
              type="text"
              value={orgName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOrgName(e.target.value)}
              placeholder="Organization name"
              required
              disabled={isUpdating}
              className="h-10"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={isUpdating} variant="primary" mode="filled" size="sm">
                {isUpdating ? 'Saving...' : 'Save'}
              </Button>
              <Button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isUpdating}
                variant="secondary"
                mode="outline"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">{orgName || 'Not set'}</span>
            <Button onClick={() => setIsEditing(true)} variant="secondary" mode="ghost" size="sm">
              Edit
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Add static Page property for compatibility
OrganizationProfile.Page = function Page({ label }: { label: string }) {
  return null;
};

export function UserProfile({ children }: { children?: React.ReactNode }) {
  const [user, setUser] = useState<{ firstName?: string; lastName?: string; email?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const authHeaders = useAuthHeaders();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem(JWT_STORAGE_KEY);
        if (!token) return;

        const response = await fetch(`${API_HOSTNAME}/v1/users/me`, {
          headers: authHeaders,
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.data);
          setFirstName(data.data?.firstName || '');
          setLastName(data.data?.lastName || '');
        }
      } catch (e) {
        console.error('Failed to fetch user:', e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, []);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;

    setIsUpdatingName(true);
    setError(null);

    try {
      const response = await fetch(`${API_HOSTNAME}/v1/users/profile`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() || undefined }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to update profile');
      }

      setUser((prev) => (prev ? { ...prev, firstName, lastName } : prev));
      setIsEditingName(false);
    } catch (e: any) {
      setError(e.message || 'Failed to update profile');
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setIsChangingPassword(true);

    try {
      // Use the correct auth endpoint for password change
      const response = await fetch(`${API_HOSTNAME}/v1/auth/update-password`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to change password');
      }

      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (e: any) {
      setPasswordError(e.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return <div className="py-4 text-center text-sm text-gray-500">Loading...</div>;
  }

  if (!user) {
    return <div className="py-4 text-center text-sm text-gray-500">No user data available</div>;
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'User';

  return (
    <div className="space-y-8">
      {/* Profile Section */}
      <div className="space-y-4">
        <div className="border-b border-neutral-100 pb-4">
          <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
          <p className="mt-1 text-sm text-gray-600">Manage your account information</p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-900">Full Name</h3>
          {isEditingName ? (
            <form onSubmit={handleUpdateName} className="space-y-3">
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={firstName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)}
                  placeholder="First name"
                  required
                  disabled={isUpdatingName}
                  className="h-10 flex-1"
                />
                <Input
                  type="text"
                  value={lastName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)}
                  placeholder="Last name"
                  disabled={isUpdatingName}
                  className="h-10 flex-1"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={isUpdatingName} variant="primary" mode="filled" size="sm">
                  {isUpdatingName ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setIsEditingName(false);
                    setFirstName(user.firstName || '');
                    setLastName(user.lastName || '');
                  }}
                  disabled={isUpdatingName}
                  variant="secondary"
                  mode="outline"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{fullName}</span>
              <Button onClick={() => setIsEditingName(true)} variant="secondary" mode="ghost" size="sm">
                Edit
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-900">Email Address</h3>
          <span className="text-sm text-gray-700">{user.email}</span>
        </div>
      </div>

      {/* Security Section */}
      <div className="space-y-4">
        <div className="border-b border-neutral-100 pb-4">
          <h2 className="text-lg font-semibold text-gray-900">Security</h2>
          <p className="mt-1 text-sm text-gray-600">Manage your password</p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-900">Password</h3>
          {passwordSuccess && (
            <p className="mb-3 text-sm text-green-600">Password updated successfully!</p>
          )}
          {showPasswordForm ? (
            <form onSubmit={handleChangePassword} className="space-y-3">
              <Input
                type="password"
                value={currentPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                required
                disabled={isChangingPassword}
                className="h-10"
              />
              <Input
                type="password"
                value={newPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
                placeholder="New password"
                required
                disabled={isChangingPassword}
                className="h-10"
              />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                disabled={isChangingPassword}
                className="h-10"
              />
              {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={isChangingPassword} variant="primary" mode="filled" size="sm">
                  {isChangingPassword ? 'Updating...' : 'Update Password'}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setPasswordError(null);
                  }}
                  disabled={isChangingPassword}
                  variant="secondary"
                  mode="outline"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">••••••••</span>
              <Button onClick={() => setShowPasswordForm(true)} variant="secondary" mode="ghost" size="sm">
                Change Password
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add static Page property for compatibility
UserProfile.Page = function Page({ label }: { label: string }) {
  return null;
};

export function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_HOSTNAME}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      if (data.data.token) {
        let token = data.data.token;

        // Check if user has an organization
        const payload = JSON.parse(atob(token.split('.')[1]));

        if (!payload.organizationId) {
          // Auto-create organization for user
          const orgResponse = await fetch(`${API_HOSTNAME}/v1/organizations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ name: `${payload.firstName || 'My'}'s Organization` }),
          });

          if (!orgResponse.ok) {
            throw new Error('Failed to create organization. Please try again.');
          }

          // Re-login to get token with organizationId
          const reloginResponse = await fetch(`${API_HOSTNAME}/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });

          if (!reloginResponse.ok) {
            throw new Error('Failed to refresh session. Please sign in again.');
          }

          const reloginData = await reloginResponse.json();
          token = reloginData.data.token;
        }

        setAuthToken(token);
        navigate('/');
      } else {
        throw new Error('No token received');
      }
    } catch (e: any) {
      setError(e.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md pt-12">
      <h2 className="mb-6 text-center text-xl font-semibold">Sign In</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
            Email
          </label>
          <Input
            type="email"
            id="email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
            Password
          </label>
          <Input
            type="password"
            id="password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={isLoading} variant="primary" mode="filled" className="w-full">
          {isLoading ? 'Signing In...' : 'Sign In'}
        </Button>
        <p className="mt-4 text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <span
            role="button"
            tabIndex={0}
            className="text-primary-base focus:ring-primary-base/50 cursor-pointer font-medium hover:underline focus:outline-hidden focus:ring-2"
            onClick={() => navigate('/auth/sign-up')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate('/auth/sign-up');
            }}
          >
            Sign Up
          </span>
        </p>
      </form>
    </div>
  );
}

export function SignUp() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const validatePassword = (password: string) => {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[#?!@$%^&*()-]/.test(password);
    const isLengthValid = password.length >= 8 && password.length <= 64;

    if (!isLengthValid) {
      return 'Password must be between 8 and 64 characters';
    }

    if (!hasUpperCase) {
      return 'Password must contain at least one uppercase letter';
    }

    if (!hasLowerCase) {
      return 'Password must contain at least one lowercase letter';
    }

    if (!hasNumber) {
      return 'Password must contain at least one number';
    }

    if (!hasSpecialChar) {
      return 'Password must contain at least one special character (#?!@$%^&*()-)';
    }

    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPasswordError(null);
    setIsLoading(true);
    setIsSubmitted(true);

    const passwordValidationError = validatePassword(password);

    if (passwordValidationError) {
      setPasswordError(passwordValidationError);
      setIsLoading(false);
      return;
    }

    if (!organizationName.trim()) {
      setError('Organization name is required.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_HOSTNAME}/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName: lastName || undefined,
          organizationName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.errors?.general?.messages) {
          setError(data.errors.general.messages[0]);
        } else {
          throw new Error(data.message || 'Sign up failed');
        }

        return;
      }

      if (data.data.token) {
        setAuthToken(data.data.token);
        navigate('/');
      } else {
        throw new Error('No token received after sign up');
      }
    } catch (e: any) {
      setError(e.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md pt-12">
      <h2 className="mb-6 text-center text-xl font-semibold">Create Account</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="firstName" className="mb-1 block text-sm font-medium text-gray-700">
            First Name <span className="text-red-600">*</span>
          </label>
          <Input
            type="text"
            id="firstName"
            value={firstName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)}
            placeholder="John"
            required
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="mb-1 block text-sm font-medium text-gray-700">
            Last Name
          </label>
          <Input
            type="text"
            id="lastName"
            value={lastName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)}
            placeholder="Doe"
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
            Email <span className="text-red-600">*</span>
          </label>
          <Input
            type="email"
            id="email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
            Password <span className="text-red-600">*</span>
          </label>
          <Input
            type="password"
            id="password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setIsSubmitted(false);
              setPassword(e.target.value);
            }}
            placeholder="••••••••"
            required
            hasError={Boolean(isSubmitted && passwordError)}
            className="w-full"
            aria-describedby="password-constraints"
          />
          <p className="mt-1 text-xs text-gray-500" id="password-constraints">
            Min. 8 characters, include uppercase, lowercase, number, and special character.
          </p>
        </div>
        <div>
          <label htmlFor="organizationName" className="mb-1 block text-sm font-medium text-gray-700">
            Organization Name <span className="text-red-600">*</span>
          </label>
          <Input
            type="text"
            id="organizationName"
            value={organizationName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOrganizationName(e.target.value)}
            placeholder="Your Company"
            required
            className="w-full"
          />
        </div>
        {error && (
          <div className="rounded-md bg-red-50 p-4" role="alert">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        <Button type="submit" disabled={isLoading} variant="primary" mode="filled" className="mt-6! w-full">
          {isLoading ? 'Creating Account...' : 'Create Account'}
        </Button>
        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <span
            role="button"
            tabIndex={0}
            className="text-primary-base focus:ring-primary-base/50 cursor-pointer font-medium hover:underline focus:outline-hidden focus:ring-2"
            onClick={() => navigate('/auth/sign-in')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate('/auth/sign-in');
            }}
          >
            Sign In
          </span>
        </p>
      </form>
    </div>
  );
}

export function RedirectToSignIn() {
  const navigate = useNavigate();
  const isLoggedIn = useSyncExternalStore(subscribe, getAuthSnapshot);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/auth/sign-in');
    }
  }, [navigate, isLoggedIn]);

  return null;
}

export function SignedIn({ children }: { children: any }) {
  const isLoggedIn = useSyncExternalStore(subscribe, getAuthSnapshot);
  if (!isLoggedIn) return null;

  return <>{children}</>;
}

export function SignedOut({ children }: { children: any }) {
  const isLoggedIn = useSyncExternalStore(subscribe, getAuthSnapshot);
  if (isLoggedIn) return null;

  return <>{children}</>;
}
