require('dotenv').config();
const OpenAI = require('openai');

async function testOpenAI() {
    console.log("Testing OpenAI Key...");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "Say Hello" }],
        });
        console.log("✅ OpenAI Response:", completion.choices[0].message.content);
    } catch (error) {
        console.error("❌ OpenAI Error:", error.message);
    }
}

testOpenAI();
