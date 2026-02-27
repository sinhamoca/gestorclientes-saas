import axios, { AxiosInstance } from 'axios';
import { GatewayType, PaymentStatus } from '@prisma/client';
import {
  IGatewayAdapter, CreatePaymentInput, CreatePaymentOutput,
  PaymentStatusOutput, RefundInput, RefundOutput, WebhookPayload,
} from '../../../common/interfaces/gateway.interface';
import { GatewayError } from '../../../common/errors';

const STATUS_MAP: Record<string, PaymentStatus> = {
  pending: 'PENDING', approved: 'APPROVED', authorized: 'PROCESSING',
  in_process: 'PROCESSING', in_mediation: 'PROCESSING', rejected: 'REJECTED',
  cancelled: 'CANCELLED', refunded: 'REFUNDED', charged_back: 'REFUNDED',
};

function mapStatus(s: string): PaymentStatus {
  return STATUS_MAP[s] || 'ERROR';
}

export class MercadoPagoAdapter implements IGatewayAdapter {
  readonly name = GatewayType.MERCADO_PAGO;

  private client(creds: Record<string, string>): AxiosInstance {
    return axios.create({
      baseURL: 'https://api.mercadopago.com',
      headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  }

  async createPayment(input: CreatePaymentInput, creds: Record<string, string>): Promise<CreatePaymentOutput> {
    const api = this.client(creds);
    const headers = { 'X-Idempotency-Key': input.idempotencyKey || `mp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };

    try {
      // ═══ CHECKOUT PRO (redirect) ═══
      if (input.checkout) {
        const prefPayload: any = {
          items: [{
            title: input.description || 'Pagamento',
            unit_price: input.amount / 100,
            quantity: 1,
            currency_id: 'BRL',
          }],
          payer: {
            email: input.payer?.email || 'customer@email.com',
            ...(input.payer?.name && { first_name: input.payer.name.split(' ')[0] }),
            ...(input.payer?.name && { last_name: input.payer.name.split(' ').slice(1).join(' ') || '' }),
          },
          payment_methods: {},
          notification_url: input.notificationUrl,
          external_reference: input.externalId,
          metadata: input.metadata,
        };

        // Exclusões de métodos de pagamento
        const excludedTypes = input.checkout.excludedPaymentTypes || ['ticket', 'atm'];
        if (excludedTypes.length > 0) {
          prefPayload.payment_methods.excluded_payment_types = excludedTypes.map(t => ({ id: t }));
        }
        if (input.checkout.excludedPaymentMethods?.length) {
          prefPayload.payment_methods.excluded_payment_methods = input.checkout.excludedPaymentMethods.map(m => ({ id: m }));
        }

        // URLs de retorno
        if (input.checkout.backUrl) {
          prefPayload.back_urls = {
            success: `${input.checkout.backUrl}?status=approved`,
            failure: `${input.checkout.backUrl}?status=rejected`,
            pending: `${input.checkout.backUrl}?status=pending`,
          };
          prefPayload.auto_return = 'approved';
        }

        const { data } = await api.post('/checkout/preferences', prefPayload, { headers });

        return {
          gatewayPaymentId: String(data.id),
          status: 'PENDING' as PaymentStatus,
          checkoutUrl: data.init_point, // URL de produção
          raw: data,
        };
      }

      // ═══ PIX DIRETO ═══
      if (input.method === 'PIX') {
        const exp = new Date();
        exp.setMinutes(exp.getMinutes() + (input.pix?.expirationMinutes || 30));

        const { data } = await api.post('/v1/payments', {
          transaction_amount: input.amount / 100,
          description: input.description || 'Pagamento PIX',
          payment_method_id: 'pix',
          payer: {
            email: input.payer?.email || 'customer@email.com',
            first_name: input.payer?.name?.split(' ')[0],
            last_name: input.payer?.name?.split(' ').slice(1).join(' '),
            identification: input.payer?.document ? { type: 'CPF', number: input.payer.document.replace(/\D/g, '') } : undefined,
          },
          date_of_expiration: exp.toISOString(),
          notification_url: input.notificationUrl,
          external_reference: input.externalId,
          metadata: input.metadata,
        }, { headers });

        return {
          gatewayPaymentId: String(data.id),
          status: mapStatus(data.status),
          pixQrCode: data.point_of_interaction?.transaction_data?.qr_code_base64,
          pixCopiaECola: data.point_of_interaction?.transaction_data?.qr_code,
          pixExpiration: new Date(data.date_of_expiration),
          raw: data,
        };
      }

      // ═══ CARTÃO DIRETO (tokenizado) ═══
      if (input.method === 'CREDIT_CARD') {
        if (!input.card?.token) throw new GatewayError('MERCADO_PAGO', 'Token do cartão obrigatório');

        const { data } = await api.post('/v1/payments', {
          transaction_amount: input.amount / 100,
          description: input.description || 'Pagamento Cartão',
          token: input.card.token,
          installments: input.card.installments || 1,
          payer: {
            email: input.payer?.email || 'customer@email.com',
            identification: input.payer?.document ? { type: 'CPF', number: input.payer.document.replace(/\D/g, '') } : undefined,
          },
          notification_url: input.notificationUrl,
          external_reference: input.externalId,
          metadata: input.metadata,
        }, { headers });

        return {
          gatewayPaymentId: String(data.id),
          status: mapStatus(data.status),
          cardBrand: data.payment_method_id,
          cardLastFour: data.card?.last_four_digits,
          raw: data,
        };
      }

      // ═══ BOLETO ═══
      if (input.method === 'BOLETO') {
        const { data } = await api.post('/v1/payments', {
          transaction_amount: input.amount / 100,
          description: input.description || 'Pagamento Boleto',
          payment_method_id: 'bolbradesco',
          payer: {
            email: input.payer?.email || 'customer@email.com',
            first_name: input.payer?.name?.split(' ')[0],
            identification: input.payer?.document ? { type: 'CPF', number: input.payer.document.replace(/\D/g, '') } : undefined,
            address: { zip_code: '00000000', street_name: 'N/A', street_number: '0', neighborhood: 'N/A', city: 'N/A', federal_unit: 'SP' },
          },
          notification_url: input.notificationUrl,
          external_reference: input.externalId,
        }, { headers });

        return {
          gatewayPaymentId: String(data.id),
          status: mapStatus(data.status),
          boletoUrl: data.transaction_details?.external_resource_url,
          boletoBarcode: data.barcode?.content,
          raw: data,
        };
      }

      throw new GatewayError('MERCADO_PAGO', `Método não suportado: ${input.method}`);
    } catch (error: any) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError('MERCADO_PAGO', error.response?.data?.message || error.message, error.response?.data);
    }
  }

  async getPaymentStatus(id: string, creds: Record<string, string>): Promise<PaymentStatusOutput> {
    try {
      const { data } = await this.client(creds).get(`/v1/payments/${id}`);
      return {
        gatewayPaymentId: String(data.id),
        status: mapStatus(data.status),
        paidAt: data.date_approved ? new Date(data.date_approved) : undefined,
        raw: data,
      };
    } catch (error: any) {
      throw new GatewayError('MERCADO_PAGO', error.message, error.response?.data);
    }
  }

  async parseWebhook(_headers: Record<string, string>, body: unknown): Promise<WebhookPayload | null> {
    const p = body as any;
    if (p?.type === 'payment' || p?.action?.startsWith('payment.')) {
      const id = p?.data?.id;
      if (!id) return null;
      return { gatewayPaymentId: String(id), status: 'PENDING', raw: p };
    }
    return null;
  }

  verifyWebhookSignature(): boolean {
    return true;
  }

  async refund(input: RefundInput, creds: Record<string, string>): Promise<RefundOutput> {
    try {
      const body = input.amount ? { amount: input.amount / 100 } : {};
      const { data } = await this.client(creds).post(`/v1/payments/${input.gatewayPaymentId}/refunds`, body);
      return { refundId: String(data.id), status: data.status, raw: data };
    } catch (error: any) {
      throw new GatewayError('MERCADO_PAGO', error.message, error.response?.data);
    }
  }
}
