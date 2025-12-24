const { chromium } = require('playwright');

async function detailedDebug() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Intercept and log all network requests and responses
  page.on('response', async response => {
    if (response.url().includes('/api/patients/search')) {
      try {
        const body = await response.json();
        console.log('\n=== API RESPONSE ===');
        console.log('URL:', response.url());
        console.log('Status:', response.status());
        console.log('Response Body:', JSON.stringify(body, null, 2));
      } catch (e) {
        console.log('Could not parse response as JSON');
      }
    }
  });

  try {
    console.log('1. Navigating to patients page...');
    await page.goto('http://localhost:5174/patients', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('2. Filling search form...');
    await page.fill('input[placeholder*="Last Name" i]', 'Aleman');
    await page.fill('input[placeholder*="First Name" i]', 'Chris');

    console.log('3. Clicking search button...');
    await page.click('button:has-text("Search")');

    // Wait for API response
    await page.waitForTimeout(4000);

    console.log('4. Reading page content...');

    // Check for "Found X patients" text
    const foundText = await page.locator('text=/Found \\d+ patient/').textContent().catch(() => null);
    console.log('Found text:', foundText);

    // Check table rows
    const tableRows = await page.locator('table tbody tr').count();
    console.log('Table rows:', tableRows);

    // Get all text content
    const allText = await page.textContent('body');

    // Check for patient names
    const hasChris = allText.includes('Chris');
    const hasAleman = allText.includes('Aleman');
    const hasPatientId = allText.includes('MOE015553');

    console.log('\n=== PAGE CONTENT ANALYSIS ===');
    console.log('Contains "Chris":', hasChris);
    console.log('Contains "Aleman":', hasAleman);
    console.log('Contains "MOE015553":', hasPatientId);

    // Take screenshot
    await page.screenshot({ path: 'screenshots/detailed-debug.png', fullPage: true });
    console.log('\nScreenshot saved: screenshots/detailed-debug.png');

    // Extract Redux state from the page
    const reduxState = await page.evaluate(() => {
      return window.__REDUX_DEVTOOLS_EXTENSION__?.()?.getState?.() || null;
    });

    if (reduxState) {
      console.log('\n=== REDUX STATE ===');
      console.log(JSON.stringify(reduxState, null, 2));
    }

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'screenshots/error-detailed.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

const fs = require('fs');
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots');
}

detailedDebug();
