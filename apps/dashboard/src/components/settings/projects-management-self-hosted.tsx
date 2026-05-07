import type { IOrganizationEntity } from '@novu/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { RiAddCircleLine, RiArrowRightSLine, RiCheckLine } from 'react-icons/ri';
import { getOrganizations } from '@/api/organization';
import { Avatar, AvatarFallback } from '@/components/primitives/avatar';
import { Button } from '@/components/primitives/button';
import { showErrorToast } from '@/components/primitives/sonner-helpers';
import { ROUTES } from '@/utils/routes';
import { useAuth, useClerk } from '@/utils/self-hosted';

const projectInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

export function ProjectsManagementSelfHosted() {
  const { orgId } = useAuth();
  const clerk = useClerk();
  const navigate = useNavigate();

  const { data: projects = [], isLoading } = useQuery<IOrganizationEntity[]>({
    queryKey: ['my-organizations-settings'],
    queryFn: getOrganizations,
  });

  const switchMutation = useMutation({
    mutationFn: (organizationId: string) => clerk.setActive({ organization: organizationId }),
    onError: (err: Error) => showErrorToast(err.message || 'Could not switch project', 'Switch failed'),
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-label-sm text-text-strong">Your projects</h1>
        <Button
          variant="secondary"
          mode="outline"
          size="2xs"
          leadingIcon={RiAddCircleLine}
          onClick={() => navigate(ROUTES.SIGNUP_ORGANIZATION_LIST)}
        >
          New project
        </Button>
      </div>

      <div className="rounded-lg border border-neutral-100 divide-y divide-neutral-100 bg-white">
        {isLoading && (
          <div className="px-4 py-3 text-sm text-text-soft">Loading projects…</div>
        )}
        {!isLoading && projects.length === 0 && (
          <div className="px-4 py-3 text-sm text-text-soft">You don't have any other projects yet.</div>
        )}
        {projects.map((p) => {
          const isActive = p._id === orgId;
          const switching = switchMutation.isPending && switchMutation.variables === p._id;
          return (
            <div key={p._id} className="flex items-center gap-3 px-4 py-3">
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary-base text-static-white text-xs">
                  {projectInitials(p.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground-950">{p.name}</span>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      <RiCheckLine className="size-3" />
                      Currently active
                    </span>
                  )}
                </div>
              </div>
              {!isActive && (
                <Button
                  variant="secondary"
                  mode="ghost"
                  size="2xs"
                  trailingIcon={RiArrowRightSLine}
                  onClick={() => switchMutation.mutate(p._id)}
                  disabled={switchMutation.isPending}
                >
                  {switching ? 'Switching…' : 'Switch'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
