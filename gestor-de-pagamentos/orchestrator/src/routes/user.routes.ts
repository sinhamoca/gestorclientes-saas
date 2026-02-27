import { FastifyInstance } from 'fastify';
import { accountService } from '../modules/account/account.service';
import { gatewayConfigService } from '../modules/gateway/gateway-config.service';
import { paymentService } from '../modules/payment/payment.service';
import { webhookService } from '../modules/webhook/webhook.service';
import { jwtAuth, requireUser, checkPasswordChanged } from '../common/guards/auth';
import {
  configureGatewaySchema, configureFeeSchema,
  createApiKeySchema, listPaymentsSchema, webhookCallbackSchema,
} from '../common/utils/schemas';

export async function userRoutes(app: FastifyInstance) {

  app.addHook('preHandler', jwtAuth);
  app.addHook('preHandler', requireUser);
  app.addHook('preHandler', checkPasswordChanged);

  // ── Dashboard / Stats ────────────────────────────

  /**
   * GET /user/stats
   */
  app.get('/user/stats', async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const stats = await paymentService.getStats(request.accountId!, from, to);
    return reply.send({ success: true, data: stats });
  });

  // ── Payments (dashboard view) ────────────────────

  /**
   * GET /user/payments
   */
  app.get('/user/payments', async (request, reply) => {
    const query = listPaymentsSchema.parse(request.query);
    const result = await paymentService.list(request.accountId!, query);
    return reply.send({ success: true, ...result });
  });

  /**
   * GET /user/payments/:id
   */
  app.get('/user/payments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await paymentService.getById(request.accountId!, id);
    return reply.send({ success: true, data: result });
  });

  // ── Gateways ─────────────────────────────────────

  /**
   * GET /user/gateways
   */
  app.get('/user/gateways', async (request, reply) => {
    const result = await gatewayConfigService.list(request.accountId!);
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /user/gateways
   */
  app.post('/user/gateways', async (request, reply) => {
    const body = configureGatewaySchema.parse(request.body);
    const result = await gatewayConfigService.configure(request.accountId!, body);
    return reply.send({ success: true, data: result });
  });

  /**
   * PATCH /user/gateways/:id/toggle
   */
  app.patch('/user/gateways/:id/toggle', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await gatewayConfigService.toggle(request.accountId!, id);
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /user/gateways/:id/test - Testar conexão (validar credenciais)
   */
  app.post('/user/gateways/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await gatewayConfigService.testConnection(request.accountId!, id);
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /user/gateways/:id/test-payment - Gerar pagamento PIX de teste (R$ 1,00)
   */
  app.post('/user/gateways/:id/test-payment', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await gatewayConfigService.testPayment(request.accountId!, id);
    return reply.send({ success: true, data: result });
  });

  // ── Gateway Routing (roteamento por método) ─────

  /**
   * GET /user/routing - Listar roteamento atual
   */
  app.get('/user/routing', async (request, reply) => {
    const result = await gatewayConfigService.listRouting(request.accountId!);
    return reply.send({ success: true, data: result });
  });

  /**
   * PUT /user/routing - Salvar roteamento (bulk)
   * Body: { routes: [{ method: 'PIX', gatewayConfigId: 'xxx' }, ...] }
   */
  app.put('/user/routing', async (request, reply) => {
    const { routes } = request.body as { routes: { method: string; gatewayConfigId: string | null }[] };
    if (!Array.isArray(routes)) return reply.status(400).send({ success: false, message: 'routes deve ser um array' });
    const result = await gatewayConfigService.setRoutingBulk(request.accountId!, routes);
    return reply.send({ success: true, data: result });
  });

  // ── Fees ─────────────────────────────────────────

  /**
   * GET /user/fees
   */
  app.get('/user/fees', async (request, reply) => {
    const result = await gatewayConfigService.listFees(request.accountId!);
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /user/fees
   */
  app.post('/user/fees', async (request, reply) => {
    const body = configureFeeSchema.parse(request.body);
    const result = await gatewayConfigService.configureFee(request.accountId!, body);
    return reply.send({ success: true, data: result });
  });

  // ── API Keys ─────────────────────────────────────

  /**
   * GET /user/api-keys
   */
  app.get('/user/api-keys', async (request, reply) => {
    const result = await accountService.listApiKeys(request.accountId!);
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /user/api-keys
   */
  app.post('/user/api-keys', async (request, reply) => {
    const body = createApiKeySchema.parse(request.body || {});
    const result = await accountService.createApiKey(request.accountId!, body.label);
    return reply.status(201).send({ success: true, data: result });
  });

  /**
   * PATCH /user/api-keys/:id/toggle
   */
  app.patch('/user/api-keys/:id/toggle', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await accountService.toggleApiKey(request.accountId!, id);
    return reply.send({ success: true, data: result });
  });

  /**
   * DELETE /user/api-keys/:id
   */
  app.delete('/user/api-keys/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await accountService.deleteApiKey(request.accountId!, id);
    return reply.send({ success: true, data: result });
  });

  // ── Webhook Callback Config ───────────────────────

  /**
   * GET /user/webhook-config - Ver config atual
   */
  app.get('/user/webhook-config', async (request, reply) => {
    const account = await import('../database/prisma').then(m => m.prisma.account.findUnique({
      where: { id: request.accountId! },
      select: { webhookCallbackUrl: true, webhookCallbackSecret: true },
    }));
    return reply.send({
      success: true,
      data: {
        webhookCallbackUrl: account?.webhookCallbackUrl || null,
        hasSecret: !!account?.webhookCallbackSecret,
      },
    });
  });

  /**
   * PUT /user/webhook-config - Configurar URL de callback
   */
  app.put('/user/webhook-config', async (request, reply) => {
    const body = webhookCallbackSchema.parse(request.body);
    const { prisma } = await import('../database/prisma');
    await prisma.account.update({
      where: { id: request.accountId! },
      data: {
        webhookCallbackUrl: body.webhookCallbackUrl,
        ...(body.webhookCallbackSecret !== undefined && { webhookCallbackSecret: body.webhookCallbackSecret }),
      },
    });
    return reply.send({ success: true, message: 'Webhook callback configurado' });
  });

  // ── Webhooks (logs) ──────────────────────────────

  /**
   * GET /user/webhooks
   */
  app.get('/user/webhooks', async (request, reply) => {
    const { page, limit } = request.query as { page?: number; limit?: number };
    const result = await webhookService.listLogs(request.accountId!, page, limit);
    return reply.send({ success: true, ...result });
  });
}
