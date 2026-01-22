/**
 * ============================================================================
 * CLOUD9 API RETRY UTILITY
 * Version: v1 | Created: 2026-01-21
 * ============================================================================
 * Reusable retry logic for Cloud9 API calls with rate limiting protection.
 *
 * Usage in Node-RED function nodes:
 *   const utils = global.get('cloud9RetryUtils') || require('./cloud9_retry_utils');
 *   const result = await utils.fetchWithRetry(url, options, retryConfig);
 *
 * Usage in Flowise tools:
 *   // Copy the functions directly or load via node-fetch wrapper
 * ============================================================================
 */

// Default retry configuration
const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,              // Maximum number of retry attempts
    initialDelayMs: 5000,       // Delay between retries (5 seconds per user requirement)
    maxDelayMs: 5000,           // Keep consistent 5 second delay
    backoffMultiplier: 1,       // No backoff - constant 5 second delay
    retryOnZeroResults: true,   // Retry when API returns 0 results (rate limiting pattern)
    timeout: 60000              // Request timeout in ms
};

// Rate limiting detection patterns
const RATE_LIMIT_INDICATORS = {
    httpCodes: [429, 503],       // HTTP status codes indicating rate limit
    errorPatterns: [             // Error message patterns
        'rate limit',
        'too many requests',
        'throttle',
        'retry after'
    ]
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay between retries
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {object} config - Retry configuration
 * @returns {number} - Delay in milliseconds (constant 5 seconds by default)
 */
function calculateDelay(attempt, config) {
    // Use constant delay (5 seconds) unless backoff is configured
    if (config.backoffMultiplier <= 1) {
        return config.initialDelayMs;
    }
    // Optional: exponential backoff if configured
    const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
    return Math.min(baseDelay, config.maxDelayMs);
}

/**
 * Detect if error indicates rate limiting
 * @param {Error|string} error - Error object or message
 * @param {number} httpStatus - HTTP status code
 * @returns {boolean}
 */
function isRateLimitError(error, httpStatus) {
    // Check HTTP status codes
    if (RATE_LIMIT_INDICATORS.httpCodes.includes(httpStatus)) {
        return true;
    }

    // Check error message patterns
    const errorMsg = (error?.message || String(error)).toLowerCase();
    return RATE_LIMIT_INDICATORS.errorPatterns.some(pattern =>
        errorMsg.includes(pattern.toLowerCase())
    );
}

/**
 * Detect if response indicates rate limiting (0 results when expecting data)
 * @param {object} response - Parsed response object
 * @param {object} context - Request context (optional)
 * @returns {boolean}
 */
function isZeroResultRateLimit(response, context = {}) {
    // If we got 0 records but expected some, it might be rate limiting
    if (Array.isArray(response?.records) && response.records.length === 0) {
        // Check if this is a known rate-limit scenario
        // Cloud9 often returns 0 records on subsequent calls within a short window
        return true;
    }
    return false;
}

/**
 * Main fetch with retry logic for Cloud9 API
 * @param {string} url - API endpoint URL
 * @param {object} options - Fetch options (method, headers, body, etc.)
 * @param {object} userConfig - Retry configuration overrides
 * @returns {Promise<object>} - Response with retry metadata
 */
async function fetchWithRetry(url, options = {}, userConfig = {}) {
    const config = { ...DEFAULT_RETRY_CONFIG, ...userConfig };
    let lastError = null;
    let lastResponse = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            // Add timeout to fetch
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);

            const fetchOptions = {
                ...options,
                signal: controller.signal
            };

            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            // Check for HTTP-level rate limiting
            if (isRateLimitError(null, response.status)) {
                lastError = new Error(`Rate limited: HTTP ${response.status}`);
                console.log(`[RETRY] Attempt ${attempt + 1}/${config.maxRetries + 1}: Rate limit detected (HTTP ${response.status})`);

                if (attempt < config.maxRetries) {
                    const delay = calculateDelay(attempt, config);
                    console.log(`[RETRY] Waiting ${Math.round(delay / 1000)}s before retry...`);
                    await sleep(delay);
                    continue;
                }
                throw lastError;
            }

            // For non-OK responses, check if we should retry
            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
                lastResponse = response;

                // Only retry on certain error codes
                if ([500, 502, 503, 504].includes(response.status) && attempt < config.maxRetries) {
                    const delay = calculateDelay(attempt, config);
                    console.log(`[RETRY] Attempt ${attempt + 1}/${config.maxRetries + 1}: Server error ${response.status}, retrying in ${Math.round(delay / 1000)}s...`);
                    await sleep(delay);
                    continue;
                }
            }

            // Return successful response with metadata
            return {
                success: true,
                response: response,
                attempts: attempt + 1,
                retriedDueToRateLimit: attempt > 0
            };

        } catch (error) {
            lastError = error;

            // Handle abort (timeout)
            if (error.name === 'AbortError') {
                console.log(`[RETRY] Attempt ${attempt + 1}/${config.maxRetries + 1}: Request timeout after ${config.timeout}ms`);
            } else {
                console.log(`[RETRY] Attempt ${attempt + 1}/${config.maxRetries + 1}: ${error.message}`);
            }

            if (attempt < config.maxRetries) {
                const delay = calculateDelay(attempt, config);
                console.log(`[RETRY] Waiting ${Math.round(delay / 1000)}s before retry...`);
                await sleep(delay);
            }
        }
    }

    // All retries exhausted
    return {
        success: false,
        error: lastError,
        response: lastResponse,
        attempts: config.maxRetries + 1,
        retriedDueToRateLimit: true
    };
}

