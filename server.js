const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Gmail OAuth2 Config
const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
);

let userTokens = null; // In-memory store for demo. In production, use a database.

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

// --- GMAIL OAUTH ENDPOINTS ---
app.get('/api/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/gmail.readonly'],
        prompt: 'consent'
    });
    res.json({ url });
});

app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        userTokens = tokens;
        res.send('<h1>Authentication Successful</h1><p>You can close this window now and return to JARVIS.</p><script>setTimeout(() => window.close(), 2000)</script>');
    } catch (error) {
        console.error("Auth Error:", error);
        res.status(500).send("Authentication Failed");
    }
});

// --- EMAIL SUMMARIZATION ENDPOINT ---
app.get('/api/emails/summarize', async (req, res) => {
    if (!userTokens) {
        return res.status(401).json({ error: "Gmail not connected. Please authenticate." });
    }

    try {
        oauth2Client.setCredentials(userTokens);
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Fetch last 5 unread emails
        const listRes = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread',
            maxResults: 5
        });

        const messages = listRes.data.messages || [];
        if (messages.length === 0) {
            return res.json({ summary: "Your inbox is clear, Sir. No new unread emails." });
        }

        let emailContents = "";
        for (const msg of messages) {
            const detail = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id
            });
            const snippet = detail.data.snippet;
            const subject = detail.data.payload.headers.find(h => h.name === 'Subject')?.value || "No Subject";
            emailContents += `Subject: ${subject}\nSnippet: ${snippet}\n---\n`;
        }

        // Send to Gemini for summarization
        const summaryResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `Summarize these recent emails for me in a professional JARVIS-like tone. Highlight key actions or urgent items:\n\n${emailContents}` }]
                }]
            })
        });

        const summaryData = await summaryResponse.json();
        const summary = summaryData.candidates?.[0]?.content?.parts?.[0]?.text || "I was unable to process the email summaries at this time.";

        res.json({ summary });

    } catch (error) {
        console.error("Gmail/AI Error:", error);
        res.status(500).json({ error: "Failed to summarize emails." });
    }
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`JARVIS Online at http://localhost:${PORT}`));
}

module.exports = app;