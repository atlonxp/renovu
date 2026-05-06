import { Injectable, Logger, OnModuleInit, ConflictException } from '@nestjs/common';
import { DalService } from '@novu/dal';
import archiver from 'archiver';
import * as tar from 'tar';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { randomBytes } from 'crypto';
import { ObjectId } from 'mongodb';
import { CreateBackupResponseDto, BackupListItemDto } from './dto';
import { RestorePreviewDto, RestoreResultDto, RestoreResponseDto } from './dto';

/**
 * Regex matching a 24-character lowercase hex string (MongoDB ObjectId format).
 */
const OBJECT_ID_RE = /^[0-9a-f]{24}$/;

/**
 * Fields known to store ObjectId references in Novu/ReNovu collections.
 * Both the `_id` field and any field ending with `Id` are candidates.
 */
function isObjectIdField(key: string): boolean {
  return key === '_id' || key.endsWith('Id') || key === '_templateId';
}

/**
 * Recursively walks a document and converts string values that look like ObjectIds
 * back into proper BSON ObjectId instances for known fields.
 * This fixes documents exported via JSON.stringify() which loses BSON type info.
 */
function rehydrateBsonTypes(doc: any): any {
  if (doc === null || doc === undefined) return doc;
  if (Array.isArray(doc)) return doc.map(rehydrateBsonTypes);
  if (typeof doc !== 'object') return doc;

  for (const key of Object.keys(doc)) {
    const val = doc[key];
    if (typeof val === 'string' && isObjectIdField(key) && OBJECT_ID_RE.test(val)) {
      doc[key] = new ObjectId(val);
    } else if (Array.isArray(val)) {
      doc[key] = val.map((item) => {
        if (typeof item === 'string' && isObjectIdField(key) && OBJECT_ID_RE.test(item)) {
          return new ObjectId(item);
        }
        if (typeof item === 'object' && item !== null) {
          return rehydrateBsonTypes(item);
        }
        return item;
      });
    } else if (typeof val === 'object' && val !== null && !(val instanceof ObjectId) && !(val instanceof Date)) {
      rehydrateBsonTypes(val);
    }
  }

  return doc;
}

/**
 * Collection registry for full environment backup.
 *
 * Mongoose lowercases + pluralizes model names to derive the MongoDB collection name.
 * One exception: ControlValues uses model name 'controls' => collection 'controls'.
 *
 * High-volume collections use cursor-based NDJSON streaming (one JSON doc per line)
 * to avoid loading millions of documents into memory at once.
 */

interface CollectionEntry {
  /** Actual MongoDB collection name */
  name: string;
  /** If true, use cursor + NDJSON instead of find().toArray() + JSON */
  highVolume: boolean;
}

const COLLECTION_REGISTRY: CollectionEntry[] = [
  // ── Regular collections (find → JSON) ──
  // Use highVolume: false ONLY for collections expected to stay small.
  // Large or unbounded collections must stream as NDJSON to avoid V8
  // heap exhaustion in pm2 cluster workers (default heap ~256MB).
  { name: 'users', highVolume: false },
  { name: 'organizations', highVolume: false },
  { name: 'environments', highVolume: false },
  { name: 'members', highVolume: false },
  { name: 'notificationgroups', highVolume: false },
  { name: 'layouts', highVolume: false },
  { name: 'integrations', highVolume: false },
  { name: 'topics', highVolume: false },
  { name: 'tenants', highVolume: false },
  { name: 'workflowoverrides', highVolume: false },
  { name: 'feeds', highVolume: false },
  { name: 'contexts', highVolume: false },
  { name: 'channelconnections', highVolume: false },
  { name: 'channelendpoints', highVolume: false },
  { name: 'localizationgroups', highVolume: false },

  // ── High-volume collections (cursor → NDJSON) ──
  // notificationtemplates: workflow definitions can carry large step
  //   templates; production seen with 579 docs, 3400 message templates.
  // messagetemplates: per-step content (Maily JSON / HTML); largest
  //   single offender — caused OOM at 3400 docs / 257MB heap.
  // controls: layout + step control bodies, also large JSON payloads.
  // preferences, changes, subscribers, localizations: grow with usage.
  { name: 'notificationtemplates', highVolume: true },
  { name: 'messagetemplates', highVolume: true },
  { name: 'subscribers', highVolume: true },
  { name: 'preferences', highVolume: true },
  { name: 'controls', highVolume: true },
  { name: 'changes', highVolume: true },
  { name: 'localizations', highVolume: true },
  { name: 'jobs', highVolume: true },
  { name: 'notifications', highVolume: true },
  { name: 'messages', highVolume: true },
  { name: 'executiondetails', highVolume: true },
];

