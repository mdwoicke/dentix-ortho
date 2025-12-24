/**
 * Test Appointment Wizard - Patient Search
 * Tests the appointment creation wizard with patient search for "chris aleman"
 */

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to console messages
  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type()}]:`, msg.text());
  });

  // Listen to network requests
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      console.log(`[REQUEST] ${request.method()} ${request.url()}`);
      if (request.postDataJSON()) {
        console.log('[REQUEST BODY]', JSON.stringify(request.postDataJSON(), null, 2));
      }
    }
  });

  // Listen to network responses
  page.on('response', async response => {
    if (response.url().includes('/api/')) {
      console.log(`[RESPONSE] ${response.status()} ${response.url()}`);
      try {
        const body = await response.json();
        console.log('[RESPONSE BODY]', JSON.stringify(body, null, 2));
      } catch (e) {
        // Not JSON
      }
    }
  });

  try {
    console.log('1. Navigating to calendar page...');
    await page.goto('http://localhost:5174/calendar');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('2. Looking for "New Appointment" button...');
    await page.screenshot({ path: 'screenshots/01-calendar-page.png' });

    // Try to find and click the New Appointment button
    const newApptButton = page.locator('button:has-text("New Appointment"), button:has-text("Create Appointment"), button:has-text("+ New")').first();

    if (await newApptButton.isVisible({ timeout: 5000 })) {
      console.log('3. Clicking New Appointment button...');
      await newApptButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'screenshots/02-wizard-opened.png' });
    } else {
      console.log('3. New Appointment button not found, looking for calendar date click...');
      // Try clicking on a specific date (11/12/2025)
      const dateCell = page.locator('[data-date*="2025-11-12"], [aria-label*="November 12"], td:has-text("12")').first();
      if (await dateCell.isVisible({ timeout: 5000 })) {
        console.log('   Clicking on date cell...');
        await dateCell.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'screenshots/02-date-clicked.png' });
      }
    }

    console.log('4. Looking for patient search input in wizard...');
    await page.waitForTimeout(1000);

    // Look for the patient search input
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[placeholder*="name"], input[placeholder*="patient"]').first();

    if (await searchInput.isVisible({ timeout: 5000 })) {
      console.log('5. Found search input, typing "chris aleman"...');
      await searchInput.fill('chris aleman');
      await page.screenshot({ path: 'screenshots/03-search-filled.png' });

      console.log('6. Looking for Search button...');
      const searchButton = page.locator('button:has-text("Search")').first();

      if (await searchButton.isVisible({ timeout: 3000 })) {
        console.log('7. Clicking Search button...');
        await searchButton.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'screenshots/04-search-results.png' });

        console.log('8. Looking for search results...');
        const results = page.locator('[class*="patient"], [class*="result"], .patient-card, .search-result');
        const count = await results.count();
        console.log(`   Found ${count} result elements`);

        if (count > 0) {
          console.log('   SUCCESS: Search results found!');
          await page.screenshot({ path: 'screenshots/05-results-found.png' });
        } else {
          console.log('   WARNING: No search results found');
        }
      } else {
        console.log('   Search button not found');
      }
    } else {
      console.log('   Patient search input not found!');
      console.log('   Taking screenshot of current page...');
      await page.screenshot({ path: 'screenshots/03-no-search-input.png' });
    }

    console.log('\n9. Final screenshot...');
    await page.screenshot({ path: 'screenshots/06-final-state.png' });

    console.log('\n10. Waiting 5 seconds before closing...');
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('ERROR:', error);
    await page.screenshot({ path: 'screenshots/error.png' });
  } finally {
    await browser.close();
    console.log('\nTest completed!');
  }
})();
