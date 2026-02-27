import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { env } from './config/env';
import { authRoutes } from './routes/auth.routes';
import { superAdminRoutes } from './routes/super-admin.routes';
import { adminRoutes } from './routes/admin.routes';
import { userRoutes } from './routes/user.routes';
import { paymentApiRoutes } from './routes/payment-api.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { AppError } from './common/errors';
import { ZodError } from 'zod';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
    },
  });

  // ── Plugins ──────────────────────────────────────

  await app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : [env.FRONTEND_URL],
    credentials: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  // ── Error Handler ────────────────────────────────

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Erro de validação',
        errors: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    if (error.statusCode === 429) {
      return reply.status(429).send({ success: false, code: 'RATE_LIMIT', message: 'Muitas requisições' });
    }

    app.log.error(error);
    return reply.status(500).send({
      success: false,
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'development' ? error.message : 'Erro interno',
    });
  });

  // ── Health ───────────────────────────────────────

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  }));

  // ── Routes ───────────────────────────────────────
  //
  // Estrutura:
  //   /api/v1/auth/*            → Login, troca de senha (todos)
  //   /api/v1/super-admin/*     → Super Admin gerencia Admins
  //   /api/v1/admin/*           → Admin gerencia Users
  //   /api/v1/user/*            → User: dashboard, gateways, fees, api keys
  //   /api/v1/payments/*        → API pública (X-Api-Key do GestãoPro)
  //   /api/v1/webhooks/*        → Webhooks dos gateways
  //

  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(superAdminRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1' });
  await app.register(userRoutes, { prefix: '/api/v1' });
  await app.register(paymentApiRoutes, { prefix: '/api/v1' });
  await app.register(webhookRoutes, { prefix: '/api/v1' });

  return app;
}
