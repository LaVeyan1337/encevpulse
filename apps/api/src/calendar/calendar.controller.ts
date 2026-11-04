import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Patch, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { ModuleAction } from '../access-control/access-control.service.js';
import { CalendarService } from './calendar.service.js';

@Controller('calendar')
export class CalendarController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(CalendarService) private readonly calendar: CalendarService,
  ) {}

  @Get()
  async list(@Req() request: Request, @Query() query: Record<string, string | undefined>) {
    const user = await this.authorize(request, 'calendar', 'view');
    const includeTasks = await this.access.hasPermission(user, 'tasks', 'view');
    const includeProjects = await this.access.hasPermission(user, 'projects', 'view');
    const includeCed = await this.access.hasPermission(user, 'eced', 'view');
    const includeOpinions = await this.access.hasPermission(user, 'institution_opinions', 'view');
    return this.calendar.list(user, query, includeTasks, includeProjects, includeCed, includeOpinions, true);
  }

  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.authorize(request, 'calendar', 'create', true);
    return this.calendar.create(user, body);
  }

  @Patch('events/:id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.authorize(request, 'calendar', 'update', true);
    return this.calendar.update(user, id, body);
  }

  @Post('events/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.authorize(request, 'calendar', 'delete', true);
    await this.calendar.archive(user, id, body);
  }

  private async authorize(request: Request, moduleKey: string, action: ModuleAction, write = false) {
    const user = await this.auth.authorizeRequest(request, write);
    await this.access.assertPermission(user, moduleKey, action);
    return user;
  }
}
