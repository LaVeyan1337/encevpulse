import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { AuthUser } from './auth.service.js';
import { AuthService } from './auth.service.js';

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
  ) {}

  @Post('csrf')
  @HttpCode(HttpStatus.OK)
  async csrf(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.issueLoginChallenge(request);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const data = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const session = await this.auth.login(request, data.identifier, data.password);
    this.setSessionCookie(response, session.sessionToken);
    return { user: await this.withPermissions(session.user), csrfToken: session.csrfToken };
  }

  @Get('session')
  async session(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const current = await this.auth.currentSession(request);
    if (!current) {
      this.clearSessionCookie(response);
      return { authenticated: false };
    }
    return { authenticated: true, user: await this.withPermissions(current.user), csrfToken: current.csrfToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    await this.auth.logout(request);
    this.clearSessionCookie(response);
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const data = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const session = await this.auth.changePassword(request, data.currentPassword, data.newPassword);
    this.setSessionCookie(response, session.sessionToken);
    return { user: await this.withPermissions(session.user), csrfToken: session.csrfToken };
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.createUser(request, body);
  }

  @Get('users')
  async listUsers(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.listUsers(request);
  }

  @Get('people')
  async people(@Req() request: Request) {
    const user=await this.auth.authorizeRequest(request);
    await this.access.assertPermission(user,'people','view');
    return this.auth.listPeople();
  }

  @Get('permissions/me')
  async myPermissions(@Req() request:Request,@Res({passthrough:true}) response:Response) {
    response.setHeader('Cache-Control','no-store');
    const user=await this.auth.authorizeRequest(request);
    return this.access.permissionsForUser(user.roles);
  }

  @Get('permissions')
  async permissionMatrix(@Req() request:Request,@Res({passthrough:true}) response:Response) {
    response.setHeader('Cache-Control','no-store');
    const user=await this.auth.authorizeRequest(request);
    this.assertSystemAdmin(user);
    return this.access.listMatrix();
  }

  @Put('permissions/:roleCode/:moduleKey')
  async setRoleModulePermissions(@Req() request:Request,@Param('roleCode') roleCode:string,@Param('moduleKey') moduleKey:string,@Body() body:unknown,@Res({passthrough:true}) response:Response) {
    response.setHeader('Cache-Control','no-store');
    const user=await this.auth.authorizeRequest(request,true);
    this.assertSystemAdmin(user);
    return this.access.replaceRoleModulePermissions(user,roleCode,moduleKey,body);
  }

  @Get('roles')
  async roles(@Req() request: Request) {
    return this.auth.listRoles(request);
  }

  @Patch('users/:id/profile')
  async updateUserProfile(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.auth.updateUserProfile(request, id, body);
  }

  @Post('users/:id/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableUser(@Req() request: Request, @Param('id') id: string): Promise<void> {
    await this.auth.disableUser(request, id);
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetUserPassword(@Req() request: Request, @Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.resetUserPassword(request, id);
  }

  private assertSystemAdmin(user:AuthUser):void {
    if(!user.roles.includes('system_admin')) throw new ForbiddenException({code:'ADMIN_REQUIRED',message:'Bu işlem için sistem yöneticisi yetkisi gerekiyor.'});
  }

  private async withPermissions(user:AuthUser) {
    const result=await this.access.permissionsForUser(user.roles);
    return {...user,modulePermissions:result.modules};
  }

  private setSessionCookie(response: Response, token: string): void {
    response.cookie(this.auth.cookieName, token, {
      httpOnly: true,
      secure: this.auth.secureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_MS,
    });
  }

  private clearSessionCookie(response: Response): void {
    response.clearCookie(this.auth.cookieName, {
      httpOnly: true,
      secure: this.auth.secureCookies,
      sameSite: 'lax',
      path: '/',
    });
  }
}
