/* ========================================
   AUTH ROUTES
   Registro, login e gerenciamento de API Keys
   ======================================== */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import {
  register,
  login,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  getProfile
} from '../controllers/authController.js';

const router = Router();

// ── Públicas ──
router.post('/login', login);

// ── Autenticadas (JWT) ──
router.get('/profile', authenticateJWT, getProfile);
router.get('/api-keys', authenticateJWT, listApiKeys);
router.post('/api-keys', authenticateJWT, createApiKey);
router.delete('/api-keys/:id', authenticateJWT, revokeApiKey);

export default router;
