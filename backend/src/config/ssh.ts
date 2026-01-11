/**
 * SSH Configuration
 * Manages SSH target configurations for the Skills Runner
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SSHTarget {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'key' | 'password' | 'local';
  privateKeyPath?: string;
  password?: string;
  workDir?: string;
}

export interface SSHTargetsConfig {
  targets: SSHTarget[];
  defaultTarget: string;
}

const CONFIG_PATH = path.join(__dirname, '../../config/ssh-targets.json');

/**
 * Load SSH targets from config file
 */
export function loadSSHTargets(): SSHTargetsConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      // Return default config if file doesn't exist
      return {
        targets: [],
        defaultTarget: ''
      };
    }

    const configContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(configContent) as SSHTargetsConfig;
  } catch (error) {
    console.error('Error loading SSH targets config:', error);
    return {
      targets: [],
      defaultTarget: ''
    };
  }
}

/**
 * Save SSH targets to config file
 */
export function saveSSHTargets(config: SSHTargetsConfig): void {
  try {
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving SSH targets config:', error);
    throw error;
  }
}

/**
 * Get a specific SSH target by ID
 */
export function getSSHTarget(targetId: string): SSHTarget | undefined {
  const config = loadSSHTargets();
  return config.targets.find(t => t.id === targetId);
}

/**
 * Get the default SSH target
 */
export function getDefaultSSHTarget(): SSHTarget | undefined {
  const config = loadSSHTargets();
  return config.targets.find(t => t.id === config.defaultTarget);
}

/**
 * Expand home directory in path (~ to actual home path)
 */
export function expandHomePath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

/**
 * Get SSH connection config for ssh2 library
 */
export function getSSH2Config(target: SSHTarget): {
  host: string;
  port: number;
  username: string;
  privateKey?: Buffer;
  password?: string;
  readyTimeout?: number;
  keepaliveInterval?: number;
} {
  const config: ReturnType<typeof getSSH2Config> = {
    host: target.host,
    port: target.port,
    username: target.username,
    readyTimeout: 30000,
    keepaliveInterval: 10000
  };

  if (target.authType === 'key' && target.privateKeyPath) {
    const keyPath = expandHomePath(target.privateKeyPath);
    if (fs.existsSync(keyPath)) {
      config.privateKey = fs.readFileSync(keyPath);
    } else {
      throw new Error(`SSH private key not found: ${keyPath}`);
    }
  } else if (target.authType === 'password' && target.password) {
    config.password = target.password;
  }

  return config;
}

/**
 * Mask sensitive data for display (passwords, keys)
 */
export function maskSSHTarget(target: SSHTarget): SSHTarget {
  return {
    ...target,
    password: target.password ? '********' : undefined,
    privateKeyPath: target.privateKeyPath // Keep path visible, but not content
  };
}
