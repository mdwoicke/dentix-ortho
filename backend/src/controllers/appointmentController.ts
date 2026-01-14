import { Request, Response } from 'express';
import { createCloud9Client } from '../services/cloud9/client';
import { Environment, isValidEnvironment } from '../config/cloud9';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { Cloud9Appointment, Cloud9AvailableSlot, Cloud9Location, Cloud9AppointmentType, Cloud9Provider } from '../types/cloud9';
import { AppointmentModel } from '../models/Appointment';
import { PatientModel } from '../models/Patient';
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
 * Get all appointments for a patient and their family members (same phone number)
 */
export const getPatientAppointments = asyncHandler(
  async (req: Request, res: Response) => {
    const environment = getEnvironment(req);
    const { patientGuid } = req.params;
    const includeFamily = req.query.includeFamily !== 'false'; // Default to true

    if (!patientGuid) {
      throw new AppError('Patient GUID is required', 400);
    }

    const client = createCloud9Client(environment);

    // Fetch reference data in parallel (including chair schedules for chair info)
    const [locationsResponse, appointmentTypesResponse, chairSchedulesResponse] = await Promise.all([
      client.getLocations(),
      client.getAppointmentTypes(),
      client.getChairSchedules(),
    ]);

    // Create lookup maps for reference data
    const locationMap = new Map<string, Cloud9Location>();
    if (locationsResponse.status === 'Success' && locationsResponse.records) {
      locationsResponse.records.forEach((loc: Cloud9Location) => {
        locationMap.set(loc.LocationGUID, loc);
      });
    }

    const appointmentTypeMap = new Map<string, Cloud9AppointmentType>();
    if (appointmentTypesResponse.status === 'Success' && appointmentTypesResponse.records) {
      appointmentTypesResponse.records.forEach((type: Cloud9AppointmentType) => {
        appointmentTypeMap.set(type.AppointmentTypeGUID, type);
      });
    }

    // Create maps from chair schedules:
    // 1. location GUID -> schedule view GUIDs (for fetching chair info)
    // 2. schedule column GUID -> description (for direct chair lookup)
    // 3. location + svcOrder -> description (for translating Chair number from GetAppointmentsByDate)
    const locationScheduleViewMap = new Map<string, string[]>();
    const scheduleColumnDescriptionMap = new Map<string, string>();
    const svcOrderToChairMap = new Map<string, string>(); // key: "locationGUID:svcOrder"

    if (chairSchedulesResponse.status === 'Success' && chairSchedulesResponse.records) {
      chairSchedulesResponse.records.forEach((schedule: Cloud9Provider) => {
        // Build location -> schedule views map
        const existing = locationScheduleViewMap.get(schedule.locGUID) || [];
        if (!existing.includes(schedule.schdvwGUID)) {
          existing.push(schedule.schdvwGUID);
        }
        locationScheduleViewMap.set(schedule.locGUID, existing);

        // Build schedule column GUID -> description map (for direct chair lookup)
        if (schedule.schdcolGUID && schedule.schdcolDescription) {
          scheduleColumnDescriptionMap.set(schedule.schdcolGUID, schedule.schdcolDescription);
        }

        // Build location + svcOrder -> description map (for translating Chair number)
        if (schedule.locGUID && schedule.svcOrder && schedule.schdcolDescription) {
          const key = `${schedule.locGUID}:${schedule.svcOrder}`;
          svcOrderToChairMap.set(key, schedule.schdcolDescription);
        }
      });
    }

    // Get the primary patient's info to find their phone number
    const primaryPatientInfo = await client.getPatientInformation(patientGuid);
    let familyPatientGuids: string[] = [patientGuid];

    // If includeFamily is true, find family members by phone number
    if (includeFamily && primaryPatientInfo.status === 'Success' && primaryPatientInfo.records.length > 0) {
      const primaryRecord = primaryPatientInfo.records[0];
      const phoneNumber = primaryRecord.PatientPhone || primaryRecord.persHomePhone || primaryRecord.persCellPhone || primaryRecord.PhoneNumber;

      logger.info('Patient phone number for family lookup', { patientGuid, phoneNumber: phoneNumber || 'not found' });

      // Save primary patient to local database for future family lookups
      try {
        PatientModel.upsert({
          patient_guid: patientGuid,
          first_name: primaryRecord.PatientFirstName || primaryRecord.persFirstName || '',
          last_name: primaryRecord.PatientLastName || primaryRecord.persLastName || '',
          middle_name: primaryRecord.PatientMiddleName || primaryRecord.persMiddleName,
          birthdate: primaryRecord.PatientBirthDate || primaryRecord.persBirthDate,
          gender: primaryRecord.PatientGender || primaryRecord.persGender,
          email: primaryRecord.PatientEmail || primaryRecord.persUseEmail,
          phone: phoneNumber,
          environment,
        });
        logger.info('Saved patient to local database for family lookup', { patientGuid });
      } catch (err) {
        logger.warn('Failed to save patient to local database', { error: err });
      }

      if (phoneNumber) {
        // Look up family members from local database by phone number
        try {
          const localFamilyMembers = PatientModel.getByPhone(phoneNumber, environment);

          if (localFamilyMembers.length > 0) {
            // Get GUIDs from local family members (excluding current patient)
            const familyGuids = localFamilyMembers
              .map(p => p.patient_guid)
              .filter(guid => guid !== patientGuid);

            if (familyGuids.length > 0) {
              familyPatientGuids = [patientGuid, ...familyGuids];

              logger.info('Found family members by phone from local database', {
                primaryGuid: patientGuid,
                phoneNumber,
                familyCount: familyGuids.length,
                familyGuids
              });
            }
          } else {
            logger.info('No family members found in local database (may need to view other family member pages first)', {
              patientGuid,
              phoneNumber
            });
          }
        } catch (err) {
          logger.warn('Failed to search for family members via local database', { error: err });
        }
      }
    }

    // Fetch appointments for all family members in parallel
    const appointmentPromises = familyPatientGuids.map(guid =>
      client.getPatientAppointments(guid).catch(err => {
        logger.warn('Failed to fetch appointments for patient', { guid, error: err });
        return { status: 'Error', records: [] };
      })
    );
    const appointmentResponses = await Promise.all(appointmentPromises);

    // Combine all appointments
    const allAppointmentRecords: Cloud9Appointment[] = [];
    appointmentResponses.forEach(response => {
      if (response.status === 'Success' && response.records) {
        allAppointmentRecords.push(...response.records);
      }
    });

    // Deduplicate appointments by GUID
    const uniqueAppointments = Array.from(
      new Map(allAppointmentRecords.map(appt => [appt.AppointmentGUID, appt])).values()
    );

    // Get local appointment data for scheduled_at timestamps
    const localAppointments = AppointmentModel.getByPatientGuid(patientGuid);
    const localAppointmentMap = new Map(
      localAppointments.map((a) => [a.appointment_guid, a])
    );

    // Get unique patient GUIDs from appointments to fetch their birth dates
    const uniquePatientGuids = Array.from(new Set(uniqueAppointments.map((appt: Cloud9Appointment) => appt.PatientGUID)));

    // Fetch patient info for each unique patient (in parallel, limited to avoid overload)
    const patientBirthDateMap = new Map<string, string>();
    if (uniquePatientGuids.length > 0) {
      const patientInfoPromises = uniquePatientGuids.slice(0, 10).map(async (guid) => {
        try {
          const patientInfo = await client.getPatientInformation(guid);
          if (patientInfo.status === 'Success' && patientInfo.records.length > 0) {
            const record = patientInfo.records[0];
            // Try multiple possible field names for birth date
            const birthDate = record.PatientBirthDate || record.persBirthDate || record.BirthDate;
            if (birthDate) {
              patientBirthDateMap.set(guid, birthDate);
            }
          }
        } catch (err) {
          logger.warn('Failed to fetch patient info for birth date', { patientGuid: guid, error: err });
        }
      });
      await Promise.all(patientInfoPromises);
    }

    // Fetch chair info via GetAppointmentsByDate for appointments without local chair data
    // Build map from appointment GUID to chair
    const appointmentChairMap = new Map<string, string>();

    // Get unique date/location combinations that need chair info
    const dateLocationCombos = new Map<string, Set<string>>(); // date -> Set of locationGUIDs
    for (const appt of uniqueAppointments) {
      const localAppt = localAppointmentMap.get(appt.AppointmentGUID);
      // Only fetch if we don't have chair info locally
      if (!localAppt?.schedule_column_description && appt.LocationGUID && appt.AppointmentDateTime) {
        // Parse date from appointment (format: "M/D/YYYY H:mm:ss AM/PM")
        const datePart = appt.AppointmentDateTime.split(' ')[0];
        const locations = dateLocationCombos.get(datePart) || new Set();
        locations.add(appt.LocationGUID);
        dateLocationCombos.set(datePart, locations);
      }
    }

    // Fetch chair info for each unique date/location combo (limited to avoid rate limiting)
    const fetchPromises: Promise<void>[] = [];
    let fetchCount = 0;
    const MAX_FETCHES = 50; // High limit to ensure chair info is found across multiple schedule views

    for (const [date, locationGuids] of dateLocationCombos) {
      if (fetchCount >= MAX_FETCHES) break;

      for (const locationGuid of locationGuids) {
        if (fetchCount >= MAX_FETCHES) break;

        const scheduleViews = locationScheduleViewMap.get(locationGuid) || [];

        if (scheduleViews.length === 0) {
          logger.warn('No schedule views found for location - cannot fetch chair info', { locationGuid, date });
        }

        // Check all schedule views for this location (chair could be on any)
        for (const scheduleViewGuid of scheduleViews) {
          if (fetchCount >= MAX_FETCHES) break;
          fetchCount++;

          fetchPromises.push(
            client.getAppointmentsByDate(date, scheduleViewGuid)
              .then(response => {
                if (response.status === 'Success' && response.records) {
                  for (const record of response.records) {
                    if (record.AppointmentGUID && record.Chair) {
                      // Translate Chair number (svcOrder) to chair name using location
                      const locationGuid = record.LocationGUID;
                      if (locationGuid) {
                        const svcOrderKey = `${locationGuid}:${record.Chair}`;
                        const chairName = svcOrderToChairMap.get(svcOrderKey);
                        appointmentChairMap.set(record.AppointmentGUID, chairName || record.Chair);
                      } else {
                        appointmentChairMap.set(record.AppointmentGUID, record.Chair);
                      }
                    }
                  }
                }
              })
              .catch(err => {
                logger.warn('Failed to fetch appointments by date for chair info', {
                  date,
                  scheduleViewGuid,
                  error: err instanceof Error ? err.message : String(err)
                });
              })
          );
        }
      }
    }

    if (fetchPromises.length > 0) {
      await Promise.all(fetchPromises);
      logger.info('Chair info fetch complete', {
        fetchCount,
        dateLocationCombos: dateLocationCombos.size,
        chairsFound: appointmentChairMap.size,
      });
    }

    // Transform appointment data with location and appointment type enrichment
    const appointments = uniqueAppointments.map((appt: Cloud9Appointment) => {
      const localAppt = localAppointmentMap.get(appt.AppointmentGUID);
      const location = appt.LocationGUID ? locationMap.get(appt.LocationGUID) : undefined;
      const appointmentType = appt.AppointmentTypeGUID ? appointmentTypeMap.get(appt.AppointmentTypeGUID) : undefined;

      return {
        appointment_guid: appt.AppointmentGUID,
        patient_guid: appt.PatientGUID,
        patient_title: appt.PatientTitle,
        patient_first_name: appt.PatientFirstName,
        patient_middle_name: appt.PatientMiddleName,
        patient_last_name: appt.PatientLastName,
        patient_suffix: appt.PatientSuffix,
        patient_greeting: appt.PatientGreeting,
        patient_gender: appt.PatientGender,
        patient_birth_date: appt.PatientBirthDate || patientBirthDateMap.get(appt.PatientGUID) || null,
        appointment_date_time: appt.AppointmentDateTime,
        appointment_type_guid: appt.AppointmentTypeGUID,
        appointment_type_code: appointmentType?.AppointmentTypeCode || null,
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
        location_city: location?.AddressCity || location?.LocationCity || null,
        location_state: location?.AddressState || location?.LocationState || null,
        location_address: location?.AddressStreet || null,
        location_phone: location?.PhoneNumber || null,
        // Chair lookup priority:
        // 1. Direct from Cloud9 API (if returned)
        // 2. Local DB schedule_column_description (from previous create)
        // 3. Look up via schedule_column_guid in the chair schedule map
        // 4. From GetAppointmentsByDate fetch (appointmentChairMap)
        chair: appt.Chair ||
          localAppt?.schedule_column_description ||
          (localAppt?.schedule_column_guid ? scheduleColumnDescriptionMap.get(localAppt.schedule_column_guid) : null) ||
          appointmentChairMap.get(appt.AppointmentGUID) ||
          null,
        // Schedule view and column info (only available for appointments created through our system)
        schedule_view_guid: localAppt?.schedule_view_guid || null,
        schedule_view_description: localAppt?.schedule_view_description || null,
        schedule_column_guid: localAppt?.schedule_column_guid || null,
        schedule_column_description: localAppt?.schedule_column_description || null,
        environment,
        scheduled_at: localAppt?.cached_at || null,
      };
    });

    // Sort by appointment date (newest first)
    appointments.sort((a, b) => {
      const dateA = new Date(a.appointment_date_time).getTime();
      const dateB = new Date(b.appointment_date_time).getTime();
      return dateB - dateA;
    });

    res.json({
      status: 'success',
      data: appointments,
      count: appointments.length,
      familyMembersIncluded: familyPatientGuids.length > 1,
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
    // Error code 8 = rate limiting
    const statusCode = response.errorCode === 8 ? 429 : 500;
    throw new AppError(response.errorMessage || 'Failed to create appointment', statusCode);
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

  // Fetch chair schedules to look up the chair description
  const chairSchedulesResponse = await client.getChairSchedules();
  let scheduleColumnDescription: string | undefined;

  if (chairSchedulesResponse.status === 'Success' && chairSchedulesResponse.records) {
    const chairRecord = chairSchedulesResponse.records.find(
      (chair: Cloud9Provider) => chair.schdcolGUID === scheduleColumnGuid
    );
    if (chairRecord) {
      scheduleColumnDescription = chairRecord.schdcolDescription;
      logger.info('Found chair description', { scheduleColumnGuid, scheduleColumnDescription });
    }
  }

  // Fetch the created appointment to get its GUID
  const appointmentsResponse = await client.getPatientAppointments(patientGuid);
  const scheduledAt = new Date().toISOString();

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

    // Save to local database to track scheduled_at timestamp and chair info
    try {
      AppointmentModel.upsert({
        appointment_guid: newAppointment.appointment_guid,
        patient_guid: newAppointment.patient_guid,
        appointment_date_time: newAppointment.appointment_date_time,
        appointment_type_guid: newAppointment.appointment_type_guid,
        appointment_type_description: newAppointment.appointment_type_description,
        location_guid: newAppointment.location_guid,
        location_name: newAppointment.location_name,
        orthodontist_name: newAppointment.orthodontist_name,
        schedule_view_guid: scheduleViewGuid,
        schedule_column_guid: scheduleColumnGuid,
        schedule_column_description: scheduleColumnDescription, // Chair name
        minutes: newAppointment.appointment_minutes,
        status: newAppointment.status_description || 'Scheduled',
        environment,
      });
      logger.info('Appointment saved to local database', {
        appointmentGuid: newAppointment.appointment_guid,
        chair: scheduleColumnDescription,
      });
    } catch (dbError) {
      logger.warn('Failed to save appointment to local database', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }

    res.status(201).json({
      status: 'success',
      message: 'Appointment created successfully',
      data: {
        ...newAppointment,
        scheduled_at: scheduledAt,
      },
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
    // Error code 8 = rate limiting
    const statusCode = response.errorCode === 8 ? 429 : 500;
    throw new AppError(response.errorMessage || 'Failed to confirm appointment', statusCode);
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
    // Error code 8 = rate limiting
    const statusCode = response.errorCode === 8 ? 429 : 500;
    throw new AppError(response.errorMessage || 'Failed to cancel appointment', statusCode);
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
