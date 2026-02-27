/* ========================================
   RENEWAL CONTROLLER
   
   Coração da API. Recebe requisições de renovação,
   valida, debita créditos, roteia para o microserviço
   correto e registra o resultado.
   
   Fluxo:
   1. Validar payload
   2. Verificar créditos (middleware já fez)
   3. Debitar créditos
   4. Rotear para microserviço
   5. Se falhou → reembolsar créditos
   6. Registrar log
   7. Retornar resultado
   ======================================== */

import { query } from '../config/database.js';
import creditService from '../services/creditService.js';
import { routeRenewal } from '../services/providerRouter.js';
import { successResponse, errorResponse, isValidProvider, log } from '../utils/helpers.js';

// ========================================
// RENOVAR CLIENTE
// POST /api/v1/renew
// ========================================
export async function renewClient(req, res) {
  const startTime = Date.now();
  const requestIp = req.ip || req.connection?.remoteAddress;
  
  try {
    const {
      provider,
      credentials,
      client_id,
      client_name,
      telas = 1,
      months = 1,
      // Campos específicos por provedor
      sigma_domain,
      sigma_plan_code,
      koffice_domain,
      painelfoda_domain,
      painelfoda_package_id,
      rush_type,
      suffix,
      // Rastreamento do usuário do gestor
      user_email
    } = req.body;
    
    // ── VALIDAÇÕES ──
    
    if (!provider || !isValidProvider(provider)) {
      return errorResponse(res, `Provedor inválido. Use: sigma, cloudnation, koffice, uniplay, club, painelfoda, rush`);
    }
    
    if (!credentials || !credentials.username || !credentials.password) {
      return errorResponse(res, 'Credenciais obrigatórias: { username, password }');
    }
    
    if (!client_id && !client_name) {
      return errorResponse(res, 'Informe client_id ou client_name');
    }

    const providerLower = provider.toLowerCase();
    const numTelas = parseInt(telas) || 1;
    const numMonths = parseInt(months) || 1;
    
    log(`Renovação: ${providerLower} | User: ${req.apiUser.name} | Cliente: ${client_name || client_id} | Telas: ${numTelas}`);
    
    // ── CUSTO (já calculado pelo middleware creditCheck) ──
    const cost = req.costInfo.cost;
    
    // ── DEBITAR CRÉDITOS ──
    let debitResult;
    try {
      debitResult = await creditService.debitCredits(
        req.apiUser.id,
        cost,
        `Renovação ${providerLower} - ${client_name || client_id} (${numTelas} tela(s))`,
        `renewal_${Date.now()}`
      );
    } catch (error) {
      return errorResponse(res, 'Falha ao debitar créditos', 402, {
        balance: req.apiUser.balance,
        required: cost
      });
    }
    
    // ── MONTAR PAYLOAD PARA MICROSERVIÇO ──
    const renewalPayload = {
      credentials: {
        username: credentials.username,
        password: credentials.password
      },
      client_id,
      client_name,
      telas: numTelas,
      months: numMonths,
      suffix: suffix || null,
      // Campos específicos
      sigma_domain,
      sigma_plan_code,
      koffice_domain,
      painelfoda_domain,
      painelfoda_package_id,
      rush_type
    };
    
    // ── ROTEAR PARA MICROSERVIÇO ──
    let renewalResult;
    
    try {
      renewalResult = await routeRenewal(providerLower, renewalPayload);
    } catch (routeError) {
      // Serviço offline ou erro de conexão → REEMBOLSAR
      log(`Serviço ${providerLower} indisponível: ${routeError.message}`, 'ERROR');
      
      await creditService.refundCredits(
        req.apiUser.id,
        cost,
        `Reembolso - serviço ${providerLower} indisponível`,
        `refund_${Date.now()}`
      );
      
      // Registrar log de falha
      await logRenewal({
        userId: req.apiUser.id,
        apiKeyId: req.apiUser.apiKeyId,
        provider: providerLower,
        status: 'failed',
        telas: numTelas,
        cost: 0, // Reembolsado
        billingMode: req.costInfo.billingMode,
        requestIp,
        responseTime: Date.now() - startTime,
        errorMessage: routeError.message,
        metadata: { refunded: true, reason: 'service_unavailable', user_email: user_email || null }
      });
      
      return errorResponse(res, `Serviço ${providerLower} indisponível. Créditos reembolsados.`, 503, {
        refunded: cost,
        balance: debitResult.balance + cost
      });
    }
    
    // ── PROCESSAR RESULTADO ──
    const responseTime = Date.now() - startTime;
    
    if (renewalResult.success) {
      // ✅ SUCESSO
      await logRenewal({
        userId: req.apiUser.id,
        apiKeyId: req.apiUser.apiKeyId,
        provider: providerLower,
        status: 'success',
        telas: numTelas,
        cost,
        billingMode: req.costInfo.billingMode,
        requestIp,
        responseTime,
        metadata: { ...renewalResult.data, user_email: user_email || null }
      });
      
      return successResponse(res, {
        provider: providerLower,
        status: 'success',
        client: client_name || client_id,
        telas: numTelas,
        months: numMonths,
        cost,
        balance: debitResult.balance,
        user_email: user_email || null,
        response_time_ms: responseTime,
        details: renewalResult.data
      });
      
    } else {
      // ❌ FALHA NA RENOVAÇÃO → REEMBOLSAR
      log(`Renovação falhou no ${providerLower}: ${renewalResult.data?.error || 'erro desconhecido'}`, 'ERROR');
      
      await creditService.refundCredits(
        req.apiUser.id,
        cost,
        `Reembolso - falha na renovação ${providerLower}`,
        `refund_${Date.now()}`
      );
      
      await logRenewal({
        userId: req.apiUser.id,
        apiKeyId: req.apiUser.apiKeyId,
        provider: providerLower,
        status: 'failed',
        telas: numTelas,
        cost: 0,
        billingMode: req.costInfo.billingMode,
        requestIp,
        responseTime,
        errorMessage: renewalResult.data?.error || 'Falha na renovação',
        metadata: { refunded: true, ...renewalResult.data, user_email: user_email || null }
      });
      
      return errorResponse(res, 'Renovação falhou. Créditos reembolsados.', 422, {
        provider: providerLower,
        refunded: cost,
        balance: debitResult.balance + cost,
        error_details: renewalResult.data?.error,
        response_time_ms: responseTime
      });
    }
    
  } catch (error) {
    console.error('❌ Erro crítico na renovação:', error);
    
    return errorResponse(res, 'Erro interno na renovação', 500, {
      response_time_ms: Date.now() - startTime
    });
  }
}

// ========================================
// REGISTRAR LOG DE RENOVAÇÃO
// ========================================
async function logRenewal({ userId, apiKeyId, provider, status, telas, cost, billingMode, requestIp, responseTime, errorMessage, metadata }) {
  try {
    await query(`
      INSERT INTO renewal_logs 
        (user_id, api_key_id, provider, status, telas, cost, billing_mode, request_ip, response_time_ms, error_message, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      userId, apiKeyId, provider, status, telas, cost,
      billingMode, requestIp, responseTime, errorMessage || null,
      metadata ? JSON.stringify(metadata) : null
    ]);
  } catch (error) {
    console.error('⚠️  Erro ao registrar log de renovação:', error);
    // Não lançar erro - log falhar não pode impedir a resposta
  }
}
