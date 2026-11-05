import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ChatController } from './chat.controller.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatService } from './chat.service.js';
import { ChatUploadGuard } from './chat-upload.guard.js';
import { ChatCallsService } from './chat-calls.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, AccessControlModule],
  controllers: [ChatController],
  providers: [ChatService,ChatEventsService,ChatUploadGuard,ChatCallsService],
})
export class ChatModule {}
