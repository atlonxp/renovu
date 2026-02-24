import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { ExportImportController } from './export-import.controller';
import { ExportService } from './export.service';
import { ImportService } from './import.service';

@Module({
  imports: [SharedModule, AuthModule],
  controllers: [ExportImportController],
  providers: [ExportService, ImportService],
})
export class ExportImportModule {}
