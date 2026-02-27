import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { PaymentStatus, PaymentMethod, GatewayType } from '@/types'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function formatCurrency(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

export function formatDate(d: string, time = true) {
  const dt = new Date(d)
  const day = dt.toLocaleDateString('pt-BR')
  return time ? `${day} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : day
}

export function relativeTime(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export const STATUS_CFG: Record<PaymentStatus, { label: string; color: string; bg: string }> = {
  PENDING:    { label: 'Pendente',     color: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/20' },
  PROCESSING: { label: 'Processando', color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/20' },
  APPROVED:   { label: 'Aprovado',    color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  REJECTED:   { label: 'Rejeitado',   color: 'text-red-400',     bg: 'bg-red-400/10 border-red-400/20' },
  CANCELLED:  { label: 'Cancelado',   color: 'text-surface-500', bg: 'bg-surface-400/10 border-surface-400/20' },
  REFUNDED:   { label: 'Reembolsado', color: 'text-purple-400',  bg: 'bg-purple-400/10 border-purple-400/20' },
  EXPIRED:    { label: 'Expirado',    color: 'text-surface-500', bg: 'bg-surface-400/10 border-surface-400/20' },
  ERROR:      { label: 'Erro',        color: 'text-red-400',     bg: 'bg-red-400/10 border-red-400/20' },
}

export const METHOD_CFG: Record<PaymentMethod, { label: string; icon: string }> = {
  PIX: { label: 'PIX', icon: '⚡' },
  CREDIT_CARD: { label: 'Cartão Crédito', icon: '💳' },
  DEBIT_CARD: { label: 'Cartão Débito', icon: '💳' },
  BOLETO: { label: 'Boleto', icon: '📄' },
}

export const GW_CFG: Record<GatewayType, { label: string; color: string }> = {
  MERCADO_PAGO: { label: 'Mercado Pago', color: '#00b1ea' },
  ASAAS: { label: 'Asaas', color: '#1a73e8' },
  STRIPE: { label: 'Stripe', color: '#635bff' },
  PICPAY: { label: 'PicPay', color: '#21c25e' },
}
