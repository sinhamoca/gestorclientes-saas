/* ========================================
   RENEWAL ROUTES
   Rota principal de renovação via API Key
   
   Fluxo de middlewares:
   1. authenticateApiKey → Valida API Key
   2. rateLimiterByApiKey → Controla taxa de requisições
   3. checkCredits → Verifica saldo suficiente
   4. renewClient → Processa renovação
   ======================================== */

import { Router } from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import { rateLimiterByApiKey } from '../middleware/rateLimiter.js';
import { checkCredits } from '../middleware/creditCheck.js';
import { renewClient } from '../controllers/renewalController.js';

const router = Router();

// POST /api/v1/renew
// Body: { provider, credentials, client_id, client_name, telas, months, ... }
router.post('/renew',
  authenticateApiKey,
  rateLimiterByApiKey,
  checkCredits,
  renewClient
);

export default router;
