const { chromium } = require('playwright');

async function testAppointmentsDisplay() {
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

    console.log('👆 Step 3: Click on first patient row...');
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(4000);

    // Check current URL
    const currentUrl = page.url();
    console.log('   Current URL:', currentUrl);

    // Verify we're on appointments page
    if (currentUrl.includes('/appointments')) {
      console.log('✅ Successfully navigated to Appointments page');

      // Take full page screenshot to see all appointment fields
      await page.screenshot({
        path: 'screenshots/03-appointments-full-display.png',
        fullPage: true
      });
      console.log('📸 Screenshot: 03-appointments-full-display.png');

      // Count appointment cards
      const appointmentCards = await page.locator('[class*="Card"]').count();
      console.log(`   Found ${appointmentCards} appointment cards`);

      // Get body text to check for all fields
      const bodyText = await page.textContent('body');

      const fieldsToCheck = [
        { name: 'Appointment Type', pattern: /100 Exam - NP Child|Exam/i },
        { name: 'Status', pattern: /Scheduled|Confirmed/i },
        { name: 'Date & Time', pattern: /10\/29\/2025|11\/3\/2025/i },
        { name: 'Duration', pattern: /45 minutes|minutes/i },
        { name: 'Location', pattern: /Location14|Location6/i },
        { name: 'Orthodontist', pattern: /Bruce.*Bailey|Bailey/i },
        { name: 'Confirmation', pattern: /Vendor Provided Confirmation|Confirmation/i },
      ];

      console.log('\n📋 Checking appointment fields:');
      fieldsToCheck.forEach(field => {
        if (field.pattern.test(bodyText)) {
          console.log(`   ✅ ${field.name} found`);
        } else {
          console.log(`   ⚠️  ${field.name} not found`);
        }
      });

    } else {
      console.log('❌ Not on appointments page');
    }

    console.log('\n✅ Test Complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'screenshots/error-appointments.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

const fs = require('fs');
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots');
}

testAppointmentsDisplay();
