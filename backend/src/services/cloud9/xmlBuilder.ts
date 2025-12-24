import { Builder } from 'xml2js';

/**
 * XML Builder for Cloud 9 Ortho API requests
 * Converts JavaScript objects to XML format required by Cloud 9 API
 */

const XML_NAMESPACE = 'http://schemas.practica.ws/cloud9/partners/';

export interface Cloud9Credentials {
  clientId: string;
  userName: string;
  password: string;
}

export interface BuildRequestOptions {
  procedure: string;
  parameters?: Record<string, any>;
  credentials: Cloud9Credentials;
}

/**
 * Builds an XML request for the Cloud 9 API
 */
export function buildXmlRequest(options: BuildRequestOptions): string {
  const { procedure, parameters = {}, credentials } = options;

  const requestObject = {
    GetDataRequest: {
      $: {
        xmlns: XML_NAMESPACE,
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      },
      ClientID: credentials.clientId,
      UserName: credentials.userName,
      Password: credentials.password,
      Procedure: procedure,
      ...(Object.keys(parameters).length > 0 && {
        Parameters: parameters,
      }),
    },
  };

  const builder = new Builder({
    xmldec: { version: '1.0', encoding: 'utf-8' },
    renderOpts: { pretty: false },
  });

  return builder.buildObject(requestObject);
}

/**
 * Helper function to build GetLocations request
 */
export function buildGetLocationsRequest(
  credentials: Cloud9Credentials,
  showDeleted: boolean = false
): string {
  return buildXmlRequest({
    procedure: 'GetLocations',
    parameters: { showDeleted: showDeleted.toString() },
    credentials,
  });
}

/**
 * Helper function to build GetChairSchedules request
 */
export function buildGetChairSchedulesRequest(
  credentials: Cloud9Credentials
): string {
  return buildXmlRequest({
    procedure: 'GetChairSchedules',
    credentials,
  });
}

/**
 * Helper function to build GetAppointmentTypes request
 */
export function buildGetAppointmentTypesRequest(
  credentials: Cloud9Credentials,
  showDeleted: boolean = false
): string {
  return buildXmlRequest({
    procedure: 'GetAppointmentTypes',
    parameters: { showDeleted: showDeleted.toString() },
    credentials,
  });
}

/**
 * Helper function to build GetPortalPatientLookup request
 */
export function buildGetPortalPatientLookupRequest(
  credentials: Cloud9Credentials,
  filter: string,
  pageIndex: number = 1,
  pageSize: number = 25
): string {
  return buildXmlRequest({
    procedure: 'GetPortalPatientLookup',
    parameters: {
      filter,
      lookupByPatient: '1',
      pageIndex: pageIndex.toString(),
      pageSize: pageSize.toString(),
    },
    credentials,
  });
}

/**
 * Helper function to build GetPatientList request
 */
export function buildGetPatientListRequest(
  credentials: Cloud9Credentials,
  locationGuids?: string[]
): string {
  const parameters: Record<string, any> = {};

  if (locationGuids && locationGuids.length > 0) {
    parameters.LocGUIDs = locationGuids.join(',');
  }

  return buildXmlRequest({
    procedure: 'GetPatientList',
    parameters,
    credentials,
  });
}

/**
 * Helper function to build GetPatientInformation request
 */
export function buildGetPatientInformationRequest(
  credentials: Cloud9Credentials,
  patientGuid: string
): string {
  return buildXmlRequest({
    procedure: 'GetPatientInformation',
    parameters: { patguid: patientGuid },
    credentials,
  });
}

/**
 * Helper function to build SetPatient request (Create patient)
 */
export interface CreatePatientParams {
  patientFirstName: string;
  patientLastName: string;
  providerGUID: string;
  locationGUID: string;
  birthdayDateTime: string;
  phoneNumber: string;
  email: string;
  VendorUserName: string;
  note?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressPostalCode?: string;
}

