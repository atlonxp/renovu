import type { ChangePropsValueType } from '../../types/helpers';
import type { EnvironmentId } from '../environment';
import type { OrganizationId } from '../organization';

export enum LocalizationResourceEnum {
  WORKFLOW = 'workflow',
  LAYOUT = 'layout',
}

export class LocalizationGroupEntity {
  _id: string;

  resourceType: LocalizationResourceEnum;
  resourceId: string;
  resourceName: string;

  /**
   * Whether translations are enabled for this resource.
   * When false, this group should be filtered out from the translations list.
   * Optional because legacy records may not have this field (defaults to true in schema).
   */
  enabled?: boolean;

  _resourceInternalId: string;
  _environmentId: EnvironmentId;
  _organizationId: OrganizationId;
  createdAt: string;
  updatedAt: string;
}

export type LocalizationGroupDBModel = ChangePropsValueType<
  LocalizationGroupEntity,
  '_environmentId' | '_organizationId' | '_resourceInternalId'
>;
