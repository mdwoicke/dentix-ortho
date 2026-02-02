# Testing Patterns

**Analysis Date:** 2026-02-02

## Test Framework

**Runner:**
- JavaScript/Node.js: Custom test runners (no Jest or Vitest detected at app level)
- Cloud9 API tests: Manual test harnesses in `docs/tests/`

**Assertion Library:**
- Custom assertion functions in test files (no external library)
- Patterns: `assert()`, `assertEqual()`, `assertContains()`, `assertNotEmpty()`

**Run Commands:**
```bash
# Test Cloud9 tools integration
node docs/tests/cloud9-tools.test.js

# Test tool actions (internal tool testing)
node docs/tests/tool-actions.test.js

# Backend test script stub (not implemented)
npm test  # Currently: "echo \"Error: no test specified\" && exit 1"
```

## Test File Organization

**Location:**
- `docs/tests/` - Cloud9 API integration tests
- No test files in `backend/src/` or `frontend/src/` directories detected
- Test files are co-located with documentation, not source code

**Naming:**
- Test files: `*.test.js` suffix

**Structure:**
```
docs/tests/
├── cloud9-tools.test.js          # API endpoint tests
└── tool-actions.test.js          # Tool script tests
```

## Test Structure

**Suite Organization:**

Tests are organized into logical groups with test functions and reporting:

```javascript
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, testFn) {
  return async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${name}`);
    console.log('='.repeat(60));

    try {
      const startTime = Date.now();
      await testFn();
      const duration = Date.now() - startTime;
      console.log(`✓ PASSED (${duration}ms)`);
      testResults.passed++;
      testResults.tests.push({ name, status: 'passed', duration });
    } catch (error) {
      console.error(`✗ FAILED: ${error.message}`);
      testResults.failed++;
      testResults.tests.push({ name, status: 'failed', error: error.message });
    }
  };
}
```

**Suite groups in cloud9-tools.test.js:**
1. XML Format Tests - Request/response format validation
2. Scheduling Tool Tests - GetOnlineReservations, SetAppointment
3. Patient Tool Tests - GetLocations, GetProviders, GetPatientList
4. Integration Tests - Full booking flow simulation
5. Test Results Tracking - Summary reporting

**Patterns:**

**Setup (Utilities):**
```javascript
const CLOUD9 = {
  endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
  clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
  defaults: {
    providerGUID: '79ec29fe-c315-4982-845a-0005baefb5a8',
    locationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db'
  }
};

function getTestDateRange(daysFromNow = 1, rangeDays = 14) {
  const baseDate = new Date('2026-01-01');
  const start = new Date(Math.max(Date.now(), baseDate.getTime()));
  start.setDate(start.getDate() + daysFromNow);
  const end = new Date(start);
  end.setDate(end.getDate() + rangeDays);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end)
  };
}
```

**Assertion Pattern:**
```javascript
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || 'Assertion failed'}: expected ${expected}, got ${actual}`
    );
  }
}

function assertContains(str, substring, message) {
  if (!str || !str.includes(substring)) {
    throw new Error(
      `${message || 'Assertion failed'}: expected "${str}" to contain "${substring}"`
    );
  }
}

function assertNotEmpty(arr, message) {
  if (!arr || arr.length === 0) {
    throw new Error(message || 'Expected non-empty array');
  }
}
```

**Teardown/Cleanup:**
- Tests manage their own state (created test patients tracked in `testResults`)
- No formal cleanup phase; tests are idempotent

