/* ========================================
   CREDIT SERVICE
   
   Gerencia saldo de créditos dos usuários.
   Operações atômicas com transação PostgreSQL.
   
   - Débito (após renovação com sucesso)
   - Reembolso (se cobrou mas falhou)
   - Consulta de saldo
   - Histórico de transações
   ======================================== */

import { query, pool } from '../config/database.js';

class CreditService {
  
  // ========================================
  // CONSULTAR SALDO
  // ========================================
  async getBalance(userId) {
    const result = await query(
      'SELECT balance FROM credit_balances WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      // Criar registro com saldo 0
      await query(
        'INSERT INTO credit_balances (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING',
        [userId]
      );
      return 0;
    }
    
    return parseFloat(result.rows[0].balance);
  }
  
  // ========================================
  // ADICIONAR CRÉDITOS (COMPRA)
  // ========================================
  async addCredits(userId, amount, description = 'Compra de créditos', referenceId = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Atualizar saldo
      const balanceResult = await client.query(`
        INSERT INTO credit_balances (user_id, balance) 
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE 
        SET balance = credit_balances.balance + $2, updated_at = NOW()
        RETURNING balance
      `, [userId, amount]);
      
      const newBalance = parseFloat(balanceResult.rows[0].balance);
      
      // Registrar transação
      await client.query(`
        INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, reference_id)
        VALUES ($1, 'purchase', $2, $3, $4, $5)
      `, [userId, amount, newBalance, description, referenceId]);
      
      await client.query('COMMIT');
      
      return { balance: newBalance, added: amount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ========================================
  // DEBITAR CRÉDITOS (USO - RENOVAÇÃO)
  // ========================================
  async debitCredits(userId, amount, description = 'Renovação', referenceId = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verificar saldo e debitar atomicamente
      const balanceResult = await client.query(`
        UPDATE credit_balances 
        SET balance = balance - $2, updated_at = NOW()
        WHERE user_id = $1 AND balance >= $2
        RETURNING balance
      `, [userId, amount]);
      
      if (balanceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Créditos insuficientes');
      }
      
      const newBalance = parseFloat(balanceResult.rows[0].balance);
      
      // Registrar transação
      await client.query(`
        INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, reference_id)
        VALUES ($1, 'usage', $2, $3, $4, $5)
      `, [userId, -amount, newBalance, description, referenceId]);
      
      await client.query('COMMIT');
      
      return { balance: newBalance, debited: amount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ========================================
  // REEMBOLSAR CRÉDITOS (FALHA APÓS DÉBITO)
  // ========================================
  async refundCredits(userId, amount, description = 'Reembolso - falha na renovação', referenceId = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const balanceResult = await client.query(`
        UPDATE credit_balances 
        SET balance = balance + $2, updated_at = NOW()
        WHERE user_id = $1
        RETURNING balance
      `, [userId, amount]);
      
      const newBalance = parseFloat(balanceResult.rows[0].balance);
      
      await client.query(`
        INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, reference_id)
        VALUES ($1, 'refund', $2, $3, $4, $5)
      `, [userId, amount, newBalance, description, referenceId]);
      
      await client.query('COMMIT');
      
      return { balance: newBalance, refunded: amount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ========================================
  // HISTÓRICO DE TRANSAÇÕES
  // ========================================
  async getTransactions(userId, limit = 50, offset = 0) {
    const result = await query(`
      SELECT id, type, amount, balance_after, description, reference_id, created_at
      FROM credit_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    const countResult = await query(
      'SELECT COUNT(*) as total FROM credit_transactions WHERE user_id = $1',
      [userId]
    );
    
    return {
      transactions: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    };
  }
}

export default new CreditService();
