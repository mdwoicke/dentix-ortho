/**
 * Skills Runner Routes
 * /api/skills-runner/*
 *
 * Provides endpoints for skill execution via SSH
 */

import { Router } from 'express';
import * as skillsRunnerController from '../controllers/skillsRunnerController';

const router = Router();

// =============================================================================
// SKILLS ROUTES
// =============================================================================

// GET /api/skills-runner/skills - List all skills
router.get('/skills', skillsRunnerController.getSkills);

// GET /api/skills-runner/skills/by-category - Get skills grouped by category
router.get('/skills/by-category', skillsRunnerController.getSkillsByCategory);

// GET /api/skills-runner/skills/:skillId - Get a specific skill
router.get('/skills/:skillId', skillsRunnerController.getSkill);

// =============================================================================
// CLAUDE SKILL FILES ROUTES
// =============================================================================

// GET /api/skills-runner/skill-files - List available Claude skill .MD files
router.get('/skill-files', skillsRunnerController.getSkillFiles);

// =============================================================================
// PLUGIN COMMANDS ROUTES
// =============================================================================

// GET /api/skills-runner/plugin-commands - List available plugin commands
router.get('/plugin-commands', skillsRunnerController.getPluginCommands);

// GET /api/skills-runner/plugin-commands/by-plugin - Get commands grouped by plugin
router.get('/plugin-commands/by-plugin', skillsRunnerController.getPluginCommandsByPlugin);

// =============================================================================
// EXECUTION ROUTES
// =============================================================================

// POST /api/skills-runner/execute - Execute a skill via SSH or LLM Provider
router.post('/execute', skillsRunnerController.executeSkill);

// GET /api/skills-runner/sessions - Get all active sessions
router.get('/sessions', skillsRunnerController.getActiveSessions);

// GET /api/skills-runner/sessions/:sessionId/stream - SSE stream for session output
router.get('/sessions/:sessionId/stream', skillsRunnerController.streamSession);

// POST /api/skills-runner/sessions/:sessionId/input - Send input to a session
router.post('/sessions/:sessionId/input', skillsRunnerController.sendSessionInput);

// DELETE /api/skills-runner/sessions/:sessionId - Kill a session
router.delete('/sessions/:sessionId', skillsRunnerController.killSession);

// =============================================================================
// SSH CONFIG ROUTES
// =============================================================================

// GET /api/skills-runner/ssh-targets - Get all SSH targets
router.get('/ssh-targets', skillsRunnerController.getSSHTargets);

// POST /api/skills-runner/ssh-targets - Add or update an SSH target
router.post('/ssh-targets', skillsRunnerController.saveSSHTarget);

// DELETE /api/skills-runner/ssh-targets/:targetId - Delete an SSH target
router.delete('/ssh-targets/:targetId', skillsRunnerController.deleteSSHTarget);

// POST /api/skills-runner/ssh-targets/:targetId/set-default - Set default target
router.post('/ssh-targets/:targetId/set-default', skillsRunnerController.setDefaultSSHTarget);

// POST /api/skills-runner/ssh-targets/:targetId/test - Test SSH connection
router.post('/ssh-targets/:targetId/test', skillsRunnerController.testSSHConnection);

export default router;
