import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { MemberRepository, UserRepository } from '@novu/dal';
import { Types } from 'mongoose';
import { AuthService } from '../../services/auth.service';
import { SwitchOrganizationCommand } from './switch-organization.command';

@Injectable()
export class SwitchOrganization {
  constructor(
    private userRepository: UserRepository,
    private memberRepository: MemberRepository,
    private authService: AuthService
  ) {}

  async execute(command: SwitchOrganizationCommand) {
    // Reject malformed orgIds before they hit Mongo (where the ObjectId cast
    // throws an unhandled error → ugly 500). Treat them as 401, same as
    // genuinely-not-a-member: the response shape stays consistent and we don't
    // leak whether an id is malformed vs. just unauthorized.
    if (!Types.ObjectId.isValid(command.newOrganizationId)) {
      throw new UnauthorizedException(`Not authorized for organization ${command.newOrganizationId}`);
    }

    const isAuthenticated = await this.authService.isAuthenticatedForOrganization(
      command.userId,
      command.newOrganizationId
    );
    if (!isAuthenticated) {
      throw new UnauthorizedException(`Not authorized for organization ${command.newOrganizationId}`);
    }

    const member = await this.memberRepository.findMemberByUserId(command.newOrganizationId, command.userId);
    if (!member) throw new BadRequestException('Member not found');

    const user = await this.userRepository.findById(command.userId);
    if (!user) throw new BadRequestException(`User ${command.userId} not found`);

    const token = await this.authService.getSignedToken(user, command.newOrganizationId, member);

    return token;
  }
}
