import { GatewayType } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { encryptJson, decryptJson } from '../../common/utils/encryption';
import { AppError } from '../../common/errors';
import { listAvailableGateways } from './gateway.factory';

export class GatewayConfigService {

  async configure(userId: string, data: {
    gateway: GatewayType;
    credentials: Record<string, string>;
    isPrimary?: boolean;
  }) {
    const encrypted = encryptJson(data.credentials);

    if (data.isPrimary) {
      await prisma.gatewayConfig.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const config = await prisma.gatewayConfig.upsert({
      where: { userId_gateway: { userId, gateway: data.gateway } },
      create: {
        userId,
        gateway: data.gateway,
        credentials: encrypted,
        isPrimary: data.isPrimary ?? false,
      },
      update: {
        credentials: encrypted,
        isPrimary: data.isPrimary,
        isActive: true,
      },
    });

    return { id: config.id, gateway: config.gateway, isActive: config.isActive, isPrimary: config.isPrimary };
  }

  async list(userId: string) {
    const configs = await prisma.gatewayConfig.findMany({
      where: { userId },
      select: { id: true, gateway: true, isActive: true, isPrimary: true, createdAt: true, updatedAt: true },
    });

    return { configured: configs, available: listAvailableGateways() };
  }

  async toggle(userId: string, configId: string) {
    const config = await prisma.gatewayConfig.findFirst({ where: { id: configId, userId } });
    if (!config) throw new AppError('Gateway config não encontrada', 404);

    const updated = await prisma.gatewayConfig.update({
      where: { id: configId },
      data: { isActive: !config.isActive },
    });

    return { id: updated.id, isActive: updated.isActive };
  }

  async configureFee(userId: string, data: {
    method: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO';
    feeType: 'PERCENTAGE' | 'FIXED';
    feeValue: number;
  }) {
    const rule = await prisma.feeRule.upsert({
      where: { userId_method: { userId, method: data.method } },
      create: { userId, method: data.method, feeType: data.feeType, feeValue: data.feeValue },
      update: { feeType: data.feeType, feeValue: data.feeValue, isActive: true },
    });
    return rule;
  }

  async listFees(userId: string) {
    return prisma.feeRule.findMany({ where: { userId }, orderBy: { method: 'asc' } });
  }

  // ── Routing (roteamento por método) ──────────────

  /**
   * Lista as rotas configuradas + status geral.
   * Retorna pra cada método: qual gateway está atribuído (ou null = usa primário)
   */
  async listRouting(userId: string) {
    const routings = await prisma.gatewayRouting.findMany({
      where: { userId },
      include: { gatewayConfig: { select: { id: true, gateway: true, isActive: true, isPrimary: true } } },
    });

    const configs = await prisma.gatewayConfig.findMany({
      where: { userId, isActive: true },
      select: { id: true, gateway: true, isPrimary: true },
    });

    const primaryGw = configs.find(c => c.isPrimary) || null;

    // Todos os métodos disponíveis com seu roteamento
    const methods: ('PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO')[] = ['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO'];
    const routingMap = methods.map(method => {
      const route = routings.find(r => r.method === method);
      return {
        method,
        gatewayConfigId: route?.gatewayConfigId || null,
        gateway: route?.gatewayConfig.gateway || null,
        gatewayLabel: route ? route.gatewayConfig.gateway : null,
        source: route ? 'routing' as const : 'primary' as const,
        effectiveGateway: route?.gatewayConfig.gateway || primaryGw?.gateway || null,
      };
    });

    return {
      routings: routingMap,
      primaryGateway: primaryGw,
      configuredGateways: configs,
    };
  }

  /**
   * Define ou atualiza rota: método X → gateway Y.
   * Se gatewayConfigId = null, remove a rota (volta pro primário).
   */
  async setRouting(userId: string, method: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO', gatewayConfigId: string | null) {
    if (!gatewayConfigId) {
      // Remove rota, volta pro primário
      await prisma.gatewayRouting.deleteMany({ where: { userId, method } });
      return { method, gateway: null, source: 'primary' };
    }

    // Verifica se o gateway pertence ao user e está ativo
    const config = await prisma.gatewayConfig.findFirst({ where: { id: gatewayConfigId, userId, isActive: true } });
    if (!config) throw new AppError('Gateway não encontrado ou inativo', 400);

    const routing = await prisma.gatewayRouting.upsert({
      where: { userId_method: { userId, method } },
      create: { userId, method, gatewayConfigId },
      update: { gatewayConfigId },
      include: { gatewayConfig: { select: { gateway: true } } },
    });

    return { method, gateway: routing.gatewayConfig.gateway, source: 'routing' };
  }

  /**
   * Salva todas as rotas de uma vez (bulk update).
   * Recebe um array: [{ method: 'PIX', gatewayConfigId: 'xxx' }, ...]
   */
  async setRoutingBulk(userId: string, routes: { method: string; gatewayConfigId: string | null }[]) {
    const results = [];
    for (const route of routes) {
      const result = await this.setRouting(userId, route.method as any, route.gatewayConfigId);
      results.push(result);
    }
    return results;
  }

  /**
   * Resolve qual gateway usar para um método específico.
   * Prioridade: 1) rota específica → 2) gateway primário → 3) erro
   */
  async resolveGatewayForMethod(userId: string, method: PaymentMethod, explicitGateway?: GatewayType) {
    // Se o caller especificou um gateway, usa ele (override)
    if (explicitGateway) {
      const config = await prisma.gatewayConfig.findFirst({ where: { userId, gateway: explicitGateway, isActive: true } });
      if (!config) throw new AppError(`Gateway "${explicitGateway}" não configurado ou inativo`, 400);
      return config;
    }

    // Verifica rota específica pro método
    const routing = await prisma.gatewayRouting.findUnique({
      where: { userId_method: { userId, method } },
      include: { gatewayConfig: true },
    });

    if (routing && routing.gatewayConfig.isActive) {
      return routing.gatewayConfig;
    }

    // Fallback: gateway primário
    const primary = await prisma.gatewayConfig.findFirst({ where: { userId, isPrimary: true, isActive: true } });
    if (!primary) throw new AppError('Nenhum gateway configurado para este método. Configure um roteamento ou defina um gateway primário.', 400);
    return primary;
  }

  /**
   * Testa conexão com o gateway usando as credenciais salvas.
   * MP: GET /v1/payment_methods
   * Asaas: GET /v3/finance/balance
   */
  async testConnection(userId: string, configId: string) {
    const config = await prisma.gatewayConfig.findFirst({ where: { id: configId, userId } });
    if (!config) throw new AppError('Gateway config não encontrada', 404);

    const creds = decryptJson<Record<string, string>>(config.credentials);

    if (config.gateway === 'MERCADO_PAGO') {
      const res = await fetch('https://api.mercadopago.com/v1/payment_methods', {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new AppError(`Mercado Pago retornou ${res.status}: ${body.message || 'Credenciais inválidas'}`, 400);
      }
      const methods = await res.json();
      return {
        success: true,
        gateway: 'MERCADO_PAGO',
        message: 'Conexão OK! Credenciais válidas.',
        details: {
          totalMethods: Array.isArray(methods) ? methods.length : 0,
          activeMethods: Array.isArray(methods)
            ? methods.filter((m: any) => m.status === 'active').map((m: any) => m.id).slice(0, 10)
            : [],
        },
      };
    }

    if (config.gateway === 'ASAAS') {
      const isSandbox = creds.sandbox === 'true';
      const baseUrl = isSandbox ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
      const res = await fetch(`${baseUrl}/finance/balance`, {
        headers: { 'access_token': creds.apiKey },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errMsg = body.errors?.[0]?.description || body.message || 'Credenciais inválidas';
        throw new AppError(`Asaas retornou ${res.status}: ${errMsg}`, 400);
      }
      const balance = await res.json();
      return {
        success: true,
        gateway: 'ASAAS',
        message: `Conexão OK! ${isSandbox ? '(Sandbox)' : '(Produção)'}`,
        details: {
          environment: isSandbox ? 'sandbox' : 'production',
          balance: balance.balance ?? null,
        },
      };
    }

    throw new AppError(`Teste não disponível para ${config.gateway}`, 400);
  }

  /**
   * Gera um pagamento PIX de teste (R$ 5,00 - mínimo Asaas) para validar integração completa.
   */
  async testPayment(userId: string, configId: string) {
    const config = await prisma.gatewayConfig.findFirst({ where: { id: configId, userId } });
    if (!config) throw new AppError('Gateway config não encontrada', 404);
    if (!config.isActive) throw new AppError('Gateway está desativado', 400);

    const creds = decryptJson<Record<string, string>>(config.credentials);
    const testAmountMP = 100;   // R$ 1,00 para Mercado Pago
    const testAmountAsaas = 500; // R$ 5,00 para Asaas (mínimo aceito)
    const testDescription = `Teste Orchestrator - ${new Date().toISOString()}`;

    if (config.gateway === 'MERCADO_PAGO') {
      const res = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.accessToken}`,
          'X-Idempotency-Key': `test-${userId}-${Date.now()}`,
        },
        body: JSON.stringify({
          transaction_amount: testAmountMP / 100,
          description: testDescription,
          payment_method_id: 'pix',
          payer: { email: 'test@orchestrator.com' },
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new AppError(`MP erro ${res.status}: ${body.message || JSON.stringify(body.cause || body)}`, 400);
      }

      return {
        success: true,
        gateway: 'MERCADO_PAGO',
        message: 'Pagamento de teste criado com sucesso!',
        payment: {
          id: body.id,
          status: body.status,
          amount: `R$ ${(testAmountMP / 100).toFixed(2).replace('.', ',')}`,
          pixCopiaECola: body.point_of_interaction?.transaction_data?.qr_code || null,
          pixQrCode: body.point_of_interaction?.transaction_data?.qr_code_base64 || null,
          expiresAt: body.date_of_expiration || null,
        },
      };
    }

    if (config.gateway === 'ASAAS') {
      const isSandbox = creds.sandbox === 'true';
      const baseUrl = isSandbox ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';

      // Criar customer de teste
      const custRes = await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': creds.apiKey },
        body: JSON.stringify({ name: 'Teste Orchestrator', cpfCnpj: '12345678909' }),
      });
      const customer = await custRes.json();
      const customerId = customer.id || customer.object?.id;
      if (!customerId && !customer.errors) {
        throw new AppError('Não foi possível criar customer de teste no Asaas', 400);
      }

      // Se o customer já existe, pegar pelo CPF
      let finalCustomerId = customerId;
      if (customer.errors) {
        const listRes = await fetch(`${baseUrl}/customers?cpfCnpj=12345678909`, {
          headers: { 'access_token': creds.apiKey },
        });
        const listData = await listRes.json();
        finalCustomerId = listData.data?.[0]?.id;
        if (!finalCustomerId) throw new AppError(`Asaas customer erro: ${JSON.stringify(customer.errors)}`, 400);
      }

      // Criar cobrança PIX
      const payRes = await fetch(`${baseUrl}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': creds.apiKey },
        body: JSON.stringify({
          customer: finalCustomerId,
          billingType: 'PIX',
          value: testAmountAsaas / 100,
          description: testDescription,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        }),
      });

      const payment = await payRes.json();
      if (!payRes.ok || payment.errors) {
        throw new AppError(`Asaas erro: ${payment.errors?.[0]?.description || JSON.stringify(payment)}`, 400);
      }

      // Buscar QR Code
      let pixData: any = {};
      try {
        const pixRes = await fetch(`${baseUrl}/payments/${payment.id}/pixQrCode`, {
          headers: { 'access_token': creds.apiKey },
        });
        if (pixRes.ok) pixData = await pixRes.json();
      } catch {}

      return {
        success: true,
        gateway: 'ASAAS',
        message: `Pagamento de teste criado! ${isSandbox ? '(Sandbox)' : '(Produção)'}`,
        payment: {
          id: payment.id,
          status: payment.status,
          amount: `R$ ${(testAmountAsaas / 100).toFixed(2).replace('.', ',')}`,
          pixCopiaECola: pixData.payload || null,
          pixQrCode: pixData.encodedImage || null,
          expiresAt: pixData.expirationDate || null,
        },
      };
    }

    throw new AppError(`Teste de pagamento não disponível para ${config.gateway}`, 400);
  }
}

export const gatewayConfigService = new GatewayConfigService();
