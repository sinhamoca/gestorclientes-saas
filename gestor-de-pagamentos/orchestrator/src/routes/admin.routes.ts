import { FastifyInstance } from 'fastify';
import { accountService } from '../modules/account/account.service';
import { jwtAuth, requireAdmin, checkPasswordChanged } from '../common/guards/auth';
import { createUserSchema, updateUserSchema, resetPasswordSchema } from '../common/utils/schemas';

export async function adminRoutes(app: FastifyInstance) {

  app.addHook('preHandler', jwtAuth);
  app.addHook('preHandler', requireAdmin);
  app.addHook('preHandler', checkPasswordChanged);

  /**
   * POST /admin/users - Criar usuário
   */
  app.post('/admin/users', async (request, reply) => {
    const body = createUserSchema.parse(request.body);
    const result = await accountService.createUser(request.accountId!, body);
    return reply.status(201).send({ success: true, data: result });
  });

  /**
   * GET /admin/users - Listar usuários
   */
  app.get('/admin/users', async (request, reply) => {
    const result = await accountService.listUsers(request.accountId!);
    return reply.send({ success: true, data: result });
  });

  /**
   * GET /admin/users/:id - Detalhe usuário
   */
  app.get('/admin/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await accountService.getUser(request.accountId!, id);
    return reply.send({ success: true, data: result });
  });

  /**
   * PUT /admin/users/:id - Atualizar usuário
   */
  app.put('/admin/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateUserSchema.parse(request.body);
    const result = await accountService.updateUser(request.accountId!, id, body);
    return reply.send({ success: true, data: result });
  });

  /**
   * POST /admin/users/:id/reset-password - Resetar senha
   */
  app.post('/admin/users/:id/reset-password', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { newPassword } = resetPasswordSchema.parse(request.body);
    const result = await accountService.resetUserPassword(request.accountId!, id, newPassword);
    return reply.send({ success: true, data: result });
  });
}
