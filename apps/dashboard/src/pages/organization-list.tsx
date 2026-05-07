import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import OrganizationCreate from '@/components/auth/create-organization';
import { PageMeta } from '@/components/page-meta';
import { Button } from '@/components/primitives/button';
import { showErrorToast, showSuccessToast } from '@/components/primitives/sonner-helpers';
import { IS_ENTERPRISE, IS_SELF_HOSTED } from '@/config';
import { useOrganization, useOrganizationList } from '@/utils/self-hosted';
import { createOrganization } from '@/api/organization';

/**
 * In renovu (self-hosted) mode, this page is the project picker / creator.
 * Users land here when they click "+ Create project" from the project switcher,
 * or directly via /auth/organization-list. Cloud Novu uses OrganizationCreate
 * (Clerk-driven) below.
 */
function SelfHostedProjectListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organization: currentOrganization } = useOrganization() as {
    organization: { _id?: string; id?: string; name?: string } | undefined;
  };
  const { userMemberships, setActive } = useOrganizationList();
  const memberships = userMemberships?.data ?? [];

  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const currentOrgId = currentOrganization?._id || currentOrganization?.id;

  async function handleSwitch(orgId: string) {
    if (orgId === currentOrgId) {
      navigate('/');
      return;
    }
    setSwitchingId(orgId);
    try {
      await setActive({ organization: orgId });
      // setActive triggers a hard reload, so we never reach here in practice.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Switch failed';
      showErrorToast(`Failed to switch project: ${message}`, 'Switch failed');
      setSwitchingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    try {
      const created = await createOrganization({ name: trimmed });
      showSuccessToast(`Project "${created.name}" created`);
      queryClient.removeQueries();
      await setActive({ organization: created._id });
      // setActive reloads.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed';
      showErrorToast(`Failed to create project: ${message}`, 'Create failed');
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <PageMeta title="Select or create project" />

      <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
        <div>
          <h1 className="text-foreground-950 text-xl font-semibold">Your projects</h1>
          <p className="text-foreground-600 mt-1 text-sm">
            Switch between projects you belong to, or create a new one.
          </p>
        </div>

        {memberships.length > 0 && (
          <div className="flex flex-col gap-1">
            <h2 className="text-foreground-700 text-xs font-medium uppercase tracking-wide">
              Existing projects
            </h2>
            <div className="border-neutral-200 flex flex-col rounded-lg border bg-white">
              {memberships.map((m) => {
                const orgId = m.organization.id;
                const isActive = orgId === currentOrgId;
                const isLoading = switchingId === orgId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSwitch(orgId)}
                    disabled={!!switchingId}
                    className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 text-left last:border-b-0 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <div className="flex flex-col">
                      <span className="text-foreground-950 text-sm font-medium">{m.organization.name}</span>
                      {isActive && <span className="text-foreground-500 text-xs">Currently active</span>}
                    </div>
                    {isLoading && <span className="text-foreground-500 text-xs">Switching…</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <h2 className="text-foreground-700 text-xs font-medium uppercase tracking-wide">Create new project</h2>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name (e.g. Mobile App)"
            disabled={isSubmitting}
            maxLength={100}
            className="border-neutral-200 focus:border-primary-base focus:ring-primary-base/20 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
            autoFocus
          />
          <Button type="submit" variant="primary" disabled={!name.trim() || isSubmitting} isLoading={isSubmitting}>
            Create project
          </Button>
        </form>
      </div>
    </>
  );
}

export const OrganizationListPage = () => {
  // Self-hosted (renovu) without enterprise auth uses the local picker. Cloud
  // Novu / enterprise still uses the Clerk-flavored signup flow.
  if (IS_SELF_HOSTED && !IS_ENTERPRISE) {
    return <SelfHostedProjectListPage />;
  }

  return (
    <>
      <PageMeta title="Select or create organization" />
      <OrganizationCreate />
    </>
  );
};
