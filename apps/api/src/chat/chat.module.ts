import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ChatController } from './chat.controller.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ChatController],
  providers: [ChatService,ChatEventsService],
})
export class ChatModule {}
