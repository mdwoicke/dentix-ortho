import { Router } from 'express';
import * as dominos from '../controllers/dominosProxyController';

const router = Router();

// Dashboard
router.get('/dashboard/stats', dominos.getDashboardStats);
router.get('/dashboard/logs', dominos.getDashboardLogs);
router.get('/dashboard/logs/:id', dominos.getDashboardLogById);
router.get('/dashboard/performance', dominos.getDashboardPerformance);
router.get('/dashboard/errors', dominos.getDashboardErrors);
router.get('/dashboard/errors/by-type', dominos.getDashboardErrorsByType);

// Import
router.post('/dashboard/import', dominos.importOrderLogs);

// Sessions
router.get('/dashboard/sessions/:sessionId', dominos.getSessionDetail);
router.get('/sessions/:sessionId', dominos.getSessionDetail);

// Health
router.get('/health', dominos.getHealth);
router.get('/health/detailed', dominos.getHealthDetailed);
router.get('/health/:component', dominos.getHealthComponent);

// Metrics
router.get('/metrics', dominos.getMetrics);

// Orders
router.post('/orders/submit', dominos.submitOrder);

// Menu
router.get('/menu/:storeId', dominos.getStoreMenu);

// Coupons
router.get('/coupons/:storeId', dominos.getStoreCoupons);

export default router;
