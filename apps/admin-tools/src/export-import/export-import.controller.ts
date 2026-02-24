import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ExportService } from './export.service';
import { ImportService } from './import.service';
import { ExportRequestDto, ImportStrategy } from './dto';

const UPLOAD_DIR = process.env.BACKUP_DIR || '/tmp/admin-tools-backups';
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;

@Controller('api')
@UseGuards(AdminAuthGuard)
export class ExportImportController {
  private readonly logger = new Logger(ExportImportController.name);

  constructor(
    private readonly exportService: ExportService,
    private readonly importService: ImportService,
  ) {}

  /**
   * POST /api/export
   *
   * Export selected workflows and all their dependencies as a JSON package.
   *
   * Body:
   *   workflowIds: string[] — specific workflow IDs or ["all"]
   *   environmentId: string — source environment ObjectId
   */
  @Post('export')
  async exportWorkflows(@Body() body: ExportRequestDto) {
    if (!body.workflowIds || !Array.isArray(body.workflowIds) || body.workflowIds.length === 0) {
      throw new HttpException(
        { error: 'Validation error', message: 'workflowIds must be a non-empty array of IDs or ["all"]' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!body.environmentId) {
      throw new HttpException(
        { error: 'Validation error', message: 'environmentId is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!OBJECT_ID_REGEX.test(body.environmentId)) {
      throw new HttpException(
        { error: 'Validation error', message: 'environmentId must be a valid ObjectId (24 hex chars)' },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(
      `Export request: ${body.workflowIds.length === 1 && body.workflowIds[0] === 'all' ? 'ALL' : body.workflowIds.length} workflows from env ${body.environmentId}`,
    );

    try {
      const pkg = await this.exportService.exportWorkflows(body.workflowIds, body.environmentId);

      this.logger.log(
        `Export complete: ${pkg.workflows.length} workflows, ` +
          `${pkg.messageTemplates.length} message templates, ` +
          `${pkg.notificationGroups.length} notification groups, ` +
          `${pkg.layouts.length} layouts, ` +
          `${pkg.controlValues.length} control values, ` +
          `${pkg.feeds.length} feeds`,
      );

      return pkg;
    } catch (error) {
      this.logger.error(`Export failed: ${error.message}`, error.stack);
      throw new HttpException(
        { error: 'Export failed', message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/import
   *
   * Import workflows from a JSON file upload.
   *
   * Multipart form fields:
   *   file          — JSON file containing the exported workflow package
   *   environmentId — target environment ObjectId
   *   organizationId — target organization ObjectId
   *   strategy      — "skip" (default) or "overwrite"
   */
  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          fs.mkdirSync(UPLOAD_DIR, { recursive: true });
          cb(null, UPLOAD_DIR);
        },
        filename: (_req, _file, cb) => cb(null, `import-${Date.now()}.json`),
      }),
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        const validMimeTypes = ['application/json', 'application/octet-stream', 'text/plain'];
        if (
          validMimeTypes.includes(file.mimetype) ||
          file.originalname.endsWith('.json')
        ) {
          cb(null, true);
        } else {
          cb(
            new HttpException(
              { error: 'Invalid file type', message: 'Only .json files are accepted' },
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
        }
      },
    }),
  )
  async importWorkflows(
    @UploadedFile() file: Express.Multer.File,
    @Body('environmentId') environmentId: string,
    @Body('organizationId') organizationId: string,
    @Body('strategy') strategy: string,
  ) {
    if (!file) {
      throw new HttpException(
        { error: 'No file uploaded', message: 'Please upload a .json export file' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!environmentId) {
      this.cleanupFile(file.path);
      throw new HttpException(
        { error: 'Validation error', message: 'environmentId is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!organizationId) {
      this.cleanupFile(file.path);
      throw new HttpException(
        { error: 'Validation error', message: 'organizationId is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!OBJECT_ID_REGEX.test(environmentId) || !OBJECT_ID_REGEX.test(organizationId)) {
      this.cleanupFile(file.path);
      throw new HttpException(
        { error: 'Validation error', message: 'environmentId and organizationId must be valid ObjectIds (24 hex chars)' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const importStrategy: ImportStrategy = strategy === 'overwrite' ? 'overwrite' : 'skip';

    this.logger.log(
      `Import request: ${file.originalname} (${file.size} bytes), ` +
        `env=${environmentId}, org=${organizationId}, strategy=${importStrategy}`,
    );

    try {
      // Read and parse the JSON file
      const raw = fs.readFileSync(file.path, 'utf-8');
      let pkg: any;

      try {
        pkg = JSON.parse(raw);
      } catch {
        throw new HttpException(
          { error: 'Invalid JSON', message: 'The uploaded file is not valid JSON' },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate package structure
      this.validatePackage(pkg);

      const result = await this.importService.importWorkflows(pkg, environmentId, organizationId, importStrategy);

      this.logger.log(
        `Import complete: imported ${result.imported.workflows} workflows, ` +
          `skipped ${result.skipped.workflows}, errors ${result.errors.length}`,
      );

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Import failed: ${error.message}`, error.stack);
      throw new HttpException(
        { error: 'Import failed', message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      // Clean up uploaded file
      this.cleanupFile(file.path);
    }
  }

  /**
   * Validate the basic structure of an export package.
   */
  private validatePackage(pkg: any): void {
    if (!pkg.version) {
      throw new HttpException(
        { error: 'Invalid package', message: 'Package is missing "version" field' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!pkg.workflows || !Array.isArray(pkg.workflows)) {
      throw new HttpException(
        { error: 'Invalid package', message: 'Package is missing "workflows" array' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const requiredArrays = ['messageTemplates', 'notificationGroups', 'layouts', 'controlValues', 'feeds'];
    for (const field of requiredArrays) {
      if (pkg[field] !== undefined && !Array.isArray(pkg[field])) {
        throw new HttpException(
          { error: 'Invalid package', message: `"${field}" must be an array if present` },
          HttpStatus.BAD_REQUEST,
        );
      }
      // Default missing arrays to empty
      if (!pkg[field]) {
        pkg[field] = [];
      }
    }
  }

  /**
   * Safely remove an uploaded file.
   */
  private cleanupFile(filePath: string): void {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      this.logger.warn(`Failed to clean up file ${filePath}: ${error.message}`);
    }
  }
}
