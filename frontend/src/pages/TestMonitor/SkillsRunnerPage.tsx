/**
 * Skills Runner Page
 * Main page for running skills/plugins via SSH
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SkillSelector } from '../../components/features/skillsRunner/SkillSelector';
import { TerminalEmulator } from '../../components/features/skillsRunner/TerminalEmulator';
import { SSHConfigModal } from '../../components/features/skillsRunner/SSHConfigModal';
import { SkillBrowser } from '../../components/features/skillsRunner/SkillBrowser';
import { AgentReportModal } from '../../components/features/skillsRunner/AgentReportModal';
import type { Skill } from '../../components/features/skillsRunner/SkillSelector';
import type { AgentReportData } from '../../components/features/skillsRunner/TerminalEmulator';
import {
  fetchSkills,
  fetchSSHTargets,
  executeSkill,
  killSession,
  saveSSHTarget,
  deleteSSHTarget,
  setDefaultSSHTarget,
  testSSHConnection,
} from '../../services/api/skillsRunner';
import type { SSHTarget, SSHTargetsConfig } from '../../services/api/skillsRunner';

// Skills that use CLI/PTY (subscription auth) - uses terminal, no API credits
const CLI_SKILL_IDS = ['claude-plugin', 'claude-skill-runner-pty'];

// Skills that use API credits (--print mode or LLM service)
const API_SKILL_IDS = ['claude-cli-llm', 'claude-cli', 'claude-analyze-file', 'claude-skill-runner', 'claude-plugin-print'];

type AuthMode = 'cli' | 'api';
type ViewMode = 'runner' | 'browser';

export function SkillsRunnerPage() {
  // View mode toggle - Runner (execute skills) vs Browser (view/edit skill files)
  const [viewMode, setViewMode] = useState<ViewMode>('runner');

  // Auth mode toggle - CLI (subscription) vs API Credits
  const [authMode, setAuthMode] = useState<AuthMode>('cli');

  // Skills state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [inputs, setInputs] = useState<Record<string, string | number | boolean>>({});
  const [isLoadingSkills, setIsLoadingSkills] = useState(true);

  // SSH state
  const [sshConfig, setSSHConfig] = useState<SSHTargetsConfig>({ targets: [], defaultTarget: '' });
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [isSSHModalOpen, setIsSSHModalOpen] = useState(false);

  // Execution state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastExitCode, setLastExitCode] = useState<number | null>(null);

  // Agent report state
  const [agentReport, setAgentReport] = useState<AgentReportData | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Filter skills based on auth mode
  // - Non-AI skills are always shown
  // - AI skills are filtered based on whether they use CLI (subscription) or API credits
  const filteredSkills = useMemo(() => {
    return skills.filter(skill => {
      // If skill is not in either list, always show it (non-AI skills)
      const isCLISkill = CLI_SKILL_IDS.includes(skill.id);
      const isAPISkill = API_SKILL_IDS.includes(skill.id);

      if (!isCLISkill && !isAPISkill) {
        return true; // Non-AI skill, always show
      }

      // Show based on selected auth mode
      if (authMode === 'cli') {
        return isCLISkill || !isAPISkill;
      } else {
        return isAPISkill || !isCLISkill;
      }
    });
  }, [skills, authMode]);

  // Load skills on mount
  useEffect(() => {
    const loadSkills = async () => {
      try {
        setIsLoadingSkills(true);
        const skillsData = await fetchSkills();
        setSkills(skillsData);
      } catch (error) {
        console.error('Error loading skills:', error);
      } finally {
        setIsLoadingSkills(false);
      }
    };

    loadSkills();
  }, []);

  // Reset selected skill when auth mode changes if the skill is no longer available
  useEffect(() => {
    if (selectedSkill) {
      const skillStillAvailable = filteredSkills.some(s => s.id === selectedSkill.id);
      if (!skillStillAvailable) {
        setSelectedSkill(null);
        setInputs({});
      }
    }
  }, [authMode, filteredSkills, selectedSkill]);

  // Load SSH targets on mount
  useEffect(() => {
    const loadSSHTargets = async () => {
      try {
        const config = await fetchSSHTargets();
        setSSHConfig(config);
        if (config.defaultTarget) {
          setSelectedTarget(config.defaultTarget);
        } else if (config.targets.length > 0) {
          setSelectedTarget(config.targets[0].id);
        }
      } catch (error) {
        console.error('Error loading SSH targets:', error);
      }
    };

    loadSSHTargets();
  }, []);

  // Handle skill selection
  const handleSkillSelect = useCallback((skill: Skill | null) => {
    setSelectedSkill(skill);
    setInputs({});
  }, []);

  // Handle input change
  const handleInputChange = useCallback((name: string, value: string | number | boolean) => {
    setInputs(prev => ({ ...prev, [name]: value }));
  }, []);

  // Handle report ready
  const handleReportReady = useCallback((report: AgentReportData) => {
    setAgentReport(report);
  }, []);

  // Handle run
  const handleRun = async () => {
    if (!selectedSkill || !selectedTarget) return;

    try {
      setIsRunning(true);
      setLastExitCode(null);
      setAgentReport(null);
      const result = await executeSkill(selectedSkill.id, selectedTarget, inputs);
      setSessionId(result.sessionId);
    } catch (error) {
      console.error('Error executing skill:', error);
      setIsRunning(false);
    }
  };

  // Handle stop
  const handleStop = async () => {
    if (!sessionId) return;

    try {
      await killSession(sessionId);
    } catch (error) {
      console.error('Error stopping session:', error);
    }
  };

  // Handle session end
  const handleSessionEnd = useCallback((exitCode: number) => {
    setIsRunning(false);
    setLastExitCode(exitCode);
  }, []);

  // SSH Config handlers
  const handleSaveTarget = async (target: SSHTarget) => {
    await saveSSHTarget(target);
    const config = await fetchSSHTargets();
    setSSHConfig(config);
  };

  const handleDeleteTarget = async (targetId: string) => {
    await deleteSSHTarget(targetId);
    const config = await fetchSSHTargets();
    setSSHConfig(config);
    if (selectedTarget === targetId) {
      setSelectedTarget(config.defaultTarget || config.targets[0]?.id || '');
    }
  };

  const handleSetDefaultTarget = async (targetId: string) => {
    await setDefaultSSHTarget(targetId);
    const config = await fetchSSHTargets();
    setSSHConfig(config);
  };

  const handleTestConnection = async (targetId: string) => {
    return await testSSHConnection(targetId);
  };

  // Get current target info
  const currentTarget = sshConfig.targets.find(t => t.id === selectedTarget);

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Skills Runner
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {viewMode === 'runner' ? (
              <>
                Execute skills and tools via SSH
                <span className="ml-2 text-xs">
                  {authMode === 'cli' ? (
                    <span className="text-green-600 dark:text-green-400">(Using Claude Subscription)</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">(Using API Credits)</span>
                  )}
                </span>
              </>
            ) : (
              'Browse and edit skill files'
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Primary View Mode Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('runner')}
              disabled={isRunning}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'runner'
                  ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
              title="Execute skills"
            >
              Runner
            </button>
            <button
              onClick={() => setViewMode('browser')}
              disabled={isRunning}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'browser'
                  ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
              title="Browse and edit skill files"
            >
              Skill Browser
            </button>
          </div>

          {/* Divider - only show in runner mode */}
          {viewMode === 'runner' && (
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
          )}

          {/* Auth Mode Toggle - only show in runner mode */}
          {viewMode === 'runner' && (
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setAuthMode('cli')}
                disabled={isRunning}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  authMode === 'cli'
                    ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
                title="Uses Claude subscription (PTY mode)"
              >
                CLI
              </button>
              <button
                onClick={() => setAuthMode('api')}
                disabled={isRunning}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  authMode === 'api'
                    ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
                title="Uses API credits (--print mode)"
              >
                API Credits
              </button>
            </div>
          )}

          {/* Target Selector - only show in runner mode */}
          {viewMode === 'runner' && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">Target:</label>
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                disabled={isRunning}
                className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {sshConfig.targets.length === 0 ? (
                  <option value="">No targets configured</option>
                ) : (
                  sshConfig.targets.map(target => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* Connection Status - only show in runner mode */}
          {viewMode === 'runner' && currentTarget && (
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-gray-600 dark:text-gray-400">
                {currentTarget.username}@{currentTarget.host}
              </span>
            </div>
          )}

          {/* SSH Config Button - only show in runner mode */}
          {viewMode === 'runner' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsSSHModalOpen(true)}
            >
              SSH Config
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'browser' ? (
        /* Skill Browser View */
        <div className="flex-1 min-h-0">
          <SkillBrowser />
        </div>
      ) : (
        /* Runner View - Split Layout */
        <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
          {/* Left Panel - Skill Selector */}
          <div className="col-span-4 min-h-0">
            <SkillSelector
              skills={filteredSkills}
              selectedSkill={selectedSkill}
              onSkillSelect={handleSkillSelect}
              inputs={inputs}
              onInputChange={handleInputChange}
              onRun={handleRun}
              onStop={handleStop}
              isRunning={isRunning}
              isLoading={isLoadingSkills}
            />
          </div>

          {/* Right Panel - Terminal */}
          <div className="col-span-8 min-h-0">
            <Card className="h-full flex flex-col">
              <Card.Header className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Terminal Output
                </h3>
                <div className="flex items-center gap-2">
                  {agentReport && !isRunning && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowReportModal(true)}
                    >
                      View Report
                    </Button>
                  )}
                  {lastExitCode !== null && (
                    <span className={`text-sm ${lastExitCode === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Exit code: {lastExitCode}
                    </span>
                  )}
                  {isRunning && (
                    <span className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                      <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                      Running...
                    </span>
                  )}
                </div>
              </Card.Header>
              <Card.Body className="flex-1 p-0 min-h-0">
                <TerminalEmulator
                  sessionId={sessionId}
                  onSessionEnd={handleSessionEnd}
                  onReportReady={handleReportReady}
                  className="h-full"
                />
              </Card.Body>
            </Card>
          </div>
        </div>
      )}

      {/* SSH Config Modal */}
      <SSHConfigModal
        isOpen={isSSHModalOpen}
        onClose={() => setIsSSHModalOpen(false)}
        targets={sshConfig.targets}
        defaultTarget={sshConfig.defaultTarget}
        onSave={handleSaveTarget}
        onDelete={handleDeleteTarget}
        onSetDefault={handleSetDefaultTarget}
        onTest={handleTestConnection}
      />

      {/* Agent Report Modal */}
      <AgentReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        report={agentReport}
      />
    </div>
  );
}

export default SkillsRunnerPage;
