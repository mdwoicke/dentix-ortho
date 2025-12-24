import { Request, Response } from 'express';
import { createCloud9Client } from '../services/cloud9/client';
import { Environment, isValidEnvironment } from '../config/cloud9';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { Cloud9Appointment, Cloud9AvailableSlot } from '../types/cloud9';
import logger from '../utils/logger';

/**
 * Appointment Controller
 * Handles endpoints for appointment management
 */

/**
 * Get environment from request header or query
 */
function getEnvironment(req: Request): Environment {
  const env =
    (req.header('X-Environment') as string) ||
    (req.query.environment as string) ||
    'sandbox';

  if (!isValidEnvironment(env)) {
    throw new AppError('Invalid environment. Must be "sandbox" or "production"', 400);
  }

  return env;
}

/**
 * GET /api/appointments/patient/:patientGuid
 * Get all appointments for a patient
 */
export const getPatientAppointments = asyncHandler(
  async (req: Request, res: Response) => {
    const environment = getEnvironment(req);
    const { patientGuid } = req.params;

    if (!patientGuid) {
      throw new AppError('Patient GUID is required', 400);
    }

    const client = createCloud9Client(environment);

    // Fetch appointments from Cloud 9 API
    const response = await client.getPatientAppointments(patientGuid);

    if (response.status === 'Error' || response.errorMessage) {
      throw new AppError(
        response.errorMessage || 'Failed to fetch patient appointments',
        500
      );
    }

    // Transform appointment data
    const appointments = response.records.map((appt: Cloud9Appointment) => ({
      appointment_guid: appt.AppointmentGUID,
      patient_guid: appt.PatientGUID,
      patient_title: appt.PatientTitle,
      patient_first_name: appt.PatientFirstName,
      patient_middle_name: appt.PatientMiddleName,
      patient_last_name: appt.PatientLastName,
      patient_suffix: appt.PatientSuffix,
      patient_greeting: appt.PatientGreeting,
      patient_gender: appt.PatientGender,
      appointment_date_time: appt.AppointmentDateTime,
      appointment_type_guid: appt.AppointmentTypeGUID,
      appointment_type_description: appt.AppointmentTypeDescription,
      status: appt.AppointmentStatus,
      status_description: appt.AppointmentStatusDescription,
      appointment_note: appt.AppointmentNote,
      appointment_minutes: appt.AppointmentMinutes,
      appointment_confirmation: appt.AppointmentConfirmation,
      orthodontist_guid: appt.OrthodontistGUID,
      orthodontist_code: appt.OrthodontistCode,
      orthodontist_name: appt.OrthodontistName,
      location_guid: appt.LocationGUID,
      location_code: appt.LocationCode,
      location_name: appt.LocationName,
      environment,
    }));

    res.json({
      status: 'success',
      data: appointments,
      count: appointments.length,
      environment,
    });
  }
);

/**
 * POST /api/appointments
 * Create a new appointment
 */
