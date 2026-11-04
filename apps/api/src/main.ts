import 'reflect-metadata';
import { isIP } from 'node:net';
import { NestFactory } from '@nestjs/core';
import type { CorsOptions } from 'cors';
import { ApplicationModule } from './application.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ApplicationModule);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const extensionCors: CorsOptions = {

    origin: (origin, callback) => {
      if (origin && /^(chrome-extension|moz-extension):\/\/[a-z0-9-]{16,}$/i.test(origin)) {
        callback(null, origin);
        return;
      }
      callback(null, false);
    },
    methods: ['GET','POST','OPTIONS'],
    allowedHeaders: ['Content-Type','X-Pulse-Token'],
    maxAge: 600,
    credentials: false,
  };
  app.enableCors(extensionCors);

  const trustedProxyIps = (process.env.TRUSTED_PROXY_IPS ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  if (trustedProxyIps.some((address) => isIP(address) === 0)) {
    throw new Error('Trusted proxy IP configuration is invalid.');
  }
  if (process.env.NODE_ENV === 'production' && trustedProxyIps.length === 0) {
    throw new Error('Trusted reverse proxy IPs must be configured in production.');
  }
  app.getHttpAdapter().getInstance().set('trust proxy', trustedProxyIps.length ? trustedProxyIps : false);

  const port = Number(process.env.API_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API port configuration is invalid.');
  }
  await app.listen(port, '127.0.0.1');
}

void bootstrap();
