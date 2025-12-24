/**
 * cURL Generator API Service
 * API calls for generating cURL commands
 */

import { post } from './client';

/**
 * cURL request parameters
 */
export interface GenerateCurlRequestParams {
  procedure: string;
  parameters: Record<string, any>;
}

/**
 * cURL request response from backend
 */
export interface CurlRequestResponse {
  curlCommand: string; // cURL command string
  procedure: string;
  environment: string;
}

/**
 * Generate a cURL command
 *
 * @param params - Procedure and parameters
 * @returns cURL command string ready to copy
 */
export async function generateCurlCommand(
  params: GenerateCurlRequestParams
): Promise<string> {
  const response = await post<{ data: CurlRequestResponse }>(
    '/postman/generate',
    params
  );

  // Return just the curlCommand string (unwrap from data wrapper)
  return response.data.curlCommand;
}
