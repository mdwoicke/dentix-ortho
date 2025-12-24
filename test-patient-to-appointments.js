const { chromium } = require('playwright');

async function testPatientToAppointments() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🌐 Step 1: Navigate to Patients page...');
    await page.goto('http://localhost:5174/patients', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('📝 Step 2: Search for "Aleman, Chris"...');
    await page.fill('input[placeholder*="Last Name" i]', 'Aleman');
    await page.fill('input[placeholder*="First Name" i]', 'Chris');
    await page.click('button:has-text("Search")');
    await page.waitForTimeout(3000);

    // Check if patients were found
    const foundText = await page.locator('text=/Found \\d+ patient/').textContent().catch(() => null);
    console.log('   Found text:', foundText);

    // Take screenshot of search results
    await page.screenshot({ path: 'screenshots/01-patient-search.png', fullPage: true });
    console.log('📸 Screenshot: 01-patient-search.png');

    console.log('\n👆 Step 3: Click on first patient row...');

    // Click on the first table row
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(3000);

    // Check current URL
    const currentUrl = page.url();
    console.log('   Current URL:', currentUrl);

    // Verify we're on appointments page
    if (currentUrl.includes('/appointments')) {
      console.log('✅ Successfully navigated to Appointments page');

      // Check if patient name is in the header
      const pageTitle = await page.locator('h1').textContent();
      console.log('   Page Title:', pageTitle);

      if (pageTitle.includes('Aleman') || pageTitle.includes('Chris')) {
        console.log('✅ Patient name shown in header');
      } else {
        console.log('⚠️  Patient name not in header');
      }

      // Take screenshot of appointments page
      await page.screenshot({ path: 'screenshots/02-appointments-page.png', fullPage: true });
      console.log('📸 Screenshot: 02-appointments-page.png');

      // Check for appointments in the table
      await page.waitForTimeout(2000);
      const appointmentRows = await page.locator('table tbody tr').count();
      console.log('   Appointment rows:', appointmentRows);

      if (appointmentRows > 0) {
        console.log('✅ Appointments displayed');

        // Get some appointment details
        const bodyText = await page.textContent('body');

        // Check for appointment dates
        if (bodyText.includes('10/29/2025') || bodyText.includes('11/3/2025')) {
          console.log('✅ Appointment dates found');
        }

        // Check for appointment type
        if (bodyText.includes('Exam')) {
          console.log('✅ Appointment type found');
        }
      } else {
        console.log('⚠️  No appointments displayed');
      }

    } else {
      console.log('❌ Not on appointments page');
    }

    console.log('\n✅ Test Complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'screenshots/error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

const fs = require('fs');
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots');
}

testPatientToAppointments();
