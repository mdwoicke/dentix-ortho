"use strict";
/**
 * SQLite Database for Test Results
 * Stores test runs, results, transcripts, findings, and recommendations
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const uuid_1 = require("uuid");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class Database {
    constructor() {
        this.db = null;
        // Use __dirname to ensure consistent path regardless of where the process runs from
        // This ensures backend and test-agent use the same database file
        this.dbPath = path.resolve(__dirname, '../../data/test-results.db');
    }
    /**
     * Initialize database and create tables
     */
    initialize() {
        // Ensure data directory exists
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new better_sqlite3_1.default(this.dbPath);
        this.createTables();
    }
    /**
     * Get database connection (initialize if needed)
     */
    getDb() {
        if (!this.db) {
            this.initialize();
        }
        return this.db;
    }
    /**
     * Create database tables
     */
    createTables() {
        const db = this.getDb();
        db.exec(`
      -- Test Runs
      CREATE TABLE IF NOT EXISTS test_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT UNIQUE NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT CHECK(status IN ('running', 'completed', 'failed', 'aborted')) DEFAULT 'running',
        total_tests INTEGER DEFAULT 0,
        passed INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        skipped INTEGER DEFAULT 0,
        summary TEXT
      );

      -- Individual Test Results
      CREATE TABLE IF NOT EXISTS test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        test_name TEXT NOT NULL,
        category TEXT,
        status TEXT CHECK(status IN ('passed', 'failed', 'error', 'skipped')),
        started_at TEXT,
        completed_at TEXT,
        duration_ms INTEGER,
        error_message TEXT,
        UNIQUE(run_id, test_id)
      );

      -- Conversation Transcripts
      CREATE TABLE IF NOT EXISTS transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        result_id INTEGER,
        test_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        session_id TEXT,
        transcript_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Findings
      CREATE TABLE IF NOT EXISTS findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT,
        test_id TEXT,
        type TEXT CHECK(type IN ('bug', 'enhancement', 'prompt-issue', 'tool-issue', 'regression')),
        severity TEXT,
        title TEXT NOT NULL,
        description TEXT,
        affected_step TEXT,
        agent_question TEXT,
        expected_behavior TEXT,
        actual_behavior TEXT,
        recommendation TEXT,
        status TEXT CHECK(status IN ('new', 'in-progress', 'resolved', 'wont-fix')) DEFAULT 'new',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Recommendations
      CREATE TABLE IF NOT EXISTS recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rec_id TEXT UNIQUE NOT NULL,
        run_id TEXT,
        type TEXT CHECK(type IN ('flowise-prompt', 'function-tool', 'node-red', 'backend')),
        priority INTEGER DEFAULT 5,
        title TEXT NOT NULL,
        problem TEXT,
        solution TEXT,
        prompt_suggestion TEXT,
        tool_suggestion TEXT,
        affected_tests TEXT,
        evidence TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- API Calls (tool calls made by Flowise to Cloud 9)
      CREATE TABLE IF NOT EXISTS api_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        step_id TEXT,
        tool_name TEXT NOT NULL,
        request_payload TEXT,
        response_payload TEXT,
        status TEXT,
        duration_ms INTEGER,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_test_results_test_id ON test_results(test_id);
      CREATE INDEX IF NOT EXISTS idx_transcripts_test_id ON transcripts(test_id);
      CREATE INDEX IF NOT EXISTS idx_findings_run_id ON findings(run_id);
      CREATE INDEX IF NOT EXISTS idx_api_calls_run_id ON api_calls(run_id);
      CREATE INDEX IF NOT EXISTS idx_api_calls_test_id ON api_calls(test_id);

      -- ========================================================================
      -- DYNAMIC AGENT TUNING SYSTEM TABLES
      -- ========================================================================

      -- Generated Fixes (prompt and tool fixes suggested by LLM analysis)
      CREATE TABLE IF NOT EXISTS generated_fixes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fix_id TEXT UNIQUE NOT NULL,
        run_id TEXT NOT NULL,
        type TEXT CHECK(type IN ('prompt', 'tool')) NOT NULL,
        target_file TEXT NOT NULL,
        change_description TEXT NOT NULL,
        change_code TEXT NOT NULL,
        location_json TEXT,
        priority TEXT CHECK(priority IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
        confidence REAL DEFAULT 0.5,
        affected_tests TEXT,
        root_cause_json TEXT,
        classification_json TEXT,
        status TEXT CHECK(status IN ('pending', 'applied', 'rejected', 'verified')) DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );


      -- Fix Outcomes (track effectiveness of applied fixes)
      CREATE TABLE IF NOT EXISTS fix_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fix_id TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        tests_before TEXT,
        tests_after TEXT,
        effective INTEGER DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (fix_id) REFERENCES generated_fixes(fix_id)
      );

      -- Prompt Versions (track system prompt changes over time)
      CREATE TABLE IF NOT EXISTS prompt_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        changes_from_previous TEXT,
        test_pass_rate REAL,
        captured_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for new tables
      CREATE INDEX IF NOT EXISTS idx_generated_fixes_run_id ON generated_fixes(run_id);
      CREATE INDEX IF NOT EXISTS idx_generated_fixes_status ON generated_fixes(status);
      CREATE INDEX IF NOT EXISTS idx_fix_outcomes_fix_id ON fix_outcomes(fix_id);

      -- ========================================================================
      -- PROMPT VERSION MANAGEMENT TABLES
      -- ========================================================================

      -- Working copies of prompts (current state with all applied fixes)
      CREATE TABLE IF NOT EXISTS prompt_working_copies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_key TEXT UNIQUE NOT NULL,
        file_path TEXT NOT NULL,
        display_name TEXT,
        content TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        last_fix_id TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Version history for prompts (tracks each version)
      CREATE TABLE IF NOT EXISTS prompt_version_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_key TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        fix_id TEXT,
        change_description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for prompt tables
      CREATE INDEX IF NOT EXISTS idx_prompt_version_history_file_key ON prompt_version_history(file_key);
      CREATE INDEX IF NOT EXISTS idx_prompt_version_history_version ON prompt_version_history(version);

      -- ========================================================================
      -- TEST CASE MANAGEMENT TABLE
      -- ========================================================================

      -- Test cases stored as JSON for UI editing
      CREATE TABLE IF NOT EXISTS test_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT CHECK(category IN ('happy-path', 'edge-case', 'error-handling')) NOT NULL,
        tags_json TEXT DEFAULT '[]',
        steps_json TEXT DEFAULT '[]',
        expectations_json TEXT DEFAULT '[]',
        is_archived INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for test cases
      CREATE INDEX IF NOT EXISTS idx_test_cases_category ON test_cases(category);
      CREATE INDEX IF NOT EXISTS idx_test_cases_archived ON test_cases(is_archived);
      CREATE INDEX IF NOT EXISTS idx_test_cases_case_id ON test_cases(case_id);

      -- ========================================================================
      -- GOAL-ORIENTED TEST TABLES
      -- ========================================================================

      -- Goal Test Results (tracks goal-based test outcomes)
      CREATE TABLE IF NOT EXISTS goal_test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        passed INTEGER DEFAULT 0,
        turn_count INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        goal_results_json TEXT,
        constraint_violations_json TEXT,
        summary_text TEXT,
        UNIQUE(run_id, test_id)
      );

      -- Goal Progress Snapshots (for debugging and analysis)
      CREATE TABLE IF NOT EXISTS goal_progress_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        turn_number INTEGER NOT NULL,
        collected_fields_json TEXT,
        pending_fields_json TEXT,
        issues_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for goal test tables
      CREATE INDEX IF NOT EXISTS idx_goal_test_results_run_id ON goal_test_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_goal_test_results_test_id ON goal_test_results(test_id);
      CREATE INDEX IF NOT EXISTS idx_goal_progress_snapshots_run_id ON goal_progress_snapshots(run_id);
      CREATE INDEX IF NOT EXISTS idx_goal_progress_snapshots_test_id ON goal_progress_snapshots(test_id);

      -- ========================================================================
      -- A/B TESTING FRAMEWORK TABLES
      -- ========================================================================

      -- Variants: Store versioned copies of prompts/tools/configs
      CREATE TABLE IF NOT EXISTS ab_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant_id TEXT UNIQUE NOT NULL,
        variant_type TEXT CHECK(variant_type IN ('prompt', 'tool', 'config')) NOT NULL,
        target_file TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        baseline_variant_id TEXT,
        source_fix_id TEXT,
        is_baseline INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT CHECK(created_by IN ('manual', 'llm-analysis', 'auto-generated')) DEFAULT 'manual',
        metadata_json TEXT,
        FOREIGN KEY (baseline_variant_id) REFERENCES ab_variants(variant_id),
        FOREIGN KEY (source_fix_id) REFERENCES generated_fixes(fix_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ab_variants_type ON ab_variants(variant_type);
      CREATE INDEX IF NOT EXISTS idx_ab_variants_target ON ab_variants(target_file);
      CREATE INDEX IF NOT EXISTS idx_ab_variants_hash ON ab_variants(content_hash);
      CREATE INDEX IF NOT EXISTS idx_ab_variants_baseline ON ab_variants(is_baseline);

      -- Experiments: Define A/B test experiments
      CREATE TABLE IF NOT EXISTS ab_experiments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        hypothesis TEXT,
        status TEXT CHECK(status IN ('draft', 'running', 'paused', 'completed', 'aborted')) DEFAULT 'draft',
        experiment_type TEXT CHECK(experiment_type IN ('prompt', 'tool', 'config', 'multi')) NOT NULL,
        variants_json TEXT NOT NULL,
        test_ids_json TEXT NOT NULL,
        traffic_split_json TEXT,
        min_sample_size INTEGER DEFAULT 10,
        max_sample_size INTEGER DEFAULT 100,
        significance_threshold REAL DEFAULT 0.05,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        completed_at TEXT,
        winning_variant_id TEXT,
        conclusion TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ab_experiments_status ON ab_experiments(status);
      CREATE INDEX IF NOT EXISTS idx_ab_experiments_type ON ab_experiments(experiment_type);

      -- Experiment Runs: Track each test execution with variant info
      CREATE TABLE IF NOT EXISTS ab_experiment_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        test_id TEXT NOT NULL,
        variant_id TEXT NOT NULL,
        variant_role TEXT CHECK(variant_role IN ('control', 'treatment')) NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        passed INTEGER DEFAULT 0,
        turn_count INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        goal_completion_rate REAL DEFAULT 0,
        constraint_violations INTEGER DEFAULT 0,
        error_occurred INTEGER DEFAULT 0,
        metrics_json TEXT,
        FOREIGN KEY (experiment_id) REFERENCES ab_experiments(experiment_id),
        FOREIGN KEY (variant_id) REFERENCES ab_variants(variant_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ab_runs_experiment ON ab_experiment_runs(experiment_id);
      CREATE INDEX IF NOT EXISTS idx_ab_runs_variant ON ab_experiment_runs(variant_id);
      CREATE INDEX IF NOT EXISTS idx_ab_runs_test ON ab_experiment_runs(test_id);

      -- Experiment Triggers: Define when to suggest/run experiments
      CREATE TABLE IF NOT EXISTS ab_experiment_triggers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_id TEXT UNIQUE NOT NULL,
        experiment_id TEXT NOT NULL,
        trigger_type TEXT CHECK(trigger_type IN ('fix-applied', 'scheduled', 'pass-rate-drop', 'manual')) NOT NULL,
        condition_json TEXT,
        enabled INTEGER DEFAULT 1,
        last_triggered TEXT,
        FOREIGN KEY (experiment_id) REFERENCES ab_experiments(experiment_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ab_triggers_experiment ON ab_experiment_triggers(experiment_id);
      CREATE INDEX IF NOT EXISTS idx_ab_triggers_enabled ON ab_experiment_triggers(enabled);

      -- ========================================================================
      -- A/B TESTING SANDBOX TABLES
      -- ========================================================================

      -- Sandboxes: Persistent A and B sandbox configurations
      CREATE TABLE IF NOT EXISTS ab_sandboxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sandbox_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        flowise_endpoint TEXT,
        flowise_api_key TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Sandbox Files: Copy of each of the 3 files per sandbox
      CREATE TABLE IF NOT EXISTS ab_sandbox_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sandbox_id TEXT NOT NULL,
        file_key TEXT NOT NULL,
        file_type TEXT NOT NULL,
        display_name TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        base_version INTEGER,
        change_description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sandbox_id, file_key),
        FOREIGN KEY (sandbox_id) REFERENCES ab_sandboxes(sandbox_id)
      );

      -- Sandbox File History: Version history for sandbox file edits
      CREATE TABLE IF NOT EXISTS ab_sandbox_file_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sandbox_id TEXT NOT NULL,
        file_key TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        change_description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sandbox_id) REFERENCES ab_sandboxes(sandbox_id)
      );

      -- Sandbox Comparison Runs: Track three-way comparison test runs
      CREATE TABLE IF NOT EXISTS ab_sandbox_comparison_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comparison_id TEXT UNIQUE NOT NULL,
        name TEXT,
        status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
        test_ids_json TEXT,
        production_results_json TEXT,
        sandbox_a_results_json TEXT,
        sandbox_b_results_json TEXT,
        started_at TEXT,
        completed_at TEXT,
        summary_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for sandbox tables
      CREATE INDEX IF NOT EXISTS idx_sandbox_files_sandbox ON ab_sandbox_files(sandbox_id);
      CREATE INDEX IF NOT EXISTS idx_sandbox_history_sandbox ON ab_sandbox_file_history(sandbox_id);
      CREATE INDEX IF NOT EXISTS idx_sandbox_history_file ON ab_sandbox_file_history(file_key);
      CREATE INDEX IF NOT EXISTS idx_comparison_runs_status ON ab_sandbox_comparison_runs(status);

      -- ========================================================================
      -- AI ENHANCEMENT TABLES
      -- ========================================================================

      -- AI Enhancement History: Track all AI prompt enhancement operations
      CREATE TABLE IF NOT EXISTS ai_enhancement_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enhancement_id TEXT UNIQUE NOT NULL,
        file_key TEXT NOT NULL,
        source_version INTEGER NOT NULL,
        result_version INTEGER,
        command TEXT NOT NULL,
        command_template TEXT,
        web_search_used INTEGER DEFAULT 0,
        web_search_queries TEXT,
        web_search_results_json TEXT,
        enhancement_prompt TEXT,
        ai_response_json TEXT,
        quality_score_before REAL,
        quality_score_after REAL,
        status TEXT CHECK(status IN ('pending', 'preview', 'processing', 'completed', 'failed', 'cancelled', 'applied', 'promoted')) DEFAULT 'pending',
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        created_by TEXT DEFAULT 'user',
        metadata_json TEXT,
        FOREIGN KEY (file_key) REFERENCES prompt_working_copies(file_key)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_file_key ON ai_enhancement_history(file_key);
      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_status ON ai_enhancement_history(status);
      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_created ON ai_enhancement_history(created_at);

      -- AI Enhancement Templates: Pre-built and custom enhancement templates
      CREATE TABLE IF NOT EXISTS ai_enhancement_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        command_template TEXT NOT NULL,
        category TEXT CHECK(category IN ('clarity', 'examples', 'edge-cases', 'format', 'validation', 'custom')) NOT NULL,
        use_web_search INTEGER DEFAULT 0,
        default_search_queries TEXT,
        is_built_in INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        usage_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_ai_templates_category ON ai_enhancement_templates(category);
      CREATE INDEX IF NOT EXISTS idx_ai_templates_built_in ON ai_enhancement_templates(is_built_in);
    `);
        // Migration: Add agent_question column if it doesn't exist
        this.addColumnIfNotExists('findings', 'agent_question', 'TEXT');
        // Migration: Add display_name column to prompt_working_copies if it doesn't exist
        this.addColumnIfNotExists('prompt_working_copies', 'display_name', 'TEXT');
        // Migration: Add resolved persona fields to goal_test_results
        this.addColumnIfNotExists('goal_test_results', 'resolved_persona_json', 'TEXT');
        this.addColumnIfNotExists('goal_test_results', 'generation_seed', 'INTEGER');
        // Migration: Add classification_json column to generated_fixes
        this.addColumnIfNotExists('generated_fixes', 'classification_json', 'TEXT');
        // Migration: Add flowise_api_key column to ab_sandboxes
        this.addColumnIfNotExists('ab_sandboxes', 'flowise_api_key', 'TEXT');
        // Migration: Add LangFuse credential columns to ab_sandboxes
        this.addColumnIfNotExists('ab_sandboxes', 'langfuse_host', 'TEXT');
        this.addColumnIfNotExists('ab_sandboxes', 'langfuse_public_key', 'TEXT');
        this.addColumnIfNotExists('ab_sandboxes', 'langfuse_secret_key', 'TEXT');
        // Migration: Add AI enhancement tracking columns to prompt_version_history
        this.addColumnIfNotExists('prompt_version_history', 'enhancement_id', 'TEXT');
        this.addColumnIfNotExists('prompt_version_history', 'is_experimental', 'INTEGER DEFAULT 0');
        this.addColumnIfNotExists('prompt_version_history', 'ai_generated', 'INTEGER DEFAULT 0');
        // Migration: Add applied/promoted tracking columns to ai_enhancement_history
        this.addColumnIfNotExists('ai_enhancement_history', 'applied_at', 'TEXT');
        this.addColumnIfNotExists('ai_enhancement_history', 'promoted_at', 'TEXT');
        this.addColumnIfNotExists('ai_enhancement_history', 'applied_content', 'TEXT');
        // Migration: Update CHECK constraint to include 'applied' and 'promoted' statuses
        this.migrateEnhancementHistoryCheckConstraint();
        // Initialize built-in enhancement templates
        this.initializeBuiltInTemplates();
    }
    /**
     * Add a column to a table if it doesn't exist (migration helper)
     */
    addColumnIfNotExists(table, column, type) {
        const db = this.getDb();
        // Check if column exists
        const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all();
        const columnExists = tableInfo.some((col) => col.name === column);
        if (!columnExists) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        }
    }
    /**
     * Migrate ai_enhancement_history table to add 'preview', 'applied' and 'promoted' to CHECK constraint
     * SQLite requires recreating the table to modify CHECK constraints
     */
    migrateEnhancementHistoryCheckConstraint() {
        const db = this.getDb();
        // Check if migration is needed by looking at the table SQL
        const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ai_enhancement_history'").get();
        if (!tableInfo || !tableInfo.sql) {
            return; // Table doesn't exist yet, will be created with correct constraint
        }
        // Check if the CHECK constraint already includes 'preview', 'applied' and 'promoted'
        if (tableInfo.sql.includes("'preview'") && tableInfo.sql.includes("'applied'") && tableInfo.sql.includes("'promoted'")) {
            return; // Already migrated
        }
        // Need to recreate the table with the new CHECK constraint
        db.exec(`
      -- Create temporary table with new CHECK constraint
      CREATE TABLE ai_enhancement_history_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enhancement_id TEXT UNIQUE NOT NULL,
        file_key TEXT NOT NULL,
        source_version INTEGER NOT NULL,
        result_version INTEGER,
        command TEXT NOT NULL,
        command_template TEXT,
        web_search_used INTEGER DEFAULT 0,
        web_search_queries TEXT,
        web_search_results_json TEXT,
        enhancement_prompt TEXT,
        ai_response_json TEXT,
        quality_score_before REAL,
        quality_score_after REAL,
        status TEXT CHECK(status IN ('pending', 'preview', 'processing', 'completed', 'failed', 'cancelled', 'applied', 'promoted')) DEFAULT 'pending',
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        created_by TEXT DEFAULT 'user',
        metadata_json TEXT,
        applied_at TEXT,
        promoted_at TEXT,
        applied_content TEXT,
        FOREIGN KEY (file_key) REFERENCES prompt_working_copies(file_key)
      );

      -- Copy data from old table
      INSERT INTO ai_enhancement_history_new
      SELECT id, enhancement_id, file_key, source_version, result_version, command, command_template,
             web_search_used, web_search_queries, web_search_results_json, enhancement_prompt,
             ai_response_json, quality_score_before, quality_score_after, status, error_message,
             created_at, completed_at, created_by, metadata_json, applied_at, promoted_at, applied_content
      FROM ai_enhancement_history;

      -- Drop old table
      DROP TABLE ai_enhancement_history;

      -- Rename new table
      ALTER TABLE ai_enhancement_history_new RENAME TO ai_enhancement_history;

      -- Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_file_key ON ai_enhancement_history(file_key);
      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_status ON ai_enhancement_history(status);
      CREATE INDEX IF NOT EXISTS idx_ai_enhancement_created ON ai_enhancement_history(created_at);
    `);
    }
    /**
     * Initialize built-in enhancement templates (runs once on first setup)
     */
    initializeBuiltInTemplates() {
        const db = this.getDb();
        const builtInTemplates = [
            {
                template_id: 'add-examples',
                name: 'Add Examples',
                description: 'Add 2-3 clear, concrete examples for key scenarios',
                command_template: 'Add 2-3 clear examples showing how to handle {{topic}}',
                category: 'examples',
                use_web_search: 1,
            },
            {
                template_id: 'improve-clarity',
                name: 'Improve Clarity',
                description: 'Rewrite unclear sections to be more specific and actionable',
                command_template: 'Rewrite unclear sections to be more specific and actionable. Focus on removing ambiguity.',
                category: 'clarity',
                use_web_search: 0,
            },
            {
                template_id: 'add-edge-cases',
                name: 'Add Edge Case Handling',
                description: 'Add explicit handling for edge cases and error scenarios',
                command_template: 'Add explicit handling for edge cases including: {{scenarios}}',
                category: 'edge-cases',
                use_web_search: 1,
            },
            {
                template_id: 'improve-format',
                name: 'Improve Formatting',
                description: 'Reorganize content with clear sections, headers, and consistent formatting',
                command_template: 'Reorganize content with clear sections, headers, and consistent formatting throughout.',
                category: 'format',
                use_web_search: 0,
            },
            {
                template_id: 'add-validation',
                name: 'Add Input Validation',
                description: 'Add validation rules and helpful error messages for user inputs',
                command_template: 'Add input validation and helpful error messages for: {{fields}}',
                category: 'validation',
                use_web_search: 1,
            },
            {
                template_id: 'best-practices',
                name: 'Apply Best Practices',
                description: 'Apply prompt engineering best practices: clear structure, explicit constraints, chain-of-thought',
                command_template: 'Apply prompt engineering best practices: clear structure, explicit constraints, chain-of-thought reasoning where applicable.',
                category: 'custom',
                use_web_search: 1,
            },
        ];
        const stmt = db.prepare(`
      INSERT OR IGNORE INTO ai_enhancement_templates
      (template_id, name, description, command_template, category, use_web_search, is_built_in)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
        for (const template of builtInTemplates) {
            stmt.run(template.template_id, template.name, template.description, template.command_template, template.category, template.use_web_search);
        }
    }
    /**
     * Create a new test run
     */
    createTestRun() {
        const db = this.getDb();
        const runId = `run-${new Date().toISOString().slice(0, 10)}-${(0, uuid_1.v4)().slice(0, 8)}`;
        db.prepare(`
      INSERT INTO test_runs (run_id, started_at, status)
      VALUES (?, ?, 'running')
    `).run(runId, new Date().toISOString());
        return runId;
    }
    /**
     * Complete a test run
     */
    completeTestRun(runId, summary) {
        const db = this.getDb();
        db.prepare(`
      UPDATE test_runs
      SET completed_at = ?,
          status = 'completed',
          total_tests = ?,
          passed = ?,
          failed = ?,
          skipped = ?,
          summary = ?
      WHERE run_id = ?
    `).run(new Date().toISOString(), summary.totalTests, summary.passed, summary.failed, summary.skipped, JSON.stringify(summary), runId);
    }
    /**
     * Mark a test run as failed (for error cases)
     */
    failTestRun(runId, errorMessage) {
        const db = this.getDb();
        // Get current counts from existing results
        const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status IN ('failed', 'error') THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM test_results WHERE run_id = ?
    `).get(runId);
        const summary = {
            totalTests: stats?.total || 0,
            passed: stats?.passed || 0,
            failed: stats?.failed || 0,
            skipped: stats?.skipped || 0,
            error: errorMessage || 'Test run failed unexpectedly',
        };
        db.prepare(`
      UPDATE test_runs
      SET completed_at = ?,
          status = 'failed',
          total_tests = ?,
          passed = ?,
          failed = ?,
          skipped = ?,
          summary = ?
      WHERE run_id = ?
    `).run(new Date().toISOString(), summary.totalTests, summary.passed, summary.failed, summary.skipped, JSON.stringify(summary), runId);
    }
    /**
     * Mark a test run as aborted (for user cancellation)
     */
    abortTestRun(runId) {
        const db = this.getDb();
        // Get current counts from existing results
        const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status IN ('failed', 'error') THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM test_results WHERE run_id = ?
    `).get(runId);
        const summary = {
            totalTests: stats?.total || 0,
            passed: stats?.passed || 0,
            failed: stats?.failed || 0,
            skipped: stats?.skipped || 0,
            aborted: true,
        };
        db.prepare(`
      UPDATE test_runs
      SET completed_at = ?,
          status = 'aborted',
          total_tests = ?,
          passed = ?,
          failed = ?,
          skipped = ?,
          summary = ?
      WHERE run_id = ?
    `).run(new Date().toISOString(), summary.totalTests, summary.passed, summary.failed, summary.skipped, JSON.stringify(summary), runId);
    }
    /**
     * Clean up stale running test runs (runs started more than X hours ago still showing as running)
     */
    cleanupStaleRuns(maxAgeHours = 2) {
        const db = this.getDb();
        const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
        const result = db.prepare(`
      UPDATE test_runs
      SET completed_at = ?,
          status = 'aborted',
          summary = ?
      WHERE status = 'running' AND started_at < ?
    `).run(new Date().toISOString(), JSON.stringify({ aborted: true, reason: 'Stale run cleanup - exceeded maximum age' }), cutoffTime);
        return result.changes;
    }
    /**
     * Save a test result
     */
    saveTestResult(result) {
        const db = this.getDb();
        const info = db.prepare(`
      INSERT OR REPLACE INTO test_results
      (run_id, test_id, test_name, category, status, started_at, completed_at, duration_ms, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(result.runId, result.testId, result.testName, result.category, result.status, result.startedAt, result.completedAt, result.durationMs, result.errorMessage);
        const resultId = info.lastInsertRowid;
        // Save findings
        for (const finding of result.findings) {
            this.saveFinding(result.runId, result.testId, finding);
        }
        return resultId;
    }
    /**
     * Save transcript for a test
     */
    saveTranscript(resultId, transcript) {
        const db = this.getDb();
        // Get test info
        const result = db.prepare('SELECT run_id, test_id FROM test_results WHERE id = ?').get(resultId);
        if (result) {
            db.prepare(`
        INSERT INTO transcripts (result_id, test_id, run_id, transcript_json)
        VALUES (?, ?, ?, ?)
      `).run(resultId, result.test_id, result.run_id, JSON.stringify(transcript));
        }
    }
    /**
     * Save a finding
     */
    saveFinding(runId, testId, finding) {
        const db = this.getDb();
        db.prepare(`
      INSERT INTO findings (run_id, test_id, type, severity, title, description, affected_step, agent_question, expected_behavior, actual_behavior, recommendation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(runId, testId, finding.type, finding.severity, finding.title, finding.description, finding.affectedStep, finding.agentQuestion, finding.expectedBehavior, finding.actualBehavior, finding.recommendation);
    }
    /**
     * Save recommendations
     */
    saveRecommendations(runId, recommendations) {
        const db = this.getDb();
        for (const rec of recommendations) {
            db.prepare(`
        INSERT OR REPLACE INTO recommendations
        (rec_id, run_id, type, priority, title, problem, solution, prompt_suggestion, tool_suggestion, affected_tests, evidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(rec.id, runId, rec.type, rec.priority, rec.title, rec.problem, rec.solution, rec.promptSuggestion ? JSON.stringify(rec.promptSuggestion) : null, rec.toolSuggestion ? JSON.stringify(rec.toolSuggestion) : null, JSON.stringify(rec.affectedTests), JSON.stringify(rec.evidence));
        }
    }
    /**
     * Get the last test run
     */
    getLastTestRun() {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT run_id, started_at, completed_at, status, total_tests, passed, failed, skipped, summary
      FROM test_runs
      ORDER BY started_at DESC
      LIMIT 1
    `).get();
        if (!row)
            return null;
        return {
            runId: row.run_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            status: row.status,
            totalTests: row.total_tests,
            passed: row.passed,
            failed: row.failed,
            skipped: row.skipped,
            summary: row.summary,
        };
    }
    /**
     * Get recent runs
     */
    getRecentRuns(limit = 10) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT run_id, started_at, completed_at, status, total_tests, passed, failed, skipped, summary
      FROM test_runs
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit);
        return rows.map(row => ({
            runId: row.run_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            status: row.status,
            totalTests: row.total_tests,
            passed: row.passed,
            failed: row.failed,
            skipped: row.skipped,
            summary: row.summary,
        }));
    }
    /**
     * Get test results for a run
     */
    getTestResults(runId) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, run_id, test_id, test_name, category, status, started_at, completed_at, duration_ms, error_message
      FROM test_results
      WHERE run_id = ?
    `).all(runId);
        return rows.map(row => ({
            id: row.id,
            runId: row.run_id,
            testId: row.test_id,
            testName: row.test_name,
            category: row.category,
            status: row.status,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            durationMs: row.duration_ms,
            errorMessage: row.error_message,
            transcript: [],
            findings: [],
        }));
    }
    /**
     * Get failed test IDs from a run
     */
    getFailedTestIds(runId) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT test_id FROM test_results
      WHERE run_id = ? AND status IN ('failed', 'error')
    `).all(runId);
        return rows.map(r => r.test_id);
    }
    /**
     * Get transcript for a test
     */
    getTranscript(testId, runId) {
        const db = this.getDb();
        let query = 'SELECT transcript_json FROM transcripts WHERE test_id = ?';
        const params = [testId];
        if (runId) {
            query += ' AND run_id = ?';
            params.push(runId);
        }
        query += ' ORDER BY created_at DESC LIMIT 1';
        const row = db.prepare(query).get(...params);
        if (!row)
            return [];
        return JSON.parse(row.transcript_json);
    }
    /**
     * Get recommendations
     */
    getRecommendations(runId) {
        const db = this.getDb();
        let query = `
      SELECT rec_id, run_id, type, priority, title, problem, solution,
             prompt_suggestion, tool_suggestion, affected_tests, evidence
      FROM recommendations
    `;
        const params = [];
        if (runId) {
            query += ' WHERE run_id = ?';
            params.push(runId);
        }
        query += ' ORDER BY priority DESC';
        const rows = db.prepare(query).all(...params);
        return rows.map(row => ({
            id: row.rec_id,
            type: row.type,
            priority: row.priority,
            title: row.title,
            problem: row.problem,
            solution: row.solution,
            promptSuggestion: row.prompt_suggestion ? JSON.parse(row.prompt_suggestion) : undefined,
            toolSuggestion: row.tool_suggestion ? JSON.parse(row.tool_suggestion) : undefined,
            affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
            evidence: row.evidence ? JSON.parse(row.evidence) : [],
        }));
    }
    /**
     * Save an API call
     */
    saveApiCall(apiCall) {
        const db = this.getDb();
        db.prepare(`
      INSERT INTO api_calls (run_id, test_id, step_id, tool_name, request_payload, response_payload, status, duration_ms, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(apiCall.runId, apiCall.testId, apiCall.stepId, apiCall.toolName, apiCall.requestPayload, apiCall.responsePayload, apiCall.status, apiCall.durationMs, apiCall.timestamp || new Date().toISOString());
    }
    /**
     * Save multiple API calls
     */
    saveApiCalls(apiCalls) {
        for (const apiCall of apiCalls) {
            this.saveApiCall(apiCall);
        }
    }
    /**
     * Get API calls for a test
     */
    getApiCalls(testId, runId) {
        const db = this.getDb();
        let query = `
      SELECT id, run_id, test_id, step_id, tool_name, request_payload, response_payload, status, duration_ms, timestamp
      FROM api_calls
      WHERE test_id = ?
    `;
        const params = [testId];
        if (runId) {
            query += ' AND run_id = ?';
            params.push(runId);
        }
        query += ' ORDER BY timestamp ASC';
        const rows = db.prepare(query).all(...params);
        return rows.map(row => ({
            id: row.id,
            runId: row.run_id,
            testId: row.test_id,
            stepId: row.step_id,
            toolName: row.tool_name,
            requestPayload: row.request_payload,
            responsePayload: row.response_payload,
            status: row.status,
            durationMs: row.duration_ms,
            timestamp: row.timestamp,
        }));
    }
    /**
     * Get all API calls for a run
     */
    getApiCallsByRun(runId) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, run_id, test_id, step_id, tool_name, request_payload, response_payload, status, duration_ms, timestamp
      FROM api_calls
      WHERE run_id = ?
      ORDER BY timestamp ASC
    `).all(runId);
        return rows.map(row => ({
            id: row.id,
            runId: row.run_id,
            testId: row.test_id,
            stepId: row.step_id,
            toolName: row.tool_name,
            requestPayload: row.request_payload,
            responsePayload: row.response_payload,
            status: row.status,
            durationMs: row.duration_ms,
            timestamp: row.timestamp,
        }));
    }
    /**
     * Get all test runs with pagination
     */
    getAllTestRuns(limit = 50, offset = 0) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT run_id, started_at, completed_at, status, total_tests, passed, failed, skipped, summary
      FROM test_runs
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
        return rows.map(row => ({
            runId: row.run_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            status: row.status,
            totalTests: row.total_tests,
            passed: row.passed,
            failed: row.failed,
            skipped: row.skipped,
            summary: row.summary,
        }));
    }
    /**
     * Get a single test run by ID
     */
    getTestRun(runId) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT run_id, started_at, completed_at, status, total_tests, passed, failed, skipped, summary
      FROM test_runs
      WHERE run_id = ?
    `).get(runId);
        if (!row)
            return null;
        return {
            runId: row.run_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            status: row.status,
            totalTests: row.total_tests,
            passed: row.passed,
            failed: row.failed,
            skipped: row.skipped,
            summary: row.summary,
        };
    }
    /**
     * Get findings for a run or all findings
     */
    getFindings(runId) {
        const db = this.getDb();
        let query = `
      SELECT id, run_id, test_id, type, severity, title, description,
             affected_step, agent_question, expected_behavior, actual_behavior, recommendation, status, created_at
      FROM findings
    `;
        const params = [];
        if (runId) {
            query += ' WHERE run_id = ?';
            params.push(runId);
        }
        query += ' ORDER BY created_at DESC';
        const rows = db.prepare(query).all(...params);
        return rows.map(row => ({
            id: row.id,
            type: row.type,
            severity: row.severity,
            title: row.title,
            description: row.description,
            affectedStep: row.affected_step,
            agentQuestion: row.agent_question,
            expectedBehavior: row.expected_behavior,
            actualBehavior: row.actual_behavior,
            recommendation: row.recommendation,
        }));
    }
    // ============================================================================
    // DYNAMIC AGENT TUNING SYSTEM - Fix Management Methods
    // ============================================================================
    /**
     * Save a generated fix
     */
    saveGeneratedFix(fix) {
        const db = this.getDb();
        db.prepare(`
      INSERT OR REPLACE INTO generated_fixes
      (fix_id, run_id, type, target_file, change_description, change_code,
       location_json, priority, confidence, affected_tests, root_cause_json, classification_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fix.fixId, fix.runId, fix.type, fix.targetFile, fix.changeDescription, fix.changeCode, fix.location ? JSON.stringify(fix.location) : null, fix.priority, fix.confidence, JSON.stringify(fix.affectedTests), fix.rootCause ? JSON.stringify(fix.rootCause) : null, fix.classification ? JSON.stringify(fix.classification) : null, fix.status, fix.createdAt || new Date().toISOString());
    }
    /**
     * Save multiple generated fixes
     */
    saveGeneratedFixes(fixes) {
        for (const fix of fixes) {
            this.saveGeneratedFix(fix);
        }
    }
    /**
     * Get generated fixes for a run
     */
    getGeneratedFixes(runId, status) {
        const db = this.getDb();
        let query = `
      SELECT fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, root_cause_json, classification_json, status, created_at
      FROM generated_fixes
    `;
        const conditions = [];
        const params = [];
        if (runId) {
            conditions.push('run_id = ?');
            params.push(runId);
        }
        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY confidence DESC, priority ASC';
        const rows = db.prepare(query).all(...params);
        return rows.map(row => ({
            fixId: row.fix_id,
            runId: row.run_id,
            type: row.type,
            targetFile: row.target_file,
            changeDescription: row.change_description,
            changeCode: row.change_code,
            location: row.location_json ? JSON.parse(row.location_json) : undefined,
            priority: row.priority,
            confidence: row.confidence,
            affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
            rootCause: row.root_cause_json ? JSON.parse(row.root_cause_json) : undefined,
            classification: row.classification_json ? JSON.parse(row.classification_json) : undefined,
            status: row.status,
            createdAt: row.created_at,
        }));
    }
    /**
     * Get a single fix by ID
     */
    getGeneratedFix(fixId) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT fix_id, run_id, type, target_file, change_description, change_code,
             location_json, priority, confidence, affected_tests, root_cause_json, classification_json, status, created_at
      FROM generated_fixes
      WHERE fix_id = ?
    `).get(fixId);
        if (!row)
            return null;
        return {
            fixId: row.fix_id,
            runId: row.run_id,
            type: row.type,
            targetFile: row.target_file,
            changeDescription: row.change_description,
            changeCode: row.change_code,
            location: row.location_json ? JSON.parse(row.location_json) : undefined,
            priority: row.priority,
            confidence: row.confidence,
            affectedTests: row.affected_tests ? JSON.parse(row.affected_tests) : [],
            rootCause: row.root_cause_json ? JSON.parse(row.root_cause_json) : undefined,
            classification: row.classification_json ? JSON.parse(row.classification_json) : undefined,
            status: row.status,
            createdAt: row.created_at,
        };
    }
    /**
     * Update fix status
     */
    updateFixStatus(fixId, status) {
        const db = this.getDb();
        db.prepare(`
      UPDATE generated_fixes SET status = ? WHERE fix_id = ?
    `).run(status, fixId);
    }
    /**
     * Save a fix outcome
     */
    saveFixOutcome(outcome) {
        const db = this.getDb();
        db.prepare(`
      INSERT INTO fix_outcomes (fix_id, applied_at, tests_before, tests_after, effective, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(outcome.fixId, outcome.appliedAt, JSON.stringify(outcome.testsBefore), JSON.stringify(outcome.testsAfter), outcome.effective ? 1 : 0, outcome.notes);
    }
    /**
     * Get fix outcomes for a fix
     */
    getFixOutcomes(fixId) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, fix_id, applied_at, tests_before, tests_after, effective, notes
      FROM fix_outcomes
      WHERE fix_id = ?
      ORDER BY applied_at DESC
    `).all(fixId);
        return rows.map(row => ({
            id: row.id,
            fixId: row.fix_id,
            appliedAt: row.applied_at,
            testsBefore: row.tests_before ? JSON.parse(row.tests_before) : [],
            testsAfter: row.tests_after ? JSON.parse(row.tests_after) : [],
            effective: row.effective === 1,
            notes: row.notes,
        }));
    }
    /**
     * Save a prompt version
     */
    savePromptVersion(version) {
        const db = this.getDb();
        db.prepare(`
      INSERT INTO prompt_versions (version, content_hash, changes_from_previous, test_pass_rate, captured_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(version.version, version.contentHash, version.changesFromPrevious, version.testPassRate, version.capturedAt || new Date().toISOString());
    }
    /**
     * Get latest prompt version
     */
    getLatestPromptVersion() {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT id, version, content_hash, changes_from_previous, test_pass_rate, captured_at
      FROM prompt_versions
      ORDER BY captured_at DESC
      LIMIT 1
    `).get();
        if (!row)
            return null;
        return {
            id: row.id,
            version: row.version,
            contentHash: row.content_hash,
            changesFromPrevious: row.changes_from_previous,
            testPassRate: row.test_pass_rate,
            capturedAt: row.captured_at,
        };
    }
    /**
     * Get prompt version history
     */
    getPromptVersionHistory(limit = 10) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, version, content_hash, changes_from_previous, test_pass_rate, captured_at
      FROM prompt_versions
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(limit);
        return rows.map(row => ({
            id: row.id,
            version: row.version,
            contentHash: row.content_hash,
            changesFromPrevious: row.changes_from_previous,
            testPassRate: row.test_pass_rate,
            capturedAt: row.captured_at,
        }));
    }
    /**
     * Get pending fixes count
     */
    getPendingFixesCount() {
        const db = this.getDb();
        const row = db.prepare(`SELECT COUNT(*) as count FROM generated_fixes WHERE status = 'pending'`).get();
        return row?.count || 0;
    }
    /**
     * Get fix statistics
     */
    getFixStatistics() {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) as applied,
        SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM generated_fixes
    `).get();
        return {
            total: row?.total || 0,
            pending: row?.pending || 0,
            applied: row?.applied || 0,
            verified: row?.verified || 0,
            rejected: row?.rejected || 0,
        };
    }
    /**
     * Clear all data
     */
    clear() {
        const db = this.getDb();
        db.exec(`
      DELETE FROM ab_experiment_triggers;
      DELETE FROM ab_experiment_runs;
      DELETE FROM ab_experiments;
      DELETE FROM ab_variants;
      DELETE FROM fix_outcomes;
      DELETE FROM generated_fixes;
      DELETE FROM prompt_versions;
      DELETE FROM api_calls;
      DELETE FROM recommendations;
      DELETE FROM findings;
      DELETE FROM transcripts;
      DELETE FROM test_results;
      DELETE FROM test_runs;
    `);
    }
    // ============================================================================
    // TEST CASE MANAGEMENT METHODS
    // ============================================================================
    /**
     * Get all test cases (optionally filtered)
     */
    getTestCases(options) {
        const db = this.getDb();
        let query = `
      SELECT id, case_id, name, description, category, tags_json, steps_json,
             expectations_json, is_archived, version, created_at, updated_at
      FROM test_cases
    `;
        const conditions = [];
        const params = [];
        if (!options?.includeArchived) {
            conditions.push('is_archived = 0');
        }
        if (options?.category) {
            conditions.push('category = ?');
            params.push(options.category);
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY category, case_id';
        const rows = db.prepare(query).all(...params);
        return rows.map(row => ({
            id: row.id,
            caseId: row.case_id,
            name: row.name,
            description: row.description || '',
            category: row.category,
            tags: JSON.parse(row.tags_json || '[]'),
            steps: JSON.parse(row.steps_json || '[]'),
            expectations: JSON.parse(row.expectations_json || '[]'),
            isArchived: row.is_archived === 1,
            version: row.version,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
    /**
     * Get a single test case by ID
     */
    getTestCase(caseId) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT id, case_id, name, description, category, tags_json, steps_json,
             expectations_json, is_archived, version, created_at, updated_at
      FROM test_cases
      WHERE case_id = ?
    `).get(caseId);
        if (!row)
            return null;
        return {
            id: row.id,
            caseId: row.case_id,
            name: row.name,
            description: row.description || '',
            category: row.category,
            tags: JSON.parse(row.tags_json || '[]'),
            steps: JSON.parse(row.steps_json || '[]'),
            expectations: JSON.parse(row.expectations_json || '[]'),
            isArchived: row.is_archived === 1,
            version: row.version,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    /**
     * Create a new test case
     */
    createTestCase(testCase) {
        const db = this.getDb();
        const now = new Date().toISOString();
        const info = db.prepare(`
      INSERT INTO test_cases (case_id, name, description, category, tags_json, steps_json, expectations_json, is_archived, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(testCase.caseId, testCase.name, testCase.description, testCase.category, JSON.stringify(testCase.tags), JSON.stringify(testCase.steps), JSON.stringify(testCase.expectations), testCase.isArchived ? 1 : 0, now, now);
        return {
            id: info.lastInsertRowid,
            ...testCase,
            version: 1,
            createdAt: now,
            updatedAt: now,
        };
    }
    /**
     * Update an existing test case
     */
    updateTestCase(caseId, updates) {
        const db = this.getDb();
        // First get the existing record
        const existing = this.getTestCase(caseId);
        if (!existing)
            return null;
        const now = new Date().toISOString();
        const newVersion = existing.version + 1;
        // Build update fields
        const updated = {
            name: updates.name ?? existing.name,
            description: updates.description ?? existing.description,
            category: updates.category ?? existing.category,
            tags: updates.tags ?? existing.tags,
            steps: updates.steps ?? existing.steps,
            expectations: updates.expectations ?? existing.expectations,
            isArchived: updates.isArchived ?? existing.isArchived,
        };
        db.prepare(`
      UPDATE test_cases
      SET name = ?, description = ?, category = ?, tags_json = ?, steps_json = ?,
          expectations_json = ?, is_archived = ?, version = ?, updated_at = ?
      WHERE case_id = ?
    `).run(updated.name, updated.description, updated.category, JSON.stringify(updated.tags), JSON.stringify(updated.steps), JSON.stringify(updated.expectations), updated.isArchived ? 1 : 0, newVersion, now, caseId);
        return {
            id: existing.id,
            caseId,
            ...updated,
            version: newVersion,
            createdAt: existing.createdAt,
            updatedAt: now,
        };
    }
    /**
     * Archive a test case (soft delete)
     */
    archiveTestCase(caseId) {
        const db = this.getDb();
        const result = db.prepare(`
      UPDATE test_cases SET is_archived = 1, updated_at = ? WHERE case_id = ?
    `).run(new Date().toISOString(), caseId);
        return result.changes > 0;
    }
    /**
     * Permanently delete a test case
     */
    deleteTestCase(caseId) {
        const db = this.getDb();
        const result = db.prepare(`DELETE FROM test_cases WHERE case_id = ?`).run(caseId);
        return result.changes > 0;
    }
    /**
     * Clone a test case with a new ID
     */
    cloneTestCase(caseId, newCaseId) {
        const existing = this.getTestCase(caseId);
        if (!existing)
            return null;
        return this.createTestCase({
            caseId: newCaseId,
            name: `${existing.name} (Copy)`,
            description: existing.description,
            category: existing.category,
            tags: [...existing.tags],
            steps: JSON.parse(JSON.stringify(existing.steps)),
            expectations: JSON.parse(JSON.stringify(existing.expectations)),
            isArchived: false,
        });
    }
    /**
     * Get test case statistics
     */
    getTestCaseStats() {
        const db = this.getDb();
        const total = db.prepare('SELECT COUNT(*) as count FROM test_cases WHERE is_archived = 0').get()?.count || 0;
        const archived = db.prepare('SELECT COUNT(*) as count FROM test_cases WHERE is_archived = 1').get()?.count || 0;
        const byCategoryRows = db.prepare(`
      SELECT category, COUNT(*) as count FROM test_cases WHERE is_archived = 0 GROUP BY category
    `).all();
        const byCategory = {};
        for (const row of byCategoryRows) {
            byCategory[row.category] = row.count;
        }
        return { total, byCategory, archived };
    }
    /**
     * Get all unique tags from test cases
     */
    getAllTags() {
        const db = this.getDb();
        const rows = db.prepare(`SELECT tags_json FROM test_cases WHERE is_archived = 0`).all();
        const tagSet = new Set();
        for (const row of rows) {
            const tags = JSON.parse(row.tags_json || '[]');
            for (const tag of tags) {
                tagSet.add(tag);
            }
        }
        return Array.from(tagSet).sort();
    }
    /**
     * Check if a test case ID exists
     */
    testCaseExists(caseId) {
        const db = this.getDb();
        const row = db.prepare('SELECT 1 FROM test_cases WHERE case_id = ?').get(caseId);
        return !!row;
    }
    /**
     * Generate the next available case ID for a category
     */
    generateNextCaseId(category) {
        const prefix = category === 'happy-path' ? 'HAPPY' :
            category === 'edge-case' ? 'EDGE' : 'ERR';
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT case_id FROM test_cases WHERE case_id LIKE ?
    `).all(`${prefix}-%`);
        let maxNum = 0;
        for (const row of rows) {
            const match = row.case_id.match(new RegExp(`^${prefix}-(\\d+)$`));
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum)
                    maxNum = num;
            }
        }
        return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
    }
    // ============================================================================
    // GOAL-ORIENTED TEST METHODS
    // ============================================================================
    /**
     * Save a goal test result
     */
    saveGoalTestResult(result) {
        const db = this.getDb();
        const info = db.prepare(`
      INSERT OR REPLACE INTO goal_test_results
      (run_id, test_id, passed, turn_count, duration_ms, started_at, completed_at,
       goal_results_json, constraint_violations_json, summary_text,
       resolved_persona_json, generation_seed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(result.runId, result.testId, result.passed, result.turnCount, result.durationMs, result.startedAt, result.completedAt, result.goalResultsJson, result.constraintViolationsJson, result.summaryText, result.resolvedPersonaJson, result.generationSeed);
        return info.lastInsertRowid;
    }
    /**
     * Get goal test results for a run
     */
    getGoalTestResults(runId) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, run_id, test_id, passed, turn_count, duration_ms, started_at, completed_at,
             goal_results_json, constraint_violations_json, summary_text,
             resolved_persona_json, generation_seed
      FROM goal_test_results
      WHERE run_id = ?
    `).all(runId);
        return rows.map(row => ({
            id: row.id,
            runId: row.run_id,
            testId: row.test_id,
            passed: row.passed,
            turnCount: row.turn_count,
            durationMs: row.duration_ms,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            goalResultsJson: row.goal_results_json,
            constraintViolationsJson: row.constraint_violations_json,
            summaryText: row.summary_text,
            resolvedPersonaJson: row.resolved_persona_json,
            generationSeed: row.generation_seed,
        }));
    }
    /**
     * Get a single goal test result
     */
    getGoalTestResult(runId, testId) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT id, run_id, test_id, passed, turn_count, duration_ms, started_at, completed_at,
             goal_results_json, constraint_violations_json, summary_text,
             resolved_persona_json, generation_seed
      FROM goal_test_results
      WHERE run_id = ? AND test_id = ?
    `).get(runId, testId);
        if (!row)
            return null;
        return {
            id: row.id,
            runId: row.run_id,
            testId: row.test_id,
            passed: row.passed,
            turnCount: row.turn_count,
            durationMs: row.duration_ms,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            goalResultsJson: row.goal_results_json,
            constraintViolationsJson: row.constraint_violations_json,
            summaryText: row.summary_text,
            resolvedPersonaJson: row.resolved_persona_json,
            generationSeed: row.generation_seed,
        };
    }
    /**
     * Save a goal progress snapshot
     */
    saveGoalProgressSnapshot(snapshot) {
        const db = this.getDb();
        db.prepare(`
      INSERT INTO goal_progress_snapshots
      (run_id, test_id, turn_number, collected_fields_json, pending_fields_json, issues_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(snapshot.runId, snapshot.testId, snapshot.turnNumber, snapshot.collectedFieldsJson, snapshot.pendingFieldsJson, snapshot.issuesJson);
    }
    /**
     * Get progress snapshots for a test
     */
    getGoalProgressSnapshots(runId, testId) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, run_id, test_id, turn_number, collected_fields_json, pending_fields_json, issues_json
      FROM goal_progress_snapshots
      WHERE run_id = ? AND test_id = ?
      ORDER BY turn_number ASC
    `).all(runId, testId);
        return rows.map(row => ({
            id: row.id,
            runId: row.run_id,
            testId: row.test_id,
            turnNumber: row.turn_number,
            collectedFieldsJson: row.collected_fields_json,
            pendingFieldsJson: row.pending_fields_json,
            issuesJson: row.issues_json,
        }));
    }
    /**
     * Get goal test statistics
     */
    getGoalTestStats(runId) {
        const db = this.getDb();
        let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) as failed,
        AVG(turn_count) as avg_turns
      FROM goal_test_results
    `;
        const params = [];
        if (runId) {
            query += ' WHERE run_id = ?';
            params.push(runId);
        }
        const row = db.prepare(query).get(...params);
        return {
            total: row?.total || 0,
            passed: row?.passed || 0,
            failed: row?.failed || 0,
            avgTurns: row?.avg_turns || 0,
        };
    }
    /**
     * Delete goal test data for a run
     */
    deleteGoalTestData(runId) {
        const db = this.getDb();
        db.prepare('DELETE FROM goal_progress_snapshots WHERE run_id = ?').run(runId);
        db.prepare('DELETE FROM goal_test_results WHERE run_id = ?').run(runId);
    }
    // ============================================================================
    // A/B TESTING FRAMEWORK METHODS
    // ============================================================================
    // ----- VARIANT METHODS -----
    /**
     * Save a variant
     */
    saveVariant(variant) {
        const db = this.getDb();
        db.prepare(`
      INSERT OR REPLACE INTO ab_variants
      (variant_id, variant_type, target_file, name, description, content, content_hash,
       baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(variant.variantId, variant.variantType, variant.targetFile, variant.name, variant.description, variant.content, variant.contentHash, variant.baselineVariantId, variant.sourceFixId, variant.isBaseline ? 1 : 0, variant.createdAt || new Date().toISOString(), variant.createdBy, variant.metadata ? JSON.stringify(variant.metadata) : null);
    }
    /**
     * Get a variant by ID
     */
    getVariant(variantId) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT variant_id, variant_type, target_file, name, description, content, content_hash,
             baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json
      FROM ab_variants
      WHERE variant_id = ?
    `).get(variantId);
        if (!row)
            return null;
        return this.mapRowToVariant(row);
    }
    /**
     * Get variants by target file
     */
    getVariantsByFile(targetFile) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT variant_id, variant_type, target_file, name, description, content, content_hash,
             baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json
      FROM ab_variants
      WHERE target_file = ?
      ORDER BY created_at DESC
    `).all(targetFile);
        return rows.map(row => this.mapRowToVariant(row));
    }
    /**
     * Get baseline variant for a file
     */
    getBaselineVariant(targetFile) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT variant_id, variant_type, target_file, name, description, content, content_hash,
             baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json
      FROM ab_variants
      WHERE target_file = ? AND is_baseline = 1
    `).get(targetFile);
        if (!row)
            return null;
        return this.mapRowToVariant(row);
    }
    /**
     * Set a variant as baseline (unsets others for same file)
     */
    setVariantAsBaseline(variantId) {
        const db = this.getDb();
        // Get the variant's target file
        const variant = this.getVariant(variantId);
        if (!variant)
            return;
        // Unset other baselines for the same file
        db.prepare(`
      UPDATE ab_variants SET is_baseline = 0 WHERE target_file = ?
    `).run(variant.targetFile);
        // Set this one as baseline
        db.prepare(`
      UPDATE ab_variants SET is_baseline = 1 WHERE variant_id = ?
    `).run(variantId);
    }
    /**
     * Find variant by content hash
     */
    findVariantByHash(contentHash, targetFile) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT variant_id, variant_type, target_file, name, description, content, content_hash,
             baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json
      FROM ab_variants
      WHERE content_hash = ? AND target_file = ?
    `).get(contentHash, targetFile);
        if (!row)
            return null;
        return this.mapRowToVariant(row);
    }
    /**
     * Get all variants
     */
    getAllVariants(options) {
        const db = this.getDb();
        let query = `
      SELECT variant_id, variant_type, target_file, name, description, content, content_hash,
             baseline_variant_id, source_fix_id, is_baseline, created_at, created_by, metadata_json
      FROM ab_variants
    `;
        const conditions = [];
        const params = [];
        if (options?.variantType) {
            conditions.push('variant_type = ?');
            params.push(options.variantType);
        }
        if (options?.isBaseline !== undefined) {
            conditions.push('is_baseline = ?');
            params.push(options.isBaseline ? 1 : 0);
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY created_at DESC';
        const rows = db.prepare(query).all(...params);
        return rows.map(row => this.mapRowToVariant(row));
    }
    mapRowToVariant(row) {
        return {
            variantId: row.variant_id,
            variantType: row.variant_type,
            targetFile: row.target_file,
            name: row.name,
            description: row.description,
            content: row.content,
            contentHash: row.content_hash,
            baselineVariantId: row.baseline_variant_id,
            sourceFixId: row.source_fix_id,
            isBaseline: row.is_baseline === 1,
            createdAt: row.created_at,
            createdBy: row.created_by,
            metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
        };
    }
    // ----- EXPERIMENT METHODS -----
    /**
     * Save an experiment
     */
    saveExperiment(experiment) {
        const db = this.getDb();
        db.prepare(`
      INSERT OR REPLACE INTO ab_experiments
      (experiment_id, name, description, hypothesis, status, experiment_type,
       variants_json, test_ids_json, traffic_split_json,
       min_sample_size, max_sample_size, significance_threshold,
       created_at, started_at, completed_at, winning_variant_id, conclusion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(experiment.experimentId, experiment.name, experiment.description, experiment.hypothesis, experiment.status, experiment.experimentType, JSON.stringify(experiment.variants), JSON.stringify(experiment.testIds), JSON.stringify(experiment.trafficSplit), experiment.minSampleSize, experiment.maxSampleSize, experiment.significanceThreshold, experiment.createdAt || new Date().toISOString(), experiment.startedAt, experiment.completedAt, experiment.winningVariantId, experiment.conclusion);
    }
    /**
     * Get an experiment by ID
     */
    getExperiment(experimentId) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT experiment_id, name, description, hypothesis, status, experiment_type,
             variants_json, test_ids_json, traffic_split_json,
             min_sample_size, max_sample_size, significance_threshold,
             created_at, started_at, completed_at, winning_variant_id, conclusion
      FROM ab_experiments
      WHERE experiment_id = ?
    `).get(experimentId);
        if (!row)
            return null;
        return this.mapRowToExperiment(row);
    }
    /**
     * Get experiments by status
     */
    getExperimentsByStatus(status) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT experiment_id, name, description, hypothesis, status, experiment_type,
             variants_json, test_ids_json, traffic_split_json,
             min_sample_size, max_sample_size, significance_threshold,
             created_at, started_at, completed_at, winning_variant_id, conclusion
      FROM ab_experiments
      WHERE status = ?
      ORDER BY created_at DESC
    `).all(status);
        return rows.map(row => this.mapRowToExperiment(row));
    }
    /**
     * Get all experiments
     */
    getAllExperiments(options) {
        const db = this.getDb();
        let query = `
      SELECT experiment_id, name, description, hypothesis, status, experiment_type,
             variants_json, test_ids_json, traffic_split_json,
             min_sample_size, max_sample_size, significance_threshold,
             created_at, started_at, completed_at, winning_variant_id, conclusion
      FROM ab_experiments
    `;
        const params = [];
        if (options?.status) {
            query += ' WHERE status = ?';
            params.push(options.status);
        }
        query += ' ORDER BY created_at DESC';
        if (options?.limit) {
            query += ' LIMIT ?';
            params.push(options.limit);
        }
        const rows = db.prepare(query).all(...params);
        return rows.map(row => this.mapRowToExperiment(row));
    }
    /**
     * Update experiment status
     */
    updateExperimentStatus(experimentId, status, updates) {
        const db = this.getDb();
        let query = 'UPDATE ab_experiments SET status = ?';
        const params = [status];
        if (updates?.startedAt) {
            query += ', started_at = ?';
            params.push(updates.startedAt);
        }
        if (updates?.completedAt) {
            query += ', completed_at = ?';
            params.push(updates.completedAt);
        }
        if (updates?.winningVariantId) {
            query += ', winning_variant_id = ?';
            params.push(updates.winningVariantId);
        }
        if (updates?.conclusion) {
            query += ', conclusion = ?';
            params.push(updates.conclusion);
        }
        query += ' WHERE experiment_id = ?';
        params.push(experimentId);
        db.prepare(query).run(...params);
    }
    mapRowToExperiment(row) {
        return {
            experimentId: row.experiment_id,
            name: row.name,
            description: row.description,
            hypothesis: row.hypothesis,
            status: row.status,
            experimentType: row.experiment_type,
            variants: JSON.parse(row.variants_json),
            testIds: JSON.parse(row.test_ids_json),
            trafficSplit: JSON.parse(row.traffic_split_json || '{}'),
            minSampleSize: row.min_sample_size,
            maxSampleSize: row.max_sample_size,
            significanceThreshold: row.significance_threshold,
            createdAt: row.created_at,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            winningVariantId: row.winning_variant_id,
            conclusion: row.conclusion,
        };
    }
    // ----- EXPERIMENT RUN METHODS -----
    /**
     * Save an experiment run
     */
    saveExperimentRun(run) {
        const db = this.getDb();
        const info = db.prepare(`
      INSERT INTO ab_experiment_runs
      (experiment_id, run_id, test_id, variant_id, variant_role,
       started_at, completed_at, passed, turn_count, duration_ms,
       goal_completion_rate, constraint_violations, error_occurred, metrics_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(run.experimentId, run.runId, run.testId, run.variantId, run.variantRole, run.startedAt, run.completedAt, run.passed ? 1 : 0, run.turnCount, run.durationMs, run.goalCompletionRate, run.constraintViolations, run.errorOccurred ? 1 : 0, run.metrics ? JSON.stringify(run.metrics) : null);
        return info.lastInsertRowid;
    }
    /**
     * Get experiment runs for an experiment
     */
    getExperimentRuns(experimentId) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, experiment_id, run_id, test_id, variant_id, variant_role,
             started_at, completed_at, passed, turn_count, duration_ms,
             goal_completion_rate, constraint_violations, error_occurred, metrics_json
      FROM ab_experiment_runs
      WHERE experiment_id = ?
      ORDER BY started_at ASC
    `).all(experimentId);
        return rows.map(row => this.mapRowToExperimentRun(row));
    }
    /**
     * Get experiment runs for a specific variant
     */
    getExperimentRunsByVariant(experimentId, variantId) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, experiment_id, run_id, test_id, variant_id, variant_role,
             started_at, completed_at, passed, turn_count, duration_ms,
             goal_completion_rate, constraint_violations, error_occurred, metrics_json
      FROM ab_experiment_runs
      WHERE experiment_id = ? AND variant_id = ?
      ORDER BY started_at ASC
    `).all(experimentId, variantId);
        return rows.map(row => this.mapRowToExperimentRun(row));
    }
    /**
     * Count runs per variant for an experiment
     */
    countExperimentRuns(experimentId) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT variant_id, COUNT(*) as count, SUM(passed) as pass_count
      FROM ab_experiment_runs
      WHERE experiment_id = ?
      GROUP BY variant_id
    `).all(experimentId);
        return rows.map(row => ({
            variantId: row.variant_id,
            count: row.count,
            passCount: row.pass_count || 0,
        }));
    }
    mapRowToExperimentRun(row) {
        return {
            id: row.id,
            experimentId: row.experiment_id,
            runId: row.run_id,
            testId: row.test_id,
            variantId: row.variant_id,
            variantRole: row.variant_role,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            passed: row.passed === 1,
            turnCount: row.turn_count,
            durationMs: row.duration_ms,
            goalCompletionRate: row.goal_completion_rate,
            constraintViolations: row.constraint_violations,
            errorOccurred: row.error_occurred === 1,
            metrics: row.metrics_json ? JSON.parse(row.metrics_json) : undefined,
        };
    }
    // ----- EXPERIMENT TRIGGER METHODS -----
    /**
     * Save an experiment trigger
     */
    saveExperimentTrigger(trigger) {
        const db = this.getDb();
        db.prepare(`
      INSERT OR REPLACE INTO ab_experiment_triggers
      (trigger_id, experiment_id, trigger_type, condition_json, enabled, last_triggered)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(trigger.triggerId, trigger.experimentId, trigger.triggerType, trigger.condition ? JSON.stringify(trigger.condition) : null, trigger.enabled ? 1 : 0, trigger.lastTriggered);
    }
    /**
     * Get triggers for an experiment
     */
    getExperimentTriggers(experimentId) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT trigger_id, experiment_id, trigger_type, condition_json, enabled, last_triggered
      FROM ab_experiment_triggers
      WHERE experiment_id = ?
    `).all(experimentId);
        return rows.map(row => ({
            triggerId: row.trigger_id,
            experimentId: row.experiment_id,
            triggerType: row.trigger_type,
            condition: row.condition_json ? JSON.parse(row.condition_json) : undefined,
            enabled: row.enabled === 1,
            lastTriggered: row.last_triggered,
        }));
    }
    /**
     * Get enabled triggers
     */
    getEnabledTriggers() {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT trigger_id, experiment_id, trigger_type, condition_json, enabled, last_triggered
      FROM ab_experiment_triggers
      WHERE enabled = 1
    `).all();
        return rows.map(row => ({
            triggerId: row.trigger_id,
            experimentId: row.experiment_id,
            triggerType: row.trigger_type,
            condition: row.condition_json ? JSON.parse(row.condition_json) : undefined,
            enabled: true,
            lastTriggered: row.last_triggered,
        }));
    }
    /**
     * Update trigger last triggered time
     */
    updateTriggerLastTriggered(triggerId) {
        const db = this.getDb();
        db.prepare(`
      UPDATE ab_experiment_triggers SET last_triggered = ? WHERE trigger_id = ?
    `).run(new Date().toISOString(), triggerId);
    }
    // ----- A/B TESTING STATISTICS -----
    /**
     * Get A/B testing statistics
     */
    getABTestingStats() {
        const db = this.getDb();
        const expStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM ab_experiments
    `).get();
        const variantCount = db.prepare('SELECT COUNT(*) as count FROM ab_variants').get()?.count || 0;
        const runCount = db.prepare('SELECT COUNT(*) as count FROM ab_experiment_runs').get()?.count || 0;
        return {
            totalExperiments: expStats?.total || 0,
            runningExperiments: expStats?.running || 0,
            completedExperiments: expStats?.completed || 0,
            totalVariants: variantCount,
            totalRuns: runCount,
        };
    }
    // ============================================================================
    // A/B TESTING SANDBOX METHODS
    // ============================================================================
    // ----- SANDBOX METHODS -----
    /**
     * Initialize default sandboxes (A and B)
     */
    initializeSandboxes() {
        const db = this.getDb();
        const now = new Date().toISOString();
        // Check if sandboxes already exist
        const existingA = db.prepare('SELECT 1 FROM ab_sandboxes WHERE sandbox_id = ?').get('sandbox_a');
        const existingB = db.prepare('SELECT 1 FROM ab_sandboxes WHERE sandbox_id = ?').get('sandbox_b');
        if (!existingA) {
            db.prepare(`
        INSERT INTO ab_sandboxes (sandbox_id, name, description, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run('sandbox_a', 'Sandbox A', 'First sandbox for A/B testing', now, now);
        }
        if (!existingB) {
            db.prepare(`
        INSERT INTO ab_sandboxes (sandbox_id, name, description, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run('sandbox_b', 'Sandbox B', 'Second sandbox for A/B testing', now, now);
        }
    }
    /**
     * Get a sandbox by ID
     */
    getSandbox(sandboxId) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT id, sandbox_id, name, description, flowise_endpoint, flowise_api_key,
             langfuse_host, langfuse_public_key, langfuse_secret_key,
             is_active, created_at, updated_at
      FROM ab_sandboxes
      WHERE sandbox_id = ?
    `).get(sandboxId);
        if (!row)
            return null;
        return {
            id: row.id,
            sandboxId: row.sandbox_id,
            name: row.name,
            description: row.description,
            flowiseEndpoint: row.flowise_endpoint,
            flowiseApiKey: row.flowise_api_key,
            langfuseHost: row.langfuse_host,
            langfusePublicKey: row.langfuse_public_key,
            langfuseSecretKey: row.langfuse_secret_key,
            isActive: row.is_active === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    /**
     * Get all sandboxes
     */
    getAllSandboxes() {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, sandbox_id, name, description, flowise_endpoint, flowise_api_key,
             langfuse_host, langfuse_public_key, langfuse_secret_key,
             is_active, created_at, updated_at
      FROM ab_sandboxes
      ORDER BY sandbox_id
    `).all();
        return rows.map(row => ({
            id: row.id,
            sandboxId: row.sandbox_id,
            name: row.name,
            description: row.description,
            flowiseEndpoint: row.flowise_endpoint,
            flowiseApiKey: row.flowise_api_key,
            langfuseHost: row.langfuse_host,
            langfusePublicKey: row.langfuse_public_key,
            langfuseSecretKey: row.langfuse_secret_key,
            isActive: row.is_active === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
    /**
     * Update a sandbox
     */
    updateSandbox(sandboxId, updates) {
        const db = this.getDb();
        const now = new Date().toISOString();
        const setClauses = ['updated_at = ?'];
        const params = [now];
        if (updates.name !== undefined) {
            setClauses.push('name = ?');
            params.push(updates.name);
        }
        if (updates.description !== undefined) {
            setClauses.push('description = ?');
            params.push(updates.description);
        }
        if (updates.flowiseEndpoint !== undefined) {
            setClauses.push('flowise_endpoint = ?');
            params.push(updates.flowiseEndpoint);
        }
        if (updates.flowiseApiKey !== undefined) {
            setClauses.push('flowise_api_key = ?');
            params.push(updates.flowiseApiKey);
        }
        if (updates.langfuseHost !== undefined) {
            setClauses.push('langfuse_host = ?');
            params.push(updates.langfuseHost);
        }
        if (updates.langfusePublicKey !== undefined) {
            setClauses.push('langfuse_public_key = ?');
            params.push(updates.langfusePublicKey);
        }
        if (updates.langfuseSecretKey !== undefined) {
            setClauses.push('langfuse_secret_key = ?');
            params.push(updates.langfuseSecretKey);
        }
        if (updates.isActive !== undefined) {
            setClauses.push('is_active = ?');
            params.push(updates.isActive ? 1 : 0);
        }
        params.push(sandboxId);
        db.prepare(`
      UPDATE ab_sandboxes SET ${setClauses.join(', ')} WHERE sandbox_id = ?
    `).run(...params);
    }
    // ----- SANDBOX FILE METHODS -----
    /**
     * Get a sandbox file
     */
    getSandboxFile(sandboxId, fileKey) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT id, sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at
      FROM ab_sandbox_files
      WHERE sandbox_id = ? AND file_key = ?
    `).get(sandboxId, fileKey);
        if (!row)
            return null;
        return {
            id: row.id,
            sandboxId: row.sandbox_id,
            fileKey: row.file_key,
            fileType: row.file_type,
            displayName: row.display_name,
            content: row.content,
            version: row.version,
            baseVersion: row.base_version,
            changeDescription: row.change_description,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    /**
     * Get all files for a sandbox
     */
    getSandboxFiles(sandboxId) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at
      FROM ab_sandbox_files
      WHERE sandbox_id = ?
      ORDER BY file_key
    `).all(sandboxId);
        return rows.map(row => ({
            id: row.id,
            sandboxId: row.sandbox_id,
            fileKey: row.file_key,
            fileType: row.file_type,
            displayName: row.display_name,
            content: row.content,
            version: row.version,
            baseVersion: row.base_version,
            changeDescription: row.change_description,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
    /**
     * Save or update a sandbox file (creates new version)
     */
    saveSandboxFile(file) {
        const db = this.getDb();
        const now = new Date().toISOString();
        // Check if file exists
        const existing = this.getSandboxFile(file.sandboxId, file.fileKey);
        if (existing) {
            // Save current version to history
            db.prepare(`
        INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(existing.sandboxId, existing.fileKey, existing.version, existing.content, existing.changeDescription, now);
            // Update with new content
            const newVersion = existing.version + 1;
            db.prepare(`
        UPDATE ab_sandbox_files
        SET content = ?, version = ?, change_description = ?, updated_at = ?
        WHERE sandbox_id = ? AND file_key = ?
      `).run(file.content, newVersion, file.changeDescription, now, file.sandboxId, file.fileKey);
            return newVersion;
        }
        else {
            // Insert new file
            db.prepare(`
        INSERT INTO ab_sandbox_files (sandbox_id, file_key, file_type, display_name, content, version, base_version, change_description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(file.sandboxId, file.fileKey, file.fileType, file.displayName, file.content, file.version, file.baseVersion, file.changeDescription, now, now);
            return file.version;
        }
    }
    /**
     * Get sandbox file history
     */
    getSandboxFileHistory(sandboxId, fileKey, limit = 20) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, sandbox_id, file_key, version, content, change_description, created_at
      FROM ab_sandbox_file_history
      WHERE sandbox_id = ? AND file_key = ?
      ORDER BY version DESC
      LIMIT ?
    `).all(sandboxId, fileKey, limit);
        return rows.map(row => ({
            id: row.id,
            sandboxId: row.sandbox_id,
            fileKey: row.file_key,
            version: row.version,
            content: row.content,
            changeDescription: row.change_description,
            createdAt: row.created_at,
        }));
    }
    /**
     * Rollback sandbox file to a specific version
     */
    rollbackSandboxFile(sandboxId, fileKey, version) {
        const db = this.getDb();
        // Get the version from history
        const historyRow = db.prepare(`
      SELECT content, change_description FROM ab_sandbox_file_history
      WHERE sandbox_id = ? AND file_key = ? AND version = ?
    `).get(sandboxId, fileKey, version);
        if (!historyRow) {
            throw new Error(`Version ${version} not found in history for ${fileKey}`);
        }
        // Get current file
        const current = this.getSandboxFile(sandboxId, fileKey);
        if (!current) {
            throw new Error(`File ${fileKey} not found in sandbox ${sandboxId}`);
        }
        // Save current to history
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO ab_sandbox_file_history (sandbox_id, file_key, version, content, change_description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sandboxId, fileKey, current.version, current.content, current.changeDescription, now);
        // Update with rolled back content
        db.prepare(`
      UPDATE ab_sandbox_files
      SET content = ?, version = ?, change_description = ?, updated_at = ?
      WHERE sandbox_id = ? AND file_key = ?
    `).run(historyRow.content, current.version + 1, `Rolled back to version ${version}`, now, sandboxId, fileKey);
    }
    /**
     * Delete all files for a sandbox (for reset)
     */
    clearSandboxFiles(sandboxId) {
        const db = this.getDb();
        db.prepare('DELETE FROM ab_sandbox_file_history WHERE sandbox_id = ?').run(sandboxId);
        db.prepare('DELETE FROM ab_sandbox_files WHERE sandbox_id = ?').run(sandboxId);
    }
    // ----- COMPARISON RUN METHODS -----
    /**
     * Create a comparison run
     */
    createComparisonRun(run) {
        const db = this.getDb();
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO ab_sandbox_comparison_runs
      (comparison_id, name, status, test_ids_json, production_results_json, sandbox_a_results_json, sandbox_b_results_json, started_at, completed_at, summary_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(run.comparisonId, run.name, run.status, run.testIds ? JSON.stringify(run.testIds) : null, run.productionResults ? JSON.stringify(run.productionResults) : null, run.sandboxAResults ? JSON.stringify(run.sandboxAResults) : null, run.sandboxBResults ? JSON.stringify(run.sandboxBResults) : null, run.startedAt, run.completedAt, run.summary ? JSON.stringify(run.summary) : null, now);
        return run.comparisonId;
    }
    /**
     * Get a comparison run
     */
    getComparisonRun(comparisonId) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT id, comparison_id, name, status, test_ids_json, production_results_json, sandbox_a_results_json, sandbox_b_results_json, started_at, completed_at, summary_json, created_at
      FROM ab_sandbox_comparison_runs
      WHERE comparison_id = ?
    `).get(comparisonId);
        if (!row)
            return null;
        return {
            id: row.id,
            comparisonId: row.comparison_id,
            name: row.name,
            status: row.status,
            testIds: row.test_ids_json ? JSON.parse(row.test_ids_json) : undefined,
            productionResults: row.production_results_json ? JSON.parse(row.production_results_json) : undefined,
            sandboxAResults: row.sandbox_a_results_json ? JSON.parse(row.sandbox_a_results_json) : undefined,
            sandboxBResults: row.sandbox_b_results_json ? JSON.parse(row.sandbox_b_results_json) : undefined,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            summary: row.summary_json ? JSON.parse(row.summary_json) : undefined,
            createdAt: row.created_at,
        };
    }
    /**
     * Update a comparison run
     */
    updateComparisonRun(comparisonId, updates) {
        const db = this.getDb();
        const setClauses = [];
        const params = [];
        if (updates.status !== undefined) {
            setClauses.push('status = ?');
            params.push(updates.status);
        }
        if (updates.productionResults !== undefined) {
            setClauses.push('production_results_json = ?');
            params.push(JSON.stringify(updates.productionResults));
        }
        if (updates.sandboxAResults !== undefined) {
            setClauses.push('sandbox_a_results_json = ?');
            params.push(JSON.stringify(updates.sandboxAResults));
        }
        if (updates.sandboxBResults !== undefined) {
            setClauses.push('sandbox_b_results_json = ?');
            params.push(JSON.stringify(updates.sandboxBResults));
        }
        if (updates.startedAt !== undefined) {
            setClauses.push('started_at = ?');
            params.push(updates.startedAt);
        }
        if (updates.completedAt !== undefined) {
            setClauses.push('completed_at = ?');
            params.push(updates.completedAt);
        }
        if (updates.summary !== undefined) {
            setClauses.push('summary_json = ?');
            params.push(JSON.stringify(updates.summary));
        }
        if (setClauses.length === 0)
            return;
        params.push(comparisonId);
        db.prepare(`
      UPDATE ab_sandbox_comparison_runs SET ${setClauses.join(', ')} WHERE comparison_id = ?
    `).run(...params);
    }
    /**
     * Get comparison run history
     */
    getComparisonRunHistory(limit = 20) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT id, comparison_id, name, status, test_ids_json, production_results_json, sandbox_a_results_json, sandbox_b_results_json, started_at, completed_at, summary_json, created_at
      FROM ab_sandbox_comparison_runs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
        return rows.map(row => ({
            id: row.id,
            comparisonId: row.comparison_id,
            name: row.name,
            status: row.status,
            testIds: row.test_ids_json ? JSON.parse(row.test_ids_json) : undefined,
            productionResults: row.production_results_json ? JSON.parse(row.production_results_json) : undefined,
            sandboxAResults: row.sandbox_a_results_json ? JSON.parse(row.sandbox_a_results_json) : undefined,
            sandboxBResults: row.sandbox_b_results_json ? JSON.parse(row.sandbox_b_results_json) : undefined,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            summary: row.summary_json ? JSON.parse(row.summary_json) : undefined,
            createdAt: row.created_at,
        }));
    }
    // ============================================================================
    // AI ENHANCEMENT METHODS
    // ============================================================================
    /**
     * Create a new AI enhancement record
     */
    createEnhancement(enhancement) {
        const db = this.getDb();
        const enhancementId = `enh-${new Date().toISOString().slice(0, 10)}-${(0, uuid_1.v4)().slice(0, 8)}`;
        db.prepare(`
      INSERT INTO ai_enhancement_history
      (enhancement_id, file_key, source_version, command, command_template, web_search_used, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(enhancementId, enhancement.fileKey, enhancement.sourceVersion, enhancement.command, enhancement.commandTemplate || null, enhancement.webSearchUsed ? 1 : 0, enhancement.status, enhancement.createdBy);
        return enhancementId;
    }
    /**
     * Update an enhancement record
     */
    updateEnhancement(enhancementId, updates) {
        const db = this.getDb();
        const setClauses = [];
        const values = [];
        if (updates.status !== undefined) {
            setClauses.push('status = ?');
            values.push(updates.status);
        }
        if (updates.resultVersion !== undefined) {
            setClauses.push('result_version = ?');
            values.push(updates.resultVersion);
        }
        if (updates.webSearchQueries !== undefined) {
            setClauses.push('web_search_queries = ?');
            values.push(updates.webSearchQueries);
        }
        if (updates.webSearchResultsJson !== undefined) {
            setClauses.push('web_search_results_json = ?');
            values.push(updates.webSearchResultsJson);
        }
        if (updates.enhancementPrompt !== undefined) {
            setClauses.push('enhancement_prompt = ?');
            values.push(updates.enhancementPrompt);
        }
        if (updates.aiResponseJson !== undefined) {
            setClauses.push('ai_response_json = ?');
            values.push(updates.aiResponseJson);
        }
        if (updates.qualityScoreBefore !== undefined) {
            setClauses.push('quality_score_before = ?');
            values.push(updates.qualityScoreBefore);
        }
        if (updates.qualityScoreAfter !== undefined) {
            setClauses.push('quality_score_after = ?');
            values.push(updates.qualityScoreAfter);
        }
        if (updates.errorMessage !== undefined) {
            setClauses.push('error_message = ?');
            values.push(updates.errorMessage);
        }
        if (updates.completedAt !== undefined) {
            setClauses.push('completed_at = ?');
            values.push(updates.completedAt);
        }
        if (updates.metadataJson !== undefined) {
            setClauses.push('metadata_json = ?');
            values.push(updates.metadataJson);
        }
        // New applied/promoted fields
        if (updates.appliedAt !== undefined) {
            setClauses.push('applied_at = ?');
            values.push(updates.appliedAt);
        }
        if (updates.promotedAt !== undefined) {
            setClauses.push('promoted_at = ?');
            values.push(updates.promotedAt);
        }
        if (updates.appliedContent !== undefined) {
            setClauses.push('applied_content = ?');
            values.push(updates.appliedContent);
        }
        if (setClauses.length === 0)
            return;
        values.push(enhancementId);
        db.prepare(`
      UPDATE ai_enhancement_history
      SET ${setClauses.join(', ')}
      WHERE enhancement_id = ?
    `).run(...values);
    }
    /**
     * Get enhancement by ID
     */
    getEnhancement(enhancementId) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT * FROM ai_enhancement_history WHERE enhancement_id = ?
    `).get(enhancementId);
        if (!row)
            return null;
        return this.mapEnhancementRow(row);
    }
    /**
     * Get enhancement history for a file
     */
    getEnhancementHistory(fileKey, limit = 20) {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT * FROM ai_enhancement_history
      WHERE file_key = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(fileKey, limit);
        return rows.map(row => this.mapEnhancementRow(row));
    }
    /**
     * Get all enhancement templates
     */
    getEnhancementTemplates() {
        const db = this.getDb();
        const rows = db.prepare(`
      SELECT * FROM ai_enhancement_templates
      ORDER BY is_built_in DESC, usage_count DESC, name ASC
    `).all();
        return rows.map(row => ({
            id: row.id,
            templateId: row.template_id,
            name: row.name,
            description: row.description,
            commandTemplate: row.command_template,
            category: row.category,
            useWebSearch: row.use_web_search === 1,
            defaultSearchQueries: row.default_search_queries,
            isBuiltIn: row.is_built_in === 1,
            createdAt: row.created_at,
            usageCount: row.usage_count,
        }));
    }
    /**
     * Get a specific enhancement template
     */
    getEnhancementTemplate(templateId) {
        const db = this.getDb();
        const row = db.prepare(`
      SELECT * FROM ai_enhancement_templates WHERE template_id = ?
    `).get(templateId);
        if (!row)
            return null;
        return {
            id: row.id,
            templateId: row.template_id,
            name: row.name,
            description: row.description,
            commandTemplate: row.command_template,
            category: row.category,
            useWebSearch: row.use_web_search === 1,
            defaultSearchQueries: row.default_search_queries,
            isBuiltIn: row.is_built_in === 1,
            createdAt: row.created_at,
            usageCount: row.usage_count,
        };
    }
    /**
     * Increment template usage count
     */
    incrementTemplateUsage(templateId) {
        const db = this.getDb();
        db.prepare(`
      UPDATE ai_enhancement_templates
      SET usage_count = usage_count + 1
      WHERE template_id = ?
    `).run(templateId);
    }
    /**
     * Create a custom enhancement template
     */
    createEnhancementTemplate(template) {
        const db = this.getDb();
        const templateId = `tpl-${(0, uuid_1.v4)().slice(0, 8)}`;
        db.prepare(`
      INSERT INTO ai_enhancement_templates
      (template_id, name, description, command_template, category, use_web_search, is_built_in)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(templateId, template.name, template.description || null, template.commandTemplate, template.category, template.useWebSearch ? 1 : 0);
        return templateId;
    }
    /**
     * Helper to map enhancement row to interface
     */
    mapEnhancementRow(row) {
        return {
            id: row.id,
            enhancementId: row.enhancement_id,
            fileKey: row.file_key,
            sourceVersion: row.source_version,
            resultVersion: row.result_version,
            command: row.command,
            commandTemplate: row.command_template,
            webSearchUsed: row.web_search_used === 1,
            webSearchQueries: row.web_search_queries,
            webSearchResultsJson: row.web_search_results_json,
            enhancementPrompt: row.enhancement_prompt,
            aiResponseJson: row.ai_response_json,
            qualityScoreBefore: row.quality_score_before,
            qualityScoreAfter: row.quality_score_after,
            status: row.status,
            errorMessage: row.error_message,
            createdAt: row.created_at,
            completedAt: row.completed_at,
            createdBy: row.created_by,
            metadataJson: row.metadata_json,
            // New applied/promoted fields
            appliedAt: row.applied_at,
            promotedAt: row.promoted_at,
            appliedContent: row.applied_content,
        };
    }
    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
exports.Database = Database;
//# sourceMappingURL=database.js.map