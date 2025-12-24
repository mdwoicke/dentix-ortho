import dotenv from 'dotenv';
import { Cloud9Credentials } from '../services/cloud9/xmlBuilder';

dotenv.config();

/**
 * Cloud 9 API Environment Configuration
 */

export type Environment = 'sandbox' | 'production';

export interface Cloud9Config {
  endpoint: string;
  credentials: Cloud9Credentials;
}

/**
 * Sandbox (Test) Configuration
 */
export const SANDBOX_CONFIG: Cloud9Config = {
  endpoint:
    process.env.CLOUD9_SANDBOX_ENDPOINT ||
    'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
  credentials: {
    clientId:
      process.env.CLOUD9_SANDBOX_CLIENT_ID ||
      'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: process.env.CLOUD9_SANDBOX_USERNAME || 'IntelepeerTest',
    password: process.env.CLOUD9_SANDBOX_PASSWORD || '#!InteleP33rTest!#',
  },
};

/**
 * Production Configuration
 */
export const PRODUCTION_CONFIG: Cloud9Config = {
  endpoint:
    process.env.CLOUD9_PRODUCTION_ENDPOINT ||
    'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
  credentials: {
    clientId:
      process.env.CLOUD9_PRODUCTION_CLIENT_ID ||
      'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: process.env.CLOUD9_PRODUCTION_USERNAME || 'Intelepeer',
    password: process.env.CLOUD9_PRODUCTION_PASSWORD || '$#1Nt-p33R-AwS#$',
  },
};

/**
 * Get configuration for a specific environment
 */
export function getCloud9Config(environment: Environment): Cloud9Config {
  switch (environment) {
    case 'sandbox':
      return SANDBOX_CONFIG;
    case 'production':
      return PRODUCTION_CONFIG;
    default:
      throw new Error(`Invalid environment: ${environment}`);
  }
}

/**
 * Get credentials for a specific environment
 */
export function getCredentials(environment: Environment): Cloud9Credentials {
  return getCloud9Config(environment).credentials;
}

/**
 * Get endpoint URL for a specific environment
 */
export function getEndpoint(environment: Environment): string {
  return getCloud9Config(environment).endpoint;
}

/**
 * Validate environment parameter
 */
export function isValidEnvironment(env: string): env is Environment {
  return env === 'sandbox' || env === 'production';
}

/**
 * Get default environment from .env or fallback to 'sandbox'
 */
export function getDefaultEnvironment(): Environment {
  const defaultEnv = process.env.DEFAULT_ENVIRONMENT || 'sandbox';
  return isValidEnvironment(defaultEnv) ? defaultEnv : 'sandbox';
}

/**
 * Check if caching is enabled via environment variable
 * @returns true if ENABLE_CACHING is 'true', false otherwise (default: false)
 */
export function isCachingEnabled(): boolean {
  return process.env.ENABLE_CACHING === 'true';
}
