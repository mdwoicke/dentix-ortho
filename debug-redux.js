const { chromium } = require('playwright');

async function debugRedux() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to patients page...');
    await page.goto('http://localhost:5174/patients', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Fill and search
    await page.fill('input[placeholder*="Last Name" i]', 'Aleman');
    await page.fill('input[placeholder*="First Name" i]', 'Chris');
    await page.click('button:has-text("Search")');
    await page.waitForTimeout(5000);

    // Inject code to read Redux state
    const state = await page.evaluate(() => {
      // Try to get Redux state from window
      const reduxState = window.__REDUX_STATE__ || window.store?.getState?.() || null;

      // Also try to find React root and get state
      const root = document.getElementById('root');

      return {
        reduxState,
        hasRoot: !!root,
        rootChildren: root?.children.length,
      };
    });

    console.log('\n=== DEBUG INFO ===');
    console.log('Redux State:', JSON.stringify(state, null, 2));

    // Try to access the store via React DevTools
    const reactState = await page.evaluate(() => {
      // Get all fiber nodes
      const rootElement = document.getElementById('root');
      if (!rootElement) return null;

      // Try to find React Fiber
      const key = Object.keys(rootElement).find(k => k.startsWith('__react'));
      if (!key) return { error: 'React fiber not found' };

      const fiber = rootElement[key];
      return { fiberFound: !!fiber };
    });

    console.log('React Info:', reactState);

    // Check localStorage for any cached state
    const localStorage = await page.evaluate(() => window.localStorage);
    console.log('LocalStorage:', localStorage);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugRedux();
