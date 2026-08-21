import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import type { EnvRecord } from '@kpn/config';
import { APP_HOSTS, ROOT_DOMAIN } from '@kpn/contracts';
import { bindPlatformEnv } from './lib/context.js';
import { ApiError } from './lib/errors.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerOAuthRoutes } from './routes/oauth.js';
import { registerAccountsRoutes } from './routes/accounts.js';
import { registerPlatformRoutes } from './routes/platform.js';
import { registerCreateRoutes } from './routes/create.js';
import { registerBillingRoutes } from './routes/billing.js';
import type { Repositories } from './repositories/types.js';

const ALLOWED_ORIGINS = [
  ...Object.values(APP_HOSTS).map((host) => `https://${host}`),
  `https://${ROOT_DOMAIN}`,
];
const LOCAL_ORIGIN_PATTERN = /^http:\/\/localhost:\d+$/;

export async function buildServer(
  env: EnvRecord = process.env,
  options: { repositories?: Repositories } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: env.NODE_ENV !== 'test', trustProxy: true });
  bindPlatformEnv(app, env, options.repositories ?? null);

  await app.register(cookie);
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN_PATTERN.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by KpnSolute gateway CORS policy.'), false);
    },
    credentials: true,
  });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.status).send({ error: error.toPayload() });
      return;
    }
    if (error instanceof ZodError) {
      reply.status(422).send({
        error: {
          code: 'validation_error',
          message: error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
        },
      });
      return;
    }
    app.log.error(error);
    reply
      .status(500)
      .send({ error: { code: 'unknown_error', message: 'An unexpected error occurred.' } });
  });

  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerOAuthRoutes(app);
  registerAccountsRoutes(app);
  registerPlatformRoutes(app);
  registerCreateRoutes(app);
  registerBillingRoutes(app);

  return app;
}
