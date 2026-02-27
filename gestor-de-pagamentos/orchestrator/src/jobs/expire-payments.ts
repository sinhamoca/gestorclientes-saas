// src/jobs/expire-payments.ts
// Roda periodicamente e marca como EXPIRED pagamentos PENDING com mais de 2 horas.

import { prisma } from '../database/prisma';
import { redis } from '../database/redis';

const EXPIRATION_HOURS = 2;
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutos

async function expireStalePayments() {
  const cutoff = new Date(Date.now() - EXPIRATION_HOURS * 60 * 60 * 1000);

  try {
    // Buscar pagamentos pendentes com mais de 2h
    const stalePayments = await prisma.payment.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: cutoff },
      },
      select: { id: true, userId: true },
    });

    if (stalePayments.length === 0) return;

    // Atualizar em batch
    const result = await prisma.payment.updateMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: cutoff },
      },
      data: {
        status: 'EXPIRED',
        cancelledAt: new Date(),
      },
    });

    // Criar histórico para cada pagamento expirado
    if (stalePayments.length > 0) {
      await prisma.paymentStatusHistory.createMany({
        data: stalePayments.map((p) => ({
          paymentId: p.id,
          from: 'PENDING',
          to: 'EXPIRED',
          reason: `Expirado automaticamente após ${EXPIRATION_HOURS}h sem pagamento`,
        })),
      });

      // Limpar cache
      for (const p of stalePayments) {
        await redis.del(`payment:${p.id}`).catch(() => {});
      }
    }

    if (result.count > 0) {
      console.log(`[expire-payments] ${result.count} pagamento(s) expirado(s) (pendentes há mais de ${EXPIRATION_HOURS}h)`);
    }
  } catch (error: any) {
    console.error('[expire-payments] Erro:', error.message);
  }
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startExpirePaymentsJob() {
  console.log(`[expire-payments] Job iniciado - verifica a cada ${INTERVAL_MS / 60000}min, expira após ${EXPIRATION_HOURS}h`);

  // Rodar imediatamente na inicialização
  expireStalePayments();

  // Rodar a cada 30 minutos
  intervalHandle = setInterval(expireStalePayments, INTERVAL_MS);
}

export function stopExpirePaymentsJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
