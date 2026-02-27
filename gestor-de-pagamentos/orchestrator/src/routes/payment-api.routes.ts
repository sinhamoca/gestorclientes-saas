import { FastifyInstance } from 'fastify';
import { paymentService } from '../modules/payment/payment.service';
import { apiKeyAuth } from '../common/guards/auth';
import { createPaymentSchema, listPaymentsSchema, refundSchema } from '../common/utils/schemas';

export async function paymentApiRoutes(app: FastifyInstance) {

  // Todas as rotas exigem X-Api-Key
  app.addHook('preHandler', apiKeyAuth);

  /**
   * POST /payments - Criar pagamento
   * Usado pelo GestãoPro
   */
  app.post('/payments', async (request, reply) => {
    const body = createPaymentSchema.parse(request.body);
    const result = await paymentService.create(request.userId!, body);
    return reply.status(201).send({ success: true, data: result });
  });

  /**
   * GET /payments - Listar pagamentos
   */
  app.get('/payments', async (request, reply) => {
    const query = listPaymentsSchema.parse(request.query);
    const result = await paymentService.list(request.userId!, query);
    return reply.send({ success: true, ...result });
  });

  /**
   * GET /payments/:id - Buscar pagamento
   */
  app.get('/payments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await paymentService.getById(request.userId!, id);
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /payments/:id/sync - Sincronizar status com gateway
   */
  app.post('/payments/:id/sync', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await paymentService.syncStatus(request.userId!, id);
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /payments/:id/refund - Reembolsar
   */
  app.post('/payments/:id/refund', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = refundSchema.parse(request.body || {});
    const result = await paymentService.refund(request.userId!, id, body.amount);
    return reply.send({ success: true, data: result });
  });
}
