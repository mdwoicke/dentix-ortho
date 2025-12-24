const { chromium } = require('playwright');

async function debugSearch() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture network requests
  const requests = [];
  page.on('request', request => {
    if (request.url().includes('/api/patients/search')) {
      requests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers()
      });
    }
  });

  page.on('response', async response => {
    if (response.url().includes('/api/patients/search')) {
      const body = await response.text().catch(() => 'Could not read response');
      console.log('\n=== API RESPONSE ===');
      console.log('Status:', response.status());
      console.log('Body:', body);
    }
  });

  try {
    console.log('Navigating to: http://localhost:5174/patients');
    await page.goto('http://localhost:5174/patients', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Fill search form
    const lastNameField = await page.locator('input[placeholder*="Last Name" i]').first();
    const firstNameField = await page.locator('input[placeholder*="First Name" i]').first();

    await lastNameField.fill('Aleman');
    await firstNameField.fill('Chris');

    // Click Search
    const searchButton = await page.locator('button:has-text("Search")').first();
    await searchButton.click();

    // Wait for API call
    await page.waitForTimeout(3000);

    console.log('\n=== API REQUEST ===');
    if (requests.length > 0) {
      console.log('URL:', requests[0].url);
      console.log('Method:', requests[0].method);
    } else {
      console.log('No API request captured!');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugSearch();
