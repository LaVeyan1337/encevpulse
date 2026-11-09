import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';

/**
 * Task file attachments remain disabled until malware scanning and retention
 * requirements are approved. The explicit flag is for isolated integration
 * tests only; it is not set by the application configuration.
 */
@Injectable()
export class TaskAttachmentsFeatureGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (process.env.TASK_ATTACHMENTS_ENABLED === 'true') return true;
    throw new ServiceUnavailableException(
      'Görev dosya ekleri, zararlı yazılım taraması ve saklama süresi onaylanana kadar kapalıdır.',
    );
  }
}
