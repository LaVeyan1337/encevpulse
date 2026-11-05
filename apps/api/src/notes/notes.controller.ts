import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { ModuleAction } from '../access-control/access-control.service.js';
import { NotesService } from './notes.service.js';

@Controller('notes')
export class NotesController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(NotesService) private readonly notes: NotesService,
  ) {}

  @Get()
  async list(@Req() request: Request, @Query() query: Record<string, string | undefined>) {
    return this.notes.list(await this.authorize(request, 'view'), query);
  }

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    return this.notes.get(await this.authorize(request, 'view'), id);
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    return this.notes.create(await this.authorize(request, 'create', true), body);
  }

  @Patch(':id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.notes.update(await this.authorize(request, 'update', true), id, body);
  }

  @Post(':id/archive')
  async archive(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.notes.setArchived(await this.authorize(request, 'delete', true), id, body, false);
  }

  @Post(':id/restore')
  async restore(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.notes.setArchived(await this.authorize(request, 'update', true), id, body, true);
  }

  private async authorize(request: Request, action: ModuleAction, write = false) {
    const user = await this.auth.authorizeRequest(request, write);
    await this.access.assertPermission(user, 'notes', action);
    return user;
  }
}
