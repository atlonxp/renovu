import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  imports: [SharedModule, AuthModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
