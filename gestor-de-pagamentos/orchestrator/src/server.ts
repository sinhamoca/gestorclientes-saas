import { buildApp } from './app';
import { env } from './config/env';
import { prisma } from './database/prisma';
import { redis } from './database/redis';
import { startExpirePaymentsJob, stopExpirePaymentsJob } from './jobs/expire-payments';

async function main() {
  const app = await buildApp();

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down...`);
      stopExpirePaymentsJob();
      await app.close();
      await prisma.$disconnect();
      redis.disconnect();
      process.exit(0);
    });
  }

  try {
    await app.listen({ port: env.PORT, host: env.HOST });

    // Iniciar job de expiração de pagamentos pendentes
    startExpirePaymentsJob();

    console.log(`
╔═══════════════════════════════════════════════╗
║     ⚡ Payment Orchestrator v2.0.0            ║
╠═══════════════════════════════════════════════╣
║  API:    http://${env.HOST}:${env.PORT}                ║
║  Health: http://${env.HOST}:${env.PORT}/health          ║
║  Env:    ${env.NODE_ENV.padEnd(37)}║
╠═══════════════════════════════════════════════╣
║  Endpoints:                                   ║
║    /api/v1/auth/*          → Login            ║
║    /api/v1/super-admin/*   → Gerenciar Admins ║
║    /api/v1/admin/*         → Gerenciar Users  ║
║    /api/v1/user/*          → Dashboard User   ║
║    /api/v1/payments/*      → API (X-Api-Key)  ║
║    /api/v1/webhooks/*      → Webhooks         ║
╠═══════════════════════════════════════════════╣
║  Jobs:                                        ║
║    expire-payments  → 30min (expira após 2h)  ║
╚═══════════════════════════════════════════════╝
    `);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
