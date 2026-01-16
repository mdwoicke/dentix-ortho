/**
 * Skills Runner Controller
 * Handles API requests for skill execution and SSH management
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { sshService } from '../services/sshService';
import { skillsRegistry } from '../services/skillsRegistry';
import { getClaudeSkillService } from '../services/claudeSkillService';
import { ptyService } from '../services/ptyService';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const ExecuteSkillSchema = z.object({
  skillId: z.string().min(1, 'Skill ID is required'),
  targetId: z.string().min(1, 'Target ID is required'),
  inputs: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().default({})
});

const SSHTargetSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required'),
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().min(0).max(65535).default(22),
  username: z.string().min(1, 'Username is required'),
  authType: z.enum(['key', 'password', 'local']),
  privateKeyPath: z.string().optional(),
  password: z.string().optional(),
  workDir: z.string().optional()
});

// =============================================================================
// SKILLS ENDPOINTS
// =============================================================================

/**
 * GET /api/skills-runner/skills
 * List all available skills
 */
export async function getSkills(_req: Request, res: Response): Promise<void> {
  try {
    const skills = skillsRegistry.getSkills();
    res.json({
      success: true,
      data: skills
    });
  } catch (error) {
    console.error('Error getting skills:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get skills'
    });
  }
}

/**
 * GET /api/skills-runner/skills/by-category
 * Get skills grouped by category
 */
export async function getSkillsByCategory(_req: Request, res: Response): Promise<void> {
  try {
    const skillsByCategory = skillsRegistry.getSkillsByCategory();
    res.json({
      success: true,
      data: skillsByCategory
    });
  } catch (error) {
    console.error('Error getting skills by category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get skills by category'
    });
  }
}

/**
 * GET /api/skills-runner/skills/:skillId
 * Get a specific skill
 */
export async function getSkill(req: Request, res: Response): Promise<void> {
  try {
    const { skillId } = req.params;
    const skill = skillsRegistry.getSkill(skillId);

    if (!skill) {
      res.status(404).json({
        success: false,
        error: `Skill not found: ${skillId}`
      });
      return;
    }

    res.json({
      success: true,
      data: skill
    });
  } catch (error) {
    console.error('Error getting skill:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get skill'
    });
  }
}

// =============================================================================
// EXECUTION ENDPOINTS
// =============================================================================

/**
 * POST /api/skills-runner/execute
 * Execute a skill via SSH
 */
