
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

async function testUsage() {
    try {
        const { PDFParse } = require('pdf-parse');
        const dataDir = path.join(process.cwd(), 'data', 'regulations');
        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.pdf'));
        const pdfPath = path.join(dataDir, files[0]);
        const buffer = fs.readFileSync(pdfPath);

        const instance = new PDFParse(buffer);
        console.log("Calling getText()...");
        const result = await instance.getText();
        console.log("Result Type:", typeof result);
        console.log("Result Preview:", JSON.stringify(result).substring(0, 100));

    } catch (e) {
        console.error("Setup failed:", e);
    }
}

testUsage();
