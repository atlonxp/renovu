import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Request, Response } from 'express';
import * as fs from 'fs';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { BackupService } from './backup.service';

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Extract the organization ID from the authenticated request.
 * JWT users have organizationId in the token payload.
 * API key users get a fallback 'global' scope.
 */
function getOrgId(req: Request): string {
  const user = (req as any).user;
  return user?.organizationId || 'global';
}

@Controller('api')
@UseGuards(AdminAuthGuard)
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(private readonly backupService: BackupService) {}

  /**
   * POST /api/backup
   * Create a full environment backup scoped to the caller's organization.
   */
  @Post('backup')
  async createBackup(@Req() req: Request) {
    const orgId = getOrgId(req);
    this.logger.log(`Creating backup for org ${orgId}...`);
    try {
      const result = await this.backupService.createBackup(orgId);
      return result;
    } catch (error) {
      this.logger.error(`Backup failed: ${error.message}`, error.stack);
      throw new HttpException(
        { error: 'Backup failed', message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/backups
   * List backups belonging to the caller's organization.
   */
  @Get('backups')
  async listBackups(@Req() req: Request) {
    const orgId = getOrgId(req);
    const backups = await this.backupService.listBackups(orgId);
    return { backups, total: backups.length };
  }

  /**
   * GET /api/backups/:filename/download
   * Download a backup tar.gz file (org-scoped).
   */
  @Get('backups/:filename/download')
  async downloadBackup(@Param('filename') filename: string, @Req() req: Request, @Res() res: Response) {
    const orgId = getOrgId(req);
    const filePath = this.backupService.getBackupFilePath(filename, orgId);

    if (!filePath) {
      throw new HttpException(
        { error: 'Not found', message: `Backup '${filename}' not found` },
        HttpStatus.NOT_FOUND,
      );
    }

    const stat = fs.statSync(filePath);

    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': stat.size.toString(),
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  }

  /**
   * POST /api/restore
   * Restore from an uploaded tar.gz backup.
   * Use ?dryRun=true for a preview without actual writes.
   */
  @Post('restore')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = process.env.BACKUP_DIR || '/tmp/admin-tools-backups';
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, _file, cb) => cb(null, `upload-${Date.now()}.tar.gz`),
      }),
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        // Accept tar.gz and gzip content types, or by extension
        const validMimeTypes = [
          'application/gzip',
          'application/x-gzip',
          'application/x-tar',
          'application/octet-stream',
        ];
        if (
          validMimeTypes.includes(file.mimetype) ||
          file.originalname.endsWith('.tar.gz') ||
          file.originalname.endsWith('.tgz')
        ) {
          cb(null, true);
        } else {
          cb(
            new HttpException(
              { error: 'Invalid file type', message: 'Only .tar.gz files are accepted' },
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
        }
      },
    }),
  )
  async restoreBackup(
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRun: string,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new HttpException(
        { error: 'No file uploaded', message: 'Please upload a .tar.gz backup file' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const orgId = getOrgId(req);
    const isDryRun = dryRun === 'true';

    this.logger.log(
      `Restore request (org ${orgId}): ${file.originalname} (${file.size} bytes), dryRun=${isDryRun}`,
    );

    try {
      const result = await this.backupService.restoreBackup(file.path, isDryRun, orgId);
      return result;
    } catch (error) {
      this.logger.error(`Restore failed: ${error.message}`, error.stack);
      // Clean up uploaded file on error if service didn't already
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw new HttpException(
        { error: 'Restore failed', message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /api/backups/:filename
   * Delete a specific backup file (org-scoped).
   */
  @Delete('backups/:filename')
  async deleteBackup(@Param('filename') filename: string, @Req() req: Request) {
    const orgId = getOrgId(req);
    const deleted = this.backupService.deleteBackup(filename, orgId);

    if (!deleted) {
      throw new HttpException(
        { error: 'Not found', message: `Backup '${filename}' not found` },
        HttpStatus.NOT_FOUND,
      );
    }

    return { deleted: true, filename };
  }
}