export async function executeSkill(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const parseResult = ExecuteSkillSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parseResult.error.errors
      });
      return;
    }

    const { skillId, targetId, inputs } = parseResult.data;

    // Get skill
    const skill = skillsRegistry.getSkill(skillId);
    if (!skill) {
      res.status(404).json({
        success: false,
        error: `Skill not found: ${skillId}`
      });
      return;
    }

    // Validate inputs
    const validation = skillsRegistry.validateInputs(skill, inputs);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: 'Invalid inputs',
        details: validation.errors
      });
      return;
    }

    // Check if this is a Claude skill file execution (API mode)
    if ((skill as any).skillType === 'claude-skill-file') {
      // Execute via Claude Skill Service
      const claudeSkillService = getClaudeSkillService();
      const { sessionId } = await claudeSkillService.executeClaudeSkill({
        skillFilePath: inputs.skillFilePath as string,
        userPrompt: inputs.userPrompt as string,
        model: inputs.model as string | undefined,
      });

      res.json({
        success: true,
        data: {
          sessionId,
          skillId,
          targetId,
          skillType: 'claude-skill-file'
        }
      });
      return;
    }

    // Check if this is a PTY-based skill file execution (subscription mode)
    if ((skill as any).skillType === 'pty-skill-file') {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Get project root (same logic as claudeSkillService)
      const projectRoot = process.env.PROJECT_ROOT ||
        process.cwd().replace(/[\\/]backend$/, '');

      // Get work directory from target config (for PTY execution directory)
      const target = sshService.getTargetsConfig().targets.find(t => t.id === targetId);
      const workDir = target?.workDir || projectRoot;

      // Read skill file content - resolve from project root
      const skillFilePath = inputs.skillFilePath as string;
      const fullPath = path.resolve(projectRoot, skillFilePath);

      let systemPrompt: string;
      try {
        systemPrompt = await fs.readFile(fullPath, 'utf-8');
      } catch (error) {
        res.status(400).json({
          success: false,
          error: `Failed to read skill file: ${skillFilePath}`,
          details: (error as Error).message
        });
        return;
      }

      // Escape the system prompt for shell (replace single quotes)
      const escapedSystemPrompt = systemPrompt.replace(/'/g, "'\\''");
      const userPrompt = (inputs.userPrompt as string).replace(/'/g, "'\\''");

      // Build command: claude with system prompt and user prompt
      const command = `claude --system-prompt $'${escapedSystemPrompt.replace(/\n/g, '\\n')}' -p $'${userPrompt.replace(/\n/g, '\\n')}'`;

      // Execute via PTY with options
      const { sessionId } = await ptyService.execute(command, {
        workDir,
        stripAnsi: true,
        autoExit: true,
        autoExitDelay: 3000, // Longer delay for skill files
      });

      res.json({
        success: true,
        data: {
          sessionId,
          skillId,
          targetId,
          skillType: 'pty-skill-file',
          skillFile: skillFilePath
        }
      });
      return;
    }

    // Check if this is a PTY-based execution (for interactive CLI like Claude plugins)
    if ((skill as any).skillType === 'pty') {
      // Build command
      const command = skillsRegistry.buildCommand(skill, inputs, targetId);

      // Get work directory from target config
      const target = sshService.getTargetsConfig().targets.find(t => t.id === targetId);
      const workDir = target?.workDir;

      // Execute via PTY with options
      const { sessionId } = await ptyService.execute(command, {
        workDir,
        stripAnsi: true,
        autoExit: true,
        autoExitDelay: 2000,
      });

      res.json({
        success: true,
        data: {
          sessionId,
          skillId,
          targetId,
          skillType: 'pty',
          command
        }
      });
      return;
    }

    // Build command for shell execution
    const command = skillsRegistry.buildCommand(skill, inputs, targetId);

    // Execute via SSH
    const { sessionId } = await sshService.execute(targetId, command);

    res.json({
      success: true,
      data: {
        sessionId,
        skillId,
        targetId,
        command
      }
    });
  } catch (error) {
    console.error('Error executing skill:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to execute skill'
    });
  }
}

/**
 * GET /api/skills-runner/sessions/:sessionId/stream
 * SSE stream for session output
 */
