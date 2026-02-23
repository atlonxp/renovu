import { ClientSession } from 'mongoose';
import type { EnforceEnvOrOrgIds } from '../../types/enforce';
import { BaseRepository } from '../base-repository';
import {
  LocalizationGroupDBModel,
  LocalizationGroupEntity,
  LocalizationResourceEnum,
} from './localization-group.entity';
import { LocalizationGroup } from './localization-group.schema';

export class LocalizationGroupRepository extends BaseRepository<
  LocalizationGroupDBModel,
  LocalizationGroupEntity,
  EnforceEnvOrOrgIds
> {
  constructor() {
    super(LocalizationGroup, LocalizationGroupEntity);
  }

  async findByResource(
    resourceType: LocalizationResourceEnum,
    resourceInternalId: string,
    environmentId: string,
    organizationId: string
  ) {
    return this.findOne({
      resourceType,
      _resourceInternalId: resourceInternalId,
      _environmentId: environmentId,
      _organizationId: organizationId,
    });
  }

  async findByIds(ids: string[], environmentId: string, organizationId: string): Promise<LocalizationGroupEntity[]> {
    return this.find({
      _id: { $in: ids },
      _environmentId: environmentId,
      _organizationId: organizationId,
    });
  }

  async getOrCreateForResource(
    resourceType: LocalizationResourceEnum,
    resourceId: string,
    resourceName: string,
    _resourceInternalId: string,
    environmentId: string,
    organizationId: string,
    session?: ClientSession | null
  ) {
    let group = await this.findByResource(resourceType, _resourceInternalId, environmentId, organizationId);

    if (!group) {
      group = await this.create(
        {
          resourceType,
          resourceId,
          resourceName,
          enabled: true,
          _resourceInternalId,
          _environmentId: environmentId,
          _organizationId: organizationId,
        },
        { session }
      );
    } else if (group.resourceName !== resourceName || !group.enabled) {
      // Update resource name if changed, or re-enable if disabled
      await this.update(
        {
          _id: group._id,
          _environmentId: environmentId,
          _organizationId: organizationId,
        },
        { resourceName, enabled: true },
        { session }
      );

      group = await this.findByResource(resourceType, _resourceInternalId, environmentId, organizationId);
    }

    return group;
  }

  /**
   * Set enabled status for a localization group
   */
  async setEnabled(
    resourceType: LocalizationResourceEnum,
    resourceInternalId: string,
    environmentId: string,
    organizationId: string,
    enabled: boolean
  ): Promise<void> {
    const result = await this.update(
      {
        resourceType,
        _resourceInternalId: resourceInternalId,
        _environmentId: environmentId,
        _organizationId: organizationId,
      },
      { $set: { enabled } }
    );

    // Log for debugging
    console.log(`[LocalizationGroupRepository] setEnabled: resourceInternalId=${resourceInternalId}, enabled=${enabled}, result=`, result);
  }

  /**
   * Find all enabled localization groups for an organization/environment
   * Used for bulk operations like translating all groups when new locales are added
   */
  async findEnabledGroups(
    environmentId: string,
    organizationId: string
  ): Promise<LocalizationGroupEntity[]> {
    return this.find({
      _environmentId: environmentId,
      _organizationId: organizationId,
      enabled: { $ne: false }, // Only enabled groups
    });
  }

  async findPaginatedGroups(
    environmentId: string,
    organizationId: string,
    options: {
      query?: string;
      limit: number;
      offset: number;
    }
  ): Promise<{ data: LocalizationGroupEntity[]; totalCount: number }> {
    const { query, limit, offset } = options;

    const filters: any = {
      _environmentId: environmentId,
      _organizationId: organizationId,
      enabled: { $ne: false }, // Only show enabled groups (includes legacy records without the field)
    };

    if (query) {
      // Use regex search like workflow controller for consistency
      filters.$or = [
        { resourceName: { $regex: this.regExpEscape(query), $options: 'i' } },
        { resourceId: { $regex: this.regExpEscape(query), $options: 'i' } },
      ];
    }

    const [totalCount, data] = await Promise.all([
      this.count(filters),
      this.find(
        filters,
        {},
        {
          sort: { updatedAt: -1 },
          skip: offset,
          limit,
        }
      ),
    ]);

    return { data, totalCount };
  }
}
