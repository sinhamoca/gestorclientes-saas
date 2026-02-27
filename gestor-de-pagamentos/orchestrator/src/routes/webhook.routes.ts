import { FastifyInstance } from 'fastify';
import { GatewayType } from '@prisma/client';
import { webhookService } from '../modules/webhook/webhook.service';

const GATEWAY_MAP: Record<string, GatewayType> = {
  'mercado-pago': 'MERCADO_PAGO',
  'asaas': 'ASAAS',
  'stripe': 'STRIPE',
  'picpay': 'PICPAY',
};

export async function webhookRoutes(app: FastifyInstance) {

  /**
   * POST /webhooks/:gateway/:userId
   * Recebe webhooks dos gateways.
   * Ex: /webhooks/mercado-pago/clx123abc
   */
  app.post('/webhooks/:gateway/:userId', async (request, reply) => {
    const { gateway: slug, userId } = request.params as { gateway: string; userId: string };

    const gatewayType = GATEWAY_MAP[slug];
    if (!gatewayType) return reply.status(400).send({ error: 'Gateway desconhecido' });

    try {
      const result = await webhookService.processInbound(
        gatewayType,
        userId,
        request.headers as Record<string, string>,
        request.body
      );
      return reply.status(200).send(result);
    } catch (error: any) {
      console.error(`[Webhook Error] ${slug}/${userId}:`, error.message);
      return reply.status(200).send({ status: 'error', message: error.message });
    }
  });
}
