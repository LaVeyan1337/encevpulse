import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { ChatModule } from './chat/chat.module.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { CedModule } from './ced/ced.module.js';
import { EcedModule } from './eced/eced.module.js';
import { NotesModule } from './notes/notes.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(process.cwd(), '../../.env'),
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    TasksModule,
    CalendarModule,
    CedModule,
    EcedModule,
    NotesModule,
    ChatModule,
  ],
})
export class ApplicationModule {}
