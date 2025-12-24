const { chromium } = require('playwright');

async function finalTest() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Log all console messages from the page
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    }
  });

  // Log network responses
  page.on('response', async response => {
    if (response.url().includes('/api/patients/search')) {
      const status = response.status();
      const body = await response.text().catch(() => 'Could not read');
      console.log('\n📡 API Response:');
      console.log('Status:', status);
      console.log('Body:', body.substring(0, 500));
    }
  });

  try {
    console.log('🌐 Navigating to patients page...');

    // Navigate with hard reload
    await page.goto('http://localhost:5174/patients', {
      waitUntil: 'networkidle',
      timeout: 10000
    });

    // Wait for page to be fully loaded
    await page.waitForTimeout(3000);

    console.log('📝 Filling search form...');

    // Fill the form
    await page.fill('input[placeholder*="Last Name" i]', 'Aleman');
    await page.fill('input[placeholder*="First Name" i]', 'Chris');

    console.log('🔍 Clicking search...');
    await page.click('button:has-text("Search")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Take screenshot
    await page.screenshot({ path: 'screenshots/final-test.png', fullPage: true });
    console.log('📸 Screenshot saved: screenshots/final-test.png');

    // Check what's on the page
    const bodyText = await page.textContent('body');

    console.log('\n📊 Results:');

    // Look for "Found X patients"
    const foundMatch = bodyText.match(/Found (\d+) patient/);
    if (foundMatch) {
      console.log('✅ Found text:', foundMatch[0]);
      console.log('   Patient count:', foundMatch[1]);
    } else {
      console.log('❌ "Found X patients" text not detected');
    }

    // Check for patient data
    const hasChris = bodyText.includes('Chris');
    const hasAleman = bodyText.includes('Aleman');
    const hasPatientId = bodyText.includes('MOE015553');

    console.log('   Contains "Chris":', hasChris ? '✅' : '❌');
    console.log('   Contains "Aleman":', hasAleman ? '✅' : '❌');
    console.log('   Contains "MOE015553":', hasPatientId ? '✅' : '❌');

    // Check table
    const tableRows = await page.locator('table tbody tr').count();
    console.log('   Table rows:', tableRows);

    if (tableRows === 0 && !hasChris) {
      console.log('\n⚠️  NO DATA DISPLAYED - Checking for errors...');

      // Check for error messages
      if (bodyText.includes('No patients found')) {
        console.log('   Page shows: "No patients found"');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'screenshots/error-final.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

const fs = require('fs');
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots');
}

finalTest();
