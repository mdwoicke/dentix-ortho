import { Router } from 'express';
import * as patientController from '../controllers/patientController';

/**
 * Patient Routes
 * /api/patients/*
 */

const router = Router();

// GET /api/patients/search?query=Smith&pageIndex=1&pageSize=25
router.get('/search', patientController.searchPatients);

// GET /api/patients/:patientGuid
router.get('/:patientGuid', patientController.getPatient);

// POST /api/patients
router.post('/', patientController.createPatient);

// PUT /api/patients/:patientGuid
router.put('/:patientGuid', patientController.updatePatient);

export default router;
