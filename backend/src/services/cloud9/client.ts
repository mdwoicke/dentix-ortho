import axios, { AxiosError } from 'axios';
import fs from 'fs';
import path from 'path';
import { Cloud9Config, Environment, getCredentials, getEndpoint } from '../../config/cloud9';
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
  buildGetAppointmentsByDateRequest,
  buildSetAppointmentRequest,
  buildSetAppointmentStatusConfirmedRequest,
  buildSetAppointmentStatusCanceledRequest,
  buildGetAvailableApptsRequest,
  Cloud9Credentials,
  CreatePatientParams,
  UpdatePatientParams,
  CreateAppointmentParams,
  GetAvailableApptsParams,
} from './xmlBuilder';
import { parseXmlResponse, Cloud9Response } from './xmlParser';
import logger, { loggers } from '../../utils/logger';
import { Cloud9Procedure } from './procedures';

/**
 * Short-term cache for GetPatientInformation to prevent rate limiting
 * Key: `${environment}:${patientGuid}`, Value: { response, timestamp }
 */
const patientInfoCache = new Map<string, { response: Cloud9Response; timestamp: number }>();
const PATIENT_INFO_CACHE_TTL_MS = 60000; // 60 seconds

/**
 * Cloud 9 API Client
 * Handles HTTP communication with the Cloud 9 Ortho API
 */

export class Cloud9Client {
  private environment: Environment;
  private configOverride?: Cloud9Config;

  constructor(environment: Environment = 'sandbox', configOverride?: Cloud9Config) {
    this.environment = environment;
    this.configOverride = configOverride;
  }

  /**
   * Log rate limit errors (error code 8) to a markdown file for analysis
   */
  private logRateLimitError(procedure: string, requestXml: string, response: Cloud9Response, rawXml?: string): void {
    const logsDir = path.join(__dirname, '../../../logs');
    const logPath = path.join(logsDir, 'rate-limit-errors.md');
    const timestamp = new Date().toISOString();

    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const entry = `
## Rate Limit Error - ${timestamp}

**Procedure:** ${procedure}
**Environment:** ${this.environment}
**Error Code:** ${response.errorCode}
**Error Message:** ${response.errorMessage}

### Request XML
\`\`\`xml
${requestXml}
\`\`\`

### Response
\`\`\`xml
${rawXml || JSON.stringify(response, null, 2)}
\`\`\`

---

`;

    fs.appendFileSync(logPath, entry);
    console.log(`[RATE LIMIT] Logged rate limit error for ${procedure} to rate-limit-errors.md`);
  }

  /**
   * Make a generic request to the Cloud 9 API
   * @param xmlBody - XML request body
   * @param procedure - Procedure name for logging
   * @param timeoutMs - Optional custom timeout in milliseconds (default: 30000)
   */
  private async makeRequest(xmlBody: string, procedure: string, timeoutMs: number = 30000): Promise<Cloud9Response> {
    const endpoint = this.configOverride?.endpoint || getEndpoint(this.environment);

    try {
      loggers.cloud9Request(procedure, this.environment);

      const response = await axios.get(endpoint, {
        headers: {
          'Content-Type': 'application/xml',
        },
        data: xmlBody,
        timeout: timeoutMs,
      });

      const parsedResponse = await parseXmlResponse(response.data);

      // Log raw XML if there's an error for debugging
      if (parsedResponse.status === 'Error') {
        logger.error('Cloud 9 API Error - Raw XML Response', {
          procedure,
          xmlResponse: response.data.substring(0, 1000), // First 1000 chars
        });

        // Log rate limit errors (error code 8) to markdown file for analysis
        if (parsedResponse.errorCode === 8) {
          this.logRateLimitError(procedure, xmlBody, parsedResponse, response.data);
        }
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
   * Get credentials, using config override if provided
   */
  private getCredentials(): Cloud9Credentials {
    return this.configOverride?.credentials || getCredentials(this.environment);
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
    const credentials = this.getCredentials();
    const xmlBody = buildGetLocationsRequest(credentials, showDeleted);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_LOCATIONS);
  }

  /**
   * Get chair schedules (providers/doctors)
   */
  async getChairSchedules(): Promise<Cloud9Response> {
    const credentials = this.getCredentials();
    const xmlBody = buildGetChairSchedulesRequest(credentials);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_CHAIR_SCHEDULES);
  }

  /**
   * Get appointment types
   */
  async getAppointmentTypes(showDeleted: boolean = false): Promise<Cloud9Response> {
    const credentials = this.getCredentials();
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
    const credentials = this.getCredentials();
    const xmlBody = buildGetPortalPatientLookupRequest(
      credentials,
      searchTerm,
      pageIndex,
      pageSize
    );
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_PORTAL_PATIENT_LOOKUP);
  }