export const createAppointment = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);
  const {
    patientGuid,
    startTime,
    scheduleViewGuid,
    scheduleColumnGuid,
    appointmentTypeGuid,
    durationMinutes,
  } = req.body;

  // Validate required fields
  if (
    !patientGuid ||
    !startTime ||
    !scheduleViewGuid ||
    !scheduleColumnGuid ||
    !appointmentTypeGuid ||
    !durationMinutes
  ) {
    throw new AppError(
      'Missing required fields: patientGuid, startTime, scheduleViewGuid, scheduleColumnGuid, appointmentTypeGuid, durationMinutes',
      400
    );
  }

  const client = createCloud9Client(environment);

  // Prepare appointment creation parameters
  const params = {
    PatientGUID: patientGuid,
    StartTime: startTime,
    ScheduleViewGUID: scheduleViewGuid,
    ScheduleColumnGUID: scheduleColumnGuid,
    AppointmentTypeGUID: appointmentTypeGuid,
    Minutes: durationMinutes,
    VendorUserName: environment === 'sandbox' ? 'IntelePeerTest' : 'Intelepeer',
  };

  // Create appointment via Cloud 9 API
  const response = await client.createAppointment(params);

  // Log the response for debugging
  logger.info('SetAppointment response', {
    status: response.status,
    recordCount: response.records.length,
    firstRecord: response.records[0],
    errorMessage: response.errorMessage,
  });

  if (response.status === 'Error' || response.errorMessage) {
    throw new AppError(response.errorMessage || 'Failed to create appointment', 500);
  }

  // Check if there's a Result field in the response
  if (response.records.length > 0 && response.records[0].Result) {
    const resultMessage = response.records[0].Result as string;

    // If Result starts with "Error:", it's an error even though ResponseStatus might be "Success"
    if (resultMessage.startsWith('Error:')) {
      throw new AppError(resultMessage, 400);
    }

    // Otherwise, if ResponseStatus is "Success", treat it as successful
    // (The result message might be a success message or empty)
    logger.info('Appointment created successfully', { resultMessage });
  }

  // Fetch the created appointment to get its GUID
  const appointmentsResponse = await client.getPatientAppointments(patientGuid);

  if (appointmentsResponse.records.length > 0) {
    // Find the most recent appointment (should be the one we just created)
    const appointments = appointmentsResponse.records.map((appt: Cloud9Appointment) => ({
      appointment_guid: appt.AppointmentGUID,
      patient_guid: appt.PatientGUID,
      patient_title: appt.PatientTitle,
      patient_first_name: appt.PatientFirstName,
      patient_middle_name: appt.PatientMiddleName,
      patient_last_name: appt.PatientLastName,
      patient_suffix: appt.PatientSuffix,
      patient_greeting: appt.PatientGreeting,
      patient_gender: appt.PatientGender,
      appointment_date_time: appt.AppointmentDateTime,
      appointment_type_guid: appt.AppointmentTypeGUID,
      appointment_type_description: appt.AppointmentTypeDescription,
      status: appt.AppointmentStatus,
      status_description: appt.AppointmentStatusDescription,
      appointment_note: appt.AppointmentNote,
      appointment_minutes: appt.AppointmentMinutes,
      appointment_confirmation: appt.AppointmentConfirmation,
      orthodontist_guid: appt.OrthodontistGUID,
      orthodontist_code: appt.OrthodontistCode,
      orthodontist_name: appt.OrthodontistName,
      location_guid: appt.LocationGUID,
      location_code: appt.LocationCode,
      location_name: appt.LocationName,
      environment,
    }));

    // Return the most recent one (likely the newly created appointment)
    const newAppointment = appointments[0];

    res.status(201).json({
      status: 'success',
      message: 'Appointment created successfully',
      data: newAppointment,
      environment,
    });
  } else {
    res.status(201).json({
      status: 'success',
      message: 'Appointment created successfully',
      environment,
    });
  }
});

/**
 * PUT /api/appointments/:appointmentGuid/confirm
 * Confirm an existing appointment
 */
export const confirmAppointment = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);
  const { appointmentGuid } = req.params;

  if (!appointmentGuid) {
    throw new AppError('Appointment GUID is required', 400);
  }

  const client = createCloud9Client(environment);

  // Confirm appointment via Cloud 9 API
  const response = await client.confirmAppointment(appointmentGuid);

  if (response.status === 'Error' || response.errorMessage) {
    throw new AppError(response.errorMessage || 'Failed to confirm appointment', 500);
  }

  res.json({
    status: 'success',
    message: 'Appointment confirmed successfully',
    data: {
      appointmentGuid,
      newStatus: 'Confirmed',
    },
    environment,
  });
});

/**
 * PUT /api/appointments/:appointmentGuid/cancel
 * Cancel an existing appointment
 */
export const cancelAppointment = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);
  const { appointmentGuid } = req.params;

  if (!appointmentGuid) {
    throw new AppError('Appointment GUID is required', 400);
  }

  const client = createCloud9Client(environment);

  // Cancel appointment via Cloud 9 API
  const response = await client.cancelAppointment(appointmentGuid);

  if (response.status === 'Error' || response.errorMessage) {
    throw new AppError(response.errorMessage || 'Failed to cancel appointment', 500);
  }

  res.json({
    status: 'success',
    message: 'Appointment canceled successfully',
    data: {
      appointmentGuid,
      newStatus: 'Canceled',
    },
    environment,
  });
});

