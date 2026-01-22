import dotenv from 'dotenv';

dotenv.config();

/**
 * Node-RED Admin API Configuration
 *
 * Used to deploy flow updates to the production Node-RED instance
 */

export interface NodeRedConfig {
  adminUrl: string;
  username: string;
  password: string;
}

/**
 * Production Node-RED Configuration
 */
export const NODERED_CONFIG: NodeRedConfig = {
  adminUrl:
    process.env.NODERED_ADMIN_URL ||
    'https://c1-aicoe-nodered-lb.prod.c1conversations.io:1880',
  username: process.env.NODERED_ADMIN_USER || 'workflowapi',
  password: process.env.NODERED_ADMIN_PASSWORD || 'e^@V95&6sAJReTsb5!iq39mIC4HYIV',
};

/**
 * Get Node-RED configuration
 */
export function getNodeRedConfig(): NodeRedConfig {
  return NODERED_CONFIG;
}

/**
 * Generate Basic Auth header for Node-RED Admin API
 */
export function getNodeRedAuthHeader(): string {
  const credentials = `${NODERED_CONFIG.username}:${NODERED_CONFIG.password}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

/**
 * Check if Node-RED is configured
 */
export function isNodeRedConfigured(): boolean {
  return !!(NODERED_CONFIG.adminUrl && NODERED_CONFIG.username && NODERED_CONFIG.password);
}
