import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthUser } from '../auth/auth.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';

type UploadRequest = Request & { chatUploadUser?: AuthUser };

@Injectable()
export class ChatUploadGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request=context.switchToHttp().getRequest<UploadRequest>();
    const user=await this.auth.authorizeRequest(request,true,'multipart');
    await this.access.assertPermission(user,'chat','create');
    request.chatUploadUser=user;
    return true;
  }
}
