import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { DalService } from '@novu/dal';
import { ObjectId } from 'mongodb';
import { ImportStrategy, ImportCountsDto, ImportErrorDto, ImportResponseDto } from './dto';
import { ExportedWorkflowPackage } from './dto';

/**
 * Import service for workflow packages.
 *
 * Handles cross-environment workflow migration with full ID remapping.
 * Import order follows dependency graph (dependencies first):
 *   1. notificationgroups   (no dependencies)
 *   2. feeds                (no dependencies)
 *   3. layouts              (no dependencies)
 *   4. messagetemplates     (depends on layouts, feeds)
 *   5. notificationtemplates (depends on messagetemplates, notificationgroups)
 *   6. controls             (depends on notificationtemplates — _workflowId, _stepId)
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private operationInProgress = false;

  constructor(private readonly dalService: DalService) {}

  private async acquireLock(): Promise<void> {
    if (this.operationInProgress) {
      throw new ConflictException('Another import operation is already in progress');
    }
    this.operationInProgress = true;
  }

  private releaseLock(): void {
    this.operationInProgress = false;
  }

  /**
   * Import a workflow package into the target environment.
   */
  async importWorkflows(
    pkg: ExportedWorkflowPackage,
    environmentId: string,
    organizationId: string,
    strategy: ImportStrategy,
  ): Promise<ImportResponseDto> {
    await this.acquireLock();
    try {
      return await this._importWorkflowsInternal(pkg, environmentId, organizationId, strategy);
    } finally {
      this.releaseLock();
    }
  }

  private async _importWorkflowsInternal(
    pkg: ExportedWorkflowPackage,
    environmentId: string,
    organizationId: string,
    strategy: ImportStrategy,
  ): Promise<ImportResponseDto> {
    const startTime = Date.now();
    const db = this.dalService.connection.db;

    // ID remap tables: exportId (string) → newId (ObjectId)
    const idMap: Record<string, ObjectId> = {};

    const imported: ImportCountsDto = {
      workflows: 0,
      messageTemplates: 0,
      notificationGroups: 0,
      layouts: 0,
      controlValues: 0,
      feeds: 0,
    };

    const skipped: ImportCountsDto = {
      workflows: 0,
      messageTemplates: 0,
      notificationGroups: 0,
      layouts: 0,
      controlValues: 0,
      feeds: 0,
    };

    const errors: ImportErrorDto[] = [];

    const envObjectId = new ObjectId(environmentId);
    const orgObjectId = new ObjectId(organizationId);

    // ── 1. Import notification groups (match by name or create) ──
    this.logger.log(`Importing ${pkg.notificationGroups.length} notification groups...`);
    const ngCollection = db.collection('notificationgroups');

    for (const ng of pkg.notificationGroups) {
      try {
        const existing = await ngCollection.findOne({
          name: ng.name,
          _environmentId: envObjectId,
        });

        if (existing) {
          // Map the exported ID to the existing document's ID
          idMap[ng._exportId] = existing._id;
          if (strategy === 'overwrite') {
            const updateDoc = this.stripExportMeta(ng);
            delete updateDoc._id;
            updateDoc._environmentId = envObjectId;
            updateDoc._organizationId = orgObjectId;
            await ngCollection.updateOne({ _id: existing._id }, { $set: updateDoc });
            imported.notificationGroups++;
            this.logger.debug(`Notification group "${ng.name}" overwritten`);
          } else {
            skipped.notificationGroups++;
            this.logger.debug(`Notification group "${ng.name}" already exists, mapped`);
          }
        } else {
          const newDoc = this.stripExportMeta(ng);
          newDoc._environmentId = envObjectId;
          newDoc._organizationId = orgObjectId;

          const result = await ngCollection.insertOne(newDoc);
          idMap[ng._exportId] = result.insertedId;
          imported.notificationGroups++;
          this.logger.debug(`Created notification group "${ng.name}"`);
        }
      } catch (error) {
        errors.push({
          entity: 'notificationGroup',
          exportId: ng._exportId,
          identifier: ng.name,
          message: error.message,
        });
        this.logger.warn(`Failed to import notification group "${ng.name}": ${error.message}`);
      }
    }

    // ── 2. Import feeds (match by identifier or create) ──
    this.logger.log(`Importing ${pkg.feeds.length} feeds...`);
    const feedCollection = db.collection('feeds');

    for (const feed of pkg.feeds) {
      try {
        const existing = await feedCollection.findOne({
          identifier: feed.identifier,
          _environmentId: envObjectId,
        });

        if (existing) {
          idMap[feed._exportId] = existing._id;
          if (strategy === 'overwrite') {
            const updateDoc = this.stripExportMeta(feed);
            delete updateDoc._id;
            updateDoc._environmentId = envObjectId;
            updateDoc._organizationId = orgObjectId;
            await feedCollection.updateOne({ _id: existing._id }, { $set: updateDoc });
            imported.feeds++;
            this.logger.debug(`Feed "${feed.identifier}" overwritten`);
          } else {
            skipped.feeds++;
            this.logger.debug(`Feed "${feed.identifier}" already exists, mapped`);
          }
        } else {
          const newDoc = this.stripExportMeta(feed);
          newDoc._environmentId = envObjectId;
          newDoc._organizationId = orgObjectId;

          const result = await feedCollection.insertOne(newDoc);
          idMap[feed._exportId] = result.insertedId;
          imported.feeds++;
          this.logger.debug(`Created feed "${feed.identifier}"`);
        }
      } catch (error) {
        errors.push({
          entity: 'feed',
          exportId: feed._exportId,
          identifier: feed.identifier,
          message: error.message,
        });
        this.logger.warn(`Failed to import feed "${feed.identifier}": ${error.message}`);
      }
    }

    // ── 3. Import layouts (match by identifier or create) ──
    this.logger.log(`Importing ${pkg.layouts.length} layouts...`);
    const layoutCollection = db.collection('layouts');

    for (const layout of pkg.layouts) {
      try {
        const existing = await layoutCollection.findOne({
          identifier: layout.identifier,
          _environmentId: envObjectId,
        });

        if (existing) {
          idMap[layout._exportId] = existing._id;
          if (strategy === 'overwrite') {
            const updateDoc = this.stripExportMeta(layout);
            delete updateDoc._id;
            updateDoc._environmentId = envObjectId;
            updateDoc._organizationId = orgObjectId;
            await layoutCollection.updateOne({ _id: existing._id }, { $set: updateDoc });
            imported.layouts++;
            this.logger.debug(`Layout "${layout.identifier}" overwritten`);
          } else {
            skipped.layouts++;
            this.logger.debug(`Layout "${layout.identifier}" already exists, mapped`);
          }
        } else {
          const newDoc = this.stripExportMeta(layout);
          newDoc._environmentId = envObjectId;
          newDoc._organizationId = orgObjectId;

          const result = await layoutCollection.insertOne(newDoc);
          idMap[layout._exportId] = result.insertedId;
          imported.layouts++;
          this.logger.debug(`Created layout "${layout.identifier}"`);
        }
      } catch (error) {
        errors.push({
          entity: 'layout',
          exportId: layout._exportId,
          identifier: layout.identifier,
          message: error.message,
        });
        this.logger.warn(`Failed to import layout "${layout.identifier}": ${error.message}`);
      }
    }

    // ── 4. Import message templates (create new, remap _layoutId and _feedId) ──
    this.logger.log(`Importing ${pkg.messageTemplates.length} message templates...`);
    const mtCollection = db.collection('messagetemplates');

    for (const mt of pkg.messageTemplates) {
      try {
        const newDoc = this.stripExportMeta(mt);
        newDoc._environmentId = envObjectId;
        newDoc._organizationId = orgObjectId;

        // Remap _layoutId
        if (mt._layoutId && idMap[mt._layoutId]) {
          newDoc._layoutId = idMap[mt._layoutId];
        } else if (mt._layoutId) {
          // If the layout wasn't in the export, try to find it by the original ID in target env
          // or leave it null to avoid broken references
          this.logger.debug(`Layout ${mt._layoutId} not found in remap table, clearing reference`);
          delete newDoc._layoutId;
        }

        // Remap _feedId
        if (mt._feedId && idMap[mt._feedId]) {
          newDoc._feedId = idMap[mt._feedId];
        } else if (mt._feedId) {
          this.logger.debug(`Feed ${mt._feedId} not found in remap table, clearing reference`);
          delete newDoc._feedId;
        }

        const result = await mtCollection.insertOne(newDoc);
        idMap[mt._exportId] = result.insertedId;
        imported.messageTemplates++;
      } catch (error) {
        errors.push({
          entity: 'messageTemplate',
          exportId: mt._exportId,
          message: error.message,
        });
        this.logger.warn(`Failed to import message template ${mt._exportId}: ${error.message}`);
      }
    }

    // ── 5. Import workflows (remap steps[]._templateId, _notificationGroupId) ──
    this.logger.log(`Importing ${pkg.workflows.length} workflows...`);
    const workflowCollection = db.collection('notificationtemplates');

    for (const workflow of pkg.workflows) {
      try {
        // Determine trigger identifier for conflict detection
        const triggerIdentifier = this.getTriggerIdentifier(workflow);

        if (strategy === 'skip' && triggerIdentifier) {
          const existing = await workflowCollection.findOne({
            'triggers.identifier': triggerIdentifier,
            _environmentId: envObjectId,
            deleted: { $ne: true },
          });

          if (existing) {
            idMap[workflow._exportId] = existing._id;
            skipped.workflows++;
            this.logger.debug(`Workflow "${triggerIdentifier}" exists, skipping`);
            continue;
          }
        }

        if (strategy === 'overwrite' && triggerIdentifier) {
          const existing = await workflowCollection.findOne({
            'triggers.identifier': triggerIdentifier,
            _environmentId: envObjectId,
            deleted: { $ne: true },
          });

          if (existing) {
            // Overwrite: update existing workflow and cascade
            const updatedDoc = this.prepareWorkflowForImport(workflow, envObjectId, orgObjectId, idMap);
            delete updatedDoc._id; // Don't overwrite the _id

            await workflowCollection.updateOne({ _id: existing._id }, { $set: updatedDoc });

            idMap[workflow._exportId] = existing._id;
            imported.workflows++;
            this.logger.debug(`Workflow "${triggerIdentifier}" overwritten`);

            // Clean up old message templates for this workflow's steps
            await this.cleanupOldStepTemplates(existing, updatedDoc, mtCollection);
            continue;
          }
        }

        // Create new workflow
        const newDoc = this.prepareWorkflowForImport(workflow, envObjectId, orgObjectId, idMap);
        const result = await workflowCollection.insertOne(newDoc);
        idMap[workflow._exportId] = result.insertedId;
        imported.workflows++;
        this.logger.debug(`Created workflow "${triggerIdentifier || workflow._exportId}"`);
      } catch (error) {
        errors.push({
          entity: 'workflow',
          exportId: workflow._exportId,
          identifier: this.getTriggerIdentifier(workflow),
          message: error.message,
        });
        this.logger.warn(`Failed to import workflow ${workflow._exportId}: ${error.message}`);
      }
    }

    // ── 6. Import control values (remap _workflowId, _stepId) ──
    this.logger.log(`Importing ${pkg.controlValues.length} control values...`);
    const controlCollection = db.collection('controls');

    for (const cv of pkg.controlValues) {
      try {
        const newDoc = this.stripExportMeta(cv);
        newDoc._environmentId = envObjectId;
        newDoc._organizationId = orgObjectId;

        // Remap _workflowId
        if (cv._workflowId && idMap[cv._workflowId]) {
          newDoc._workflowId = idMap[cv._workflowId];
        } else if (cv._workflowId) {
          this.logger.debug(`Workflow ${cv._workflowId} not found in remap table for control value`);
          // Skip this control value since it can't be linked
          skipped.controlValues++;
          continue;
        }

        // Remap _stepId
        if (cv._stepId && idMap[cv._stepId]) {
          newDoc._stepId = idMap[cv._stepId];
        }
        // Note: _stepId might reference a step _id within a workflow,
        // which is remapped via the step processing. If not in the map,
        // keep the original value as it may be a step identifier string.

        // For overwrite strategy, check if control already exists for this workflow+step
        if (strategy === 'overwrite' && newDoc._workflowId) {
          const query: any = {
            _workflowId: newDoc._workflowId,
            _environmentId: envObjectId,
          };
          if (newDoc._stepId) {
            query._stepId = newDoc._stepId;
          }

          const existing = await controlCollection.findOne(query);
          if (existing) {
            await controlCollection.updateOne({ _id: existing._id }, { $set: newDoc });
            imported.controlValues++;
            continue;
          }
        }

        await controlCollection.insertOne(newDoc);
        imported.controlValues++;
      } catch (error) {
        errors.push({
          entity: 'controlValue',
          exportId: cv._exportId,
          message: error.message,
        });
        this.logger.warn(`Failed to import control value ${cv._exportId}: ${error.message}`);
      }
    }

    const duration = Date.now() - startTime;

    this.logger.log(
      `Import completed in ${duration}ms. ` +
        `Imported: ${imported.workflows} workflows, ${imported.messageTemplates} message templates. ` +
        `Skipped: ${skipped.workflows} workflows. ` +
        `Errors: ${errors.length}`,
    );

    return { imported, skipped, errors, duration };
  }

  /**
   * Prepare a workflow document for insertion into the target environment.
   * Remaps _notificationGroupId and steps[]._templateId references.
   */
  private prepareWorkflowForImport(
    workflow: any,
    envObjectId: ObjectId,
    orgObjectId: ObjectId,
    idMap: Record<string, ObjectId>,
  ): any {
    const doc = this.stripExportMeta(workflow);
    doc._environmentId = envObjectId;
    doc._organizationId = orgObjectId;

    // Remap _notificationGroupId
    if (workflow._notificationGroupId && idMap[workflow._notificationGroupId]) {
      doc._notificationGroupId = idMap[workflow._notificationGroupId];
    } else if (workflow._notificationGroupId) {
      // Remove dangling reference to avoid broken foreign key
      delete doc._notificationGroupId;
    }

    // Remap steps[]._templateId and track step ID mappings
    if (doc.steps && Array.isArray(doc.steps)) {
      doc.steps = doc.steps.map((step: any) => this.remapStep(step, idMap));
    }

    // Set default values for imported workflows
    doc.deleted = false;
    doc.createdAt = new Date().toISOString();
    doc.updatedAt = new Date().toISOString();

    return doc;
  }

  /**
   * Remap references within a single step (and its variants).
   */
  private remapStep(step: any, idMap: Record<string, ObjectId>): any {
    const remapped = { ...step };

    // Remap _templateId (message template reference)
    if (step._templateId && idMap[step._templateId]) {
      remapped._templateId = idMap[step._templateId];
    }

    // Generate a new _id for the step and map the old one
    if (step._id) {
      const newStepId = new ObjectId();
      idMap[step._id] = newStepId;
      remapped._id = newStepId;
    }

    // Handle variants recursively
    if (step.variants && Array.isArray(step.variants)) {
      remapped.variants = step.variants.map((variant: any) => this.remapStep(variant, idMap));
    }

    return remapped;
  }

  /**
   * Extract the primary trigger identifier from a workflow.
   */
  private getTriggerIdentifier(workflow: any): string | undefined {
    if (workflow.triggers && Array.isArray(workflow.triggers) && workflow.triggers.length > 0) {
      return workflow.triggers[0].identifier;
    }
    return undefined;
  }

  /**
   * Remove export metadata from a document before insertion.
   */
  private stripExportMeta(doc: any): any {
    const cleaned = { ...doc };
    delete cleaned._exportId;
    return cleaned;
  }

  /**
   * When overwriting a workflow, clean up message templates that are no longer
   * referenced by the updated steps (avoids orphaned templates).
   * Before deleting, checks if any other workflow references the template.
   */
  private async cleanupOldStepTemplates(
    existingWorkflow: any,
    updatedWorkflow: any,
    mtCollection: any,
  ): Promise<void> {
    try {
      const oldTemplateIds = new Set<string>();
      const newTemplateIds = new Set<string>();

      if (existingWorkflow.steps) {
        for (const step of existingWorkflow.steps) {
          if (step._templateId) oldTemplateIds.add(step._templateId.toString());
        }
      }

      if (updatedWorkflow.steps) {
        for (const step of updatedWorkflow.steps) {
          if (step._templateId) newTemplateIds.add(step._templateId.toString());
        }
      }

      // Find templates that were in the old workflow but not in the new one
      const orphanedIds: ObjectId[] = [];
      for (const id of oldTemplateIds) {
        if (!newTemplateIds.has(id)) {
          orphanedIds.push(new ObjectId(id));
        }
      }

      if (orphanedIds.length > 0) {
        const existingWorkflowId = existingWorkflow._id;
        const workflowCollection = this.dalService.connection.db.collection('notificationtemplates');
        let deletedCount = 0;

        for (const orphanId of orphanedIds) {
          // Check if any other workflow references this template before deleting
          const otherRef = await workflowCollection.findOne({
            'steps._templateId': orphanId,
            _id: { $ne: existingWorkflowId },
          });
          if (!otherRef) {
            await mtCollection.deleteOne({ _id: orphanId });
            deletedCount++;
          } else {
            this.logger.debug(
              `Skipping deletion of message template ${orphanId} — referenced by workflow ${otherRef._id}`,
            );
          }
        }

        this.logger.debug(`Cleaned up ${deletedCount} orphaned message templates (${orphanedIds.length - deletedCount} shared, kept)`);
      }
    } catch (error) {
      this.logger.warn(`Failed to clean up orphaned templates: ${error.message}`);
    }
  }
}