**Test Reporting:**
```javascript
console.log(`\n${'='.repeat(70)}`);
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Total:  ${testResults.passed + testResults.failed}`);
console.log(`Passed: ${testResults.passed} ✓`);
console.log(`Failed: ${testResults.failed} ✗`);
console.log(`Pass Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
```

## Mocking

**Framework:** No mocking framework detected (manual mocking in test utilities)

**Patterns:**

Helper functions replace external dependencies:

```javascript
async function callCloud9(procedure, params) {
  const xmlRequest = buildXmlRequest(procedure, params);
  console.log(`\n[API] Calling: ${procedure}`);

  try {
    const response = await fetch(CLOUD9.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xmlRequest,
      timeout: 30000
    });

    const xmlText = await response.text();
    const parsed = parseXmlResponse(xmlText);
    console.log(`[API] Status: ${parsed.status}, Records: ${parsed.records.length}`);
    return { ok: response.ok, ...parsed };
  } catch (error) {
    console.error(`[API] Error: ${error.message}`);
    return { ok: false, error: error.message, status: 'Error', records: [] };
  }
}
```

XML response parsing (mock response structure):
```javascript
function parseXmlResponse(xmlText) {
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
  return { status, result, records, rawXml: xmlText };
}
```

**What to Mock:**
- External API calls (via `callCloud9` wrapper)
- Date generation (via `getTestDateRange`)
- Test data (hardcoded GUIDs and known sandbox data)

**What NOT to Mock:**
- Real Cloud9 Sandbox API (tests call actual endpoints)
- Request/response parsing (tested as part of the API)
- XML escaping/formatting (validated in XML tests)

## Fixtures and Factories

**Test Data:**

Known Cloud9 sandbox resources stored as constants:

```javascript
const CLOUD9 = {
  defaults: {
    providerGUID: '79ec29fe-c315-4982-845a-0005baefb5a8',
    locationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db',
    appointmentTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a',
    scheduleViewGUID: '2544683a-8e79-4b32-a4d4-bf851996bac3',
    scheduleColumnGUID: 'e062b81f-1fff-40fc-b4a4-1cf9ecc2f32b'
  }
};
```

Dynamic test patient creation (for SET operations):
```javascript
const testPatientName = `TestPatient_${Date.now()}`;

const result = await callCloud9('SetPatient', {
  patientFirstName: testPatientName,
  patientLastName: 'UnitTest',
  providerGUID: CLOUD9.defaults.providerGUID,
  locationGUID: CLOUD9.defaults.locationGUID,
  VendorUserName: CLOUD9.vendorUserName,
  birthdayDateTime: '2015-06-15T00:00:00',
  gender: 'M'
});
```

Date range factory for scheduling tests:
```javascript
function getTestDateRange(daysFromNow = 1, rangeDays = 14) {
  // IMPORTANT: Cloud9 sandbox has no appointment slots before 1/1/2026
  const baseDate = new Date('2026-01-01');
  const start = new Date(Math.max(Date.now(), baseDate.getTime()));
  start.setDate(start.getDate() + daysFromNow);
  const end = new Date(start);
  end.setDate(end.getDate() + rangeDays);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
    startDateTime: `${formatDate(start)} 7:00:00 AM`,
    endDateTime: `${formatDate(end)} 5:00:00 PM`
  };
}
```

**Location:**
- `docs/tests/cloud9-tools.test.js` - All fixtures and factories in single file
- No separate fixtures directory

## Coverage

**Requirements:** None enforced; testing is opt-in

**View Coverage:**
```bash
# No built-in coverage reporting
# To add: npm install --save-dev nyc
# Then: npyc node docs/tests/cloud9-tools.test.js
```

## Test Types

**Unit Tests:**
- XML parsing validation: `parseXmlResponse()` tested with sample XML
- XML escaping: `escapeXml()` tested with special characters
- Date formatting: `formatDate()` tested with date objects
- **Scope:** Utility functions and data transformation
- **Approach:** Direct function calls with known inputs, assert output

Example:
```javascript
test('XML: Response parsing extracts records correctly', async () => {
  const sampleXml = `<GetDataResponse>...`;
  const parsed = parseXmlResponse(sampleXml);

  assertEqual(parsed.status, 'Success', 'Should parse status correctly');
  assertEqual(parsed.records.length, 2, 'Should find 2 records');
  assertEqual(parsed.records[0].Field1, 'Value1', 'Should parse Field1 correctly');
});
```

**Integration Tests:**
- API endpoint tests: Real calls to Cloud9 Sandbox
- Full booking flow: slots -> create patient -> book appointment -> cancel
- **Scope:** Multi-step workflows across different API operations
- **Approach:** Sequential API calls with validation at each step

Example:
```javascript
test('Integration: Full booking flow (slots -> create -> book)', async () => {
  console.log('  Step 1: Search for available slots...');
  const slotsResult = await callCloud9('GetOnlineReservations', {...});

  console.log('  Step 2: Create test patient...');
  const patientResult = await callCloud9('SetPatient', {...});

  console.log('  Step 3: Book appointment...');
  const bookResult = await callCloud9('SetAppointment', {...});

  console.log('  Step 4: Cancel test appointment...');
  const cancelResult = await callCloud9('SetAppointmentStatusCanceled', {...});
});
```

**E2E Tests:**
- Not separately defined (integration tests serve this purpose)

## Common Patterns

**Async Testing:**
```javascript
test('Scheduling: GetOnlineReservations returns available slots', async () => {
  const result = await callCloud9('GetOnlineReservations', {...});
  assertEqual(result.status, 'Success', 'API should return Success status');
});
```

All tests are async. The `test()` wrapper returns an async function that is executed sequentially.

**Error Testing:**
```javascript
test('Scheduling: SetAppointment requires patientGUID', async () => {
  const result = await callCloud9('SetAppointment', {
    // Missing patientGUID
    StartTime: `${dates.startDate} 9:00:00 AM`
  });

  // Should fail or return error
  assert(
    result.status === 'Error' ||
    (result.result && result.result.includes('Error')) ||
    result.rawXml.includes('required'),
    'Should require patientGUID'
  );
});
```

Error tests verify that missing required parameters are caught by the API.

**Conditional Skipping:**
```javascript
if (!patientGUID) {
  console.log('  Skipped: No patient GUID available');
  return;
}

const result = await callCloud9('GetPatientInformation', {
  patguid: patientGUID
});
```

Tests skip when dependencies (like created resources) are unavailable.

**Test Execution:**
```javascript
async function runAllTests() {
  const allTests = [
    { name: 'XML Format Tests', tests: xmlTests },
    { name: 'Scheduling Tool Tests', tests: schedulingTests },
    { name: 'Patient Tool Tests', tests: patientTests },
    { name: 'Integration Tests', tests: integrationTests },
  ];

  for (const suite of allTests) {
    console.log(`# ${suite.name.toUpperCase()}`);
    for (const testFn of suite.tests) {
      await testFn();  // Execute each test function
    }
  }
}

// Run if executed directly
if (require.main === module) {
  runAllTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}
```

## Test Coverage Gaps

**Untested Areas:**
- Backend controllers and services (no unit tests found)
- Frontend components (no component tests found)
- Error edge cases beyond Cloud9 API parameter validation
- Database operations and query logic
- Authentication flow edge cases
- Rate limiting and timeout scenarios
- Concurrent API requests

**Files:**
- `backend/src/controllers/`, `backend/src/services/` - No test files
- `frontend/src/components/`, `frontend/src/services/` - No test files

**Risk:** High - Core business logic is unverified by automated tests

**Priority:** High - Consider adding Jest/Vitest for backend unit tests and Vitest for frontend component tests

---

*Testing analysis: 2026-02-02*
