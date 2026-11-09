import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { TaskUploadGuard } from './task-upload.guard.js';

@Module({ imports: [AuthModule,AccessControlModule], controllers: [TasksController], providers: [TasksService,TaskUploadGuard] })
export class TasksModule {}
