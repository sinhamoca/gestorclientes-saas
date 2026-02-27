import { z } from 'zod';

// ── Auth ─────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6),
});

// ── Super Admin: Manage Admins ───────────────────
export const createAdminSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export const updateAdminSchema = z.object({
  name: z.string().min(2).optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6),
});

// ── Admin: Manage Users ──────────────────────────
export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  isActive: z.boolean().optional(),
});

// ── User: Gateways ───────────────────────────────
export const configureGatewaySchema = z.object({
  gateway: z.enum(['MERCADO_PAGO', 'ASAAS', 'STRIPE', 'PICPAY']),
  credentials: z.record(z.string()),
  isPrimary: z.boolean().optional(),
});

// ── User: Fees ───────────────────────────────────
export const configureFeeSchema = z.object({
  method: z.enum(['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO']),
  feeType: z.enum(['PERCENTAGE', 'FIXED']),
  feeValue: z.number().min(0),
});

// ── User: API Key ────────────────────────────────
export const createApiKeySchema = z.object({
  label: z.string().min(1).max(50).optional(),
});

// ── User: Webhook Callback ──────────────────────
export const webhookCallbackSchema = z.object({
  webhookCallbackUrl: z.string().url('URL inválida').nullable(),
  webhookCallbackSecret: z.string().min(8).nullable().optional(),
});

// ── Payments (via API Key) ───────────────────────
export const createPaymentSchema = z.object({
  gateway: z.enum(['MERCADO_PAGO', 'ASAAS', 'STRIPE', 'PICPAY']).optional(),
  method: z.enum(['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO']),
  amount: z.number().int().positive(),
  description: z.string().optional(),
  externalId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  payer: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    document: z.string().optional(),
    phone: z.string().optional(),
  }).optional(),
  pix: z.object({
    expirationMinutes: z.number().int().positive().optional(),
  }).optional(),
  card: z.object({
    token: z.string(),
    installments: z.number().int().min(1).max(12).optional(),
    holderName: z.string().optional(),
    holderDocument: z.string().optional(),
  }).optional(),
  boleto: z.object({
    expirationDays: z.number().int().positive().optional(),
  }).optional(),
  // ── Checkout redirect (Checkout Pro / Payment Link) ──
  checkout: z.object({
    backUrl: z.string().url().optional(),
    excludedPaymentTypes: z.array(z.string()).optional(),
    excludedPaymentMethods: z.array(z.string()).optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const listPaymentsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED', 'EXPIRED', 'ERROR']).optional(),
  method: z.enum(['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO']).optional(),
  gateway: z.enum(['MERCADO_PAGO', 'ASAAS', 'STRIPE', 'PICPAY']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  externalId: z.string().optional(),
  search: z.string().optional(),
});

export const refundSchema = z.object({
  amount: z.number().int().positive().optional(),
});
