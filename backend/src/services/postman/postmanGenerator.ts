/**
 * cURL Generator Service
 * Converts Cloud 9 XML requests into cURL commands
 */

import { getCredentials, getEndpoint, type Environment } from '../../config/cloud9';
import { buildXmlRequest } from '../cloud9/xmlBuilder';

/**
 * Escape single quotes in string for shell
 */
function escapeForShell(str: string): string {
  return str.replace(/'/g, "'\\''");
}

/**
 * Generate cURL command from Cloud 9 API parameters
 *
 * @param procedure - Cloud 9 procedure name (e.g., "GetPortalPatientLookup")
 * @param parameters - Procedure-specific parameters
 * @param environment - Environment ("sandbox" or "production")
 * @returns cURL command string
 */
export function generateCurlCommand(
  procedure: string,
  parameters: Record<string, any>,
  environment: Environment
): string {
  // Get credentials and endpoint for the environment
  const credentials = getCredentials(environment);
  const endpoint = getEndpoint(environment);

  // Generate XML request body using existing xmlBuilder
  const xmlBody = buildXmlRequest({
    procedure,
    parameters,
    credentials,
  });

  // Escape XML for shell
  const escapedXml = escapeForShell(xmlBody);

  // Build cURL command
  const curlCommand = `curl -X GET '${endpoint}' \\
  -H 'Content-Type: application/xml' \\
  --data-raw '${escapedXml}'`;

  return curlCommand;
}
