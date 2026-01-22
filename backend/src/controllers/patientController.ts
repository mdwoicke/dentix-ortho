import { Request, Response } from 'express';
import { createCloud9Client } from '../services/cloud9/client';
import { Environment, isValidEnvironment } from '../config/cloud9';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { extractPatientGuidFromResponse } from '../services/cloud9/xmlParser';
import logger from '../utils/logger';

/**
 * Patient Controller
 * Handles endpoints for patient management
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
 * GET /api/patients/search
 * Search for patients by name
 */
export const searchPatients = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);
  const query = req.query.query as string;
  const pageIndex = parseInt(req.query.pageIndex as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 25;

  if (!query || query.trim().length === 0) {
    throw new AppError('Search query is required', 400);
  }

  const client = createCloud9Client(environment);

  // Search via Cloud 9 API
  const response = await client.searchPatients(query, pageIndex, pageSize);

  if (response.status === 'Error' || response.errorMessage) {
    // Error code 8 = rate limiting
    const statusCode = response.errorCode === 8 ? 429 : 500;
    throw new AppError(response.errorMessage || 'Failed to search patients', statusCode);
  }

  // Transform patient data
  // Note: GetPortalPatientLookup returns limited fields (no email, phone, address)
  const patients = response.records.map((patient: any) => ({
    patient_guid: patient.PatientGUID,
    patient_id: patient.PatientID,
    first_name: patient.PatientFirstName || patient.PatientFirstName,
    last_name: patient.PatientLastName || patient.PatientLastName,
    birthdate: patient.PatientBirthDate || patient.PatientBirthdate,
    email: patient.PatientEmail || undefined, // Not available in search
    phone: patient.PatientPhone || undefined, // Not available in search
    address_street: patient.PatientStreetAddress || patient.AddressStreet,
    address_city: patient.PatientCity || patient.AddressCity,
    address_state: patient.PatientState || patient.AddressState,
    address_postal_code: patient.PatientPostalCode || patient.AddressPostalCode,
    provider_guid: patient.PatientOrthodontistGUID || patient.ProviderGUID,
    location_guid: patient.PatientLocationGUID || patient.LocationGUID,
    environment,
  }));

  res.json({
    status: 'success',
    data: patients,
    pagination: {
      page: pageIndex,
      pageSize,
      totalCount: patients.length,
    },
    environment,
  });
});

/**
 * GET /api/patients/:patientGuid
 * Get detailed patient information
 */
export const getPatient = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);
  const { patientGuid } = req.params;

  if (!patientGuid) {
    throw new AppError('Patient GUID is required', 400);
  }

  const client = createCloud9Client(environment);

  // Fetch from Cloud 9 API
  const response = await client.getPatientInformation(patientGuid);

  if (response.status === 'Error' || response.errorMessage) {
    // Error code 8 = rate limiting
    const statusCode = response.errorCode === 8 ? 429 : 500;
    throw new AppError(
      response.errorMessage || 'Failed to fetch patient information',
      statusCode
    );
  }

  if (response.records.length === 0) {
    throw new AppError('Patient not found', 404);
  }

  const patientData = response.records[0] as any;

  // Transform and cache patient data
  // Note: getPatientInformation returns different fields than searchPatients
  // PatientFullName needs to be split into first and last name
  const fullName = patientData.PatientFullName || '';
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts.length > 1 ? nameParts[0] : fullName;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : fullName;

  const patient = {
    patient_guid: patientGuid,
    patient_id: patientData.PatID,
    first_name: firstName,
    last_name: lastName,
    birthdate: patientData.PatientBirthDate,
    gender: patientData.PatientGender,
    email: patientData.PatientEmail,
    phone: patientData.PatientPhone,
    address_street: patientData.PatientStreet,
    address_city: patientData.PatientCity,
    address_state: patientData.PatientState,
    address_postal_code: patientData.PatientPostalCode,
    provider_guid: undefined,
    location_guid: undefined,
    environment,
    comment: patientData.PatientComment || patientData.PatComment || patientData.Comment || undefined,
  };

  res.json({
    status: 'success',
    data: patient,
    environment,
  });
});

/**
 * POST /api/patients
 * Create a new patient
 */
