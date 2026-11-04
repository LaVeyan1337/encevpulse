import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { EcedController } from './eced.controller.js';
import { EcedMonitorService } from './eced.service.js';

@Module({
  imports: [AuthModule,AccessControlModule],
  controllers: [EcedController],
  providers: [EcedMonitorService],
})
export class EcedModule {}