/**
 * GET /api/appointments/available
 * Get available appointment slots
 */
export const getAvailableAppointments = asyncHandler(
  async (req: Request, res: Response) => {
    const environment = getEnvironment(req);
    const {
      locationGuid,
      providerGuid,
      appointmentTypeGuid,
      startDate,
      endDate,
      durationMinutes,
    } = req.query;

    // Validate required fields
    if (!locationGuid || !startDate || !endDate) {
      throw new AppError(
        'Missing required fields: locationGuid, startDate, endDate',
        400
      );
    }

    const client = createCloud9Client(environment);

    // If no provider is specified, get all providers for this location
    let scheduleViewGuid = providerGuid as string | undefined;

    if (!scheduleViewGuid && locationGuid) {
      // Get all providers for this location
      const providersResponse = await client.getChairSchedules();

      if (providersResponse.status === 'Success' && providersResponse.records.length > 0) {
        // Filter providers by location and get their schedule view GUIDs
        const locationProviders = providersResponse.records.filter(
          (p: any) => p.locGUID === locationGuid
        );

        logger.info('Provider lookup for location', {
          locationGuid,
          totalProviders: providersResponse.records.length,
          matchingProviders: locationProviders.length,
          firstFewLocGuids: providersResponse.records.slice(0, 5).map((p: any) => p.locGUID),
        });

        if (locationProviders.length > 0) {
          // Use the first provider's schedule view GUID
          // Note: Cloud 9 API might support comma-separated GUIDs for multiple providers
          scheduleViewGuid = locationProviders[0].schdvwGUID;
          logger.info('Using schedule view GUID', { scheduleViewGuid });
        } else {
          logger.warn('No providers found for location', { locationGuid });
        }
      }
    }

    // Prepare parameters for GetAvailableAppts
    const params = {
      locationGuid: locationGuid as string,
      startDate: startDate as string,
      endDate: endDate as string,
      ...(scheduleViewGuid && { providerGuid: scheduleViewGuid }),
      ...(appointmentTypeGuid && { appointmentTypeGuid: appointmentTypeGuid as string }),
      ...(durationMinutes && { durationMinutes: parseInt(durationMinutes as string) }),
    };

    logger.info('GetOnlineReservations params', { params });

    // Fetch available slots from Cloud 9 API
    const response = await client.getAvailableAppts(params);

    if (response.status === 'Error' || response.errorMessage) {
      throw new AppError(
        response.errorMessage || 'Failed to fetch available appointments',
        500
      );
    }

    // Transform slot data to camelCase for frontend
    const slots = response.records.map((slot: Cloud9AvailableSlot) => ({
      dateTime: slot.StartTime,
      endTime: slot.EndTime,
      scheduleViewGuid: slot.ScheduleViewGUID,
      scheduleColumnGuid: slot.ScheduleColumnGUID,
      scheduleViewDescription: slot.ScheduleViewDescription,
      scheduleColumnDescription: slot.ScheduleColumnDescription,
      durationMinutes: slot.Minutes,
      locationGuid: slot.LocationGUID,
      appointmentTypeGuid: slot.AppointmentTypeGUID,
      appointmentTypeDescription: slot.AppointmentTypeDescription,
    }));

    res.json({
      status: 'success',
      data: slots,
      count: slots.length,
      environment,
    });
  }
);

/**
 * GET /api/appointments/date-range
 * Deprecated: This endpoint is no longer supported since caching is disabled.
 * Cloud 9 API does not provide a direct date range query endpoint.
 * Returns empty array for backward compatibility.
 * Use GET /api/appointments/patient/:patientGuid instead for patient-specific appointments.
 */
export const getAppointmentsByDateRange = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    // Log deprecation warning
    logger.warn('Deprecated endpoint called: /api/appointments/date-range', {
      startDate,
      endDate,
      message: 'This endpoint is deprecated. Caching is disabled. Use GET /api/appointments/patient/:patientGuid instead.',
    });

    // Return empty array for backward compatibility
    res.json({
      status: 'success',
      data: [],
      count: 0,
      deprecated: true,
      message: 'This endpoint is deprecated. Caching is disabled. Use GET /api/appointments/patient/:patientGuid instead.',
    });
  }
);
