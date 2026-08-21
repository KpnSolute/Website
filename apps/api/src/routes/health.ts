import type { FastifyInstance } from 'fastify';
import { resolvePlatformConfigState } from '@kpn/config';
import { sendData } from '../lib/reply.js';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async (_req, reply) => {
    sendData(reply, { status: 'ok', configState: resolvePlatformConfigState(app.platformEnv) });
  });

  app.get('/status', async (_req, reply) => {
    sendData(reply, { status: 'ok', configState: resolvePlatformConfigState(app.platformEnv) });
  });
}
