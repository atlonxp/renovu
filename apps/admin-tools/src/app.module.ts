import { Module } from '@nestjs/common';
import { SharedModule } from './shared/shared.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { BackupModule } from './backup/backup.module';
import { ExportImportModule } from './export-import/export-import.module';

@Module({
  imports: [SharedModule, HealthModule, AuthModule, BackupModule, ExportImportModule],
})
export class AppModule {}
