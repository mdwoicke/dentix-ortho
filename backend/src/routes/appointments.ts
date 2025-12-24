import { Router } from 'express';
import * as appointmentController from '../controllers/appointmentController';

/**
 * Appointment Routes
 * /api/appointments/*
 */

const router = Router();

// GET /api/appointments/patient/:patientGuid
router.get('/patient/:patientGuid', appointmentController.getPatientAppointments);

// GET /api/appointments/date-range?startDate=2025-01-01&endDate=2025-01-31
router.get('/date-range', appointmentController.getAppointmentsByDateRange);

// GET /api/appointments/available?locationGuid=XXX&startDate=01/01/2025&endDate=01/31/2025
router.get('/available', appointmentController.getAvailableAppointments);

// POST /api/appointments
router.post('/', appointmentController.createAppointment);

// PUT /api/appointments/:appointmentGuid/confirm
router.put('/:appointmentGuid/confirm', appointmentController.confirmAppointment);

// PUT /api/appointments/:appointmentGuid/cancel
router.put('/:appointmentGuid/cancel', appointmentController.cancelAppointment);

export default router;
