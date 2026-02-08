const puppeteer = require('puppeteer');

async function debugScraper() {
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--start-maximized'] });
    const page = await browser.newPage();
    const partida = "A10169791";

    try {
        await page.goto('https://sistemas.ciudaddecorrientes.gov.ar/usosuelo/index.php', { waitUntil: 'networkidle2' });

        // Selectors
        await page.select('#t_uso_suelo', '1');
        await new Promise(r => setTimeout(r, 1000));
        await page.select('#tipo_actividad', '1');
        await new Promise(r => setTimeout(r, 1000));
        await page.select('#activida_d', '2');
        await new Promise(r => setTimeout(r, 1000));
        await page.select('#ubicacion', 'adrema');

        // Input Adrema
        await page.waitForSelector('#adrema');
        await page.type('#adrema', partida);
        await page.click('#siguiente');

        console.log("Waiting for results...");
        await page.waitForSelector('table', { visible: true, timeout: 60000 });

        // Dump content
        const content = await page.evaluate(() => document.body.innerText);
        const html = await page.evaluate(() => document.body.innerHTML);

        console.log("--- BODY TEXT ---");
        console.log(content);
        console.log("--- END BODY TEXT ---");

        // Attempt Extraction
        const alturaMatch = content.match(/Altura\s*M[áa]x\.?[:\s]*([\d\.,]+)/i);
        console.log("Regex Height Match:", alturaMatch);

        // Check Table Details
        const tableDetails = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tr'));
            return rows.map((r, i) => {
                const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
                return {
                    index: i,
                    text: r.innerText,
                    cells: cells,
                    cellCount: cells.length,
                    hasMedianeras: /Entre\s*Medianeras/i.test(r.innerText)
                };
            });
        });
        console.log("Table Details:", JSON.stringify(tableDetails, null, 2));

    } catch (e) {
        console.error("Error:", e);
    } finally {
        // await browser.close();
    }
}

debugScraper();
