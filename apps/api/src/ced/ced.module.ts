import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { CedController } from './ced.controller.js';
import { CedService } from './ced.service.js';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [CedController],
  providers: [CedService],
  exports: [CedService],
})
export class CedModule {}
