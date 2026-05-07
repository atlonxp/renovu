import { Body, ClassSerializerInterceptor, Controller, Delete, Get, Param, Patch, Post, Put, UseInterceptors } from '@nestjs/common';
import { ApiExcludeController, ApiExcludeEndpoint, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { OrganizationEntity } from '@novu/dal';
import { ExternalApiAccessible, RequirePermissions } from '@novu/application-generic';
import { MemberRoleEnum, PermissionsEnum, UserSessionData } from '@novu/shared';
import { RequireAuthentication } from '../auth/framework/auth.decorator';
import { ApiCommonResponses, ApiResponse } from '../shared/framework/response.decorator';
import { UserSession } from '../shared/framework/user.decorator';
import { CreateOrganizationDto } from './dtos/create-organization.dto';
import { IGetMyOrganizationDto } from './dtos/get-my-organization.dto';
import { GetOrganizationSettingsDto } from './dtos/get-organization-settings.dto';
import { MemberResponseDto } from './dtos/member-response.dto';
import { OrganizationBrandingResponseDto, OrganizationResponseDto } from './dtos/organization-response.dto';
import { RenameOrganizationDto } from './dtos/rename-organization.dto';
import { UpdateBrandingDetailsDto } from './dtos/update-branding-details.dto';
import { UpdateMemberRolesDto } from './dtos/update-member-roles.dto';
import { UpdateOrganizationSettingsDto } from './dtos/update-organization-settings.dto';
import { CreateOrganizationCommand } from './usecases/create-organization/create-organization.command';
import { CreateOrganization } from './usecases/create-organization/create-organization.usecase';
import { GetMyOrganizationCommand } from './usecases/get-my-organization/get-my-organization.command';
import { GetMyOrganization } from './usecases/get-my-organization/get-my-organization.usecase';
import { GetOrganizationSettingsCommand } from './usecases/get-organization-settings/get-organization-settings.command';
import { GetOrganizationSettings } from './usecases/get-organization-settings/get-organization-settings.usecase';
import { GetOrganizationsCommand } from './usecases/get-organizations/get-organizations.command';
import { GetOrganizations } from './usecases/get-organizations/get-organizations.usecase';
import { ChangeMemberRoleCommand } from './usecases/membership/change-member-role/change-member-role.command';
import { ChangeMemberRole } from './usecases/membership/change-member-role/change-member-role.usecase';
import { GetMembersCommand } from './usecases/membership/get-members/get-members.command';
import { GetMembers } from './usecases/membership/get-members/get-members.usecase';
import { RemoveMemberCommand } from './usecases/membership/remove-member/remove-member.command';
import { RemoveMember } from './usecases/membership/remove-member/remove-member.usecase';
import { RenameOrganization } from './usecases/rename-organization/rename-organization.usecase';
import { RenameOrganizationCommand } from './usecases/rename-organization/rename-organization-command';
import { UpdateBrandingDetailsCommand } from './usecases/update-branding-details/update-branding-details.command';
import { UpdateBrandingDetails } from './usecases/update-branding-details/update-branding-details.usecase';
import { UpdateOrganizationSettingsCommand } from './usecases/update-organization-settings/update-organization-settings.command';
import { UpdateOrganizationSettings } from './usecases/update-organization-settings/update-organization-settings.usecase';

@Controller('/organizations')
@UseInterceptors(ClassSerializerInterceptor)
@RequireAuthentication()
@ApiTags('Organizations')
@ApiCommonResponses()
@ApiExcludeController()
export class EEOrganizationController {
  constructor(
    private createOrganizationUsecase: CreateOrganization,
    private updateBrandingDetailsUsecase: UpdateBrandingDetails,
    private getMyOrganizationUsecase: GetMyOrganization,
    private renameOrganizationUsecase: RenameOrganization,
    private getOrganizationSettingsUsecase: GetOrganizationSettings,
    private updateOrganizationSettingsUsecase: UpdateOrganizationSettings,
    private getOrganizationsUsecase: GetOrganizations,
    private getMembersUsecase: GetMembers,
    private removeMemberUsecase: RemoveMember,
    private changeMemberRoleUsecase: ChangeMemberRole
  ) {}

  /**
   * List every organization the current user is an active member of.
   * Used by the dashboard's project switcher to render the dropdown.
   */
  @Get('/')
  @ApiResponse(OrganizationResponseDto, 200, true)
  @ApiOperation({
    summary: 'Fetch all organizations the current user is a member of',
  })
  async listMyOrganizations(@UserSession() user: UserSessionData): Promise<OrganizationEntity[]> {
    return this.getOrganizationsUsecase.execute(
      GetOrganizationsCommand.create({
        userId: user._id,
      })
    );
  }

  @Post('/')
  @ExternalApiAccessible()
  @ApiResponse(OrganizationResponseDto, 201)
  @ApiOperation({
    summary: 'Create an organization',
  })
  async createOrganization(
    @UserSession() user: UserSessionData,
    @Body() body: CreateOrganizationDto
  ): Promise<OrganizationEntity> {
    return await this.createOrganizationUsecase.execute(
      CreateOrganizationCommand.create({
        userId: user._id,
        logo: body.logo,
        name: body.name,
        jobTitle: body.jobTitle,
        domain: body.domain,
        language: body.language,
      })
    );
  }

  /**
   * @deprecated - used in v1 legacy web
   */
  @Get('/me')
  @ApiResponse(OrganizationResponseDto)
  @ApiOperation({
    summary: 'Fetch current organization details',
  })
  async getMyOrganization(@UserSession() user: UserSessionData): Promise<IGetMyOrganizationDto> {
    const command = GetMyOrganizationCommand.create({
      userId: user._id,
      id: user.organizationId,
    });

    return await this.getMyOrganizationUsecase.execute(command);
  }

  /**
   * @deprecated - used in v1 legacy web
   */
  @Put('/branding')
  @ExternalApiAccessible()
  @ApiResponse(OrganizationBrandingResponseDto)
  @ApiOperation({
    summary: 'Update organization branding details',
  })
  async updateBrandingDetails(@UserSession() user: UserSessionData, @Body() body: UpdateBrandingDetailsDto) {
    return await this.updateBrandingDetailsUsecase.execute(
      UpdateBrandingDetailsCommand.create({
        logo: body.logo,
        color: body.color,
        userId: user._id,
        id: user.organizationId,
        fontColor: body.fontColor,
        fontFamily: body.fontFamily,
        contentBackground: body.contentBackground,
      })
    );
  }

  /**
   * @deprecated - used in v1 legacy web
   */
  @Patch('/')
  @ExternalApiAccessible()
  @ApiResponse(RenameOrganizationDto)
  @ApiOperation({
    summary: 'Rename organization name',
  })
  async renameOrganization(@UserSession() user: UserSessionData, @Body() body: RenameOrganizationDto) {
    return await this.renameOrganizationUsecase.execute(
      RenameOrganizationCommand.create({
        name: body.name,
        userId: user._id,
        id: user.organizationId,
      })
    );
  }

  @Get('/settings')
  @ExternalApiAccessible()
  @ApiResponse(GetOrganizationSettingsDto)
  @ApiOperation({
    summary: 'Get organization settings',
  })
  @RequirePermissions(PermissionsEnum.ORG_SETTINGS_READ)
  async getSettings(@UserSession() user: UserSessionData) {
    return await this.getOrganizationSettingsUsecase.execute(
      GetOrganizationSettingsCommand.create({
        organizationId: user.organizationId,
      })
    );
  }

  @Patch('/settings')
  @ApiResponse(UpdateOrganizationSettingsDto)
  @ExternalApiAccessible()
  @ApiOperation({
    summary: 'Update organization settings',
  })
  @RequirePermissions(PermissionsEnum.ORG_SETTINGS_WRITE)
  async updateSettings(@UserSession() user: UserSessionData, @Body() body: UpdateOrganizationSettingsDto) {
    return await this.updateOrganizationSettingsUsecase.execute(
      UpdateOrganizationSettingsCommand.create({
        userId: user._id,
        organizationId: user.organizationId,
        removeNovuBranding: body.removeNovuBranding,
        defaultLocale: body.defaultLocale,
        targetLocales: body.targetLocales,
      })
    );
  }

  @Get('/members')
  @ExternalApiAccessible()
  @ApiResponse(MemberResponseDto, 200, true)
  @ApiOperation({ summary: 'Fetch all members of current organization' })
  async listOrganizationMembers(@UserSession() user: UserSessionData) {
    return await this.getMembersUsecase.execute(
      GetMembersCommand.create({
        user,
        userId: user._id,
        organizationId: user.organizationId,
      })
    );
  }

  @Delete('/members/:memberId')
  @ExternalApiAccessible()
  @ApiResponse(MemberResponseDto)
  @ApiOperation({ summary: 'Remove a member from organization' })
  @ApiParam({ name: 'memberId', type: String, required: true })
  async removeMember(@UserSession() user: UserSessionData, @Param('memberId') memberId: string) {
    return await this.removeMemberUsecase.execute(
      RemoveMemberCommand.create({
        userId: user._id,
        organizationId: user.organizationId,
        memberId,
      })
    );
  }

  @Put('/members/:memberId/roles')
  @ExternalApiAccessible()
  @ApiExcludeEndpoint()
  @ApiResponse(MemberResponseDto)
  @ApiOperation({ summary: 'Update a member role to admin' })
  @ApiParam({ name: 'memberId', type: String, required: true })
  async updateMemberRoles(
    @UserSession() user: UserSessionData,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRolesDto
  ) {
    if (body.role !== MemberRoleEnum.OSS_ADMIN) {
      throw new Error('Only admin role can be assigned to a member');
    }

    return await this.changeMemberRoleUsecase.execute(
      ChangeMemberRoleCommand.create({
        memberId,
        role: MemberRoleEnum.OSS_ADMIN,
        userId: user._id,
        organizationId: user.organizationId,
      })
    );
  }
}
