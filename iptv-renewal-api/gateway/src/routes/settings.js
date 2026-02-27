/* ========================================
   SETTINGS ROUTES
   Admin: CRUD de configurações
   Internal: Microserviços consultam configs
   ======================================== */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  getSettings,
  updateSetting,
  updateSettingsBulk,
  testProxy,
  testCaptcha,
  getSettingsByCategory
} from '../controllers/settingsController.js';

const router = Router();

// ── Admin (JWT + is_admin) ──
router.get('/', authenticateJWT, requireAdmin, getSettings);
router.put('/', authenticateJWT, requireAdmin, updateSetting);
router.put('/bulk', authenticateJWT, requireAdmin, updateSettingsBulk);
router.post('/test-proxy', authenticateJWT, requireAdmin, testProxy);
router.post('/test-captcha', authenticateJWT, requireAdmin, testCaptcha);

// ── Interno (usado pelos microserviços via header X-Gateway-Request) ──
router.get('/internal/:category', getSettingsByCategory);

export default router;