export function buildSetPatientRequest(
  credentials: Cloud9Credentials,
  params: CreatePatientParams
): string {
  return buildXmlRequest({
    procedure: 'SetPatient',
    parameters: params,
    credentials,
  });
}

/**
 * Helper function to build SetPatientDemographicInfo request (Update patient)
 */
export interface UpdatePatientParams {
  patguid: string;
  persUseEmail?: string;
  persUsePhone?: string;
  persFirstName?: string;
  persLastName?: string;
  persBirthdate?: string;
  persStreetAddress?: string;
  persCity?: string;
  persState?: string;
  persPostalCode?: string;
}

export function buildSetPatientDemographicInfoRequest(
  credentials: Cloud9Credentials,
  params: UpdatePatientParams
): string {
  return buildXmlRequest({
    procedure: 'SetPatientDemographicInfo',
    parameters: params,
    credentials,
  });
}

/**
 * Helper function to build GetAppointmentListByPatient request
 */
export function buildGetAppointmentListByPatientRequest(
  credentials: Cloud9Credentials,
  patientGuid: string
): string {
  return buildXmlRequest({
    procedure: 'GetAppointmentListByPatient',
    parameters: { patGUID: patientGuid },
    credentials,
  });
}

/**
 * Helper function to build SetAppointment request (Create appointment)
 */
export interface CreateAppointmentParams {
  PatientGUID: string;
  StartTime: string; // Format: MM/DD/YYYY HH:mm:ss AM/PM
  ScheduleViewGUID: string;
  ScheduleColumnGUID: string;
  AppointmentTypeGUID: string;
  Minutes: number;
  VendorUserName: string;
}

export function buildSetAppointmentRequest(
  credentials: Cloud9Credentials,
  params: CreateAppointmentParams
): string {
  return buildXmlRequest({
    procedure: 'SetAppointment',
    parameters: {
      ...params,
      Minutes: params.Minutes.toString(),
    },
    credentials,
  });
}

/**
 * Helper function to build SetAppointmentStatusConfirmed request
 */
export function buildSetAppointmentStatusConfirmedRequest(
  credentials: Cloud9Credentials,
  appointmentGuid: string
): string {
  return buildXmlRequest({
    procedure: 'SetAppointmentStatusConfirmed',
    parameters: { apptGUID: appointmentGuid },
    credentials,
  });
}

/**
 * Helper function to build SetAppointmentStatusCanceled request
 */
export function buildSetAppointmentStatusCanceledRequest(
  credentials: Cloud9Credentials,
  appointmentGuid: string
): string {
  return buildXmlRequest({
    procedure: 'SetAppointmentStatusCanceled',
    parameters: { apptGUID: appointmentGuid },
    credentials,
  });
}

/**
 * Helper function to build GetAvailableAppts request
 */
export interface GetAvailableApptsParams {
  locationGuid: string;
  providerGuid?: string;
  appointmentTypeGuid?: string;
  startDate: string; // Format: MM/DD/YYYY
  endDate: string; // Format: MM/DD/YYYY
  durationMinutes?: number;
}

export function buildGetAvailableApptsRequest(
  credentials: Cloud9Credentials,
  params: GetAvailableApptsParams
): string {
  // Format dates with time (7:00 AM to 5:00 PM) as Cloud 9 expects
  const startDateTime = `${params.startDate} 7:00:00 AM`;
  const endDateTime = `${params.endDate} 5:00:00 PM`;

  const parameters: Record<string, any> = {
    startDate: startDateTime,
    endDate: endDateTime,
    morning: 'True',
    afternoon: 'True',
  };

  // Add schedule view GUID (provider/location schedule)
  if (params.providerGuid) {
    parameters.schdvwGUIDs = params.providerGuid;
  }

  // Add appointment type GUID
  if (params.appointmentTypeGuid) {
    parameters.appttypGUIDs = params.appointmentTypeGuid;
  }

  return buildXmlRequest({
    procedure: 'GetOnlineReservations',
    parameters,
    credentials,
  });
}
