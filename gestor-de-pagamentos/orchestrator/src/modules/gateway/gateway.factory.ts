import { GatewayType } from '@prisma/client';
import { IGatewayAdapter } from '../../common/interfaces/gateway.interface';
import { MercadoPagoAdapter } from './adapters/mercadopago.adapter';
import { AsaasAdapter } from './adapters/asaas.adapter';
import { AppError } from '../../common/errors';

const adapters: Map<GatewayType, IGatewayAdapter> = new Map();
adapters.set(GatewayType.MERCADO_PAGO, new MercadoPagoAdapter());
adapters.set(GatewayType.ASAAS, new AsaasAdapter());

export function getGatewayAdapter(gateway: GatewayType): IGatewayAdapter {
  const adapter = adapters.get(gateway);
  if (!adapter) throw new AppError(`Gateway "${gateway}" não suportado`, 400);
  return adapter;
}

export function listAvailableGateways(): GatewayType[] {
  return Array.from(adapters.keys());
}
