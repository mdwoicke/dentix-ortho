/**
 * Cloud9 Direct Service
 *
 * Tests the Cloud9 API directly with parameters extracted from a trace observation.
 * Used to isolate whether failures originate in tool logic or the upstream Cloud9 API.
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface Cloud9DirectResult {
  observationId: string;
  nodeRedResponse: any;
  cloud9Response: any;
  cloud9StatusCode: number;
  match: boolean;
  differences: string[];
  bottleneck: 'cloud9' | 'tool_logic' | 'inconclusive';
  durationMs: number;
  procedure: string;
  xmlRequest: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLOUD9_PROD_URL = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CLOUD9_CLIENT_ID = 'b42c51be-2529-4d31-92cb-50fd1a58c084';
const CLOUD9_USERNAME = process.env.CLOUD9_USERNAME || '';
const CLOUD9_PASSWORD = process.env.CLOUD9_PASSWORD || '';

const XML_NAMESPACE = 'http://schemas.practica.ws/cloud9/partners/';

// ============================================================================
// DATABASE ACCESS
// ============================================================================

function getDb(): BetterSqlite3.Database {
  const dbPath = path.resolve(__dirname, '../../../test-agent/data/test-results.db');
  return new BetterSqlite3(dbPath, { readonly: true });
}

// ============================================================================
// XML BUILDERS
// ============================================================================

function buildXmlRequest(procedure: string, parameters: string): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="${XML_NAMESPACE}">
    <ClientID>${CLOUD9_CLIENT_ID}</ClientID>
    <UserName>${CLOUD9_USERNAME}</UserName>
    <Password>${CLOUD9_PASSWORD}</Password>
    <Procedure>${procedure}</Procedure>
    <Parameters>
${parameters}
    </Parameters>
</GetDataRequest>`;
}

function xmlParam(name: string, value: string): string {
  return `        <${name}>${escapeXml(value)}</${name}>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// ACTION TO PROCEDURE MAPPING
// ============================================================================

interface ProcedureMapping {
  procedure: string;
  buildParams: (input: any) => string;
}

const ACTION_MAP: Record<string, ProcedureMapping> = {
  // Patient tool actions
  lookup: {
    procedure: 'GetPortalPatientLookup',
    buildParams: (input: any) => {
      const params: string[] = [];
      if (input.filter) params.push(xmlParam('filter', String(input.filter)));
      if (input.phoneNumber) params.push(xmlParam('filter', String(input.phoneNumber)));
      return params.join('\n');
    },
  },
  create: {
    procedure: 'SetPatient',
    buildParams: (input: any) => {
      const params: string[] = [];
      if (input.patientFirstName) params.push(xmlParam('patientFirstName', input.patientFirstName));
      if (input.patientLastName) params.push(xmlParam('patientLastName', input.patientLastName));
      if (input.birthdayDateTime) params.push(xmlParam('birthdayDateTime', input.birthdayDateTime));
      if (input.phoneNumber) params.push(xmlParam('phoneNumber', input.phoneNumber));
      if (input.providerGUID) params.push(xmlParam('providerGUID', input.providerGUID));
      if (input.locationGUID) params.push(xmlParam('locationGUID', input.locationGUID));
      params.push(xmlParam('VendorUserName', 'IntelePeer'));
      return params.join('\n');
    },
  },
  // Scheduling tool actions
  slots: {
    procedure: 'GetOnlineReservations',
    buildParams: (input: any) => {
      const params: string[] = [];
      if (input.startDate) params.push(xmlParam('startDate', input.startDate));
      if (input.endDate) params.push(xmlParam('endDate', input.endDate));
      if (input.scheduleViewGUIDs) params.push(xmlParam('schdvwGUIDs', input.scheduleViewGUIDs));
      return params.join('\n');
    },
  },
  grouped_slots: {
    procedure: 'GetOnlineReservations',
    buildParams: (input: any) => {
      const params: string[] = [];
      if (input.startDate) params.push(xmlParam('startDate', input.startDate));
      if (input.endDate) params.push(xmlParam('endDate', input.endDate));
      if (input.scheduleViewGUIDs) params.push(xmlParam('schdvwGUIDs', input.scheduleViewGUIDs));
      return params.join('\n');
    },
  },
  book_child: {
    procedure: 'SetAppointment',
    buildParams: (input: any) => {
      const params: string[] = [];
      if (input.patientGUID) params.push(xmlParam('PatientGUID', input.patientGUID));
      if (input.startTime) params.push(xmlParam('StartTime', input.startTime));
      if (input.scheduleViewGUID) params.push(xmlParam('ScheduleViewGUID', input.scheduleViewGUID));
      if (input.scheduleColumnGUID) params.push(xmlParam('ScheduleColumnGUID', input.scheduleColumnGUID));
      if (input.appointmentTypeGUID) params.push(xmlParam('AppointmentTypeGUID', input.appointmentTypeGUID));
      if (input.minutes) params.push(xmlParam('Minutes', String(input.minutes)));
      params.push(xmlParam('VendorUserName', 'IntelePeer'));
      return params.join('\n');
    },
  },
  get: {
    procedure: 'GetPatientInformation',
    buildParams: (input: any) => {
      const params: string[] = [];
      if (input.patientGUID) params.push(xmlParam('patguid', input.patientGUID));
      return params.join('\n');
    },
  },
  appointments: {
    procedure: 'GetAppointmentListByPatient',
    buildParams: (input: any) => {
      const params: string[] = [];
      if (input.patientGUID) params.push(xmlParam('patGUID', input.patientGUID));
      return params.join('\n');
    },
  },
};

// ============================================================================
// XML RESPONSE PARSER (simple -- just extracts key info)
// ============================================================================

function parseXmlResponse(xml: string): { status: string; records: string; raw: string } {
  const statusMatch = xml.match(/<ResponseStatus>(.*?)<\/ResponseStatus>/);
  const recordsMatch = xml.match(/<Records>([\s\S]*?)<\/Records>/);

  return {
    status: statusMatch?.[1] || 'Unknown',
    records: recordsMatch?.[1]?.trim() || '',
    raw: xml,
  };
}

// ============================================================================
// COMPARISON LOGIC
// ============================================================================

function compareResponses(
  nodeRedOutput: any,
  cloud9Response: { status: string; records: string; raw: string }
): { match: boolean; differences: string[]; bottleneck: 'cloud9' | 'tool_logic' | 'inconclusive' } {
  const differences: string[] = [];

  // Check if Cloud9 returned an error
  if (cloud9Response.status !== 'Success') {
    differences.push(`Cloud9 returned status: ${cloud9Response.status}`);

    // If Node-RED also returned an error, bottleneck is Cloud9
    const nodeRedError = nodeRedOutput?.success === false || nodeRedOutput?.error;
    if (nodeRedError) {
      return { match: true, differences, bottleneck: 'cloud9' };
    }
    // Node-RED succeeded but Cloud9 failed -- inconclusive (cache/timing)
    return { match: false, differences, bottleneck: 'inconclusive' };
  }

  // Cloud9 succeeded
  const nodeRedError = nodeRedOutput?.success === false || nodeRedOutput?._debug_error;
  if (nodeRedError) {
    differences.push(`Cloud9 succeeded but Node-RED returned error: ${nodeRedOutput?._debug_error || nodeRedOutput?.error || 'unknown'}`);
    return { match: false, differences, bottleneck: 'tool_logic' };
  }

  // Both succeeded -- check if data roughly matches
  const hasRecords = cloud9Response.records.length > 0;
  const nodeRedHasData = nodeRedOutput?.patient || nodeRedOutput?.patients ||
    nodeRedOutput?.slots || nodeRedOutput?.groups ||
    nodeRedOutput?.appointmentGUID || nodeRedOutput?.data;

  if (hasRecords && !nodeRedHasData) {
    differences.push('Cloud9 returned records but Node-RED response has no data');
    return { match: false, differences, bottleneck: 'tool_logic' };
  }

  if (!hasRecords && nodeRedHasData) {
    differences.push('Cloud9 returned no records but Node-RED had data (possibly cached)');
    return { match: false, differences, bottleneck: 'inconclusive' };
  }

  if (differences.length === 0) {
    differences.push('Both returned data -- detailed field comparison not implemented');
  }

  return { match: differences.length <= 1, differences, bottleneck: 'inconclusive' };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Test Cloud9 API directly with parameters extracted from a trace observation.
 */
