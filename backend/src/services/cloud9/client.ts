import axios, { AxiosError } from 'axios';
import { Environment, getCredentials, getEndpoint } from '../../config/cloud9';
import {
  buildXmlRequest,
  buildGetLocationsRequest,
  buildGetChairSchedulesRequest,
  buildGetAppointmentTypesRequest,
  buildGetPortalPatientLookupRequest,
  buildGetPatientListRequest,
  buildGetPatientInformationRequest,
  buildSetPatientRequest,
  buildSetPatientDemographicInfoRequest,
  buildGetAppointmentListByPatientRequest,
  buildSetAppointmentRequest,
  buildSetAppointmentStatusConfirmedRequest,
  buildSetAppointmentStatusCanceledRequest,
  buildGetAvailableApptsRequest,
  CreatePatientParams,
  UpdatePatientParams,
  CreateAppointmentParams,
  GetAvailableApptsParams,
} from './xmlBuilder';
import { parseXmlResponse, Cloud9Response } from './xmlParser';
import logger, { loggers } from '../../utils/logger';
import { Cloud9Procedure } from './procedures';

/**
 * Cloud 9 API Client
 * Handles HTTP communication with the Cloud 9 Ortho API
 */

export class Cloud9Client {
  private environment: Environment;

  constructor(environment: Environment = 'sandbox') {
    this.environment = environment;
  }

  /**
   * Make a generic request to the Cloud 9 API
   */
  private async makeRequest(xmlBody: string, procedure: string): Promise<Cloud9Response> {
    const endpoint = getEndpoint(this.environment);

    try {
      loggers.cloud9Request(procedure, this.environment);

      const response = await axios.get(endpoint, {
        headers: {
          'Content-Type': 'application/xml',
        },
        data: xmlBody,
        timeout: 30000, // 30 second timeout
      });

      const parsedResponse = await parseXmlResponse(response.data);

      // Log raw XML if there's an error for debugging
      if (parsedResponse.status === 'Error') {
        logger.error('Cloud 9 API Error - Raw XML Response', {
          procedure,
          xmlResponse: response.data.substring(0, 1000), // First 1000 chars
        });
      }

      loggers.cloud9Response(
        procedure,
        parsedResponse.status,
        parsedResponse.records.length,
        parsedResponse.errorMessage
      );

      return parsedResponse;
    } catch (error) {
      if (error instanceof AxiosError) {
        logger.error('Cloud 9 API HTTP Error', {
          procedure,
          environment: this.environment,
          status: error.response?.status,
          message: error.message,
          data: error.response?.data,
        });

        throw new Error(
          `Cloud 9 API HTTP Error: ${error.message} (${error.response?.status || 'unknown'})`
        );
      }

      logger.error('Cloud 9 API Error', {
        procedure,
        environment: this.environment,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Set environment for this client instance
   */
  setEnvironment(environment: Environment): void {
    this.environment = environment;
  }

  /**
   * Get current environment
   */
  getEnvironment(): Environment {
    return this.environment;
  }

  // ===========================================
  // Reference Data Methods
  // ===========================================

  /**
   * Get all practice locations
   */
  async getLocations(showDeleted: boolean = false): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildGetLocationsRequest(credentials, showDeleted);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_LOCATIONS);
  }

  /**
   * Get chair schedules (providers/doctors)
   */
  async getChairSchedules(): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildGetChairSchedulesRequest(credentials);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_CHAIR_SCHEDULES);
  }

  /**
   * Get appointment types
   */
  async getAppointmentTypes(showDeleted: boolean = false): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildGetAppointmentTypesRequest(credentials, showDeleted);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_APPOINTMENT_TYPES);
  }

  // ===========================================
  // Patient Methods
  // ===========================================

  /**
   * Search for patients by name
   */
  async searchPatients(
    searchTerm: string,
    pageIndex: number = 1,
    pageSize: number = 25
  ): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildGetPortalPatientLookupRequest(
      credentials,
      searchTerm,
      pageIndex,
      pageSize
    );
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_PORTAL_PATIENT_LOOKUP);
  }

  /**
   * Get patient list (optionally filtered by location)
   */
  async getPatientList(locationGuids?: string[]): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildGetPatientListRequest(credentials, locationGuids);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_PATIENT_LIST);
  }

  /**
   * Get detailed patient information
   */
  async getPatientInformation(patientGuid: string): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildGetPatientInformationRequest(credentials, patientGuid);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_PATIENT_INFORMATION);
  }

  /**
   * Create a new patient
   */
  async createPatient(params: CreatePatientParams): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildSetPatientRequest(credentials, params);
    return this.makeRequest(xmlBody, Cloud9Procedure.SET_PATIENT);
  }

  /**
   * Update patient demographic information
   */
  async updatePatient(params: UpdatePatientParams): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildSetPatientDemographicInfoRequest(credentials, params);
    return this.makeRequest(xmlBody, Cloud9Procedure.SET_PATIENT_DEMOGRAPHIC_INFO);
  }

  // ===========================================
  // Appointment Methods
  // ===========================================

  /**
   * Get all appointments for a patient
   */
  async getPatientAppointments(patientGuid: string): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildGetAppointmentListByPatientRequest(credentials, patientGuid);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_APPOINTMENT_LIST_BY_PATIENT);
  }

  /**
   * Create a new appointment
   */
  async createAppointment(params: CreateAppointmentParams): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildSetAppointmentRequest(credentials, params);
    return this.makeRequest(xmlBody, Cloud9Procedure.SET_APPOINTMENT);
  }

  /**
   * Confirm an existing appointment
   */
  async confirmAppointment(appointmentGuid: string): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildSetAppointmentStatusConfirmedRequest(credentials, appointmentGuid);
    return this.makeRequest(xmlBody, Cloud9Procedure.SET_APPOINTMENT_STATUS_CONFIRMED);
  }

  /**
   * Cancel an existing appointment
   */
  async cancelAppointment(appointmentGuid: string): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildSetAppointmentStatusCanceledRequest(credentials, appointmentGuid);
    return this.makeRequest(xmlBody, Cloud9Procedure.SET_APPOINTMENT_STATUS_CANCELED);
  }

  /**
   * Get available appointment slots
   */
  async getAvailableAppts(params: GetAvailableApptsParams): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildGetAvailableApptsRequest(credentials, params);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_AVAILABLE_APPTS);
  }

  /**
   * Generic method to execute any procedure with custom parameters
   */
  async executeProcedure(
    procedure: Cloud9Procedure,
    parameters?: Record<string, any>
  ): Promise<Cloud9Response> {
    const credentials = getCredentials(this.environment);
    const xmlBody = buildXmlRequest({ procedure, parameters, credentials });
    return this.makeRequest(xmlBody, procedure);
  }
}

/**
 * Factory function to create a Cloud 9 client instance
 */
export function createCloud9Client(environment: Environment = 'sandbox'): Cloud9Client {
  return new Cloud9Client(environment);
}

/**
 * Singleton instance for shared use
 */
let sharedClient: Cloud9Client | null = null;

export function getSharedClient(environment?: Environment): Cloud9Client {
  if (!sharedClient || (environment && sharedClient.getEnvironment() !== environment)) {
    sharedClient = new Cloud9Client(environment || 'sandbox');
  }
  return sharedClient;
}
