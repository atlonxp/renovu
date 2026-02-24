import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Check API key first (stateless, faster)
    const apiKey = request.headers['x-admin-api-key'];
    const configuredKey = process.env.ADMIN_API_KEY;

    if (configuredKey && apiKey && safeCompare(apiKey, configuredKey)) {
      // API key is valid — set a minimal user context
      request.user = { _id: 'admin-api-key', role: 'admin' };
      return true;
    }

    // Fall back to JWT authentication
    const jwtGuard = new (AuthGuard('jwt'))();

    try {
      const result = await jwtGuard.canActivate(context);
      return result as boolean;
    } catch (error) {
      Logger.warn(`JWT authentication failed: ${error.message}`, 'AdminAuthGuard');
      return false;
    }
  }
}
