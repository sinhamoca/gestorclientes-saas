import { FastifyInstance } from 'fastify';
import { accountService } from '../modules/account/account.service';
import { jwtAuth, requireSuperAdmin, checkPasswordChanged } from '../common/guards/auth';
import { createAdminSchema, updateAdminSchema, resetPasswordSchema } from '../common/utils/schemas';

export async function superAdminRoutes(app: FastifyInstance) {

  // Todas as rotas exigem: JWT + SUPER_ADMIN + senha trocada
  app.addHook('preHandler', jwtAuth);
  app.addHook('preHandler', requireSuperAdmin);
  app.addHook('preHandler', checkPasswordChanged);

  /**
   * POST /super-admin/admins - Criar admin
   */
  app.post('/super-admin/admins', async (request, reply) => {
    const body = createAdminSchema.parse(request.body);
    const result = await accountService.createAdmin(request.accountId!, body);
    return reply.status(201).send({ success: true, data: result });
  });

  /**
   * GET /super-admin/admins - Listar admins
   */
  app.get('/super-admin/admins', async (request, reply) => {
    const result = await accountService.listAdmins(request.accountId!);
    return reply.send({ success: true, data: result });
  });

  /**
   * GET /super-admin/admins/:id - Detalhe admin
   */
  app.get('/super-admin/admins/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await accountService.getAdmin(request.accountId!, id);
    return reply.send({ success: true, data: result });
  });

  /**
   * PUT /super-admin/admins/:id - Atualizar admin
   */
  app.put('/super-admin/admins/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateAdminSchema.parse(request.body);
    const result = await accountService.updateAdmin(request.accountId!, id, body);
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /super-admin/admins/:id/reset-password - Resetar senha
   */
  app.post('/super-admin/admins/:id/reset-password', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { newPassword } = resetPasswordSchema.parse(request.body);
    const result = await accountService.resetAdminPassword(request.accountId!, id, newPassword);
    return reply.send({ success: true, data: result });
  });
}
