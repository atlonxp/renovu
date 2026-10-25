import { RedirectToSignIn, SignedIn, SignedOut, useAuth } from '@/utils/self-hosted';
import { AnimatedOutlet } from '@/components/animated-outlet';
import { AuthLayout } from '../components/auth-layout';
import { EnvironmentProvider } from '../context/environment/environment-provider';

export const OnboardingParentRoute = () => {
  const { isLoaded } = useAuth();

  if (!isLoaded) {
    return null;
  }

  return (
    <>
      <SignedIn>
        <EnvironmentProvider>
          <AuthLayout>
            <AnimatedOutlet />
          </AuthLayout>
        </EnvironmentProvider>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
};
