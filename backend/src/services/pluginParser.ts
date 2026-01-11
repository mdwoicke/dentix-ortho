/**
 * Plugin Parser Service
 * Discovers installed Claude plugins and their commands
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

export interface PluginCommand {
  /** Command name (e.g., "reflect", "commit") */
  command: string;
  /** Full command with slash (e.g., "/reflect") */
  fullCommand: string;
  /** Plugin name this command belongs to */
  pluginName: string;
  /** Command description from frontmatter or first line */
  description?: string;
  /** Path to the command file */
  filePath: string;
}

export interface InstalledPlugin {
  /** Plugin identifier (e.g., "claude-reflect@claude-reflect-marketplace") */
  id: string;
  /** Plugin name (e.g., "claude-reflect") */
  name: string;
  /** Marketplace name */
  marketplace: string;
  /** Installation path */
  installPath: string;
  /** Version */
  version: string;
  /** Available commands */
  commands: PluginCommand[];
}

interface InstalledPluginsJson {
  version: number;
  plugins: Record<string, Array<{
    scope: string;
    installPath: string;
    version: string;
    installedAt: string;
    lastUpdated: string;
  }>>;
}

// ============================================================================
// Built-in Commands
// ============================================================================

// Claude Code built-in commands that don't come from plugins
const BUILTIN_COMMANDS: PluginCommand[] = [
  {
    command: 'commit',
    fullCommand: '/commit',
    pluginName: 'built-in',
    description: 'Create a git commit with AI-generated message',
    filePath: ''
  },
  {
    command: 'review',
    fullCommand: '/review',
    pluginName: 'built-in',
    description: 'Review code changes',
    filePath: ''
  },
  {
    command: 'pr',
    fullCommand: '/pr',
    pluginName: 'built-in',
    description: 'Create a pull request',
    filePath: ''
  },
  {
    command: 'init',
    fullCommand: '/init',
    pluginName: 'built-in',
    description: 'Initialize CLAUDE.md for the project',
    filePath: ''
  }
];

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Get the Claude plugins directory path
 */
function getPluginsDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.claude', 'plugins');
}

/**
 * Parse YAML frontmatter from command file to get description
 */
function parseCommandDescription(content: string): string | undefined {
  // Try to extract from YAML frontmatter
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  if (match) {
    const frontmatter = match[1];
    // Look for description field
    const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/i);
    if (descMatch) {
      return descMatch[1].trim();
    }
  }

  // Fallback: use first non-empty line after frontmatter as description
  const bodyStart = content.replace(frontmatterRegex, '').trim();
  const firstLine = bodyStart.split('\n')[0];
  if (firstLine && firstLine.length < 100 && !firstLine.startsWith('#')) {
    return firstLine.trim();
  }

  // Look for first heading
  const headingMatch = bodyStart.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  return undefined;
}

/**
 * Discover commands from a plugin directory
 */
function discoverPluginCommands(pluginPath: string, pluginName: string): PluginCommand[] {
  const commandsDir = path.join(pluginPath, 'commands');
  const commands: PluginCommand[] = [];

  if (!fs.existsSync(commandsDir)) {
    return commands;
  }

  try {
    const files = fs.readdirSync(commandsDir);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const commandName = file.replace('.md', '');
      const filePath = path.join(commandsDir, file);

      let description: string | undefined;
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        description = parseCommandDescription(content);
      } catch (e) {
        // Ignore read errors
      }

      commands.push({
        command: commandName,
        fullCommand: `/${commandName}`,
        pluginName,
        description,
        filePath
      });
    }
  } catch (e) {
    console.warn(`[PluginParser] Failed to read commands from ${commandsDir}:`, e);
  }

  return commands;
}

/**
 * Discover all installed plugins and their commands
 */
export function discoverInstalledPlugins(): InstalledPlugin[] {
  const pluginsDir = getPluginsDir();
  const installedPluginsPath = path.join(pluginsDir, 'installed_plugins.json');

  if (!fs.existsSync(installedPluginsPath)) {
    console.warn('[PluginParser] installed_plugins.json not found');
    return [];
  }

  let installedPluginsJson: InstalledPluginsJson;
  try {
    const content = fs.readFileSync(installedPluginsPath, 'utf-8');
    installedPluginsJson = JSON.parse(content);
  } catch (e) {
    console.error('[PluginParser] Failed to parse installed_plugins.json:', e);
    return [];
  }

  const plugins: InstalledPlugin[] = [];

  for (const [pluginId, installations] of Object.entries(installedPluginsJson.plugins)) {
    // Parse plugin ID: "plugin-name@marketplace-name"
    const [pluginName, marketplace] = pluginId.split('@');

    // Get the first (or most recent) installation
    const installation = installations[0];
    if (!installation) continue;

    const commands = discoverPluginCommands(installation.installPath, pluginName);

    plugins.push({
      id: pluginId,
      name: pluginName,
      marketplace: marketplace || 'unknown',
      installPath: installation.installPath,
      version: installation.version,
      commands
    });
  }

  return plugins;
}

/**
 * Get all available commands (built-in + installed plugins)
 */
export function getAllAvailableCommands(): PluginCommand[] {
  const commands: PluginCommand[] = [...BUILTIN_COMMANDS];

  const plugins = discoverInstalledPlugins();
  for (const plugin of plugins) {
    commands.push(...plugin.commands);
  }

  // Sort by command name
  commands.sort((a, b) => a.command.localeCompare(b.command));

  return commands;
}

/**
 * Get commands grouped by plugin
 */
export function getCommandsByPlugin(): Record<string, PluginCommand[]> {
  const result: Record<string, PluginCommand[]> = {
    'built-in': [...BUILTIN_COMMANDS]
  };

  const plugins = discoverInstalledPlugins();
  for (const plugin of plugins) {
    if (plugin.commands.length > 0) {
      result[plugin.name] = plugin.commands;
    }
  }

  return result;
}
