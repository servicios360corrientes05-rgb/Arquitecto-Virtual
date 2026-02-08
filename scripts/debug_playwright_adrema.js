
const { chromium } = require('playwright');

async function testPlaywright(adrema) {
    console.log(`🎭 Playwright Debug: ${adrema}`);

    // Headless FALSE to see what's happening
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Helper: Select Robust
    const selectRobust = async (selector, value) => {
        try {
            console.log(`   > Selecting ${selector} = ${value}`);
            await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
            await page.selectOption(selector, value);
            // Force events
            await page.evaluate(([sel, val]) => { // Fixed array syntax
                const el = document.querySelector(sel);
                if (el) {
                    el.value = val;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, [selector, value]);
            await page.waitForTimeout(1500);
        } catch (e) {
            console.log(`   ⚠️ Error selecting ${selector}: ${e.message}`);
        }
    };

    try {
        console.log("   > Navigating...");
        await page.goto('https://sistemas.ciudaddecorrientes.gov.ar/usosuelo/', { timeout: 60000, waitUntil: 'domcontentloaded' });

        await selectRobust('#t_uso_suelo', '1');
        await selectRobust('#tipo_actividad', '1');

        // Special handling for dynamic 3rd dropdown
        console.log("   > Selecting Viviendas Colectivas...");
        await page.evaluate(() => {
            const select = document.querySelector('#activida_d');
            if (select) {
                const option = Array.from(select.options).find(o => o.text.includes('Viviendas Colectivas'));
                if (option) {
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
        await page.waitForTimeout(2000);

        await selectRobust('#ubicacion', 'adrema');

        console.log("   > Input Adrema...");
        await page.waitForSelector('#adrema', { state: 'visible' });
        await page.click('#adrema');
        await page.fill('#adrema', adrema);
        await page.dispatchEvent('#adrema', 'change');
        await page.waitForTimeout(1000);

        console.log("   > Click Next...");
        await page.click('#siguiente');

        console.log("   > Waiting for results (Robust Strategy)...");

        // Robust Wait Strategy (Text based)
        try {
            await page.waitForFunction(() => {
                const body = document.body.innerText;
                return body.includes('Distrito:') || body.includes('Entre Medianeras') || body.includes('No se encontraron');
            }, { timeout: 60000 });
            console.log("   > ✅ Data detected in DOM.");
        } catch (e) {
            console.log("   ❌ Timeout waiting for text.");
        }

        // Final Extraction check
        const text = await page.innerText('body');
        console.log("Data Preview:", text.substring(0, 150));

    } catch (error) {
        console.error("   ❌ Fatal Error:", error);
    } finally {
        await browser.close();
    }
}

const adrema = process.argv[2] || 'A10065351';
testPlaywright(adrema);
