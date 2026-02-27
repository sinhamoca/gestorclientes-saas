/* ========================================
   CREDITS ROUTES
   Gerenciamento de créditos (via JWT)
   ======================================== */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { getBalance, addCredits, getTransactions } from '../controllers/creditsController.js';

const router = Router();

// Todas requerem JWT
router.use(authenticateJWT);

router.get('/balance', getBalance);
router.post('/add', addCredits);
router.get('/transactions', getTransactions);

export default router;
