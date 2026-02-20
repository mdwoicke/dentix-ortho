/**
 * Prompt Versions Skill
 *
 * Shows current prompt/tool file versions.
 * Handles queries like:
 *   "show prompt versions"
 *   "current versions"
 *   "prompt status"
 *   "what version"
 */

import type { SkillEntry, SkillResult } from '../dominos/types';
import { getPromptFiles } from '../../services/api/testMonitorApi';

async function execute(_query: string): Promise<SkillResult> {
  try {
    const files = await getPromptFiles();

    if (files.length === 0) {
      return {
        success: true,
        markdown: '## Prompt Versions\n\nNo prompt files found.',
        data: [],
      };
    }

    const lines: string[] = [];
    lines.push('## Prompt Versions\n');
    lines.push('| File | Version | Last Updated |');
    lines.push('|------|---------|-------------|');

    for (const f of files) {
      const updated = f.updatedAt ? new Date(f.updatedAt).toLocaleString() : '-';
      lines.push(`| ${f.displayName || f.fileKey} | v${f.version} | ${updated} |`);
    }

    return { success: true, markdown: lines.join('\n'), data: files };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Prompt Versions Failed\n\nCould not fetch prompt versions: ${msg}`,
    };
  }
}

export const promptVersionsSkill: SkillEntry = {
  id: 'prompt-versions',
  label: 'Prompt Versions',
  category: 'nodered',
  sampleQuery: 'Show prompt versions',
  triggers: [
    /(?:show|list|get)\s+(?:the\s+)?prompt\s+versions?/i,
    /(?:current|latest)\s+versions?/i,
    /prompt\s+(?:status|versions?)/i,
    /what\s+version/i,
    /version\s+(?:status|info|check)/i,
  ],
  execute,
};
