require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY_ARQUITECTO;
    if (!apiKey) {
        console.error("❌ No GEMINI_API_KEY_ARQUITECTO in .env");
        return;
    }
    console.log("Testing Key:", apiKey.substring(0, 10) + "...");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    try {
        const result = await model.generateContent("Respond with 'OK'");
        console.log("✅ Response:", result.response.text());
    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}
testGemini();
