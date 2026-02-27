import { FastifyInstance } from 'fastify';
import { accountService } from '../modules/account/account.service';
import { jwtAuth } from '../common/guards/auth';
import { loginSchema, changePasswordSchema } from '../common/utils/schemas';

export async function authRoutes(app: FastifyInstance) {

  /**
   * POST /auth/login
   */
  app.post('/auth/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);
    const account = await accountService.login(email, password);

    const token = app.jwt.sign({
      accountId: account.id,
      role: account.role,
    });

    return reply.send({
      success: true,
      data: { account, token },
    });
  });

  /**
   * PUT /auth/change-password
   * Qualquer role pode trocar sua própria senha.
   * Se mustChangePassword=true, não exige senha atual.
   */
  app.put('/auth/change-password', {
    preHandler: [jwtAuth],
  }, async (request, reply) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
    const result = await accountService.changePassword(request.accountId!, currentPassword, newPassword);
    return reply.send({ success: true, data: result });
  });

  /**
   * GET /auth/me
   */
  app.get('/auth/me', {
    preHandler: [jwtAuth],
  }, async (request, reply) => {
    return reply.send({
      success: true,
      data: {
        accountId: request.accountId,
        role: request.accountRole,
      },
    });
  });
}
