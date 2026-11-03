import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { ChatModule } from './chat/chat.module.js';

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
    ChatModule,
  ],
})
export class ApplicationModule {}
