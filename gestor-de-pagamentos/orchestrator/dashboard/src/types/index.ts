export type AccountRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER'
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REFUNDED' | 'EXPIRED' | 'ERROR'
export type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO'
export type GatewayType = 'MERCADO_PAGO' | 'ASAAS' | 'STRIPE' | 'PICPAY'

export interface Account {
  id: string; name: string; email: string; role: AccountRole
  isActive: boolean; mustChangePassword: boolean
  createdAt: string; updatedAt: string
  totalUsers?: number; totalPayments?: number; totalApiKeys?: number
}

export interface ApiKeyItem {
  id: string; key: string; label: string; isActive: boolean; createdAt: string
}

export interface Payment {
  id: string; userId: string; externalId?: string; gatewayPaymentId?: string
  amount: number; amountFormatted: string; originalAmount?: number
  originalAmountFormatted?: string; feeAmount: number; currency: string
  status: PaymentStatus; method: PaymentMethod; gateway: GatewayType
  payerName?: string; payerEmail?: string; payerDoc?: string
  pixQrCode?: string; pixCopiaECola?: string; pixExpiration?: string
  cardBrand?: string; cardLastFour?: string; installments?: number
  boletoUrl?: string; description?: string; metadata?: Record<string, unknown>
  paidAt?: string; createdAt: string; updatedAt: string
}

export interface GatewayConfig {
  id: string; gateway: GatewayType; isActive: boolean; isPrimary: boolean
  createdAt: string; updatedAt: string
}

export interface FeeRule {
  id: string; method: PaymentMethod; feeType: 'PERCENTAGE' | 'FIXED'
  feeValue: number; isActive: boolean
}

export interface WebhookLog {
  id: string; paymentId?: string; gateway: GatewayType
  direction: 'INBOUND' | 'OUTBOUND'; statusCode?: number
  success: boolean; error?: string; createdAt: string
}

export interface DashboardStats {
  total: number; approved: number; pending: number; rejected: number
  revenue: number; revenueFormatted: string
  byMethod: { method: PaymentMethod; count: number; total: number }[]
  byGateway: { gateway: GatewayType; count: number; total: number }[]
}

export interface Pagination { page: number; limit: number; total: number; totalPages: number }
