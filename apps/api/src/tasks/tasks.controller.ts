import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query, Req, Res, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { ModuleAction } from '../access-control/access-control.service.js';
import { TasksService } from './tasks.service.js';
import { TaskUploadGuard } from './task-upload.guard.js';
import { TaskAttachmentsFeatureGuard } from './task-attachments-feature.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { CHAT_ATTACHMENT_MAX_FILE_BYTES, CHAT_ATTACHMENT_MAX_FILES, type UploadedChatFile } from '../chat/chat-attachments.js';

type TaskUploadRequest = Request & { taskUploadUser?: AuthUser };

@Controller()
export class TasksController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
  ) {}

  @Get('tasks')
  async list(@Req() request: Request, @Query() query: Record<string, string | undefined>) {
    const user=await this.authorize(request,'tasks','view');
    const includeCedCase=await this.access.hasPermission(user,'eced','view');
    return this.tasks.list(user,query,includeCedCase);
  }

  @Get('tasks/summary')
  async summary(@Req() request: Request) {
    return this.tasks.summary(await this.authorize(request,'tasks','view'));
  }

  @Get('tasks/activity')
  async activity(@Req() request: Request) {
    return this.tasks.activity(await this.authorize(request,'tasks','view'));
  }

  @Get('notifications')
  async notifications(@Req() request: Request) {
    const user=await this.authorize(request,'notifications','view');
    const includeChat=await this.access.hasPermission(user,'chat','view');
    const includeTasks=await this.access.hasPermission(user,'tasks','view');
    return this.tasks.notifications(user,includeChat,includeTasks);
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markNotificationRead(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const user=await this.authorize(request,'notifications','update',true);
    const includeChat=await this.access.hasPermission(user,'chat','view');
    const includeTasks=await this.access.hasPermission(user,'tasks','view');
    await this.tasks.markNotificationRead(user,id,body,includeChat,includeTasks);
  }

  @Get('tasks/:id/comments')
  async taskComments(@Req() request: Request, @Param('id') id: string) {
    return this.tasks.taskComments(await this.authorize(request,'tasks','view'), id);
  }

  @Post('tasks/:id/comments')
  @HttpCode(HttpStatus.CREATED)
  async createTaskComment(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.tasks.createTaskComment(await this.authorize(request,'tasks','create',true), id, body);
  }

  @Patch('tasks/:taskId/comments/:commentId')
  async updateTaskComment(
    @Req() request: Request,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Body() body: unknown,
  ) {
    return this.tasks.updateTaskComment(await this.authorize(request,'tasks','update',true), taskId, commentId, body);
  }

  @Delete('tasks/:taskId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTaskComment(
    @Req() request: Request,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Body() body: unknown,
  ) {
    await this.tasks.deleteTaskComment(await this.authorize(request,'tasks','delete',true), taskId, commentId, body);
  }

  @Get('tasks/people')
  async people(@Req() request: Request) {
    await this.authorize(request,'people','view');
    return this.tasks.people();
  }

  @Get('tasks/projects')
  async projects(@Req() request: Request, @Query('view') view?: string) {
    return this.tasks.projects(await this.authorize(request,'projects','view'), view ?? 'active');
  }

  @Get('projects')
  async projectList(@Req() request: Request, @Query('view') view?: string) {
    return this.tasks.projects(await this.authorize(request,'projects','view'), view ?? 'active');
  }

  @Get('projects/:id')
  async projectDetails(@Req() request: Request, @Param('id') id: string) {
    return this.tasks.projectDetails(await this.authorize(request,'projects','view'), id);
  }

  @Patch('projects/:id')
  async updateProject(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.tasks.updateProject(await this.authorize(request,'projects','update',true), id, body);
  }

  @Post('projects')
  @HttpCode(HttpStatus.CREATED)
  async createProjectWorkspace(@Req() request: Request, @Body() body: unknown) {
    return this.tasks.createProject(await this.authorize(request,'projects','create',true), body);
  }

  @Post('projects/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveProject(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.tasks.archiveProject(await this.authorize(request,'projects','delete',true), id, body, false);
  }

  @Post('projects/:id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  async restoreProject(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.tasks.archiveProject(await this.authorize(request,'projects','update',true), id, body, true);
  }

  @Get('tasks/:id/attachments')
  @UseGuards(TaskAttachmentsFeatureGuard)
  async taskAttachments(@Req() request: Request,@Param('id') id: string) {
    return this.tasks.taskAttachments(await this.authorize(request,'tasks','view'),id);
  }

  @Post('tasks/:id/attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(TaskAttachmentsFeatureGuard,TaskUploadGuard)
  @UseInterceptors(FilesInterceptor('files',CHAT_ATTACHMENT_MAX_FILES,{
    limits:{files:CHAT_ATTACHMENT_MAX_FILES,fileSize:CHAT_ATTACHMENT_MAX_FILE_BYTES,fields:0,parts:CHAT_ATTACHMENT_MAX_FILES},
  }))
  async addTaskAttachments(
    @Req() request: TaskUploadRequest,
    @Param('id') id: string,
    @UploadedFiles() files: UploadedChatFile[],
  ) {
    const user=request.taskUploadUser;
    if(!user) throw new Error('Task upload authorization was not initialized.');
    return this.tasks.addTaskAttachments(user,id,files??[]);
  }

  @Get('tasks/attachments/:attachmentId/download')
  @UseGuards(TaskAttachmentsFeatureGuard)
  @Header('Cache-Control','private, no-store')
  @Header('X-Content-Type-Options','nosniff')
  async downloadTaskAttachment(
    @Req() request: Request,
    @Param('attachmentId') id: string,
    @Res({passthrough:true}) response: Response,
  ) {
    const attachment=await this.tasks.getTaskAttachment(await this.authorize(request,'tasks','view'),id);
    response.setHeader('Content-Type','application/octet-stream');
    response.setHeader('Content-Length',String(attachment.byteSize));
    response.setHeader('Content-Disposition',taskContentDisposition(attachment.originalName));
    return new StreamableFile(attachment.content);
  }

  @Delete('tasks/attachments/:attachmentId')
  @UseGuards(TaskAttachmentsFeatureGuard)
  async deleteTaskAttachment(@Req() request: Request,@Param('attachmentId') id: string,@Body() body: unknown) {
    return this.tasks.deleteTaskAttachment(await this.authorize(request,'tasks','delete',true),id,body);
  }

  @Get('tasks/:id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const user=await this.authorize(request,'tasks','view');
    const includeCedCase=await this.access.hasPermission(user,'eced','view');
    return this.tasks.get(user,id,includeCedCase);
  }

  @Get('tasks/:id/activity')
  async taskActivity(@Req() request: Request, @Param('id') id: string) {
    return this.tasks.taskActivity(await this.authorize(request,'tasks','view'), id);
  }

  @Post('tasks/projects')
  @HttpCode(HttpStatus.CREATED)
  async createProject(@Req() request: Request, @Body() body: unknown) {
    return this.tasks.createProject(await this.authorize(request,'projects','create',true), body);
  }

  @Post('tasks')
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() request: Request, @Body() body: unknown) {
    const user=await this.authorize(request,'tasks','create',true);
    const includeCedCase=await this.access.hasPermission(user,'eced','view');
    if(hasField(body,'cedCaseId') && !includeCedCase) await this.access.assertPermission(user,'eced','view');
    return this.tasks.create(user,body,includeCedCase);
  }

  @Patch('tasks/:id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const user=await this.authorize(request,'tasks','update',true);
    const includeCedCase=await this.access.hasPermission(user,'eced','view');
    if(hasField(body,'cedCaseId') && !includeCedCase) await this.access.assertPermission(user,'eced','view');
    return this.tasks.update(user,id,body,includeCedCase);
  }

  @Post('tasks/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.tasks.archive(await this.authorize(request,'tasks','delete',true), id, body, false);
  }

  @Post('tasks/:id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  async restore(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.tasks.archive(await this.authorize(request,'tasks','update',true), id, body, true);
  }

  private async authorize(request:Request,moduleKey:string,action:ModuleAction,write=false) {
    const user=await this.auth.authorizeRequest(request,write);
    await this.access.assertPermission(user,moduleKey,action);
    return user;
  }
}

function hasField(input:unknown,key:string):boolean {
  return Boolean(input && typeof input==='object' && !Array.isArray(input) && Object.hasOwn(input,key));
}

function taskContentDisposition(filename:string):string {
  const safe=filename.replace(/[\r\n"]/g,'_').replace(/[^\x20-\x7e]/g,'_').slice(0,160)||'dosya';
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
