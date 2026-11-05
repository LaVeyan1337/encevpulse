import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Inject, NotFoundException, Param, Patch, Post, Query, Req, Res, Sse, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { AuthUser } from '../auth/auth.service.js';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { ModuleAction } from '../access-control/access-control.service.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatService } from './chat.service.js';
import { ChatCallsService } from './chat-calls.service.js';
import { ChatUploadGuard } from './chat-upload.guard.js';

import type { UploadedChatFile } from './chat-attachments.js';
type ChatUploadRequest = Request & { chatUploadUser?: AuthUser };

@Controller('chat')
export class ChatController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(ChatEventsService) private readonly chatEvents: ChatEventsService,
    @Inject(ChatCallsService) private readonly calls: ChatCallsService,
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

  @Get('call-configuration')
  async callConfiguration(@Req() request:Request) {
    return this.calls.iceConfiguration(await this.authorize(request,'chat','view'));
  }

  @Get('calls/active')
  async activeCall(@Req() request:Request) {
    return this.calls.activeCall(await this.authorize(request,'chat','view'));
  }

  @Post('conversations/:id/calls')
  @HttpCode(HttpStatus.CREATED)
  async startCall(@Req() request:Request,@Param('id') id:string,@Body() body:unknown) {
    return this.calls.startCall(await this.authorize(request,'chat','create',true),id,body);
  }

  @Post('calls/:id/accept')
  async acceptCall(@Req() request:Request,@Param('id') id:string) {
    return this.calls.acceptCall(await this.authorize(request,'chat','update',true),id);
  }

  @Post('calls/:id/decline')
  async declineCall(@Req() request:Request,@Param('id') id:string) {
    return this.calls.declineCall(await this.authorize(request,'chat','update',true),id);
  }

  @Post('calls/:id/end')
  async endCall(@Req() request:Request,@Param('id') id:string) {
    return this.calls.endCall(await this.authorize(request,'chat','update',true),id);
  }

  @Post('calls/:id/signals')
  async sendCallSignal(@Req() request:Request,@Param('id') id:string,@Body() body:unknown) {
    return this.calls.sendSignal(await this.authorize(request,'chat','update',true),id,body);
  }

  @Get('calls/:id/signals')
  async listCallSignals(@Req() request:Request,@Param('id') id:string,@Query('afterId') afterId?:string) {
    return this.calls.listSignals(await this.authorize(request,'chat','view'),id,afterId);
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

  @Post('conversations/:id/attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ChatUploadGuard)
  @UseInterceptors(FilesInterceptor('files',5,{
    limits:{files:5,fileSize:12*1024*1024,fields:3,fieldSize:5000,parts:8},
  }))
  async sendAttachments(
    @Req() request: ChatUploadRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @UploadedFiles() files: UploadedChatFile[],
  ) {
    const user=request.chatUploadUser;
    if(!user) throw new Error('Chat upload authorization was not initialized.');
    return this.chat.sendAttachments(user,id,body,files??[]);
  }

  @Get('attachments/:id/content')
  @Header('Cache-Control','private, no-store')
  @Header('X-Content-Type-Options','nosniff')
  async attachmentContent(
    @Req() request: Request,
    @Param('id') id: string,
    @Res({passthrough:true}) response: Response,
  ) {
    const attachment=await this.chat.getAttachment(await this.authorize(request,'chat','view'),id);
    if(!attachment.mimeType.startsWith('image/')&&!attachment.mimeType.startsWith('audio/')&&!attachment.mimeType.startsWith('video/')) {
      throw new NotFoundException({code:'CHAT_INLINE_MEDIA_NOT_FOUND',message:'Bu dosya türü yalnızca indirilerek açılabilir.'});
    }
    response.setHeader('Content-Type',attachment.mimeType);
    response.setHeader('Content-Length',String(attachment.byteSize));
    response.setHeader('Content-Disposition',contentDisposition('inline',attachment.originalName));
    return new StreamableFile(attachment.content);
  }

  @Get('attachments/:id/download')
  @Header('Cache-Control','private, no-store')
  @Header('X-Content-Type-Options','nosniff')
  async downloadAttachment(
    @Req() request: Request,
    @Param('id') id: string,
    @Res({passthrough:true}) response: Response,
  ) {
    const attachment=await this.chat.getAttachment(await this.authorize(request,'chat','view'),id);
    response.setHeader('Content-Type','application/octet-stream');
    response.setHeader('Content-Length',String(attachment.byteSize));
    response.setHeader('Content-Disposition',contentDisposition('attachment',attachment.originalName));
    return new StreamableFile(attachment.content);
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


function contentDisposition(mode:'inline'|'attachment',filename:string):string {
  const safe=filename.replace(/[\r\n"]/g,'_').replace(/[^\x20-\x7e]/g,'_').slice(0,160)||'dosya';
  return mode+`; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
