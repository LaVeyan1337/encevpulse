import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { TasksService } from './tasks.service.js';

@Controller()
export class TasksController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(TasksService) private readonly tasks: TasksService) {}

  @Get('tasks')
  async list(@Req() request: Request, @Query() query: Record<string, string | undefined>) {
    return this.tasks.list(await this.auth.authorizeRequest(request), query);
  }

  @Get('tasks/summary')
  async summary(@Req() request: Request) {
    return this.tasks.summary(await this.auth.authorizeRequest(request));
  }

  @Get('tasks/activity')
  async activity(@Req() request: Request) {
    return this.tasks.activity(await this.auth.authorizeRequest(request));
  }

  @Get('notifications')
  async notifications(@Req() request: Request) {
    return this.tasks.notifications(await this.auth.authorizeRequest(request));
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markNotificationRead(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.tasks.markNotificationRead(await this.auth.authorizeRequest(request, true), id, body);
  }

  @Get('tasks/people')
  async people(@Req() request: Request) {
    await this.auth.authorizeRequest(request);
    return this.tasks.people();
  }

  @Get('tasks/projects')
  async projects(@Req() request: Request) {
    return this.tasks.projects(await this.auth.authorizeRequest(request));
  }

  @Get('tasks/:id')
  async get(@Req() request: Request, @Param('id') id: string) {
    return this.tasks.get(await this.auth.authorizeRequest(request), id);
  }

  @Get('tasks/:id/activity')
  async taskActivity(@Req() request: Request, @Param('id') id: string) {
    return this.tasks.taskActivity(await this.auth.authorizeRequest(request), id);
  }

  @Post('tasks/projects')
  @HttpCode(HttpStatus.CREATED)
  async createProject(@Req() request: Request, @Body() body: unknown) {
    return this.tasks.createProject(await this.auth.authorizeRequest(request, true), body);
  }

  @Post('tasks')
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() request: Request, @Body() body: unknown) {
    return this.tasks.create(await this.auth.authorizeRequest(request, true), body);
  }

  @Patch('tasks/:id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.tasks.update(await this.auth.authorizeRequest(request, true), id, body);
  }

  @Post('tasks/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.tasks.archive(await this.auth.authorizeRequest(request, true), id, body, false);
  }

  @Post('tasks/:id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  async restore(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.tasks.archive(await this.auth.authorizeRequest(request, true), id, body, true);
  }
}
