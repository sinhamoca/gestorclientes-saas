/* ========================================
   CREDITS CONTROLLER
   
   Gerencia créditos dos clientes da API:
   - Consultar saldo
   - Adicionar créditos (futuro: integrar MP)
   - Histórico de transações
   ======================================== */

import creditService from '../services/creditService.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

// ========================================
// CONSULTAR SALDO
// GET /api/v1/credits/balance
// ========================================
export async function getBalance(req, res) {
  try {
    const balance = await creditService.getBalance(req.user.id);
    
    return successResponse(res, {
      balance,
      currency: 'BRL'
    });
  } catch (error) {
    console.error('❌ Erro ao consultar saldo:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// ADICIONAR CRÉDITOS (MANUAL/ADMIN por agora)
// POST /api/v1/credits/add
// ========================================
export async function addCredits(req, res) {
  try {
    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
      return errorResponse(res, 'Valor deve ser maior que zero');
    }
    
    const minPurchase = parseFloat(process.env.MIN_CREDIT_PURCHASE) || 10;
    if (amount < minPurchase) {
      return errorResponse(res, `Valor mínimo de compra: R$ ${minPurchase.toFixed(2)}`);
    }
    
    const result = await creditService.addCredits(
      req.user.id,
      amount,
      description || `Adição manual de R$ ${amount.toFixed(2)}`,
      `manual_${Date.now()}`
    );
    
    return successResponse(res, {
      message: `R$ ${amount.toFixed(2)} adicionados com sucesso!`,
      balance: result.balance,
      added: result.added
    });
    
  } catch (error) {
    console.error('❌ Erro ao adicionar créditos:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}

// ========================================
// HISTÓRICO DE TRANSAÇÕES
// GET /api/v1/credits/transactions
// ========================================
export async function getTransactions(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await creditService.getTransactions(req.user.id, limit, offset);
    
    return successResponse(res, result);
  } catch (error) {
    console.error('❌ Erro ao buscar transações:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}
