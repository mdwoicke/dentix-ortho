import { parseStringPromise } from 'xml2js';

/**
 * XML Parser for Cloud 9 Ortho API responses
 * Converts XML responses to JavaScript objects
 */

export interface Cloud9Response<T = any> {
  status: 'Success' | 'Error';
  records: T[];
  errorCode?: number;
  errorMessage?: string;
}

/**
 * Parses an XML response from the Cloud 9 API
 */
export async function parseXmlResponse<T = any>(
  xmlResponse: string
): Promise<Cloud9Response<T>> {
  try {
    const result = await parseStringPromise(xmlResponse, {
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true,
    });

    const response = result.GetDataResponse;

    if (!response) {
      throw new Error('Invalid XML response: Missing GetDataResponse element');
    }

    const status = response.ResponseStatus || 'Error';
    const records = extractRecords(response.Records);

    // Extract top-level error code and message (Cloud 9 API returns these for errors like rate limiting)
    const errorCode = response.ErrorCode ? parseInt(response.ErrorCode, 10) : undefined;
    const topLevelErrorMessage = response.ErrorMessage;

    // Check for error in first record as fallback
    const recordErrorMessage = extractErrorMessage(records);
    const errorMessage = topLevelErrorMessage || recordErrorMessage;

    return {
      status: status as 'Success' | 'Error',
      records,
      errorCode,
      errorMessage,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse XML response: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Extracts records from the parsed XML
 */
function extractRecords(recordsElement: any): any[] {
  if (!recordsElement) {
    return [];
  }

  // Handle case where Records contains a single Record
  if (recordsElement.Record) {
    // If Record is an array, return it
    if (Array.isArray(recordsElement.Record)) {
      return recordsElement.Record;
    }
    // If Record is a single object, wrap it in an array
    return [recordsElement.Record];
  }

  return [];
}

/**
 * Extracts error message from records if present
 */
function extractErrorMessage(records: any[]): string | undefined {
  if (records.length === 0) {
    return undefined;
  }

  const firstRecord = records[0];

  // Check for Result field with error message
  if (firstRecord.Result && typeof firstRecord.Result === 'string') {
    if (
      firstRecord.Result.startsWith('Error:') ||
      firstRecord.Result.includes('error') ||
      firstRecord.Result.includes('failed')
    ) {
      return firstRecord.Result;
    }
  }

  return undefined;
}

/**
 * Helper function to extract PatientGUID from SetPatient response
 * Response format: "Patient Added: D933D128-E516-40D5-91E5-D8D6B568E347"
 */
export function extractPatientGuidFromResponse(
  response: Cloud9Response
): string | null {
  if (response.records.length === 0) {
    return null;
  }

  const result = response.records[0].Result;
  if (typeof result === 'string' && result.startsWith('Patient Added:')) {
    const guid = result.replace('Patient Added:', '').trim();
    return guid;
  }

  return null;
}

/**
 * Helper function to check if response is a success message
 */
export function isSuccessResponse(response: Cloud9Response): boolean {
  if (response.status === 'Error' || response.errorMessage) {
    return false;
  }

  if (response.records.length === 0) {
    return false;
  }

  const firstRecord = response.records[0];
  if (firstRecord.Result) {
    const result = firstRecord.Result as string;
    return (
      result.includes('successfully') ||
      result.includes('Added') ||
      result.includes('Updated')
    );
  }

  return true;
}

/**
 * Helper function to normalize field names (convert to camelCase)
 */
export function normalizeFieldNames(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(normalizeFieldNames);
  }

  if (obj !== null && typeof obj === 'object') {
    const normalized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Convert PascalCase to camelCase
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      normalized[camelKey] = normalizeFieldNames(value);
    }

    return normalized;
  }

  return obj;
}

/**
 * Type guard to check if response has error
 */
export function hasError(response: Cloud9Response): boolean {
  return !!(
    response.status === 'Error' ||
    response.errorMessage ||
    (response.records.length > 0 &&
      response.records[0].Result &&
      (response.records[0].Result as string).startsWith('Error:'))
  );
}

/**
 * Get error message from response
 */
export function getErrorMessage(response: Cloud9Response): string {
  if (response.errorMessage) {
    return response.errorMessage;
  }

  if (
    response.records.length > 0 &&
    response.records[0].Result &&
    (response.records[0].Result as string).startsWith('Error:')
  ) {
    return response.records[0].Result;
  }

  return 'Unknown error occurred';
}