export const createPatient = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);
  const {
    firstName,
    lastName,
    providerGuid,
    locationGuid,
    birthdate,
    phoneNumber,
    email,
    note,
    address,
  } = req.body;

  // Log received request body for debugging
  logger.info('Create patient request received', {
    body: req.body,
    hasFirstName: !!firstName,
    hasLastName: !!lastName,
    hasProviderGuid: !!providerGuid,
    hasLocationGuid: !!locationGuid,
    hasBirthdate: !!birthdate,
    hasPhoneNumber: !!phoneNumber,
    hasEmail: !!email,
  });

  // Validate required fields
  if (!firstName || !lastName || !birthdate || !phoneNumber || !email || !providerGuid || !locationGuid) {
    throw new AppError(
      'Missing required fields: firstName, lastName, birthdate, phoneNumber, email, providerGuid, locationGuid',
      400
    );
  }

  const client = createCloud9Client(environment);

  // Format birthdate to Cloud 9's expected format: YYYY-MM-DDTHH:MM:SS
  const formattedBirthdate = birthdate?.includes('T')
    ? birthdate
    : `${birthdate}T00:00:00`;

  // Prepare patient creation parameters
  const params: any = {
    patientFirstName: firstName,
    patientLastName: lastName,
    providerGUID: providerGuid,
    locationGUID: locationGuid,
    birthdayDateTime: formattedBirthdate,
    phoneNumber,
    email,
    VendorUserName: environment === 'sandbox' ? 'IntelepeerTest' : 'Intelepeer',
    note: note || '',
    addressStreet: address?.street || '',
    addressCity: address?.city || '',
    addressState: address?.state || '',
    addressPostalCode: address?.postalCode || '',
  };

  // Create patient via Cloud 9 API
  const response = await client.createPatient(params);

  if (response.status === 'Error' || response.errorMessage) {
    // Error code 8 = rate limiting
    const statusCode = response.errorCode === 8 ? 429 : 500;
    throw new AppError(response.errorMessage || 'Failed to create patient', statusCode);
  }

  // Extract patient GUID from response
  const patientGuid = extractPatientGuidFromResponse(response);

  if (!patientGuid) {
    throw new AppError('Failed to extract patient GUID from response', 500);
  }

  // Return the new patient data with creation timestamp
  const patient = {
    patient_guid: patientGuid,
    first_name: firstName,
    last_name: lastName,
    birthdate,
    email,
    phone: phoneNumber,
    address_street: address?.street,
    address_city: address?.city,
    address_state: address?.state,
    address_postal_code: address?.postalCode,
    provider_guid: providerGuid,
    location_guid: locationGuid,
    environment,
    created_at: new Date().toISOString(),
  };

  res.status(201).json({
    status: 'success',
    data: {
      patientGuid,
      ...patient,
    },
    environment,
  });
});

/**
 * PUT /api/patients/:patientGuid
 * Update patient demographic information
 */
export const updatePatient = asyncHandler(async (req: Request, res: Response) => {
  const environment = getEnvironment(req);
  const { patientGuid } = req.params;
  const { firstName, lastName, birthdate, email, phoneNumber, address } = req.body;

  if (!patientGuid) {
    throw new AppError('Patient GUID is required', 400);
  }

  const client = createCloud9Client(environment);

  // Prepare update parameters (only include fields that are provided)
  const params: any = {
    patguid: patientGuid,
  };

  if (firstName) params.persFirstName = firstName;
  if (lastName) params.persLastName = lastName;
  if (birthdate) params.persBirthdate = birthdate;
  if (email) params.persUseEmail = email;
  if (phoneNumber) params.persUsePhone = phoneNumber;
  if (address?.street) params.persStreetAddress = address.street;
  if (address?.city) params.persCity = address.city;
  if (address?.state) params.persState = address.state;
  if (address?.postalCode) params.persPostalCode = address.postalCode;

  // Update patient via Cloud 9 API
  const response = await client.updatePatient(params);

  if (response.status === 'Error' || response.errorMessage) {
    const errorMessage = response.errorMessage || 'Failed to update patient';

    // Check for authorization errors (error code 10)
    if (errorMessage.includes('not authorized') || response.errorCode === 10) {
      throw new AppError(
        'Patient update is not available. The SetPatientDemographicInfo procedure is not authorized for this API account. Please contact Cloud 9 support to enable this feature.',
        403
      );
    }

    // Error code 8 = rate limiting
    const statusCode = response.errorCode === 8 ? 429 : 500;
    throw new AppError(errorMessage, statusCode);
  }

  // Fetch updated patient information
  const updatedResponse = await client.getPatientInformation(patientGuid);

  if (updatedResponse.records.length > 0) {
    const patientData = updatedResponse.records[0] as any;

    // Parse full name into first and last
    const fullName = patientData.PatientFullName || '';
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts.length > 1 ? nameParts[0] : fullName;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : fullName;

    const patient = {
      patient_guid: patientGuid,
      patient_id: patientData.PatID,
      first_name: firstName,
      last_name: lastName,
      birthdate: patientData.PatientBirthDate,
      gender: patientData.PatientGender,
      email: patientData.PatientEmail,
      phone: patientData.PatientPhone,
      address_street: patientData.PatientStreet,
      address_city: patientData.PatientCity,
      address_state: patientData.PatientState,
      address_postal_code: patientData.PatientPostalCode,
      provider_guid: undefined,
      location_guid: undefined,
      environment,
    };

    res.json({
      status: 'success',
      data: patient,
      environment,
    });
  } else {
    res.json({
      status: 'success',
      message: 'Patient updated successfully',
      environment,
    });
  }
});
