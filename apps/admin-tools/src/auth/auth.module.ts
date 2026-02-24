import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { ApiKeyGuard } from './api-key.strategy';
import { AdminAuthGuard } from './admin-auth.guard';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, ApiKeyGuard, AdminAuthGuard],
  exports: [ApiKeyGuard, AdminAuthGuard],
})
export class AuthModule {}
