import { GatewayType, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { getGatewayAdapter } from '../gateway/gateway.factory';
import { decryptJson } from '../../common/utils/encryption';
import { paymentService } from '../payment/payment.service';

export class WebhookService {

  async processInbound(gateway: GatewayType, userId: string, headers: Record<string, string>, body: unknown) {
    const adapter = getGatewayAdapter(gateway);

    const log = await prisma.webhookLog.create({
      data: {
        userId,
        gateway,
        direction: 'INBOUND',
        headers: headers as Prisma.InputJsonValue,
        body: body as Prisma.InputJsonValue,
      },
    });

    try {
      const parsed = await adapter.parseWebhook(headers, body);
      if (!parsed) {
        await prisma.webhookLog.update({ where: { id: log.id }, data: { success: true, processedAt: new Date(), error: 'Ignorado' } });
        return { status: 'ignored' };
      }

      const payment = await prisma.payment.findFirst({
        where: { gatewayPaymentId: parsed.gatewayPaymentId, userId },
        include: { gatewayConfig: true },
      });

      if (!payment) {
        await prisma.webhookLog.update({ where: { id: log.id }, data: { success: false, processedAt: new Date(), error: `Pagamento não encontrado: ${parsed.gatewayPaymentId}` } });
        return { status: 'payment_not_found' };
      }

      // Para MP, consultar API pra pegar status real
      let finalStatus = parsed.status;
      let paidAt = parsed.paidAt;

      if (gateway === GatewayType.MERCADO_PAGO) {
        const creds = decryptJson<Record<string, string>>(payment.gatewayConfig.credentials);
        const statusResult = await adapter.getPaymentStatus(parsed.gatewayPaymentId, creds);
        finalStatus = statusResult.status;
        paidAt = statusResult.paidAt;
      }

      const previousStatus = payment.status;
      if (finalStatus !== payment.status) {
        await paymentService.updateStatus(payment.id, finalStatus, paidAt, parsed.raw);
      }

      await prisma.webhookLog.update({ where: { id: log.id }, data: { paymentId: payment.id, success: true, processedAt: new Date() } });

      return { status: 'processed', paymentId: payment.id, newStatus: finalStatus };
    } catch (error: any) {
      await prisma.webhookLog.update({ where: { id: log.id }, data: { success: false, processedAt: new Date(), error: error.message } });
      throw error;
    }
  }

  async listLogs(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [logs, total] = await prisma.$transaction([
      prisma.webhookLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.webhookLog.count({ where: { userId } }),
    ]);
    return { data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}

export const webhookService = new WebhookService();
