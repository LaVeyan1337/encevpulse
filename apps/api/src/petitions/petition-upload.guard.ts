import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthUser } from '../auth/auth.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';

export type PetitionUploadRequest = Request & { petitionUploadUser?: AuthUser };

@Injectable()
export class PetitionUploadGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request=context.switchToHttp().getRequest<PetitionUploadRequest>();
    const user=await this.auth.authorizeRequest(request,true,'multipart');
    await this.access.assertPermission(user,'petitions','manage');
    request.petitionUploadUser=user;
    return true;
  }
}
