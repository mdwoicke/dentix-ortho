const { chromium } = require('playwright');

async function verifyPatientInUI() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to local Patients page
    const patientsUrl = 'http://localhost:5174/patients';

    console.log('Navigating to:', patientsUrl);
    await page.goto(patientsUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Take screenshot of patients page
    await page.screenshot({ path: 'screenshots/01-patients-page.png', fullPage: true });
    console.log('Screenshot saved: 01-patients-page.png');

    // Check if "Aleman, Chris" is visible on the page
    const pageContent = await page.content();
    const pageText = await page.textContent('body');

    console.log('\nSearching for patient "Aleman, Chris"...');

    // Check if patient name appears
    if (pageText.includes('Aleman') && pageText.includes('Chris')) {
      console.log('✓ Patient "Aleman, Chris" found in UI!');

      // Check for the specific PatientID
      if (pageContent.includes('MOE015553') || pageContent.includes('865c8fa6-caf8-4e30-b152-82da6e93f33b')) {
        console.log('✓ Patient ID MOE015553 confirmed!');
      }

      // Try to find search box and filter
      try {
        const searchBox = await page.locator('input[type="search"], input[name*="search"], input[placeholder*="search" i]').first();
        if (await searchBox.isVisible({ timeout: 2000 })) {
          console.log('\nTesting search functionality...');
          await searchBox.fill('Aleman');
          await page.waitForTimeout(2000);
          await page.screenshot({ path: 'screenshots/02-search-results.png', fullPage: true });
          console.log('Screenshot saved: 02-search-results.png');
        }
      } catch (e) {
        console.log('Search box not found or not needed');
      }
    } else {
      console.log('⚠ Patient "Aleman, Chris" NOT found in UI');
      console.log('\nPage content preview:');
      console.log(pageText.substring(0, 500));
    }

    console.log('\n✓ Verification complete. Check screenshots folder for details.');

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'screenshots/error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

// Create screenshots directory
const fs = require('fs');
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots');
}

verifyPatientInUI();