  /**
   * Get patient list (optionally filtered by location and/or modified since date)
   * @param locationGuids - Optional array of location GUIDs to filter by
   * @param modifiedSince - Optional date string (MM/DD/YYYY HH:MM:SS AM/PM) for incremental sync
   * @param timeoutMs - Optional timeout in ms (default: 120000 for full sync, which can be slow)
   */
  async getPatientList(locationGuids?: string[], modifiedSince?: string, timeoutMs: number = 120000): Promise<Cloud9Response> {
    const credentials = this.getCredentials();
    const xmlBody = buildGetPatientListRequest(credentials, locationGuids, modifiedSince);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_PATIENT_LIST, timeoutMs);
  }

  /**
   * Get detailed patient information
   * Uses short-term caching (60s) to prevent rate limiting from duplicate calls
   */
  async getPatientInformation(patientGuid: string): Promise<Cloud9Response> {
    const cacheKey = `${this.environment}:${patientGuid}`;
    const now = Date.now();

    // Check cache first
    const cached = patientInfoCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < PATIENT_INFO_CACHE_TTL_MS) {
      logger.info('GetPatientInformation cache hit', { patientGuid, environment: this.environment });
      return cached.response;
    }

    // Clean up expired entries periodically (simple cleanup)
    if (patientInfoCache.size > 100) {
      for (const [key, value] of patientInfoCache.entries()) {
        if ((now - value.timestamp) >= PATIENT_INFO_CACHE_TTL_MS) {
          patientInfoCache.delete(key);
        }
      }
    }

    const credentials = this.getCredentials();
    const xmlBody = buildGetPatientInformationRequest(credentials, patientGuid);
    const response = await this.makeRequest(xmlBody, Cloud9Procedure.GET_PATIENT_INFORMATION);

    // Cache successful responses only
    if (response.status === 'Success') {
      patientInfoCache.set(cacheKey, { response, timestamp: now });
    }

    return response;
  }

  /**
   * Create a new patient
   */
  async createPatient(params: CreatePatientParams): Promise<Cloud9Response> {
    const credentials = this.getCredentials();
    const xmlBody = buildSetPatientRequest(credentials, params);
    return this.makeRequest(xmlBody, Cloud9Procedure.SET_PATIENT);
  }

  /**
   * Update patient demographic information
   */
  async updatePatient(params: UpdatePatientParams): Promise<Cloud9Response> {
    const credentials = this.getCredentials();
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
    const credentials = this.getCredentials();
    const xmlBody = buildGetAppointmentListByPatientRequest(credentials, patientGuid);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_APPOINTMENT_LIST_BY_PATIENT);
  }

  /**
   * Get appointments by date and schedule view (includes Chair field)
   */
  async getAppointmentsByDate(appointmentDate: string, scheduleViewGuid: string): Promise<Cloud9Response> {
    const credentials = this.getCredentials();
    const xmlBody = buildGetAppointmentsByDateRequest(credentials, appointmentDate, scheduleViewGuid);
    return this.makeRequest(xmlBody, Cloud9Procedure.GET_APPOINTMENTS_BY_DATE);
  }

  /**
   * Create a new appointment
   */
  async createAppointment(params: CreateAppointmentParams): Promise<Cloud9Response> {
    const credentials = this.getCredentials();
    const xmlBody = buildSetAppointmentRequest(credentials, params);
    return this.makeRequest(xmlBody, Cloud9Procedure.SET_APPOINTMENT);
  }

  /**
   * Confirm an existing appointment
   */
  async confirmAppointment(appointmentGuid: string): Promise<Cloud9Response> {
    const credentials = this.getCredentials();
    const xmlBody = buildSetAppointmentStatusConfirmedRequest(credentials, appointmentGuid);
    return this.makeRequest(xmlBody, Cloud9Procedure.SET_APPOINTMENT_STATUS_CONFIRMED);
  }

  /**
   * Cancel an existing appointment
   */
  async cancelAppointment(appointmentGuid: string): Promise<Cloud9Response> {
    const credentials = this.getCredentials();
    const xmlBody = buildSetAppointmentStatusCanceledRequest(credentials, appointmentGuid);
    return this.makeRequest(xmlBody, Cloud9Procedure.SET_APPOINTMENT_STATUS_CANCELED);
  }

  /**
   * Get available appointment slots
   */
  async getAvailableAppts(params: GetAvailableApptsParams): Promise<Cloud9Response> {
    const credentials = this.getCredentials();
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
    const credentials = this.getCredentials();
    const xmlBody = buildXmlRequest({ procedure, parameters, credentials });
    return this.makeRequest(xmlBody, procedure);
  }
}

/**
 * Factory function to create a Cloud 9 client instance
 */
export function createCloud9Client(environment: Environment = 'sandbox', configOverride?: Cloud9Config): Cloud9Client {
  return new Cloud9Client(environment, configOverride);
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
