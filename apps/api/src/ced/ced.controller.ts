import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { ModuleAction } from '../access-control/access-control.service.js';
import { CedService } from './ced.service.js';

@Controller('ced')
export class CedController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(CedService) private readonly ced: CedService,
  ) {}

  @Get('opinions')
  async listInstitutionOpinions(@Req() request: Request) {
    const user = await this.authorize(request, 'institution_opinions', 'view');
    return this.ced.listInstitutionOpinions(user);
  }

  @Get('contacts')
  async listInstitutionContacts(@Req() request: Request) {
    const user=await this.auth.authorizeRequest(request);
    const [canViewGuide,canViewOpinions]=await Promise.all([
      this.access.hasPermission(user,'institution_guide','view'),
      this.access.hasPermission(user,'institution_opinions','view'),
    ]);
    if(!canViewGuide&&!canViewOpinions) {
      throw new ForbiddenException({code:'MODULE_PERMISSION_DENIED',message:'Kurum rehberini görüntüleme yetkiniz bulunmuyor.'});
    }
    return this.ced.listInstitutionContacts(user);
  }

  @Get('projects/:projectId')
  async getProjectCase(@Req() request: Request, @Param('projectId') projectId: string) {
    const user = await this.authorize(request, 'eced', 'view');
    const includeOpinions = await this.access.hasPermission(user, 'institution_opinions', 'view');
    return this.ced.getProjectCase(user, projectId, includeOpinions);
  }

  @Post('projects/:projectId/opinions/defaults')
  @HttpCode(HttpStatus.CREATED)
  async addDefaultOpinionDrafts(@Req() request: Request, @Param('projectId') projectId: string) {
    return this.ced.addDefaultOpinionDrafts(await this.authorize(request, 'institution_opinions', 'create', true), projectId);
  }

  @Post('projects/:projectId/opinions')
  @HttpCode(HttpStatus.CREATED)
  async createOpinionForProject(@Req() request: Request, @Param('projectId') projectId: string, @Body() body: unknown) {
    return this.ced.createOpinionForProject(await this.authorize(request, 'institution_opinions', 'create', true), projectId, body);
  }

  @Post('projects/:projectId')
  @HttpCode(HttpStatus.CREATED)
  async createProjectCase(@Req() request: Request, @Param('projectId') projectId: string, @Body() body: unknown) {
    return this.ced.createProjectCase(await this.authorize(request, 'eced', 'create', true), projectId, body);
  }

  @Patch('cases/:caseId')
  async updateCase(@Req() request: Request, @Param('caseId') caseId: string, @Body() body: unknown) {
    return this.ced.updateCase(await this.authorize(request, 'eced', 'update', true), caseId, body);
  }

  @Post('cases/:caseId/stages')
  @HttpCode(HttpStatus.CREATED)
  async createStage(@Req() request: Request, @Param('caseId') caseId: string, @Body() body: unknown) {
    return this.ced.createStage(await this.authorize(request, 'eced', 'create', true), caseId, body);
  }

  @Patch('stages/:stageId')
  async updateStage(@Req() request: Request, @Param('stageId') stageId: string, @Body() body: unknown) {
    return this.ced.updateStage(await this.authorize(request, 'eced', 'update', true), stageId, body);
  }

  @Post('cases/:caseId/documents')
  @HttpCode(HttpStatus.CREATED)
  async createDocument(@Req() request: Request, @Param('caseId') caseId: string, @Body() body: unknown) {
    const user = await this.authorize(request, 'eced', 'create', true);
    if (body && typeof body === 'object' && !Array.isArray(body) &&
      (body as Record<string, unknown>).documentType === 'institution_opinion') {
      await this.access.assertPermission(user, 'institution_opinions', 'create');
    }
    return this.ced.createDocument(user, caseId, body);
  }

  @Post('cases/:caseId/opinions')
  @HttpCode(HttpStatus.CREATED)
  async createOpinion(@Req() request: Request, @Param('caseId') caseId: string, @Body() body: unknown) {
    return this.ced.createOpinion(await this.authorize(request, 'institution_opinions', 'create', true), caseId, body);
  }

  @Delete('opinions/:opinionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveOpinion(@Req() request: Request, @Param('opinionId') opinionId: string) {
    await this.ced.archiveOpinion(await this.authorize(request, 'institution_opinions', 'delete', true), opinionId);
  }

  @Patch('opinions/:opinionId')
  async updateOpinion(@Req() request: Request, @Param('opinionId') opinionId: string, @Body() body: unknown) {
    return this.ced.updateOpinion(await this.authorize(request, 'institution_opinions', 'update', true), opinionId, body);
  }

  @Post('cases/:caseId/idk-meetings')
  @HttpCode(HttpStatus.CREATED)
  async createIdkMeeting(@Req() request: Request, @Param('caseId') caseId: string, @Body() body: unknown) {
    return this.ced.createIdkMeeting(await this.authorize(request, 'eced', 'create', true), caseId, body);
  }

  @Patch('idk-meetings/:meetingId')
  async updateIdkMeeting(@Req() request: Request, @Param('meetingId') meetingId: string, @Body() body: unknown) {
    return this.ced.updateIdkMeeting(await this.authorize(request, 'eced', 'update', true), meetingId, body);
  }

  private async authorize(request: Request, moduleKey: string, action: ModuleAction, write = false) {
    const user = await this.auth.authorizeRequest(request, write);
    await this.access.assertPermission(user, moduleKey, action);
    return user;
  }
}
