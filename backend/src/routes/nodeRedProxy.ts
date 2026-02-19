import { Router } from 'express';
import * as ctrl from '../controllers/nodeRedProxyController';

const router = Router();

// Patient Operations
router.post('/getPatientByFilter', ctrl.getPatientByFilter);
router.post('/getPatient', ctrl.getPatient);
router.post('/createPatient', ctrl.createPatient);
router.post('/getPatientAppts', ctrl.getPatientAppts);
router.post('/getLocation', ctrl.getLocation);
router.post('/editInsurance', ctrl.editInsurance);
router.post('/confirmAppt', ctrl.confirmAppt);

// Scheduling Operations
router.post('/getApptSlots', ctrl.getApptSlots);
router.post('/getGroupedApptSlots', ctrl.getGroupedApptSlots);
router.post('/createAppt', ctrl.createAppt);
router.post('/cancelAppt', ctrl.cancelAppt);

export default router;
