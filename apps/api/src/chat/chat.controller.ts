import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Inject, Param, Post, Patch, Query, Req, Sse } from '@nestjs/common';
import type { Request } from 'express';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { ModuleAction } from '../access-control/access-control.service.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatService } from './chat.service.js';

@Controller('chat')
export class ChatController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(ChatEventsService) private readonly chatEvents: ChatEventsService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
  ) {}

  @Sse('events')
  @Header('Cache-Control','no-cache, no-transform')
  @Header('X-Accel-Buffering','no')
  async events(@Req() request:Request):Promise<Observable<MessageEvent>> {
    const user=await this.authorize(request,'chat','view');
    return this.chatEvents.subscribe(user.id,async()=>{
      const session=await this.auth.currentSession(request);
      if(!session||session.user.mustChangePassword)return false;
      try {
        await this.access.assertPermission(session.user,'chat','view');
        return true;
      } catch {
        return false;
      }
    });
  }

  @Get('conversations')
  async list(@Req() request: Request) {
    return this.chat.listConversations(await this.authorize(request,'chat','view'));
  }

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() request: Request, @Body() body: unknown) {
    return this.chat.createConversation(await this.authorize(request,'chat','create',true), body);
  }

  @Get('conversations/:id')
  async details(@Req() request: Request, @Param('id') id: string) {
    return this.chat.conversationDetails(await this.authorize(request,'chat','view'), id);
  }

  @Get('conversations/:id/messages')
  async messages(
    @Req() request: Request,
    @Param('id') id: string,
    @Query('beforeCreatedAt') beforeCreatedAt?: string,
    @Query('beforeId') beforeId?: string,
  ) {
    return this.chat.messages(await this.authorize(request,'chat','view'), id, beforeCreatedAt, beforeId);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async send(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.sendMessage(await this.authorize(request,'chat','create',true), id, body);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.markRead(await this.authorize(request,'chat','update',true), id, body);
  }

  @Post('conversations/:id/members')
  @HttpCode(HttpStatus.OK)
  async addMembers(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.addMembers(await this.authorize(request,'chat','update',true), id, body);
  }

  @Patch('conversations/:id/members/:userId/role')
  async updateMemberRole(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    return this.chat.updateMemberRole(await this.authorize(request,'chat','update',true), id, userId, body);
  }

  @Delete('conversations/:id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(@Req() request: Request, @Param('id') id: string, @Param('userId') userId: string) {
    await this.chat.removeMember(await this.authorize(request,'chat','delete',true), id, userId);
  }

  @Patch('messages/:id')
  async edit(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.editMessage(await this.authorize(request,'chat','update',true), id, body);
  }

  @Delete('messages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.chat.deleteMessage(await this.authorize(request,'chat','delete',true), id, body);
  }

  @Post('messages/:id/reactions')
  async react(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.react(await this.authorize(request,'chat','update',true), id, body);
  }

  @Delete('messages/:id/reactions')
  async unreact(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.react(await this.authorize(request,'chat','update',true), id, body, true);
  }

  @Post('messages/:id/pin')
  async pin(@Req() request: Request, @Param('id') id: string) {
    return this.chat.pin(await this.authorize(request,'chat','update',true), id, false);
  }

  @Post('messages/:id/unpin')
  async unpin(@Req() request: Request, @Param('id') id: string) {
    return this.chat.pin(await this.authorize(request,'chat','update',true), id, true);
  }

  @Post('messages/:id/create-task')
  @HttpCode(HttpStatus.CREATED)
  async createTask(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const user=await this.authorize(request,'chat','create',true);
    await this.access.assertPermission(user,'tasks','create');
    return this.chat.createTaskFromMessage(user,id,body);
  }

  @Get('search')
  async search(@Req() request: Request, @Query('q') query: string) {
    return this.chat.search(await this.authorize(request,'chat','view'), query);
  }

  private async authorize(request:Request,moduleKey:string,action:ModuleAction,write=false) {
    const user=await this.auth.authorizeRequest(request,write);
    await this.access.assertPermission(user,moduleKey,action);
    return user;
  }
}
