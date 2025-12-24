const { chromium } = require('playwright');

async function verifyWithReload() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-cache']
  });

  // Create context with cache disabled
  const context = await browser.newContext({
    bypassCSP: true,
  });

  const page = await context.newPage();

  try {
    console.log('Navigating to: http://localhost:5174/patients');

    // Hard reload to bypass cache
    await page.goto('http://localhost:5174/patients', {
      waitUntil: 'networkidle',
      timeout: 10000
    });

    // Force reload
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'screenshots/01-fresh-load.png', fullPage: true });
    console.log('Screenshot saved: 01-fresh-load.png');

    // Fill search form
    const lastNameField = await page.locator('input[placeholder*="Last Name" i]').first();
    const firstNameField = await page.locator('input[placeholder*="First Name" i]').first();

    await lastNameField.fill('Aleman');
    await firstNameField.fill('Chris');

    // Click Search
    const searchButton = await page.locator('button:has-text("Search")').first();
    await searchButton.click();

    // Wait longer for results
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'screenshots/02-fresh-results.png', fullPage: true });
    console.log('Screenshot saved: 02-fresh-results.png');

    // Check results
    const pageText = await page.textContent('body');

    console.log('\n=== VERIFICATION RESULTS ===');

    if (pageText.includes('Aleman') && pageText.includes('Chris') && pageText.includes('MOE015553')) {
      console.log('✓ Patient "Aleman, Chris" FOUND in UI!');
      console.log('✓ Patient ID MOE015553 confirmed!');
    } else if (pageText.includes('Found 2 patients') || pageText.includes('Found 1 patient')) {
      console.log('✓ Patients found! Count:', pageText.match(/Found \d+ patient/)[0]);
    } else if (pageText.includes('Found 0 patients')) {
      console.log('✗ Still showing 0 patients - cache may still be active');
    } else {
      console.log('Page status:', pageText.substring(0, 500));
    }

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'screenshots/error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

const fs = require('fs');
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots');
}

verifyWithReload();
