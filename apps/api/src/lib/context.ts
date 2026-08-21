import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { EnvRecord } from '@kpn/config';
import { getDb, type Db } from '../db/pool.js';
import { createPgRepositories } from '../repositories/pg/index.js';
import type { Repositories } from '../repositories/types.js';

declare module 'fastify' {
  interface FastifyInstance {
    platformEnv: EnvRecord;
    platformRepositories: Repositories | null;
  }
}

export function requestDb(req: FastifyRequest): Db {
  return getDb(req.server.platformEnv);
}

export function requestRepos(req: FastifyRequest): Repositories {
  return req.server.platformRepositories ?? createPgRepositories(requestDb(req));
}

export function requestEnv(req: FastifyRequest): EnvRecord {
  return req.server.platformEnv;
}

export function bindPlatformEnv(
  app: FastifyInstance,
  env: EnvRecord,
  repositories: Repositories | null = null,
): void {
  app.decorate('platformEnv', env);
  app.decorate('platformRepositories', repositories);
}
