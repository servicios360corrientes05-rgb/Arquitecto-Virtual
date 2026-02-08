
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function testPdf() {
    try {
        console.log("Attempting require('pdf-parse')...");
        const pdf = require('pdf-parse');
        console.log("Type of pdf export:", typeof pdf);
        console.log("Is pdf a function?", typeof pdf === 'function');

        if (pdf.PDFParse) {
            console.log("Found PDFParse:", typeof pdf.PDFParse);
            // Try to see if it looks like the main entry
        }

        // Also try importing the default ESM way
        try {
            const esmImport = await import('pdf-parse');
            console.log("ESM Import Keys:", Object.keys(esmImport));
            console.log("ESM Default:", typeof esmImport.default);
        } catch (e) { console.log("ESM import failed"); }
    } catch (e) {
        console.error("Require failed:", e);
    }
}

testPdf();
