import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';

/**
 * Task file attachments remain disabled until malware scanning and retention
 * requirements are approved. Even an explicit override is rejected in production.
 */
@Injectable()
export class TaskAttachmentsFeatureGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (process.env.NODE_ENV !== 'production' && process.env.TASK_ATTACHMENTS_ENABLED === 'true') return true;
    throw new ServiceUnavailableException(
      'Görev dosya ekleri, zararlı yazılım taraması ve saklama süresi onaylanana kadar kapalıdır.',
    );
  }
}
