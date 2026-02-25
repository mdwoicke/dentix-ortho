import BetterSqlite3 from 'better-sqlite3';

export interface ToolNames {
  patientTool: string;       // Primary patient tool name
  schedulingTool: string;    // Primary scheduling tool name
  escalationTool: string;    // Primary escalation tool name
  dateTimeTool: string;      // Primary datetime tool name
  patientTools: string[];    // All patient tool variants (for SQL IN queries)
  schedulingTools: string[]; // All scheduling tool variants
  escalationTools: string[]; // All escalation tool variants
  dateTimeTools: string[];   // All datetime tool variants
  all: string[];             // Union of all tool name variants
}

const TENANT_TOOL_NAMES: Record<number, ToolNames> = {
  1: { // Ortho (Cloud9)
    patientTool: 'chord_ortho_patient',
    schedulingTool: 'schedule_appointment_ortho',
    escalationTool: 'chord_handleEscalation',
    dateTimeTool: 'current_date_time',
    patientTools: ['chord_ortho_patient'],
    schedulingTools: ['schedule_appointment_ortho'],
    escalationTools: ['chord_handleEscalation'],
    dateTimeTools: ['current_date_time'],
    all: ['chord_ortho_patient', 'schedule_appointment_ortho', 'chord_handleEscalation', 'current_date_time'],
  },
  5: { // Chord (NexHealth) — includes all observed tool name variants across Langfuse configs
    patientTool: 'chord_patient_v07_stage',
    schedulingTool: 'chord_scheduling_v08',
    escalationTool: 'chord_OGHandleEscalation',
    dateTimeTool: 'CurrentDateTime',
    patientTools: ['chord_patient_v07_stage'],
    schedulingTools: ['chord_scheduling_v08', 'chord_scheduling_v07_dev'],
    escalationTools: ['chord_OGHandleEscalation', 'chord_handleEscalation'],
    dateTimeTools: ['CurrentDateTime', 'current_date_time'],
    all: [
      'chord_patient_v07_stage',
      'chord_scheduling_v08', 'chord_scheduling_v07_dev',
      'chord_OGHandleEscalation', 'chord_handleEscalation',
      'CurrentDateTime', 'current_date_time',
    ],
  },
};

const configTenantCache = new Map<number, number>();

export function getToolNamesForConfig(db: BetterSqlite3.Database, configId: number): ToolNames {
  if (!configTenantCache.has(configId)) {
    const row = db.prepare('SELECT tenant_id FROM langfuse_configs WHERE id = ?').get(configId) as any;
    configTenantCache.set(configId, row?.tenant_id || 1);
  }
  const tenantId = configTenantCache.get(configId)!;
  return TENANT_TOOL_NAMES[tenantId] || TENANT_TOOL_NAMES[1];
}

export function getDefaultToolNames(): ToolNames {
  return TENANT_TOOL_NAMES[1];
}

/** Returns the union of all tool names across all tenants (for queries without a specific configId) */
export function getAllKnownToolNames(): string[] {
  const all = new Set<string>();
  for (const names of Object.values(TENANT_TOOL_NAMES)) {
    names.all.forEach(n => all.add(n));
  }
  return Array.from(all);
}

/** Build a SQL-safe IN list like "'name1', 'name2'" from an array of tool names */
export function sqlInList(names: string[]): string {
  return names.map(n => `'${n}'`).join(', ');
}
