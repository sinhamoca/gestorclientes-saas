import { AccountRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../database/prisma';
import { encrypt, decrypt } from '../../common/utils/encryption';
import { AppError, NotFoundError, ForbiddenError } from '../../common/errors';

export class AccountService {

  // ── Auth ─────────────────────────────────────────

  async login(email: string, password: string) {
    const account = await prisma.account.findUnique({ where: { email } });

    if (!account || !account.isActive) {
      throw new AppError('Credenciais inválidas', 401);
    }

    const valid = await bcrypt.compare(password, account.password);
    if (!valid) {
      throw new AppError('Credenciais inválidas', 401);
    }

    return {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      mustChangePassword: account.mustChangePassword,
    };
  }

  async changePassword(accountId: string, currentPassword: string | undefined, newPassword: string) {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Conta');

    // Se mustChangePassword=true, não exige senha atual
    if (!account.mustChangePassword) {
      if (!currentPassword) {
        throw new AppError('Senha atual é obrigatória');
      }
      const valid = await bcrypt.compare(currentPassword, account.password);
      if (!valid) {
        throw new AppError('Senha atual incorreta');
      }
    }

    await prisma.account.update({
      where: { id: accountId },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        mustChangePassword: false,
      },
    });

    return { message: 'Senha alterada com sucesso' };
  }

  // ── Super Admin: Manage Admins ───────────────────

  async createAdmin(superAdminId: string, data: { name: string; email: string; password: string }) {
    const existing = await prisma.account.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email já cadastrado', 409);

    const admin = await prisma.account.create({
      data: {
        name: data.name,
        email: data.email,
        password: await bcrypt.hash(data.password, 10),
        role: 'ADMIN',
        parentId: superAdminId,
        mustChangePassword: true,
        isActive: true,
      },
    });

    return this.formatAccount(admin);
  }

  async listAdmins(superAdminId: string) {
    const admins = await prisma.account.findMany({
      where: { role: 'ADMIN', parentId: superAdminId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { children: true } },
      },
    });

    return admins.map((a) => ({
      ...this.formatAccount(a),
      totalUsers: a._count.children,
    }));
  }

  async getAdmin(superAdminId: string, adminId: string) {
    const admin = await prisma.account.findFirst({
      where: { id: adminId, role: 'ADMIN', parentId: superAdminId },
      include: { _count: { select: { children: true } } },
    });
    if (!admin) throw new NotFoundError('Admin');

    return { ...this.formatAccount(admin), totalUsers: admin._count.children };
  }

  async updateAdmin(superAdminId: string, adminId: string, data: { name?: string; isActive?: boolean }) {
    const admin = await prisma.account.findFirst({
      where: { id: adminId, role: 'ADMIN', parentId: superAdminId },
    });
    if (!admin) throw new NotFoundError('Admin');

    const updated = await prisma.account.update({
      where: { id: adminId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return this.formatAccount(updated);
  }

  async resetAdminPassword(superAdminId: string, adminId: string, newPassword: string) {
    const admin = await prisma.account.findFirst({
      where: { id: adminId, role: 'ADMIN', parentId: superAdminId },
    });
    if (!admin) throw new NotFoundError('Admin');

    await prisma.account.update({
      where: { id: adminId },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        mustChangePassword: true,
      },
    });

    return { message: 'Senha resetada. Usuário deverá trocar no próximo login.' };
  }

  // ── Admin: Manage Users ──────────────────────────

  async createUser(adminId: string, data: { name: string; email: string; password: string }) {
    const existing = await prisma.account.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email já cadastrado', 409);

    const user = await prisma.account.create({
      data: {
        name: data.name,
        email: data.email,
        password: await bcrypt.hash(data.password, 10),
        role: 'USER',
        parentId: adminId,
        mustChangePassword: true,
        isActive: true,
      },
    });

    return this.formatAccount(user);
  }

  async listUsers(adminId: string) {
    const users = await prisma.account.findMany({
      where: { role: 'USER', parentId: adminId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { payments: true, apiKeys: true } },
      },
    });

    return users.map((u) => ({
      ...this.formatAccount(u),
      totalPayments: u._count.payments,
      totalApiKeys: u._count.apiKeys,
    }));
  }

  async getUser(adminId: string, userId: string) {
    const user = await prisma.account.findFirst({
      where: { id: userId, role: 'USER', parentId: adminId },
      include: { _count: { select: { payments: true, apiKeys: true } } },
    });
    if (!user) throw new NotFoundError('Usuário');

    return {
      ...this.formatAccount(user),
      totalPayments: user._count.payments,
      totalApiKeys: user._count.apiKeys,
    };
  }

  async updateUser(adminId: string, userId: string, data: { name?: string; isActive?: boolean }) {
    const user = await prisma.account.findFirst({
      where: { id: userId, role: 'USER', parentId: adminId },
    });
    if (!user) throw new NotFoundError('Usuário');

    const updated = await prisma.account.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return this.formatAccount(updated);
  }

  async resetUserPassword(adminId: string, userId: string, newPassword: string) {
    const user = await prisma.account.findFirst({
      where: { id: userId, role: 'USER', parentId: adminId },
    });
    if (!user) throw new NotFoundError('Usuário');

    await prisma.account.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        mustChangePassword: true,
      },
    });

    return { message: 'Senha resetada. Usuário deverá trocar no próximo login.' };
  }

  // ── User: API Keys ─────────────────────────────

  async createApiKey(userId: string, label?: string) {
    // Gerar chave aleatória
    const rawKey = `orch_${crypto.randomBytes(24).toString('hex')}`;

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        key: await bcrypt.hash(rawKey, 10),
        keyPlain: encrypt(rawKey), // encriptada mas recuperável
        label: label || 'default',
        isActive: true,
      },
    });

    return {
      id: apiKey.id,
      key: rawKey, // retorna a chave em texto
      label: apiKey.label,
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
    };
  }

  async listApiKeys(userId: string) {
    const keys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => {
      let plainKey = '';
      try {
        plainKey = decrypt(k.keyPlain);
      } catch {
        plainKey = '***erro ao decriptar***';
      }

      return {
        id: k.id,
        key: plainKey, // sempre visível
        label: k.label,
        isActive: k.isActive,
        createdAt: k.createdAt,
      };
    });
  }

  async toggleApiKey(userId: string, keyId: string) {
    const key = await prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    });
    if (!key) throw new NotFoundError('API Key');

    const updated = await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: !key.isActive },
    });

    return { id: updated.id, isActive: updated.isActive };
  }

  async deleteApiKey(userId: string, keyId: string) {
    const key = await prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    });
    if (!key) throw new NotFoundError('API Key');

    await prisma.apiKey.delete({ where: { id: keyId } });
    return { message: 'API Key removida' };
  }

  // ── Helpers ──────────────────────────────────────

  private formatAccount(account: any) {
    return {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      isActive: account.isActive,
      mustChangePassword: account.mustChangePassword,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}

export const accountService = new AccountService();
