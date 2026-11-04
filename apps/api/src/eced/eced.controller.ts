import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import { EcedMonitorService } from './eced.service.js';

@Controller('eced')
export class EcedController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(EcedMonitorService) private readonly eced: EcedMonitorService,
  ) {}

  @Get('monitor')
  async monitor(@Req() request: Request) {
    return this.eced.getMonitor(await this.authorize(request,'view'));
  }

  @Post('pairings')
  @HttpCode(HttpStatus.CREATED)
  async createPairing(@Req() request: Request,@Body() body: unknown) {
    return this.eced.createPairing(await this.authorize(request,'create',true),body);
  }

  @Delete('pairings/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokePairing(@Req() request: Request,@Param('deviceId') deviceId: string) {
    await this.eced.revokePairing(await this.authorize(request,'delete',true),deviceId);
  }

  @Post('claims')
  @HttpCode(HttpStatus.CREATED)
  async claim(@Req() request: Request,@Body() body: unknown) {
    return this.eced.claimAccount(await this.authorize(request,'update',true),body);
  }

  @Delete('claims/:normalizedAccount')
  @HttpCode(HttpStatus.NO_CONTENT)
  async release(@Req() request: Request,@Param('normalizedAccount') normalizedAccount: string) {
    await this.eced.releaseAccount(await this.authorize(request,'update',true),normalizedAccount);
  }

  @Get('extension/health')
  async extensionHealth(@Headers('x-pulse-token') token: string) {
    return this.eced.extensionHealth(token ?? '');
  }

  @Post('reports')
  @HttpCode(HttpStatus.ACCEPTED)
  async report(@Headers('x-pulse-token') token: string,@Body() body: unknown) {
    return this.eced.acceptReport(token ?? '',body);
  }

  private async authorize(request:Request,action:'view'|'create'|'update'|'delete',write=false) {
    const user=await this.auth.authorizeRequest(request,write);
    await this.access.assertPermission(user,'eced',action);
    return user;
  }
}
