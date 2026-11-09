import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthUser } from '../auth/auth.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';

type TaskUploadRequest = Request & { taskUploadUser?: AuthUser };

@Injectable()
export class TaskUploadGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request=context.switchToHttp().getRequest<TaskUploadRequest>();
    const user=await this.auth.authorizeRequest(request,true,'multipart');
    const canCreate=await this.access.hasPermission(user,'tasks','create');
    const canUpdate=await this.access.hasPermission(user,'tasks','update');
    if(!canCreate&&!canUpdate) await this.access.assertPermission(user,'tasks','create');
    request.taskUploadUser=user;
    return true;
  }
}
