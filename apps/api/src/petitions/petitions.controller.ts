import {
  Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post,
  Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { ModuleAction } from '../access-control/access-control.service.js';
import { MAX_DOCX_BYTES } from './docx-template.js';
import { PetitionUploadGuard, type PetitionUploadRequest } from './petition-upload.guard.js';
import { PetitionsService, type PetitionUploadFile } from './petitions.service.js';

@Controller('petitions')
export class PetitionsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(PetitionsService) private readonly petitions: PetitionsService,
  ) {}

  @Get('templates')
  async listTemplates(@Req() request:Request) {
    await this.authorize(request,'view');
    return this.petitions.listTemplates();
  }

  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PetitionUploadGuard)
  @UseInterceptors(FileInterceptor('file',{
    limits:{files:1,fileSize:MAX_DOCX_BYTES,fields:2,fieldSize:2000,parts:4},
  }))
  async createTemplate(
    @Req() request:PetitionUploadRequest,
    @Body() body:Record<string,unknown>,
    @UploadedFile() file:PetitionUploadFile,
  ) {
    if(!request.petitionUploadUser)throw new Error('Petition upload authorization was not initialized.');
    return this.petitions.createTemplate(request.petitionUploadUser,body,file);
  }

  @Get('templates/:templateId/versions')
  async listTemplateVersions(@Req() request:Request,@Param('templateId') templateId:string) {
    await this.authorize(request,'view');
    return this.petitions.listTemplateVersions(templateId);
  }

  @Post('templates/:templateId/versions')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PetitionUploadGuard)
  @UseInterceptors(FileInterceptor('file',{
    limits:{files:1,fileSize:MAX_DOCX_BYTES,fields:0,fieldSize:1000,parts:2},
  }))
  async createTemplateVersion(
    @Req() request:PetitionUploadRequest,
    @Param('templateId') templateId:string,
    @UploadedFile() file:PetitionUploadFile,
  ) {
    if(!request.petitionUploadUser)throw new Error('Petition upload authorization was not initialized.');
    return this.petitions.createTemplateVersion(request.petitionUploadUser,templateId,file);
  }

  @Get('templates/:templateId/versions/:versionId/download')
  async downloadTemplateVersion(
    @Req() request:Request,
    @Param('templateId') templateId:string,
    @Param('versionId') versionId:string,
    @Res({passthrough:true}) response:Response,
  ) {
    const file=await this.petitions.downloadTemplateVersion(
      await this.authorize(request,'view'),templateId,versionId,
    );
    response.setHeader('Cache-Control','private, no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    response.setHeader('Content-Length',String(file.byteSize));
    response.setHeader('Content-Disposition',contentDisposition(file.fileName));
    return new StreamableFile(file.content);
  }

  @Post('templates/:templateId/archive')
  async archiveTemplate(@Req() request:Request,@Param('templateId') templateId:string) {
    return this.petitions.archiveTemplate(await this.authorize(request,'manage',true),templateId);
  }

  @Get('documents')
  async listDocuments(
    @Req() request:Request,
    @Query() query:Record<string,string|undefined>,
  ) {
    return this.petitions.listDocuments(await this.authorize(request,'view'),query);
  }

  @Post('documents')
  @HttpCode(HttpStatus.CREATED)
  async createDocument(@Req() request:Request,@Body() body:unknown) {
    return this.petitions.createDocument(await this.authorize(request,'create',true),body);
  }

  @Get('documents/:documentId')
  async getDocument(@Req() request:Request,@Param('documentId') documentId:string) {
    return this.petitions.getDocument(await this.authorize(request,'view'),documentId);
  }

  @Get('documents/:documentId/download')
  async downloadDocument(
    @Req() request:Request,
    @Param('documentId') documentId:string,
    @Res({passthrough:true}) response:Response,
  ) {
    const file=await this.petitions.downloadDocument(
      await this.authorize(request,'view'),documentId,
    );
    response.setHeader('Cache-Control','private, no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    response.setHeader('Content-Length',String(file.byteSize));
    response.setHeader('Content-Disposition',contentDisposition(file.fileName));
    return new StreamableFile(file.content);
  }

  @Patch('documents/:documentId/status')
  async updateDocumentStatus(
    @Req() request:Request,
    @Param('documentId') documentId:string,
    @Body() body:unknown,
  ) {
    return this.petitions.updateDocumentStatus(
      await this.authorize(request,'update',true),documentId,body,
    );
  }

  private async authorize(request:Request,action:ModuleAction,write=false) {
    const user=await this.auth.authorizeRequest(request,write);
    await this.access.assertPermission(user,'petitions',action);
    return user;
  }
}

function contentDisposition(filename:string):string {
  const safe=filename.replace(/[\r\n"]/g,'_').replace(/[^\x20-\x7e]/g,'_').slice(0,160)||'dilekce.docx';
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
