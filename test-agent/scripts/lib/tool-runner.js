/**
 * TOOL RUNNER LIBRARY
 *
 * Execute the actual Flowise tool code (patient_tool and scheduling_tool)
 * exactly as Flowise would call them. This enables debugging and replay testing.
 *
 * Usage:
 *   const { runPatientTool, runSchedulingTool } = require('./lib/tool-runner');
 *
 *   // Call patient tool
 *   const result = await runPatientTool({ action: 'create', ... });
 *
 *   // Call scheduling tool
 *   const slots = await runSchedulingTool({ action: 'grouped_slots', ... });
 */

const fs = require('fs');
const path = require('path');

// Tool code paths
const SCHEDULING_TOOL_PATH = path.join(__dirname, '../../../docs/v1/scheduling_tool_func.js');
const PATIENT_TOOL_PATH = path.join(__dirname, '../../../docs/v1/patient_tool_func.js');

// Cache loaded tool code
let schedulingToolCode = null;
let patientToolCode = null;

/**
 * Load tool code from file (with caching)
 */
function loadToolCode(toolPath) {
    return fs.readFileSync(toolPath, 'utf8');
}

/**
 * Execute tool code with given input parameters
 * This replicates exactly how Flowise executes the tool
 *
 * Flowise injects variables like $action, $startDate, $vars, etc.
 * We need to define these before executing the tool code.
 *
 * @param {string} toolCode - The JavaScript code of the tool
 * @param {object} params - Input parameters for the tool
 * @returns {Promise<object>} - The tool's response (parsed JSON)
 */
async function executeToolCode(toolCode, params) {
    // Create an async function that runs the tool code
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

    // Build Flowise-style variable definitions
    // Each param becomes a $variable
    const varDefinitions = Object.entries(params).map(([key, value]) => {
        const jsonValue = JSON.stringify(value);
        return `const $${key} = ${jsonValue};`;
    }).join('\n');

    // Also define $vars for c1mg_uui (Flowise context)
    const varsObj = {
        c1mg_uui: params.uui || 'test-runner-' + Date.now()
    };

    // Wrap the tool code with variable definitions
    const wrappedCode = `
        const $input = ${JSON.stringify(JSON.stringify(params))};
        const $vars = ${JSON.stringify(varsObj)};
        ${varDefinitions}
        ${toolCode}
    `;

    const func = new AsyncFunction('require', wrappedCode);

    try {
        const result = await func(require);

        // Parse result if it's a string
        if (typeof result === 'string') {
            try {
                return JSON.parse(result);
            } catch (e) {
                return { rawResponse: result };
            }
        }
        return result;
    } catch (error) {
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
}

/**
 * Run the Patient Tool (chord_ortho_patient)
 *
 * Actions:
 * - search: Search for existing patients
 * - lookup: Look up patient by GUID
 * - create: Create a new patient record
 *
 * @param {object} params - Tool parameters
 * @param {string} params.action - 'search', 'lookup', or 'create'
 * @param {string} params.uui - Session/correlation ID
 * @param {string} [params.patientFirstName] - For create
 * @param {string} [params.patientLastName] - For create
 * @param {string} [params.patientBirthday] - For create (YYYY-MM-DD)
 * @param {string} [params.phoneNumber] - For create
 * @param {string} [params.email] - For create
 * @param {string} [params.locationGUID] - For create
 * @returns {Promise<object>}
 */
async function runPatientTool(params) {
    if (!patientToolCode) {
        patientToolCode = loadToolCode(PATIENT_TOOL_PATH);
    }

    console.log('\n[PatientTool] Executing action:', params.action);
    console.log('[PatientTool] Input:', JSON.stringify(params, null, 2));

    const startTime = Date.now();
    const result = await executeToolCode(patientToolCode, params);
    const duration = Date.now() - startTime;

    console.log('[PatientTool] Duration:', duration, 'ms');
    console.log('[PatientTool] Output:', JSON.stringify(result, null, 2).substring(0, 1500));

    return result;
}

/**
 * Run the Scheduling Tool (schedule_appointment_ortho)
 *
 * Actions:
 * - slots: Get available appointment slots
 * - grouped_slots: Get consecutive slots for sibling booking
 * - book_child: Book an appointment for a child
 * - cancel: Cancel an existing appointment
 *
 * @param {object} params - Tool parameters
 * @param {string} params.action - 'slots', 'grouped_slots', 'book_child', or 'cancel'
 * @param {string} params.uui - Session/correlation ID
 * @param {number} [params.numberOfChildren] - For grouped_slots
 * @param {string} [params.patientGUID] - For book_child
 * @param {string} [params.bookingAuthToken] - For book_child (from patient create)
 * @param {string} [params.startTime] - For book_child
 * @param {string} [params.scheduleColumnGUID] - For book_child (chair)
 * @param {string} [params.scheduleViewGUID] - For book_child
 * @param {string} [params.childName] - For book_child (child's name for note)
 * @param {string} [params.childDOB] - For book_child (child's DOB for note)
 * @returns {Promise<object>}
 */
async function runSchedulingTool(params) {
    if (!schedulingToolCode) {
        schedulingToolCode = loadToolCode(SCHEDULING_TOOL_PATH);
    }

    console.log('\n[SchedulingTool] Executing action:', params.action);
    console.log('[SchedulingTool] Input:', JSON.stringify(params, null, 2));

    const startTime = Date.now();
    const result = await executeToolCode(schedulingToolCode, params);
    const duration = Date.now() - startTime;

    console.log('[SchedulingTool] Duration:', duration, 'ms');
    console.log('[SchedulingTool] Output:', JSON.stringify(result, null, 2).substring(0, 2000));

    return result;
}

/**
 * Get tool versions
 */
function getToolVersions() {
    if (!schedulingToolCode) {
        schedulingToolCode = loadToolCode(SCHEDULING_TOOL_PATH);
    }
    if (!patientToolCode) {
        patientToolCode = loadToolCode(PATIENT_TOOL_PATH);
    }

    const schedMatch = schedulingToolCode.match(/Version:\s*(v\d+)/);
    const patMatch = patientToolCode.match(/Version:\s*(v\d+)/);

    return {
        schedulingTool: schedMatch ? schedMatch[1] : 'unknown',
        patientTool: patMatch ? patMatch[1] : 'unknown'
    };
}

/**
 * Reload tool code (useful if code was updated)
 */
function reloadTools() {
    schedulingToolCode = loadToolCode(SCHEDULING_TOOL_PATH);
    patientToolCode = loadToolCode(PATIENT_TOOL_PATH);
    return getToolVersions();
}

module.exports = {
    runPatientTool,
    runSchedulingTool,
    getToolVersions,
    reloadTools,
    SCHEDULING_TOOL_PATH,
    PATIENT_TOOL_PATH
};