export async function streamSession(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Try SSH service first
  let sessionData = sshService.getSessionData(sessionId);
  let sessionSource: 'ssh' | 'claude-skill' | 'pty' = 'ssh';

  // If not found in SSH service, try PTY service
  if (!sessionData) {
    const ptySessionData = ptyService.getSessionData(sessionId);
    if (ptySessionData) {
      sessionSource = 'pty';
      sessionData = ptySessionData;
    }
  }

  // If not found in PTY service, try Claude skill service
  if (!sessionData) {
    const claudeSkillService = getClaudeSkillService();
    const claudeSession = claudeSkillService.getSession(sessionId);

    if (claudeSession) {
      sessionSource = 'claude-skill';
      // Create compatible session data structure
      sessionData = {
        session: {
          id: claudeSession.sessionId,
          targetId: 'claude-skill',  // Placeholder for compatibility
          command: 'claude-skill-execution',  // Placeholder for compatibility
          status: claudeSession.status,
          startedAt: new Date(claudeSession.startTime),
          exitCode: claudeSession.status === 'completed' ? 0 : claudeSession.status === 'failed' ? 1 : undefined
        },
        emitter: claudeSession.emitter,
        outputBuffer: claudeSession.output,
        isComplete: claudeSession.status !== 'running'
      };
    }
  }

  if (!sessionData) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Session not found or already ended' })}\n\n`);
    res.end();
    return;
  }

  const { session, emitter, outputBuffer, isComplete } = sessionData;

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId, source: sessionSource })}\n\n`);

  // Replay buffered output for late-connecting clients
  for (const data of outputBuffer) {
    res.write(`data: ${JSON.stringify({ type: 'data', content: data })}\n\n`);
  }

  // If session already completed, send end event and close
  if (isComplete) {
    res.write(`data: ${JSON.stringify({ type: 'status', status: session.status, exitCode: session.exitCode })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'end', exitCode: session.exitCode })}\n\n`);
    res.end();
    return;
  }

  // Forward future events to SSE
  const onData = (data: string) => {
    res.write(`data: ${JSON.stringify({ type: 'data', content: data })}\n\n`);
  };

  const onStatus = (status: { status: string; exitCode?: number; error?: string }) => {
    res.write(`data: ${JSON.stringify({ type: 'status', ...status })}\n\n`);
  };

  const onEnd = (result: { exitCode: number; error?: string }) => {
    res.write(`data: ${JSON.stringify({ type: 'end', ...result })}\n\n`);
    cleanup();
    res.end();
  };

  const cleanup = () => {
    emitter.off('data', onData);
    emitter.off('status', onStatus);
    emitter.off('end', onEnd);
  };

  emitter.on('data', onData);
  emitter.on('status', onStatus);
  emitter.on('end', onEnd);

  // Handle client disconnect
  req.on('close', () => {
    cleanup();
  });
}

/**
 * POST /api/skills-runner/sessions/:sessionId/input
 * Send input to a running session
 */
export async function sendSessionInput(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;
    const { input } = req.body;

    if (typeof input !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Input must be a string'
      });
      return;
    }

    // Try SSH service first
    let success = sshService.sendInput(sessionId, input);

    // If not found in SSH service, try PTY service
    if (!success) {
      success = ptyService.sendInput(sessionId, input);
    }

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Session not found or not accepting input'
      });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error sending input:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send input'
    });
  }
}

/**
 * DELETE /api/skills-runner/sessions/:sessionId
 * Kill a running session
 */
export async function killSession(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;

    // Try SSH service first
    let success = sshService.killSession(sessionId);

    // If not found in SSH service, try PTY service
    if (!success) {
      success = ptyService.killSession(sessionId);
    }

    // If not found in PTY service, try Claude skill service
    if (!success) {
      const claudeSkillService = getClaudeSkillService();
      success = claudeSkillService.killSession(sessionId);
    }

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error killing session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to kill session'
    });
  }
}

/**
 * GET /api/skills-runner/sessions
 * Get all active sessions
 */
export async function getActiveSessions(_req: Request, res: Response): Promise<void> {
  try {
    const sessions = sshService.getActiveSessions();
    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sessions'
    });
  }
}

// =============================================================================
// SSH CONFIG ENDPOINTS
// =============================================================================

/**
 * GET /api/skills-runner/ssh-targets
 * Get all SSH targets (masked)
 */
export async function getSSHTargets(_req: Request, res: Response): Promise<void> {
  try {
    const config = sshService.getTargetsConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error getting SSH targets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get SSH targets'
    });
  }
}

/**
 * POST /api/skills-runner/ssh-targets
 * Add or update an SSH target
 */
export async function saveSSHTarget(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = SSHTargetSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid target configuration',
        details: parseResult.error.errors
      });
      return;
    }

    sshService.saveTarget(parseResult.data);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving SSH target:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save SSH target'
    });
  }
}

/**
 * DELETE /api/skills-runner/ssh-targets/:targetId
 * Delete an SSH target
 */
export async function deleteSSHTarget(req: Request, res: Response): Promise<void> {
  try {
    const { targetId } = req.params;
    const success = sshService.deleteTarget(targetId);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Target not found'
      });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting SSH target:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete SSH target'
    });
  }
}

/**
 * POST /api/skills-runner/ssh-targets/:targetId/set-default
 * Set the default SSH target
 */
export async function setDefaultSSHTarget(req: Request, res: Response): Promise<void> {
  try {
    const { targetId } = req.params;
    sshService.setDefaultTarget(targetId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting default target:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set default target'
    });
  }
}

/**
 * POST /api/skills-runner/ssh-targets/:targetId/test
 * Test SSH connection to a target
 */
export async function testSSHConnection(req: Request, res: Response): Promise<void> {
  try {
    const { targetId } = req.params;
    const result = await sshService.testConnection(targetId);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error testing SSH connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test connection'
    });
  }
}

// =============================================================================
// CLAUDE SKILL FILE ENDPOINTS
// =============================================================================

/**
 * GET /api/skills-runner/skill-files
 * List available Claude skill .MD files
 */
export async function getSkillFiles(_req: Request, res: Response): Promise<void> {
  try {
    const claudeSkillService = getClaudeSkillService();
    const skillFiles = claudeSkillService.getSkillFiles();

    res.json({
      success: true,
      data: skillFiles
    });
  } catch (error) {
    console.error('Error getting skill files:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get skill files'
    });
  }
}

/**
 * GET /api/skills-runner/skill-files/:filePath(*)
 * Get full content of a skill file
 */
export async function getSkillFileContent(req: Request, res: Response): Promise<void> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const filePath = req.params.filePath || req.params[0];

    if (!filePath) {
      res.status(400).json({
        success: false,
        error: 'File path is required'
      });
      return;
    }

    const claudeSkillService = getClaudeSkillService();
    const projectRoot = claudeSkillService.getProjectRoot();

    // Resolve full path
    const fullPath = path.resolve(projectRoot, filePath);

    // Security: Ensure path is within skills directory
    const skillsDir = path.resolve(projectRoot, '.claude', 'skills');
    if (!fullPath.startsWith(skillsDir)) {
      res.status(403).json({
        success: false,
        error: 'Access denied: Path must be within .claude/skills directory'
      });
      return;
    }

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      res.status(404).json({
        success: false,
        error: `File not found: ${filePath}`
      });
      return;
    }

    // Read file content and stats
    const [content, stats] = await Promise.all([
      fs.readFile(fullPath, 'utf-8'),
      fs.stat(fullPath)
    ]);

    res.json({
      success: true,
      data: {
        path: filePath,
        content,
        lastModified: stats.mtime.toISOString(),
        size: stats.size
      }
    });
  } catch (error) {
    console.error('Error getting skill file content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to read skill file'
    });
  }
}

/**
 * PUT /api/skills-runner/skill-files/:filePath(*)
 * Save edited skill file content
 */
export async function saveSkillFileContent(req: Request, res: Response): Promise<void> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const filePath = req.params.filePath || req.params[0];
    const { content } = req.body;

    if (!filePath) {
      res.status(400).json({
        success: false,
        error: 'File path is required'
      });
      return;
    }

    if (typeof content !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Content must be a string'
      });
      return;
    }

    const claudeSkillService = getClaudeSkillService();
    const projectRoot = claudeSkillService.getProjectRoot();

    // Resolve full path
    const fullPath = path.resolve(projectRoot, filePath);

    // Security: Ensure path is within skills directory
    const skillsDir = path.resolve(projectRoot, '.claude', 'skills');
    if (!fullPath.startsWith(skillsDir)) {
      res.status(403).json({
        success: false,
        error: 'Access denied: Path must be within .claude/skills directory'
      });
      return;
    }

    // Validate content (basic YAML frontmatter check for .md files)
    if (fullPath.endsWith('.md') && !content.trimStart().startsWith('---')) {
      res.status(400).json({
        success: false,
        error: 'Skill file must start with YAML frontmatter (---)'
      });
      return;
    }

    // Write file
    await fs.writeFile(fullPath, content, 'utf-8');

    res.json({
      success: true,
      data: {
        path: filePath,
        savedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error saving skill file content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save skill file'
    });
  }
}

// =============================================================================
// PLUGIN COMMANDS ENDPOINTS
// =============================================================================

/**
 * GET /api/skills-runner/plugin-commands
 * List available Claude plugin commands (built-in + installed plugins)
 */
export async function getPluginCommands(_req: Request, res: Response): Promise<void> {
  try {
    const { getAllAvailableCommands } = await import('../services/pluginParser');
    const commands = getAllAvailableCommands();

    res.json({
      success: true,
      data: commands
    });
  } catch (error) {
    console.error('Error getting plugin commands:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get plugin commands'
    });
  }
}

/**
 * GET /api/skills-runner/plugin-commands/by-plugin
 * Get plugin commands grouped by plugin name
 */
export async function getPluginCommandsByPlugin(_req: Request, res: Response): Promise<void> {
  try {
    const { getCommandsByPlugin } = await import('../services/pluginParser');
    const commandsByPlugin = getCommandsByPlugin();

    res.json({
      success: true,
      data: commandsByPlugin
    });
  } catch (error) {
    console.error('Error getting plugin commands by plugin:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get plugin commands'
    });
  }
}
