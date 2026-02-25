import { Router } from 'express';
import * as fabricWorkflow from '../controllers/fabricWorkflowController';

const router = Router();

router.get('/records', fabricWorkflow.getRecords);
router.post('/test-connection', fabricWorkflow.testConnection);

export default router;
