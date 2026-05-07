import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';

/**
 * Restricts an endpoint to instance-level admins only.
 *
 * Required because the current backup/restore implementation produces a
 * full-database dump regardless of which org triggers it. Per-project backup
 * with org-scoped filtering is a future feature; until that lands, anyone who
 * can run backup can exfiltrate every other project's data.
 *
 * Policy when `BACKUP_REQUIRES_INSTANCE_ADMIN=true`:
 *   - API key auth (`X-Admin-API-Key`) is allowed (set by `AdminAuthGuard`,
 *     identifiable via `request.user._id === 'admin-api-key'`)
 *   - JWT auth is rejected with 403
 *
 * When the flag is unset or `false` (default), this guard is a no-op so
 * existing single-tenant deployments are not broken by an upgrade.
 */
@Injectable()
export class InstanceAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.BACKUP_REQUIRES_INSTANCE_ADMIN !== 'true') {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    if (request.user?._id === 'admin-api-key') {
      return true;
    }

    Logger.warn(
      `Backup endpoint blocked for JWT user (${request.user?._id ?? 'unknown'}): instance-admin required`,
      'InstanceAdminGuard'
    );

    throw new ForbiddenException(
      'Backup operations require instance-admin (ADMIN_API_KEY). The current backup format is whole-instance and cannot be safely run by per-project users. Set BACKUP_REQUIRES_INSTANCE_ADMIN=false to disable this gate.'
    );
  }
}