export async function testCloud9Direct(observationId: string): Promise<Cloud9DirectResult> {
  const startTime = Date.now();
  const db = getDb();

  try {
    // 1. Get observation
    const obs = db.prepare(`
      SELECT observation_id, name, input, output
      FROM production_trace_observations
      WHERE observation_id = ?
    `).get(observationId) as any;

    if (!obs) {
      throw new Error(`Observation ${observationId} not found`);
    }

    // 2. Parse input and output
    let input: any;
    let nodeRedOutput: any;
    try {
      input = typeof obs.input === 'string' ? JSON.parse(obs.input) : obs.input;
    } catch {
      throw new Error(`Could not parse observation input`);
    }
    try {
      nodeRedOutput = typeof obs.output === 'string' ? JSON.parse(obs.output) : obs.output;
    } catch {
      nodeRedOutput = obs.output;
    }

    // 3. Determine action from input
    const action = input?.action || input?.Action;
    if (!action) {
      throw new Error(`No action found in observation input`);
    }

    const mapping = ACTION_MAP[action];
    if (!mapping) {
      throw new Error(`No Cloud9 procedure mapping for action "${action}". Supported: ${Object.keys(ACTION_MAP).join(', ')}`);
    }

    // 4. Build XML request
    const xmlParams = mapping.buildParams(input);
    const xmlRequest = buildXmlRequest(mapping.procedure, xmlParams);

    // 5. Check credentials
    if (!CLOUD9_USERNAME || !CLOUD9_PASSWORD) {
      return {
        observationId,
        nodeRedResponse: nodeRedOutput,
        cloud9Response: { error: 'Cloud9 credentials not configured (CLOUD9_USERNAME, CLOUD9_PASSWORD env vars)' },
        cloud9StatusCode: 0,
        match: false,
        differences: ['Cannot test: Cloud9 credentials not configured in environment variables'],
        bottleneck: 'inconclusive',
        durationMs: Date.now() - startTime,
        procedure: mapping.procedure,
        xmlRequest,
      };
    }

    // 6. Send request to Cloud9
    const response = await fetch(CLOUD9_PROD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xmlRequest,
    });

    const responseText = await response.text();
    const cloud9Parsed = parseXmlResponse(responseText);

    // 7. Compare responses
    const comparison = compareResponses(nodeRedOutput, cloud9Parsed);

    return {
      observationId,
      nodeRedResponse: nodeRedOutput,
      cloud9Response: cloud9Parsed,
      cloud9StatusCode: response.status,
      match: comparison.match,
      differences: comparison.differences,
      bottleneck: comparison.bottleneck,
      durationMs: Date.now() - startTime,
      procedure: mapping.procedure,
      xmlRequest,
    };
  } finally {
    db.close();
  }
}
