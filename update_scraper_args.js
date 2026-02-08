const fs = require('fs');
const watcherPath = './watcher.js';
let content = fs.readFileSync(watcherPath, 'utf8');

// We need to inject the args into the puppeteer.launch call inside escrapearProvincia
// Pattern: const browser = await puppeteer.launch({ ... args: ['--start-maximized'] ... });

// Replacement target:
// args: ['--start-maximized']
// WITH
// args: ['--start-maximized', '--disable-features=PasswordLeakDetection', '--disable-save-password-bubble', '--no-default-browser-check']

const targetString = "args: ['--start-maximized']";
const replacementString = "args: ['--start-maximized', '--disable-features=PasswordLeakDetection', '--disable-save-password-bubble', '--no-default-browser-check']";

if (content.includes(targetString)) {
    const newContent = content.replace(targetString, replacementString);
    fs.writeFileSync(watcherPath, newContent);
    console.log("Watcher updated with Chrome Security Bypass flags!");
} else {
    console.error("Could not find target string to replace arguments.");
    // Fallback: Try looser match or regex if needed, but the file was just written with that exact string.
}
