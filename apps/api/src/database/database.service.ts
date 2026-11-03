import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { QueryResult, QueryResultRow } from 'pg';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly pool: Pool;
  readonly orm: ReturnType<typeof drizzle>;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const password = config.get<string>('POSTGRES_PASSWORD');
    if (!password) {
      throw new Error('Required local database configuration is missing.');
    }
    const port = Number(config.get<string>('DB_PORT', '5432'));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Local database port configuration is invalid.');
    }

    this.pool = new Pool({
      host: config.get<string>('DB_HOST', '127.0.0.1'),
      port,
      database: config.get<string>('DB_NAME', 'encev_pulse_dev'),
      user: config.get<string>('DB_USER', 'encev_dev'),
      password,
      max: 15,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,
      application_name: 'encev-pulse-api-local',
    });

    // Pool-level connection errors are reflected by readiness checks; never log credentials.
    this.pool.on('error', () => undefined);
    this.orm = drizzle({ client: this.pool });
  }

  async checkConnection(): Promise<void> {
    await this.query('SELECT 1');
  }

  async query<Row extends QueryResultRow = QueryResultRow>(statement: string, parameters: readonly unknown[] = []): Promise<QueryResult<Row>> {
    const fragments: SQL[] = [];
    const placeholders = /\$(\d+)/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = placeholders.exec(statement)) !== null) {
      const parameterIndex = Number(match[1]) - 1;
      if (!Number.isInteger(parameterIndex) || parameterIndex < 0 || parameterIndex >= parameters.length) {
        throw new Error('Database query has an invalid parameter placeholder.');
      }
      fragments.push(sql.raw(statement.slice(cursor, match.index)), sql`${sql.param(parameters[parameterIndex])}`);
      cursor = match.index + match[0].length;
    }
    fragments.push(sql.raw(statement.slice(cursor)));
    const result = await this.orm.execute(sql.join(fragments, sql.empty()));
    return result as QueryResult<Row>;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
