/* ========================================
   ADMIN ROUTES
   Todas requerem JWT + is_admin = true
   ======================================== */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  adminDashboard,
  listUsers,
  getUserDetails,
  toggleUser,
  adminAddCredits,
  adminRenewalLogs,
  createUser
} from '../controllers/adminController.js';
import {
  getAllServices,
  getServiceSessions,
  getAllSessions,
  destroyServiceSessions,
  destroyAllSessions
} from '../controllers/servicesController.js';

const router = Router();

// Todas as rotas admin requerem JWT + permissão admin
router.use(authenticateJWT);
router.use(requireAdmin);

// Dashboard geral
router.get('/dashboard', adminDashboard);

// Usuários
router.get('/users', listUsers);
router.post('/users', createUser);
router.get('/users/:id', getUserDetails);
router.put('/users/:id/toggle', toggleUser);
router.post('/users/:id/credits', adminAddCredits);

// Logs globais
router.get('/renewals', adminRenewalLogs);

// Serviços & Sessões
router.get('/services', getAllServices);
router.get('/services/sessions', getAllSessions);
router.delete('/services/sessions', destroyAllSessions);
router.get('/services/:provider/sessions', getServiceSessions);
router.delete('/services/:provider/sessions', destroyServiceSessions);

export default router;
