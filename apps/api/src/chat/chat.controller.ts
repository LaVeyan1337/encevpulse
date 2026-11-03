import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Patch, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { ChatService } from './chat.service.js';

@Controller('chat')
export class ChatController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ChatService) private readonly chat: ChatService,
  ) {}

  @Get('conversations')
  async list(@Req() request: Request) {
    return this.chat.listConversations(await this.auth.authorizeRequest(request));
  }

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() request: Request, @Body() body: unknown) {
    return this.chat.createConversation(await this.auth.authorizeRequest(request, true), body);
  }

  @Get('conversations/:id')
  async details(@Req() request: Request, @Param('id') id: string) {
    return this.chat.conversationDetails(await this.auth.authorizeRequest(request), id);
  }

  @Get('conversations/:id/messages')
  async messages(
    @Req() request: Request,
    @Param('id') id: string,
    @Query('beforeCreatedAt') beforeCreatedAt?: string,
    @Query('beforeId') beforeId?: string,
  ) {
    return this.chat.messages(await this.auth.authorizeRequest(request), id, beforeCreatedAt, beforeId);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async send(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.sendMessage(await this.auth.authorizeRequest(request, true), id, body);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.markRead(await this.auth.authorizeRequest(request, true), id, body);
  }

  @Post('conversations/:id/members')
  @HttpCode(HttpStatus.OK)
  async addMembers(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.addMembers(await this.auth.authorizeRequest(request, true), id, body);
  }

  @Delete('conversations/:id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(@Req() request: Request, @Param('id') id: string, @Param('userId') userId: string) {
    await this.chat.removeMember(await this.auth.authorizeRequest(request, true), id, userId);
  }

  @Patch('messages/:id')
  async edit(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.editMessage(await this.auth.authorizeRequest(request, true), id, body);
  }

  @Delete('messages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.chat.deleteMessage(await this.auth.authorizeRequest(request, true), id, body);
  }

  @Post('messages/:id/reactions')
  async react(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.react(await this.auth.authorizeRequest(request, true), id, body);
  }

  @Delete('messages/:id/reactions')
  async unreact(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.react(await this.auth.authorizeRequest(request, true), id, body, true);
  }

  @Post('messages/:id/pin')
  async pin(@Req() request: Request, @Param('id') id: string) {
    return this.chat.pin(await this.auth.authorizeRequest(request, true), id, false);
  }

  @Post('messages/:id/unpin')
  async unpin(@Req() request: Request, @Param('id') id: string) {
    return this.chat.pin(await this.auth.authorizeRequest(request, true), id, true);
  }

  @Post('messages/:id/create-task')
  @HttpCode(HttpStatus.CREATED)
  async createTask(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.createTaskFromMessage(await this.auth.authorizeRequest(request, true), id, body);
  }

  @Get('search')
  async search(@Req() request: Request, @Query('q') query: string) {
    return this.chat.search(await this.auth.authorizeRequest(request), query);
  }
}
