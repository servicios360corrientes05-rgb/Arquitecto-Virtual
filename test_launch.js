const { chromium } = require('playwright');

async function testLaunch() {
    console.log("Testing Profile Launch...");
    try {
        const userDataDir = 'C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\User Data';
        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            channel: 'chrome',
            args: ['--profile-directory=Profile 11', '--no-sandbox'],
            // Try ignoring automation flags that might trigger security policies
            ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
            timeout: 10000
        });
        console.log("Launch Success!");
        await new Promise(r => setTimeout(r, 5000));
        await context.close();
        console.log("Closed.");
    } catch (e) {
        console.error("Launch Failed:", e);
    }
}

testLaunch();
