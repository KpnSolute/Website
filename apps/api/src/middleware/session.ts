import type { FastifyRequest } from 'fastify';
import { resolveAccessToken, type AuthenticatedSession } from '../services/auth.js';
import { requestEnv, requestRepos } from '../lib/context.js';
import { ApiError } from '../lib/errors.js';

export async function requireSession(req: FastifyRequest): Promise<AuthenticatedSession> {
  const repos = requestRepos(req);
  const session = await resolveAccessToken(requestEnv(req), repos, req.headers.authorization);
  if (!session) {
    throw ApiError.unauthenticated();
  }
  return session;
}

export async function optionalSession(req: FastifyRequest): Promise<AuthenticatedSession | null> {
  const repos = requestRepos(req);
  return resolveAccessToken(requestEnv(req), repos, req.headers.authorization);
}
