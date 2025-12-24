const { chromium } = require('playwright');

async function searchForPatient() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to: http://localhost:5174/patients');
    await page.goto('http://localhost:5174/patients', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Take initial screenshot
    await page.screenshot({ path: 'screenshots/01-patients-page-initial.png', fullPage: true });
    console.log('Screenshot saved: 01-patients-page-initial.png');

    // Try to fill in the search form and search
    console.log('\nLooking for search fields...');

    // Try Last Name field
    const lastNameField = await page.locator('input[placeholder*="Last Name" i], input[name*="lastName" i], input[id*="lastName" i]').first();

    if (await lastNameField.isVisible({ timeout: 5000 })) {
      console.log('Found Last Name field, filling with "Aleman"');
      await lastNameField.fill('Aleman');
      await page.waitForTimeout(500);
    }

    // Try First Name field
    const firstNameField = await page.locator('input[placeholder*="First Name" i], input[name*="firstName" i], input[id*="firstName" i]').first();

    if (await firstNameField.isVisible({ timeout: 2000 })) {
      console.log('Found First Name field, filling with "Chris"');
      await firstNameField.fill('Chris');
      await page.waitForTimeout(500);
    }

    // Click Search button
    const searchButton = await page.locator('button:has-text("Search"), button[type="submit"]').first();

    if (await searchButton.isVisible({ timeout: 2000 })) {
      console.log('Clicking Search button...');
      await searchButton.click();

      // Wait for results to load
      await page.waitForTimeout(3000);

      await page.screenshot({ path: 'screenshots/02-search-results.png', fullPage: true });
      console.log('Screenshot saved: 02-search-results.png');
    }

    // Check results
    const pageText = await page.textContent('body');
    const pageContent = await page.content();

    console.log('\n=== VERIFICATION RESULTS ===');

    if (pageText.includes('Aleman') && pageText.includes('Chris')) {
      console.log('✓ Patient "Aleman, Chris" FOUND in UI!');

      // Check for PatientID
      if (pageContent.includes('MOE015553')) {
        console.log('✓ Patient ID "MOE015553" confirmed!');
      }

      // Check for GUID
      if (pageContent.includes('865c8fa6-caf8-4e30-b152-82da6e93f33b')) {
        console.log('✓ Patient GUID confirmed!');
      }

      // Check for birth date
      if (pageContent.includes('8/29/2018') || pageContent.includes('2018-08-29')) {
        console.log('✓ Birth date (8/29/2018) confirmed!');
      }

      // Check for location
      if (pageContent.includes('Location14') || pageContent.includes('GRCH')) {
        console.log('✓ Location (Location14/GRCH) confirmed!');
      }

      // Check for status
      if (pageContent.includes('New Patient - Scheduled') || pageContent.includes('NPSch')) {
        console.log('✓ Status (New Patient - Scheduled) confirmed!');
      }

    } else {
      console.log('✗ Patient "Aleman, Chris" NOT found in UI');
      console.log('\nPage text preview:');
      console.log(pageText.substring(0, 1000));
    }

    console.log('\n✓ Verification complete. Check screenshots/ folder for visual confirmation.');

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'screenshots/error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

// Create screenshots directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots');
}

searchForPatient();
