import { Injectable, Logger } from '@nestjs/common';
import { DalService } from '@novu/dal';
import { ObjectId } from 'mongodb';
import { ExportedWorkflowPackage } from './dto';

/**
 * Fields to strip from every exported document.
 * These are environment/org-specific and get re-assigned on import.
 */
const ENV_SPECIFIC_FIELDS = ['_environmentId', '_organizationId', '_creatorId', '_updatedBy', '_lastPublishedBy'];

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly dalService: DalService) {}

  /**
   * Export selected workflows (or all) and their full dependency graph.
   *
   * Dependency resolution order:
   *   workflows → steps[]._templateId → messageTemplates
   *   messageTemplates → _layoutId → layouts
   *   messageTemplates → _feedId → feeds
   *   workflows → _notificationGroupId → notificationGroups
   *   workflows._id → controlValues._workflowId → controlValues
   */
  async exportWorkflows(workflowIds: string[], environmentId: string): Promise<ExportedWorkflowPackage> {
    const db = this.dalService.connection.db;
    const startTime = Date.now();

    // ── 1. Fetch workflows ──
    const workflowCollection = db.collection('notificationtemplates');
    let workflows: any[];

    if (workflowIds.length === 1 && workflowIds[0] === 'all') {
      this.logger.log(`Exporting ALL workflows for environment ${environmentId}`);
      workflows = await workflowCollection
        .find({ _environmentId: new ObjectId(environmentId), deleted: { $ne: true } })
        .toArray();
    } else {
      this.logger.log(`Exporting ${workflowIds.length} workflows for environment ${environmentId}`);
      const objectIds = workflowIds.map((id) => new ObjectId(id));
      workflows = await workflowCollection
        .find({
          _id: { $in: objectIds },
          _environmentId: new ObjectId(environmentId),
          deleted: { $ne: true },
        })
        .toArray();
    }

    this.logger.log(`Found ${workflows.length} workflows to export`);

    if (workflows.length === 0) {
      return this.buildEmptyPackage();
    }

    // ── 2. Collect referenced IDs from workflow steps → message templates ──
    const messageTemplateIds = new Set<string>();
    const notificationGroupIds = new Set<string>();
    const workflowObjectIds: string[] = [];

    for (const workflow of workflows) {
      workflowObjectIds.push(workflow._id.toString());

      if (workflow._notificationGroupId) {
        notificationGroupIds.add(workflow._notificationGroupId.toString());
      }

      if (workflow.steps && Array.isArray(workflow.steps)) {
        for (const step of workflow.steps) {
          if (step._templateId) {
            messageTemplateIds.add(step._templateId.toString());
          }
          // Also check variants inside steps
          if (step.variants && Array.isArray(step.variants)) {
            for (const variant of step.variants) {
              if (variant._templateId) {
                messageTemplateIds.add(variant._templateId.toString());
              }
            }
          }
        }
      }
    }

    // ── 3. Fetch message templates ──
    const messageTemplateCollection = db.collection('messagetemplates');
    let messageTemplates: any[] = [];

    if (messageTemplateIds.size > 0) {
      const mtObjectIds = Array.from(messageTemplateIds).map((id) => new ObjectId(id));
      messageTemplates = await messageTemplateCollection.find({ _id: { $in: mtObjectIds } }).toArray();
      this.logger.debug(`Fetched ${messageTemplates.length} message templates`);
    }

    // ── 4. From message templates → collect layout IDs and feed IDs ──
    const layoutIds = new Set<string>();
    const feedIds = new Set<string>();

    for (const mt of messageTemplates) {
      if (mt._layoutId) {
        layoutIds.add(mt._layoutId.toString());
      }
      if (mt._feedId) {
        feedIds.add(mt._feedId.toString());
      }
    }

    // ── 5. Fetch layouts (referenced by message templates + v2 BRIDGE layouts) ──
    const layoutCollection = db.collection('layouts');
    let layouts: any[] = [];

    if (layoutIds.size > 0) {
      const layoutObjectIds = Array.from(layoutIds).map((id) => new ObjectId(id));
      layouts = await layoutCollection.find({ _id: { $in: layoutObjectIds } }).toArray();
      this.logger.debug(`Fetched ${layouts.length} layouts referenced by message templates`);
    }

    // Also capture v2 layouts (type=BRIDGE) that may not be referenced by _layoutId
    const v2Layouts = await layoutCollection
      .find({
        _environmentId: new ObjectId(environmentId),
        type: 'BRIDGE',
        origin: 'novu-cloud',
        deleted: { $ne: true },
      })
      .toArray();

    const existingLayoutIds = new Set(layouts.map((l) => l._id.toString()));
    for (const v2Layout of v2Layouts) {
      if (!existingLayoutIds.has(v2Layout._id.toString())) {
        layouts.push(v2Layout);
      }
    }
    this.logger.debug(`Total layouts to export: ${layouts.length} (including ${v2Layouts.length} v2 layouts)`);

    // ── 6. Fetch feeds ──
    const feedCollection = db.collection('feeds');
    let feeds: any[] = [];

    if (feedIds.size > 0) {
      const feedObjectIds = Array.from(feedIds).map((id) => new ObjectId(id));
      feeds = await feedCollection.find({ _id: { $in: feedObjectIds } }).toArray();
      this.logger.debug(`Fetched ${feeds.length} feeds`);
    }

    // ── 7. Fetch notification groups ──
    const notificationGroupCollection = db.collection('notificationgroups');
    let notificationGroups: any[] = [];

    if (notificationGroupIds.size > 0) {
      const ngObjectIds = Array.from(notificationGroupIds).map((id) => new ObjectId(id));
      notificationGroups = await notificationGroupCollection.find({ _id: { $in: ngObjectIds } }).toArray();
      this.logger.debug(`Fetched ${notificationGroups.length} notification groups`);
    }

    // ── 8. Fetch control values for the exported workflows ──
    const controlCollection = db.collection('controls');
    let controlValues: any[] = [];

    if (workflowObjectIds.length > 0) {
      const wfObjectIds = workflowObjectIds.map((id) => new ObjectId(id));
      controlValues = await controlCollection.find({ _workflowId: { $in: wfObjectIds } }).toArray();
      this.logger.debug(`Fetched ${controlValues.length} workflow control values`);
    }

    // ── 8b. Fetch control values for the exported layouts (v2 layout content) ──
    if (layouts.length > 0) {
      const layoutObjIds = layouts.map((l) => l._id);
      const layoutControlValues = await controlCollection
        .find({ _layoutId: { $in: layoutObjIds }, level: 'layout' })
        .toArray();
      controlValues.push(...layoutControlValues);
      this.logger.debug(`Fetched ${layoutControlValues.length} layout control values`);
    }

    // ── 9. Strip env-specific fields and map _id → _exportId ──
    const exportedWorkflows = workflows.map((doc) => this.prepareForExport(doc));
    const exportedMessageTemplates = messageTemplates.map((doc) => this.prepareForExport(doc));
    const exportedNotificationGroups = notificationGroups.map((doc) => this.prepareForExport(doc));
    const exportedLayouts = layouts.map((doc) => this.prepareForExport(doc));
    const exportedControlValues = controlValues.map((doc) => this.prepareForExport(doc));
    const exportedFeeds = feeds.map((doc) => this.prepareForExport(doc));

    const duration = Date.now() - startTime;
    this.logger.log(
      `Export completed in ${duration}ms: ${workflows.length} workflows, ` +
        `${messageTemplates.length} message templates, ${notificationGroups.length} notification groups, ` +
        `${layouts.length} layouts, ${controlValues.length} control values, ${feeds.length} feeds`,
    );

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      workflows: exportedWorkflows,
      messageTemplates: exportedMessageTemplates,
      notificationGroups: exportedNotificationGroups,
      layouts: exportedLayouts,
      controlValues: exportedControlValues,
      feeds: exportedFeeds,
    };
  }

  /**
   * Prepare a document for export:
   * - Convert _id (ObjectId) → _exportId (string)
   * - Strip environment-specific fields
   * - Convert remaining ObjectId references to strings for JSON safety
   */
  private prepareForExport(doc: any): any {
    const exported = { ...doc };

    // Preserve _id as _exportId for reference mapping
    exported._exportId = doc._id.toString();

    // Remove _id (will be regenerated on import)
    delete exported._id;

    // Strip environment-specific fields
    for (const field of ENV_SPECIFIC_FIELDS) {
      delete exported[field];
    }

    // Convert any remaining ObjectId instances to strings recursively
    return this.convertObjectIdsToStrings(exported);
  }

  /**
   * Recursively convert ObjectId instances to string representations.
   */
  private convertObjectIdsToStrings(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (obj instanceof ObjectId) {
      return obj.toString();
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.convertObjectIdsToStrings(item));
    }

    if (typeof obj === 'object' && obj.constructor === Object) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.convertObjectIdsToStrings(value);
      }
      return result;
    }

    // Handle Date objects — keep as ISO string
    if (obj instanceof Date) {
      return obj.toISOString();
    }

    return obj;
  }

  /**
   * Build an empty export package when no workflows match.
   */
  private buildEmptyPackage(): ExportedWorkflowPackage {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      workflows: [],
      messageTemplates: [],
      notificationGroups: [],
      layouts: [],
      controlValues: [],
      feeds: [],
    };
  }
}
