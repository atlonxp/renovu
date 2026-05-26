import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { AnalyticsService } from '@novu/application-generic';
import { OrganizationEntity, OrganizationRepository, UserRepository } from '@novu/dal';
import {
  ApiServiceLevelEnum,
  EnvironmentEnum,
  JobTitleEnum,
  MemberRoleEnum,
  OrganizationProductTypeEnum,
} from '@novu/shared';

import { CreateEnvironmentCommand } from '../../../environments-v1/usecases/create-environment/create-environment.command';
import { CreateEnvironment } from '../../../environments-v1/usecases/create-environment/create-environment.usecase';
import { GetOrganizationCommand } from '../get-organization/get-organization.command';
import { GetOrganization } from '../get-organization/get-organization.usecase';
import { AddMemberCommand } from '../membership/add-member/add-member.command';
import { AddMember } from '../membership/add-member/add-member.usecase';
import { CreateOrganizationCommand } from './create-organization.command';

@Injectable()
export class CreateOrganization {
  private readonly logger = new Logger(CreateOrganization.name);

  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly addMemberUsecase: AddMember,
    private readonly getOrganizationUsecase: GetOrganization,
    private readonly userRepository: UserRepository,
    private readonly createEnvironmentUsecase: CreateEnvironment,
    private analyticsService: AnalyticsService
  ) {}

  async execute(command: CreateOrganizationCommand): Promise<OrganizationEntity> {
    const user = await this.userRepository.findById(command.userId);
    if (!user) throw new BadRequestException('User not found');

    const isSelfHosted = process.env.IS_SELF_HOSTED === 'true';
    // ReNovu: Self-hosted deployments get UNLIMITED tier without requiring NOVU_ENTERPRISE
    // Enterprise packages are not available, but feature-tiers-constants.ts unlocks all features
    const defaultApiServiceLevel = isSelfHosted ? ApiServiceLevelEnum.UNLIMITED : ApiServiceLevelEnum.FREE;

    const createdOrganization = await this.organizationRepository.create({
      logo: command.logo,
      name: command.name,
      apiServiceLevel: command.apiServiceLevel || defaultApiServiceLevel,
      domain: command.domain,
      language: command.language,
      // ReNovu: Auto-remove Novu branding for self-hosted deployments
      removeNovuBranding: isSelfHosted ? true : undefined,
      productType: OrganizationProductTypeEnum.PLATFORM,
    });

    /**
     * Best-effort cleanup if env bootstrap fails. Mongo transactions across
     * AddMember + CreateEnvironment would be cleaner but require threading a
     * session through every repo call. For now: if anything below this point
     * throws, delete the half-created org so the caller can retry without
     * orphans piling up.
     */
    try {
      if (command.jobTitle) {
        await this.updateJobTitle(user, command.jobTitle);
      }

      await this.addMemberUsecase.execute(
        AddMemberCommand.create({
          roles: [MemberRoleEnum.OSS_ADMIN],
          organizationId: createdOrganization._id,
          userId: command.userId,
        })
      );

      const devEnv = await this.createEnvironmentUsecase.execute(
        CreateEnvironmentCommand.create({
          userId: user._id,
          name: EnvironmentEnum.DEVELOPMENT,
          organizationId: createdOrganization._id,
          system: true,
        })
      );

      await this.createEnvironmentUsecase.execute(
        CreateEnvironmentCommand.create({
          userId: user._id,
          name: EnvironmentEnum.PRODUCTION,
          organizationId: createdOrganization._id,
          parentEnvironmentId: devEnv._id,
          system: true,
        })
      );
    } catch (error) {
      this.logger.error(
        `Org bootstrap failed for org ${createdOrganization._id}; rolling back. Error: ${error instanceof Error ? error.message : String(error)}`
      );
      try {
        await this.organizationRepository.delete({ _id: createdOrganization._id });
      } catch (cleanupError) {
        this.logger.error(
          `Org rollback ALSO failed for ${createdOrganization._id}. Manual cleanup required. Error: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
        );
      }
      throw error;
    }

    this.analyticsService.upsertGroup(createdOrganization._id, createdOrganization, user);

    this.analyticsService.track('[Authentication] - Create Organization', user._id, {
      _organization: createdOrganization._id,
      language: command.language,
      creatorJobTitle: command.jobTitle,
    });

    const organizationAfterChanges = await this.getOrganizationUsecase.execute(
      GetOrganizationCommand.create({
        id: createdOrganization._id,
        userId: command.userId,
      })
    );

    return organizationAfterChanges as OrganizationEntity;
  }

  private async updateJobTitle(user, jobTitle: JobTitleEnum) {
    await this.userRepository.update(
      {
        _id: user._id,
      },
      {
        $set: {
          jobTitle,
        },
      }
    );

    this.analyticsService.setValue(user._id, 'jobTitle', jobTitle);
  }
}
