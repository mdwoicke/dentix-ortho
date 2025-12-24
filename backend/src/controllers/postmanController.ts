import { Request, Response } from 'express';
import { Environment, isValidEnvironment } from '../config/cloud9';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { generateCurlCommand } from '../services/postman/postmanGenerator';
import logger from '../utils/logger';

/**
 * cURL Generator Controller
 * Handles endpoints for generating cURL commands
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
 * List of valid Cloud 9 procedures
 */
const VALID_PROCEDURES = [
  'GetLocations',
  'GetChairSchedules',
  'GetAppointmentTypes',
  'GetLocationInfo',
  'GetPortalPatientLookup',
  'GetPatientList',
  'GetPatientInformation',
  'SetPatient',
  'SetPatientDemographicInfo',
  'GetAppointmentListByPatient',
  'GetAvailableAppts',
  'GetOnlineReservations',
  'SetAppointment',
  'SetAppointmentStatusConfirmed',
  'SetAppointmentStatusCanceled',
];

/**
 * Validate procedure name
 */
function isValidProcedure(procedure: string): boolean {
  return VALID_PROCEDURES.includes(procedure);
}

/**
 * POST /api/postman/generate
 * Generate a cURL command from Cloud 9 API parameters
 *
 * Request Body:
 * {
 *   procedure: string,     // Cloud 9 procedure name (e.g., "GetPortalPatientLookup")
 *   parameters: object     // Procedure-specific parameters
 * }
 *
 * Response:
 * {
 *   status: "success",
 *   data: {
 *     curlCommand: string,  // cURL command string
 *     procedure: string,
 *     environment: string
 *   }
 * }
 */
export const generate = asyncHandler(async (req: Request, res: Response) => {
  const { procedure, parameters } = req.body;
  const environment = getEnvironment(req);

  // Validate procedure
  if (!procedure || typeof procedure !== 'string') {
    throw new AppError('Procedure is required and must be a string', 400);
  }

  if (!isValidProcedure(procedure)) {
    throw new AppError(
      `Invalid procedure: ${procedure}. Must be one of: ${VALID_PROCEDURES.join(', ')}`,
      400
    );
  }

  // Validate parameters (should be an object, can be empty)
  if (parameters !== undefined && typeof parameters !== 'object') {
    throw new AppError('Parameters must be an object', 400);
  }

  // Generate cURL command
  logger.info(`Generating cURL command for procedure: ${procedure}, environment: ${environment}`);

  try {
    const curlCommand = generateCurlCommand(
      procedure,
      parameters || {},
      environment
    );

    res.json({
      status: 'success',
      data: {
        curlCommand,
        procedure,
        environment,
      },
    });
  } catch (error) {
    logger.error('Error generating cURL command:', error);
    throw new AppError('Failed to generate cURL command', 500);
  }
});