/**
 * Dependency-ordered list for restore.
 * Core identity collections first, then dependent ones.
 * High-volume collections last since they reference everything else.
 */
const RESTORE_ORDER: string[] = [
  'users',
  'organizations',
  'environments',
  'members',
  'notificationgroups',
  'feeds',
  'layouts',
  'messagetemplates',
  'notificationtemplates',
  'integrations',
  'subscribers',
  'topics',
  'tenants',
  'workflowoverrides',
  'preferences',
  'controls',
  'changes',
  'contexts',
  'channelconnections',
  'channelendpoints',
  'localizations',
  'localizationgroups',
  // High-volume last
  'jobs',
  'notifications',
  'messages',
  'executiondetails',
];

const CURSOR_BATCH_SIZE = 5000;
const INSERT_BATCH_SIZE = 5000;

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private backupDir: string;
  private operationInProgress = false;

  constructor(private readonly dalService: DalService) {}

  private async acquireLock(): Promise<void> {
    if (this.operationInProgress) {
      throw new ConflictException('Another backup/restore operation is already in progress');
    }
    this.operationInProgress = true;
  }

  private releaseLock(): void {
    this.operationInProgress = false;
  }

  onModuleInit() {
    this.backupDir = process.env.BACKUP_DIR || '/tmp/admin-tools-backups';
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.logger.log(`Backup directory: ${this.backupDir}`);
    this.migrateUnorganizedBackups();
  }

  /**
   * Return the org-scoped backup directory, creating it if needed.
   */
  private getOrgBackupDir(orgId: string): string {
    const sanitized = path.basename(orgId);
    const orgDir = path.join(this.backupDir, sanitized);
    fs.mkdirSync(orgDir, { recursive: true });
    return orgDir;
  }

  /**
   * One-time migration: move any backups from the root backupDir into a 'global' subdirectory.
   * This handles backups created before org-scoping was added.
   */
  private migrateUnorganizedBackups(): void {
    try {
      const files = fs.readdirSync(this.backupDir);
      const backupFiles = files.filter(
        (f) => f.endsWith('.tar.gz') || f.endsWith('.manifest.json'),
      );

      if (backupFiles.length === 0) return;

      const globalDir = this.getOrgBackupDir('global');
      let migrated = 0;

      for (const file of backupFiles) {
        const src = path.join(this.backupDir, file);
        const dest = path.join(globalDir, file);
        if (!fs.existsSync(dest)) {
          fs.renameSync(src, dest);
          migrated++;
        }
      }

      if (migrated > 0) {
        this.logger.log(`Migrated ${migrated} legacy backup files to global/ subdirectory`);
      }
    } catch (error) {
      this.logger.warn(`Failed to migrate legacy backups: ${error.message}`);
    }
  }

  // ──────────────────────────────────────────────────
  //  CREATE BACKUP
  // ──────────────────────────────────────────────────

  async createBackup(orgId = 'global'): Promise<CreateBackupResponseDto> {
    await this.acquireLock();
    try {
      const orgDir = this.getOrgBackupDir(orgId);
      const startTime = Date.now();
      // Format: backup-YYYYMMDD-HHmmss
      const now = new Date();
      const formattedTimestamp = [
        now.getUTCFullYear(),
        String(now.getUTCMonth() + 1).padStart(2, '0'),
        String(now.getUTCDate()).padStart(2, '0'),
      ].join('')
        + '-'
        + [
          String(now.getUTCHours()).padStart(2, '0'),
          String(now.getUTCMinutes()).padStart(2, '0'),
          String(now.getUTCSeconds()).padStart(2, '0'),
        ].join('');

      const backupName = `backup-${formattedTimestamp}`;
      const tempDir = path.join(orgDir, `${backupName}-tmp`);
      const tarPath = path.join(orgDir, `${backupName}.tar.gz`);
      const sidecarPath = path.join(orgDir, `${backupName}.manifest.json`);

      fs.mkdirSync(tempDir, { recursive: true });

      const db = this.dalService.connection.db;
      const counts: Record<string, number> = {};

      this.logger.log(`Starting backup: ${backupName}`);

      // Export each collection
      for (const entry of COLLECTION_REGISTRY) {
        try {
          const collection = db.collection(entry.name);

          if (entry.highVolume) {
            // Cursor-based NDJSON export
            const count = await this.exportCollectionNdjson(collection, entry.name, tempDir);
            counts[entry.name] = count;
          } else {
            // Regular JSON export
            const count = await this.exportCollectionJson(collection, entry.name, tempDir);
            counts[entry.name] = count;
          }

          this.logger.debug(`Exported ${entry.name}: ${counts[entry.name]} docs`);
        } catch (error) {
          this.logger.warn(`Failed to export collection ${entry.name}: ${error.message}`);
          counts[entry.name] = 0;
        }
      }

      // Write manifest.json inside the archive
      const manifest = {
        timestamp: now.toISOString(),
        version: '1.0.0',
        backupName,
        collections: counts,
        totalDocuments: Object.values(counts).reduce((sum, c) => sum + c, 0),
      };

      fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Create tar.gz archive
      await this.createTarGz(tempDir, tarPath);

      // Write sidecar manifest for fast listing
      const stat = fs.statSync(tarPath);
      const sidecar = {
        filename: `${backupName}.tar.gz`,
        size: stat.size,
        timestamp: now.toISOString(),
        collections: counts,
      };
      fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));

      // Clean up temp dir
      fs.rmSync(tempDir, { recursive: true, force: true });

      const duration = Date.now() - startTime;
      this.logger.log(`Backup completed: ${backupName}.tar.gz (${stat.size} bytes, ${duration}ms)`);

      return {
        filename: `${backupName}.tar.gz`,
        size: stat.size,
        timestamp: now.toISOString(),
        collections: counts,
        duration,
      };
    } finally {
      this.releaseLock();
    }
  }

  // ──────────────────────────────────────────────────
  //  LIST BACKUPS
  // ──────────────────────────────────────────────────

  async listBackups(orgId = 'global'): Promise<BackupListItemDto[]> {
    const orgDir = this.getOrgBackupDir(orgId);
    const files = fs.readdirSync(orgDir);
    const backups: BackupListItemDto[] = [];

    for (const file of files) {
      if (!file.endsWith('.tar.gz')) continue;

      const baseName = file.replace('.tar.gz', '');
      const sidecarPath = path.join(orgDir, `${baseName}.manifest.json`);

      if (fs.existsSync(sidecarPath)) {
        // Use sidecar for fast listing
        try {
          const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
          backups.push({
            filename: sidecar.filename,
            size: sidecar.size,
            timestamp: sidecar.timestamp,
            collections: sidecar.collections,
          });
        } catch {
          // Fall back to stat-only info
          const stat = fs.statSync(path.join(orgDir, file));
          backups.push({
            filename: file,
            size: stat.size,
            timestamp: stat.mtime.toISOString(),
            collections: {},
          });
        }
      } else {
        // No sidecar, use file stat
        const stat = fs.statSync(path.join(orgDir, file));
        backups.push({
          filename: file,
          size: stat.size,
          timestamp: stat.mtime.toISOString(),
          collections: {},
        });
      }
    }

    // Sort newest first
    backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return backups;
  }

  // ──────────────────────────────────────────────────
  //  GET BACKUP FILE PATH (for download)
  // ──────────────────────────────────────────────────

  getBackupFilePath(filename: string, orgId = 'global'): string | null {
    const orgDir = this.getOrgBackupDir(orgId);
    // Sanitize filename to prevent directory traversal
    const sanitized = path.basename(filename);
    const filePath = path.join(orgDir, sanitized);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    return filePath;
  }

  // ──────────────────────────────────────────────────
  //  DELETE BACKUP
  // ──────────────────────────────────────────────────

  deleteBackup(filename: string, orgId = 'global'): boolean {
    const orgDir = this.getOrgBackupDir(orgId);
    const sanitized = path.basename(filename);
    const filePath = path.join(orgDir, sanitized);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    fs.unlinkSync(filePath);

    // Also remove the sidecar manifest if present
    const baseName = sanitized.replace('.tar.gz', '');
    const sidecarPath = path.join(orgDir, `${baseName}.manifest.json`);
    if (fs.existsSync(sidecarPath)) {
      fs.unlinkSync(sidecarPath);
    }

    return true;
  }

  // ──────────────────────────────────────────────────
  //  RESTORE BACKUP
  // ──────────────────────────────────────────────────

  async restoreBackup(filePath: string, dryRun: boolean, orgId = 'global'): Promise<RestoreResponseDto> {
    await this.acquireLock();
    const startTime = Date.now();
    const ts = Date.now();
    const suffix = randomBytes(4).toString('hex');
    const extractDir = path.join(this.backupDir, `restore-${ts}-${suffix}-tmp`);

    try {
      fs.mkdirSync(extractDir, { recursive: true });

      // Extract tar.gz directly from the uploaded file on disk
      await tar.extract({
        file: filePath,
        cwd: extractDir,
      });

      // Find the manifest - it might be in a subdirectory after extraction
      const manifestPath = this.findManifest(extractDir);
      if (!manifestPath) {
        throw new Error('Invalid backup: manifest.json not found in archive');
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const dataDir = path.dirname(manifestPath);

      if (dryRun) {
        const preview: RestorePreviewDto = {
          dryRun: true,
          manifest: {
            timestamp: manifest.timestamp,
            version: manifest.version,
            collections: manifest.collections,
          },
        };
        return preview;
      }

      // Create automatic pre-restore backup
      this.logger.log('Creating automatic pre-restore backup...');
      try {
        this.releaseLock(); // Temporarily release lock so createBackup can acquire it
        await this.createBackup(orgId);
        await this.acquireLock(); // Re-acquire lock for the restore operation
        this.logger.log('Pre-restore backup created successfully');
      } catch (error) {
        // Re-acquire lock if createBackup failed after releasing
        if (!this.operationInProgress) {
          this.operationInProgress = true;
        }
        this.logger.warn(`Pre-restore backup failed: ${error.message}. Proceeding with restore.`);
      }

      // Perform actual restore
      const db = this.dalService.connection.db;
      const restored: Record<string, number> = {};

      for (const collectionName of RESTORE_ORDER) {
        if (!manifest.collections[collectionName] && manifest.collections[collectionName] !== 0) {
          continue; // Collection not in backup
        }

        const entry = COLLECTION_REGISTRY.find((e) => e.name === collectionName);
        if (!entry) continue;

        try {
          const collection = db.collection(collectionName);

          if (entry.highVolume) {
            const ndjsonPath = path.join(dataDir, `${collectionName}.ndjson`);
            if (fs.existsSync(ndjsonPath)) {
              const count = await this.restoreCollectionNdjson(collection, ndjsonPath);
              restored[collectionName] = count;
            } else {
              restored[collectionName] = 0;
            }
          } else {
            const jsonPath = path.join(dataDir, `${collectionName}.json`);
            if (fs.existsSync(jsonPath)) {
              const count = await this.restoreCollectionJson(collection, jsonPath);
              restored[collectionName] = count;
            } else {
              restored[collectionName] = 0;
            }
          }

          this.logger.debug(`Restored ${collectionName}: ${restored[collectionName]} docs`);
        } catch (error) {
          this.logger.error(`Failed to restore collection ${collectionName}: ${error.message}`);
          restored[collectionName] = -1; // Mark as failed
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(`Restore completed in ${duration}ms`);

      const result: RestoreResultDto = {
        dryRun: false,
        restored,
        duration,
        timestamp: new Date().toISOString(),
      };
      return result;
    } finally {
      // Clean up temp files
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      // Clean up the uploaded file from disk storage
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      this.releaseLock();
    }
  }

  // ──────────────────────────────────────────────────
  //  PRIVATE HELPERS
  // ──────────────────────────────────────────────────

  /**
   * Export a regular collection as a JSON array file.
   */
  private async exportCollectionJson(
    collection: any,
    name: string,
    tempDir: string,
  ): Promise<number> {
    const docs = await collection.find({}).toArray();
    const filePath = path.join(tempDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 0));
    return docs.length;
  }

  /**
   * Export a high-volume collection as NDJSON using cursor streaming.
   * Each line is a single JSON document, which avoids loading
   * the entire collection into memory.
   */
  private async exportCollectionNdjson(
    collection: any,
    name: string,
    tempDir: string,
  ): Promise<number> {
    const filePath = path.join(tempDir, `${name}.ndjson`);
    const writeStream = fs.createWriteStream(filePath);
    const cursor = collection.find({}).batchSize(CURSOR_BATCH_SIZE);

    let count = 0;

    for await (const doc of cursor) {
      const line = JSON.stringify(doc) + '\n';
      const canContinue = writeStream.write(line);
      if (!canContinue) {
        await new Promise<void>((resolve) => writeStream.once('drain', resolve));
      }
      count++;
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    return count;
  }

  /**
   * Create a tar.gz archive from a directory.
   */
  private async createTarGz(sourceDir: string, destPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(destPath);
      const archive = archiver('tar', { gzip: true });

      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));

      archive.pipe(output);

      // Add all files in the temp directory
      const files = fs.readdirSync(sourceDir);
      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        archive.file(filePath, { name: file });
      }

      archive.finalize();
    });
  }

  /**
   * Find manifest.json in the extracted directory tree.
   * It may be at the root or one level deep.
   */
  private findManifest(extractDir: string): string | null {
    // Check root level
    const rootManifest = path.join(extractDir, 'manifest.json');
    if (fs.existsSync(rootManifest)) {
      return rootManifest;
    }

    // Check one level deep (in case tar creates a subdirectory)
    const entries = fs.readdirSync(extractDir);
    for (const entry of entries) {
      const subDir = path.join(extractDir, entry);
      if (fs.statSync(subDir).isDirectory()) {
        const subManifest = path.join(subDir, 'manifest.json');
        if (fs.existsSync(subManifest)) {
          return subManifest;
        }
      }
    }

    return null;
  }

  /**
   * Restore a regular collection from a JSON file.
   * Drops existing documents, then bulk-inserts from the file.
   */
  private async restoreCollectionJson(collection: any, jsonPath: string): Promise<number> {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const docs: any[] = JSON.parse(raw);

    if (docs.length === 0) {
      await collection.deleteMany({});
      return 0;
    }

    // Drop existing documents
    await collection.deleteMany({});

    // Bulk insert in batches, rehydrating BSON types
    let inserted = 0;
    for (let i = 0; i < docs.length; i += INSERT_BATCH_SIZE) {
      const batch = docs.slice(i, i + INSERT_BATCH_SIZE).map(rehydrateBsonTypes);
      await collection.insertMany(batch, { ordered: false });
      inserted += batch.length;
    }

    return inserted;
  }

  /**
   * Restore a high-volume collection from an NDJSON file.
   * Uses readline streaming to avoid loading the entire file into memory.
   * Batches inserts for efficiency.
   */
  private async restoreCollectionNdjson(collection: any, ndjsonPath: string): Promise<number> {
    await collection.deleteMany({});

    const rl = readline.createInterface({
      input: fs.createReadStream(ndjsonPath),
      crlfDelay: Infinity,
    });

    let inserted = 0;
    let batch: any[] = [];

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        batch.push(rehydrateBsonTypes(JSON.parse(line)));
        if (batch.length >= INSERT_BATCH_SIZE) {
          await collection.insertMany(batch, { ordered: false });
          inserted += batch.length;
          batch = [];
        }
      } catch {
        // skip malformed lines
      }
    }

    if (batch.length > 0) {
      await collection.insertMany(batch, { ordered: false });
      inserted += batch.length;
    }

    return inserted;
  }
}
