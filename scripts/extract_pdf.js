const fs = require('fs');
const pdf = require('pdf-extraction');
const path = require('path');

// Get file path from args
const filePath = process.argv[2];
const outputPath = 'extracted_pdf_content.txt';

if (!filePath) {
    console.error("Usage: node extract_pdf.js <path_to_pdf>");
    process.exit(1);
}

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const dataBuffer = fs.readFileSync(filePath);

pdf(dataBuffer).then(function (data) {
    const content = `--- PDF EXTRACTED TEXT ---\n${data.text}\n--- END ---`;
    fs.writeFileSync(outputPath, content, 'utf8');
    console.log(`Successfully wrote extracted text to ${outputPath}`);
}).catch(err => {
    console.error("Error extracting PDF:", err);
    process.exit(1);
});
