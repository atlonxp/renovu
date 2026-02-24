import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-admin-api-key'];
    const configuredKey = process.env.ADMIN_API_KEY;

    if (!configuredKey) {
      return false;
    }

    if (!apiKey || !safeCompare(apiKey, configuredKey)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
