/**
 * NexHealth Proxy Service
 *
 * Lightweight service that calls existing Node-RED endpoints to interact
 * with the NexHealth API (used by Chord tenant).
 *
 * Reuses the same BASE_URL and auth pattern from replayService.ts.
 */

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

const AUTH_USERNAME = 'workflowapi';
const AUTH_PASSWORD = 'e^@V95&6sAJReTsb5!iq39mIC4HYIV';

const DEFAULT_LOCATION_ID = '77523';

function getAuthHeader(): string {
  const credentials = Buffer.from(`${AUTH_USERNAME}:${AUTH_PASSWORD}`).toString('base64');
  return `Basic ${credentials}`;
}

async function postChord(endpoint: string, body: Record<string, any>, timeoutMs = 15000): Promise<any> {
  const response = await fetch(`${BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': getAuthHeader(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`NexHealth proxy ${endpoint} error ${response.status}: ${text}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NexHealthAppointment {
  id: number | string;
  patient_id: number | string;
  provider_id: number | string;
  start_time: string;
  end_time?: string;
  operatory_id?: number | string;
  appointment_type_id?: number | string;
  appointment_type_name?: string;
  confirmed?: boolean;
  cancelled?: boolean;
  created_at?: string;
}

export interface NexHealthPatient {
  id: number | string;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  phone_number?: string;
  bio?: { date_of_birth?: string; gender?: string; [k: string]: any };
  date_of_birth?: string;
  gender?: string;
  inactive?: boolean;
}

export interface NexHealthOperatory {
  id: number | string;
  name?: string;
  active?: boolean;
}

export interface NexHealthLocation {
  id: number | string;
  name?: string;
  phone_number?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  operatories?: NexHealthOperatory[];
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

/**
 * Get patient appointments from NexHealth via Node-RED.
 * POST /chord/getPatientAppts
 */
export async function getPatientAppointments(
  patientId: string,
  startDate?: string,
  endDate?: string
): Promise<NexHealthAppointment[]> {
  const body: Record<string, string> = { patientId, uui: 'dentix-verify' };
  if (startDate) body.startDate = startDate;
  if (endDate) body.endDate = endDate;

  const data: any = await postChord('getPatientAppts', body);

  if (Array.isArray(data)) return data;
  if (data?.appointments && Array.isArray(data.appointments)) return data.appointments;
  if (data?.data && Array.isArray(data.data)) return data.data;
  return [];
}

/**
 * Get patient demographics from NexHealth via Node-RED.
 * POST /chord/getPatient
 */
export async function getPatient(patientId: string): Promise<NexHealthPatient | null> {
  try {
    const data: any = await postChord('getPatient', { patientId, uui: 'dentix-verify' });
    // Response may be the patient directly, or nested
    if (data?.id) return data;
    if (data?.patient) return data.patient;
    if (data?.data) return data.data;
    // Could be an array — take first
    if (Array.isArray(data) && data.length > 0) return data[0];
    return data || null;
  } catch {
    return null;
  }
}

/**
 * Get location/clinic info from NexHealth via Node-RED.
 * POST /chord/getLocation
 */
export async function getLocation(locationId?: string): Promise<NexHealthLocation | null> {
  try {
    const data: any = await postChord('getLocation', {
      locationId: locationId || DEFAULT_LOCATION_ID,
      uui: 'dentix-verify',
    });
    if (data?.id) return data;
    if (data?.location) return data.location;
    if (data?.data) return data.data;
    if (Array.isArray(data) && data.length > 0) return data[0];
    return data || null;
  } catch {
    return null;
  }
}