/**
 * Wrapper for Cloud9 XML API calls with retry and zero-result detection
 * @param {string} endpoint - Cloud9 API endpoint
 * @param {string} xmlBody - XML request body
 * @param {object} userConfig - Retry configuration overrides
 * @returns {Promise<object>} - Parsed response with retry metadata
 */
async function cloud9FetchWithRetry(endpoint, xmlBody, userConfig = {}) {
    const config = { ...DEFAULT_RETRY_CONFIG, ...userConfig };
    let lastError = null;
    let lastRecords = [];

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: xmlBody,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status}`);
                throw lastError;
            }

            const xmlText = await response.text();

            // Parse XML response
            const statusMatch = xmlText.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
            const status = statusMatch ? statusMatch[1] : 'Unknown';

            const records = [];
            const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
            let match;
            while ((match = recordRegex.exec(xmlText)) !== null) {
                const record = {};
                const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
                let fieldMatch;
                while ((fieldMatch = fieldRegex.exec(match[1])) !== null) {
                    record[fieldMatch[1]] = fieldMatch[2];
                }
                records.push(record);
            }

            lastRecords = records;

            // Check for zero-result rate limiting (only on first attempt if configured)
            if (config.retryOnZeroResults && records.length === 0 && attempt < config.maxRetries) {
                console.log(`[RETRY] Attempt ${attempt + 1}/${config.maxRetries + 1}: Got 0 results (possible rate limit), retrying...`);
                const delay = calculateDelay(attempt, config);
                console.log(`[RETRY] Waiting ${Math.round(delay / 1000)}s before retry...`);
                await sleep(delay);
                continue;
            }

            // Success!
            return {
                success: true,
                status: status,
                records: records,
                attempts: attempt + 1,
                retriedDueToRateLimit: attempt > 0
            };

        } catch (error) {
            lastError = error;
            console.log(`[RETRY] Attempt ${attempt + 1}/${config.maxRetries + 1}: ${error.message}`);

            if (attempt < config.maxRetries) {
                const delay = calculateDelay(attempt, config);
                console.log(`[RETRY] Waiting ${Math.round(delay / 1000)}s before retry...`);
                await sleep(delay);
            }
        }
    }

    // All retries exhausted - return last known state
    return {
        success: false,
        error: lastError,
        status: 'Error',
        records: lastRecords,
        attempts: config.maxRetries + 1,
        retriedDueToRateLimit: true
    };
}

/**
 * Node-RED specific: Fetch with retry returning msg-compatible format
 * @param {object} msg - Node-RED message object
 * @param {string} url - API endpoint URL
 * @param {object} options - Fetch options
 * @param {object} config - Retry configuration
 * @returns {Promise<object>} - Updated msg object
 */
async function nodeRedFetchWithRetry(msg, url, options, config = {}) {
    const result = await fetchWithRetry(url, options, config);

    msg._retryMetadata = {
        attempts: result.attempts,
        retriedDueToRateLimit: result.retriedDueToRateLimit,
        success: result.success
    };

    if (!result.success) {
        msg.statusCode = 503;
        msg.payload = {
            error: 'API call failed after retries',
            message: result.error?.message || 'Unknown error',
            attempts: result.attempts
        };
    }

    return { msg, result };
}

// Export for use in Node-RED and other contexts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        fetchWithRetry,
        cloud9FetchWithRetry,
        nodeRedFetchWithRetry,
        calculateDelay,
        isRateLimitError,
        isZeroResultRateLimit,
        sleep,
        DEFAULT_RETRY_CONFIG
    };
}

// For Node-RED global context
if (typeof global !== 'undefined') {
    global.cloud9RetryUtils = {
        fetchWithRetry,
        cloud9FetchWithRetry,
        nodeRedFetchWithRetry,
        calculateDelay,
        isRateLimitError,
        isZeroResultRateLimit,
        sleep,
        DEFAULT_RETRY_CONFIG
    };
}
