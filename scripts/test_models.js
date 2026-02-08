
const { GoogleGenerativeAI } = require("@google/generative-ai");

// User's key
const apiKey = "AIzaSyDCz-HSUBdXnW9cPxRXuwvtROFX1pAj0gM";

async function listModels() {
    const genAI = new GoogleGenerativeAI(apiKey);
    try {
        // For some SDK versions, listing models might be different, 
        // but let's try the standard way if available, or just try to instantiate generic ones.
        // The SDK doesn't always expose listModels directly easily in node without full admin context sometimes,
        // but let's try a simple generation with 'gemini-pro' and 'gemini-1.5-flash' to see errors specifically here?
        // Actually, let's try to find the method.

        console.log("Testing Model Availability...");

        const modelsToTest = ["gemini-pro", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"];

        for (const m of modelsToTest) {
            console.log(`Testing ${m}...`);
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("Hello");
                console.log(`SUCCESS: ${m} is working.`);
                return; // Found one!
            } catch (e) {
                console.log(`FAILED: ${m} - ${e.message}`);
            }
        }

    } catch (error) {
        console.error("Fatal Error:", error);
    }
}

listModels();
