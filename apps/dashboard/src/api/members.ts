import { MemberRoleEnum, MemberStatusEnum } from '@novu/shared';
import { del, get, post } from './api.client';

export type MemberDto = {
  _id: string;
  _userId: string;
  _organizationId: string;
  user?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  roles?: MemberRoleEnum[] | MemberRoleEnum;
  memberStatus?: MemberStatusEnum;
  invite?: {
    email: string;
    token: string;
    invitationDate: string;
    answerDate?: string;
    _inviterId: string;
  };
};

export async function getMembers(): Promise<MemberDto[]> {
  const response = await get<{ data: MemberDto[] }>('/organizations/members');
  return response.data;
}

export async function inviteMember(email: string): Promise<{ success: boolean }> {
  return post<{ success: boolean }>('/invites', { body: { email } });
}

export async function resendInvite(memberId: string): Promise<{ success: boolean }> {
  return post<{ success: boolean }>('/invites/resend', { body: { memberId } });
}

export async function removeMember(memberId: string): Promise<MemberDto> {
  const response = await del<{ data: MemberDto }>(`/organizations/members/${memberId}`);
  return response.data;
}
