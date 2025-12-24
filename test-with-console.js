const { chromium } = require('playwright');

async function testWithConsole() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture all console messages
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    console.log('[BROWSER]', text);
  });

  try {
    console.log('Navigating...');
    await page.goto('http://localhost:5174/patients', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('\nFilling form...');
    await page.fill('input[placeholder*="Last Name" i]', 'Aleman');
    await page.fill('input[placeholder*="First Name" i]', 'Chris');

    console.log('Searching...\n');
    await page.click('button:has-text("Search")');
    await page.waitForTimeout(5000);

    console.log('\n=== CONSOLE LOGS ===');
    const patientLogs = consoleLogs.filter(log => log.includes('[PatientList]'));
    if (patientLogs.length > 0) {
      patientLogs.forEach(log => console.log(log));
    } else {
      console.log('No [PatientList] logs found');
      console.log('All logs:', consoleLogs.join('\n'));
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testWithConsole();
