import { MemberStatusEnum } from '@novu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RiDeleteBin6Line, RiMailSendLine, RiUserAddLine } from 'react-icons/ri';
import { getMembers, inviteMember, type MemberDto, removeMember, resendInvite } from '@/api/members';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/primitives/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/primitives/avatar';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { showErrorToast, showSuccessToast } from '@/components/primitives/sonner-helpers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/primitives/table';
import { useAuth } from '@/utils/self-hosted';

const QUERY_KEY = ['organization-members'] as const;

const initials = (firstName?: string, lastName?: string, email?: string) => {
  const fromName = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.trim().toUpperCase();
  if (fromName) return fromName.slice(0, 2);
  return (email?.[0] ?? '?').toUpperCase();
};

const memberDisplayName = (m: MemberDto) => {
  if (m.user) {
    const full = `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim();
    return full || m.user.email;
  }
  return m.invite?.email ?? 'Pending invite';
};

const memberEmail = (m: MemberDto) => m.user?.email ?? m.invite?.email ?? '—';

export function TeamSettingsSelfHosted() {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const myUserId = currentUser?.externalId;
  const [inviteEmail, setInviteEmail] = useState('');
  const [memberToRemove, setMemberToRemove] = useState<MemberDto | null>(null);

  const { data: members = [], isLoading } = useQuery<MemberDto[]>({
    queryKey: QUERY_KEY,
    queryFn: getMembers,
  });

  const inviteMutation = useMutation({
    mutationFn: inviteMember,
    onSuccess: () => {
      showSuccessToast(`Invite sent to ${inviteEmail}`, 'Invitation sent');
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: Error) => showErrorToast(err.message || 'Could not send invite', 'Invite failed'),
  });

  const resendMutation = useMutation({
    mutationFn: resendInvite,
    onSuccess: () => showSuccessToast('Invite re-sent', 'Sent'),
    onError: (err: Error) => showErrorToast(err.message || 'Could not resend invite', 'Resend failed'),
  });

  const removeMutation = useMutation({
    mutationFn: removeMember,
    onSuccess: () => {
      showSuccessToast('Member removed', 'Removed');
      setMemberToRemove(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: Error) => showErrorToast(err.message || 'Could not remove member', 'Remove failed'),
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inviteEmail.trim();
    if (!trimmed) return;
    inviteMutation.mutate(trimmed);
  };

  const isPending = (m: MemberDto) => m.memberStatus === MemberStatusEnum.INVITED;
  const isSelf = (m: MemberDto) => !!myUserId && m._userId === myUserId;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-label-sm text-text-strong mb-1">Invite a teammate</h2>
        <p className="text-paragraph-sm text-text-soft mb-3">
          Invite anyone to collaborate on this project. They'll receive an email with a link to accept.
        </p>
        <form onSubmit={handleInvite} className="flex gap-2">
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@example.com"
            disabled={inviteMutation.isPending}
            required
            className="flex-1"
          />
          <Button
            type="submit"
            variant="primary"
            mode="filled"
            size="sm"
            disabled={inviteMutation.isPending || !inviteEmail.trim()}
            leadingIcon={RiUserAddLine}
          >
            {inviteMutation.isPending ? 'Sending…' : 'Send invite'}
          </Button>
        </form>
      </div>

      <div>
        <h2 className="text-label-sm text-text-strong mb-3">Members ({members.length})</h2>
        <div className="rounded-lg border border-neutral-100 overflow-hidden">
          <Table isLoading={isLoading} loadingRowsCount={3}>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m._id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarFallback className="bg-primary-base text-static-white text-xs">
                          {initials(m.user?.firstName, m.user?.lastName, m.invite?.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-foreground-950">
                        {memberDisplayName(m)}
                        {isSelf(m) && <span className="ml-1 text-xs text-text-soft">(you)</span>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-text-sub">{memberEmail(m)}</TableCell>
                  <TableCell>
                    <span
                      className={
                        isPending(m)
                          ? 'inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700'
                          : 'inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                      }
                    >
                      {isPending(m) ? 'Pending invite' : 'Active'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {isPending(m) && (
                        <Button
                          variant="secondary"
                          mode="ghost"
                          size="2xs"
                          leadingIcon={RiMailSendLine}
                          disabled={resendMutation.isPending}
                          onClick={() => resendMutation.mutate(m._id)}
                        >
                          Resend
                        </Button>
                      )}
                      {!isSelf(m) && (
                        <Button
                          variant="error"
                          mode="ghost"
                          size="2xs"
                          leadingIcon={RiDeleteBin6Line}
                          onClick={() => setMemberToRemove(m)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToRemove
                ? `${memberDisplayName(memberToRemove)} will lose access to this project. They can be re-invited later.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToRemove && removeMutation.mutate(memberToRemove._id)}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
