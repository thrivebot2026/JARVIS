const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.post('/api/ai', async (req, res) => {
    console.log("--- New AI Request Received ---");
    const userMessage = req.body.contents?.[0]?.parts?.[0]?.text || "No input";
    console.log("Input:", userMessage);

    // 1. ATTEMPT PRIMARY CORE (GEMINI 1.5 FLASH)
    if (API_KEY) {
        try {
            const modelName = "gemini-1.5-flash";
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
            });

            const data = await response.json();

            if (!data.error) {
                console.log("SUCCESS: Gemini 1.5 Flash Responded.");
                return res.json(data);
            }

            // Universal Fallback: Any error from Gemini triggers Groq attempt
            console.warn("GEMINI CORE ERROR:", data.error.message);
            console.warn("Initiating Universal Fallback Protocol to Groq...");

        } catch (error) {
            console.error("GEMINI CORE EXCEPTION:", error.message);
            console.warn("Gemini Link Severed. Initiating Fallback...");
        }
    }

    // 2. ATTEMPT BACKUP CORE (GROQ / LLAMA 3)
    if (GROQ_API_KEY) {
        try {
            console.log("FALLBACK: Initiating Groq (Llama 3.3) Backup Protocol...");
            const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: "You are JARVIS, a highly efficient personal assistant. Give a concise, professional response." },
                        { role: "user", content: userMessage }
                    ],
                    max_tokens: 500
                })
            });

            const groqData = await groqResponse.json();

            if (groqData.error) {
                console.error("GROQ ERROR:", groqData.error.message);
                return res.status(500).json({ error: "Groq Backup Core Offline: " + groqData.error.message });
            }

            // Format Groq (OpenAI format) to match Gemini structure for frontend compatibility
            const formattedResponse = {
                candidates: [{
                    content: {
                        parts: [{ text: groqData.choices[0].message.content }]
                    }
                }]
            };

            console.log("SUCCESS: Groq Fallback Core Responded.");
            return res.json(formattedResponse);

        } catch (error) {
            console.error("GROQ CORE EXCEPTION:", error.message);
            return res.status(500).json({ error: "All Neural Links Severed." });
        }
    }

    // Final failure if no keys or both failed
    res.status(503).json({ error: "Neural link offline: No API keys or Quota exceeded on all cores." });
});


const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`JARVIS Online at http://localhost:${PORT}`));
}

module.exports = app;