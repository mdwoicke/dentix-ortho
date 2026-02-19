import { Router } from 'express';
import * as apiAgent from '../controllers/apiAgentController';

const router = Router();

router.post('/chat', apiAgent.chat);
router.get('/health', apiAgent.health);

export default router;
