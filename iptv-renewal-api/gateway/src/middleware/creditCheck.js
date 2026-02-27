/* ========================================
   CREDIT CHECK MIDDLEWARE
   
   Verifica se o usuário tem créditos suficientes
   ANTES de rotear para o microserviço.
   
   Calcula o custo estimado baseado no provedor
   e número de telas.
   ======================================== */

import { query } from '../config/database.js';
import { errorResponse } from '../utils/helpers.js';

// Cache de preços (recarrega a cada 5 min)
let pricingCache = null;
let pricingCacheTime = 0;
const CACHE_TTL = 300000; // 5 min

async function getPricing() {
  const now = Date.now();
  
  if (pricingCache && (now - pricingCacheTime) < CACHE_TTL) {
    return pricingCache;
  }
  
  const result = await query('SELECT * FROM provider_pricing WHERE is_active = true');
  pricingCache = {};
  
  for (const row of result.rows) {
    pricingCache[row.provider] = {
      costPerOperation: parseFloat(row.cost_per_operation),
      costPerTela: parseFloat(row.cost_per_tela),
      billingMode: row.billing_mode,
      displayName: row.display_name
    };
  }
  
  pricingCacheTime = now;
  return pricingCache;
}

// ========================================
// CALCULAR CUSTO DA RENOVAÇÃO
// ========================================
export function calculateCost(pricing, provider, telas = 1) {
  const providerPricing = pricing[provider];
  
  if (!providerPricing) {
    return { cost: 0, billingMode: 'unknown' };
  }
  
  if (providerPricing.billingMode === 'per_tela') {
    return {
      cost: providerPricing.costPerTela * telas,
      billingMode: 'per_tela',
      costPerUnit: providerPricing.costPerTela,
      units: telas
    };
  }
  
  return {
    cost: providerPricing.costPerOperation,
    billingMode: 'per_operation',
    costPerUnit: providerPricing.costPerOperation,
    units: 1
  };
}

// ========================================
// MIDDLEWARE: VERIFICAR CRÉDITOS
// ========================================
export async function checkCredits(req, res, next) {
  try {
    const provider = req.body.provider?.toLowerCase();
    const telas = parseInt(req.body.telas) || 1;
    
    if (!provider) {
      return errorResponse(res, 'Provedor não especificado', 400);
    }
    
    // Buscar preços
    const pricing = await getPricing();
    
    if (!pricing[provider]) {
      return errorResponse(res, `Provedor "${provider}" não encontrado ou desativado`, 400);
    }
    
    // Calcular custo estimado
    const costInfo = calculateCost(pricing, provider, telas);
    
    // Verificar saldo
    if (req.apiUser.balance < costInfo.cost) {
      return errorResponse(res, 'Créditos insuficientes', 402, {
        balance: req.apiUser.balance,
        required: costInfo.cost,
        provider: provider,
        billing_mode: costInfo.billingMode,
        message: `Saldo: R$ ${req.apiUser.balance.toFixed(2)} | Custo: R$ ${costInfo.cost.toFixed(2)}`
      });
    }
    
    // Injetar informações de custo no request
    req.costInfo = costInfo;
    req.pricing = pricing;
    
    next();
  } catch (error) {
    console.error('❌ Erro ao verificar créditos:', error);
    return errorResponse(res, 'Erro interno ao verificar créditos', 500);
  }
}

// ========================================
// EXPORTAR getPricing para uso em outros módulos
// ========================================
export { getPricing };
