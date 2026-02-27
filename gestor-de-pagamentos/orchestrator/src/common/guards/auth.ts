import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../database/prisma';
import { UnauthorizedError, ForbiddenError } from '../../common/errors';
import { decrypt } from '../../common/utils/encryption';

// ── Types ────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    accountId?: string;
    accountRole?: string;
    userId?: string; // para API Key auth, aponta pro USER
  }
}

// ── JWT Auth (Dashboard login) ───────────────────

export async function jwtAuth(request: FastifyRequest, _reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<{
      accountId: string;
      role: string;
    }>();
    request.accountId = decoded.accountId;
    request.accountRole = decoded.role;
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}

// ── Role Guards ──────────────────────────────────

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.accountRole || !roles.includes(request.accountRole)) {
      throw new ForbiddenError('Sem permissão para esta ação');
    }
  };
}

export const requireSuperAdmin = requireRole('SUPER_ADMIN');
export const requireAdmin = requireRole('ADMIN');
export const requireUser = requireRole('USER');
export const requireAdminOrAbove = requireRole('SUPER_ADMIN', 'ADMIN');

// ── Must Change Password Check ───────────────────

export async function checkPasswordChanged(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.accountId) return;

  // Pular check para a rota de trocar senha
  if (request.url.includes('/auth/change-password')) return;

  const account = await prisma.account.findUnique({
    where: { id: request.accountId },
    select: { mustChangePassword: true },
  });

  if (account?.mustChangePassword) {
    throw new ForbiddenError('Você precisa trocar sua senha antes de continuar. Use PUT /api/v1/auth/change-password');
  }
}

// ── API Key Auth (GestãoPro → Gateway) ───────────

export async function apiKeyAuth(request: FastifyRequest, _reply: FastifyReply) {
  const apiKeyHeader = request.headers['x-api-key'] as string;

  if (!apiKeyHeader) {
    throw new UnauthorizedError('Header X-Api-Key ausente');
  }

  // Buscar a API key
  const apiKey = await prisma.apiKey.findFirst({
    where: { isActive: true },
    include: {
      user: { select: { id: true, isActive: true, role: true } },
    },
  });

  // Verificar comparando com todas as keys ativas
  const allKeys = await prisma.apiKey.findMany({
    where: { isActive: true },
    include: {
      user: { select: { id: true, isActive: true, role: true } },
    },
  });

  let matchedKey: typeof allKeys[0] | null = null;

  for (const key of allKeys) {
    try {
      const plain = decrypt(key.keyPlain);
      if (plain === apiKeyHeader) {
        matchedKey = key;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!matchedKey) {
    throw new UnauthorizedError('API Key inválida');
  }

  if (!matchedKey.user.isActive) {
    throw new UnauthorizedError('Conta desativada');
  }

  if (matchedKey.user.role !== 'USER') {
    throw new UnauthorizedError('API Key deve pertencer a um usuário');
  }

  request.userId = matchedKey.user.id;
}
