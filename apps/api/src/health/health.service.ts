import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface HealthStatus {
  status: 'ok' | 'unavailable';
  database?: 'ok' | 'unavailable';
}

@Injectable()
export class HealthService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  live(): HealthStatus {
    return { status: 'ok' };
  }

  async ready(): Promise<HealthStatus> {
    try {
      await this.database.checkConnection();
      return { status: 'ok', database: 'ok' };
    } catch {
      return { status: 'unavailable', database: 'unavailable' };
    }
  }
}
