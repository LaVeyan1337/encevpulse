import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [AccessControlModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
