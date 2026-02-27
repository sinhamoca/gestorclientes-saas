/* ========================================
   USAGE ROUTES
   Estatísticas e informações dos provedores
   ======================================== */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { authenticateApiKey } from '../middleware/auth.js';
import {
  getUsageSummary,
  getRenewalHistory,
  getProviderPricing,
  getProvidersStatus
} from '../controllers/usageController.js';

const router = Router();

// ── Públicas (para clientes consultarem antes de integrar) ──
router.get('/providers/pricing', getProviderPricing);
router.get('/providers/status', getProvidersStatus);

// ── Autenticadas via JWT (dashboard) ──
router.get('/summary', authenticateJWT, getUsageSummary);
router.get('/history', authenticateJWT, getRenewalHistory);

// ── Autenticadas via API Key (para consultar de dentro do gestor) ──
router.get('/api/summary', authenticateApiKey, getUsageSummary);
router.get('/api/history', authenticateApiKey, getRenewalHistory);

export default router;
