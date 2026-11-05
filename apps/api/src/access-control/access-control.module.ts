import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AccessControlService } from './access-control.service.js';

@Module({
  imports:[DatabaseModule],
  providers:[AccessControlService],
  exports:[AccessControlService],
})
export class AccessControlModule {}
