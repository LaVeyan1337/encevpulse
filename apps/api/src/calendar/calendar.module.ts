import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { CedModule } from '../ced/ced.module.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
