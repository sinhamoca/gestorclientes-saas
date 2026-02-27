/* ========================================
   ADMIN MIDDLEWARE
   
   Verifica se o usuário autenticado via JWT
   tem permissão de administrador.
   
   Requer: authenticateJWT rodando antes
   ======================================== */

import { query } from '../config/database.js';
import { errorResponse } from '../utils/helpers.js';

export async function requireAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return errorResponse(res, 'Autenticação necessária', 401);
    }
    
    const result = await query(
      'SELECT is_admin FROM users WHERE id = $1 AND is_active = true',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return errorResponse(res, 'Usuário não encontrado', 404);
    }
    
    if (!result.rows[0].is_admin) {
      return errorResponse(res, 'Acesso restrito a administradores', 403);
    }
    
    req.user.isAdmin = true;
    next();
  } catch (error) {
    console.error('❌ Erro no middleware admin:', error);
    return errorResponse(res, 'Erro interno', 500);
  }
}
