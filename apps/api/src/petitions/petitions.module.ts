import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { PetitionUploadGuard } from './petition-upload.guard.js';
import { PetitionsController } from './petitions.controller.js';
import { PetitionsService } from './petitions.service.js';

@Module({
  imports:[AuthModule,AccessControlModule,DatabaseModule],
  controllers:[PetitionsController],
  providers:[PetitionsService,PetitionUploadGuard],
})
export class PetitionsModule {}
