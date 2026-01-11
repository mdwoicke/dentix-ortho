/**
 * Skills Runner API Service
 * API client for skills execution and SSH management
 */

import axios from 'axios';
import { API_CONFIG } from '../../utils/constants';

const api = axios.create({
  baseURL: `${API_CONFIG.BASE_URL}/skills-runner`,
  timeout: API_CONFIG.TIMEOUT
});

// Types
export interface SkillInput {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  required?: boolean;
  default?: string | number | boolean;
  placeholder?: string;
  description?: string;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
}

export interface Skill {
  id: string;
  name: string;
  description?: string;
  command: string;
  category: string;
  inputs: SkillInput[];
}

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

export interface SSHSession {
  id: string;
  targetId: string;
  command: string;
  status: 'connecting' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  error?: string;
}

export interface SkillFileInfo {
  path: string;
  name: string;
  description?: string;
}

export interface PluginCommand {
  command: string;
  fullCommand: string;
  pluginName: string;
  description?: string;
  filePath: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

// Skills API
export async function fetchSkills(): Promise<Skill[]> {
  const response = await api.get<ApiResponse<Skill[]>>('/skills');
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to fetch skills');
  }
  return response.data.data || [];
}

export async function fetchSkillsByCategory(): Promise<Record<string, Skill[]>> {
  const response = await api.get<ApiResponse<Record<string, Skill[]>>>('/skills/by-category');
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to fetch skills');
  }
  return response.data.data || {};
}

export async function fetchSkill(skillId: string): Promise<Skill> {
  const response = await api.get<ApiResponse<Skill>>(`/skills/${skillId}`);
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to fetch skill');
  }
  if (!response.data.data) {
    throw new Error('Skill not found');
  }
  return response.data.data;
}

// Execution API
export async function executeSkill(
  skillId: string,
  targetId: string,
  inputs: Record<string, string | number | boolean>
): Promise<{ sessionId: string; command: string }> {
  const response = await api.post<ApiResponse<{ sessionId: string; skillId: string; targetId: string; command: string }>>('/execute', {
    skillId,
    targetId,
    inputs
  });
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to execute skill');
  }
  if (!response.data.data) {
    throw new Error('No session data returned');
  }
  return {
    sessionId: response.data.data.sessionId,
    command: response.data.data.command
  };
}

export async function fetchActiveSessions(): Promise<SSHSession[]> {
  const response = await api.get<ApiResponse<SSHSession[]>>('/sessions');
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to fetch sessions');
  }
  return response.data.data || [];
}

export async function sendSessionInput(sessionId: string, input: string): Promise<void> {
  const response = await api.post<ApiResponse<void>>(`/sessions/${sessionId}/input`, { input });
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to send input');
  }
}

export async function killSession(sessionId: string): Promise<void> {
  const response = await api.delete<ApiResponse<void>>(`/sessions/${sessionId}`);
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to kill session');
  }
}

// SSH Targets API
export async function fetchSSHTargets(): Promise<SSHTargetsConfig> {
  const response = await api.get<ApiResponse<SSHTargetsConfig>>('/ssh-targets');
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to fetch SSH targets');
  }
  return response.data.data || { targets: [], defaultTarget: '' };
}

export async function saveSSHTarget(target: SSHTarget): Promise<void> {
  const response = await api.post<ApiResponse<void>>('/ssh-targets', target);
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to save SSH target');
  }
}

export async function deleteSSHTarget(targetId: string): Promise<void> {
  const response = await api.delete<ApiResponse<void>>(`/ssh-targets/${targetId}`);
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to delete SSH target');
  }
}

export async function setDefaultSSHTarget(targetId: string): Promise<void> {
  const response = await api.post<ApiResponse<void>>(`/ssh-targets/${targetId}/set-default`);
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to set default SSH target');
  }
}

export async function testSSHConnection(targetId: string): Promise<{ success: boolean; message: string; latency?: number }> {
  const response = await api.post<ApiResponse<{ success: boolean; message: string; latency?: number }>>(`/ssh-targets/${targetId}/test`);
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to test SSH connection');
  }
  return response.data.data || { success: false, message: 'No response' };
}

// Claude Skill Files API
export async function fetchSkillFiles(): Promise<SkillFileInfo[]> {
  const response = await api.get<ApiResponse<SkillFileInfo[]>>('/skill-files');
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to fetch skill files');
  }
  return response.data.data || [];
}

// Plugin Commands API
export async function fetchPluginCommands(): Promise<PluginCommand[]> {
  const response = await api.get<ApiResponse<PluginCommand[]>>('/plugin-commands');
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to fetch plugin commands');
  }
  return response.data.data || [];
}

export async function fetchPluginCommandsByPlugin(): Promise<Record<string, PluginCommand[]>> {
  const response = await api.get<ApiResponse<Record<string, PluginCommand[]>>>('/plugin-commands/by-plugin');
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to fetch plugin commands');
  }
  return response.data.data || {};
}

// Export all functions as a service object
export const skillsRunnerApi = {
  fetchSkills,
  fetchSkillsByCategory,
  fetchSkill,
  executeSkill,
  fetchActiveSessions,
  sendSessionInput,
  killSession,
  fetchSSHTargets,
  saveSSHTarget,
  deleteSSHTarget,
  setDefaultSSHTarget,
  testSSHConnection,
  fetchSkillFiles,
  fetchPluginCommands,
  fetchPluginCommandsByPlugin
};

export default skillsRunnerApi;
