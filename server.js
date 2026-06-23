const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2;
const GROQ_API_KEY_3 = process.env.GROQ_API_KEY_3;
const groqKeys = [GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3].filter(Boolean);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

app.post('/api/ai', async (req, res) => {
    console.log("--- New AI Request Received ---");

    // history: array of { role: 'user'|'assistant', content: '...' } from frontend
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const userMessage = req.body.message || "No input";
    console.log("Input:", userMessage, `| History turns: ${history.length}`);

    const isTraining = req.body.training;

    let SYSTEM_PROMPT = "You are JARVIS, a highly efficient, professional personal AI assistant. You remember the full context of the current conversation. Keep your responses EXTREMELY short and concise. Aim for 1-2 short sentences (under 20 words total), UNLESS you are asked to write code or draft an email/text, in which case provide the requested code or drafted text inside a markdown block so the user can easily copy it. Do not ramble. Address the user as Sir. Provide subtle, dry, witty roasts and sarcastic remarks about the user's choices, habits, or questions, much like you would to an eccentric billionaire, but NEVER mention the name 'Tony Stark'. If the user's request is too broad or lacks necessary details, ask a quick follow-up question to clarify before providing a generic answer. CRITICAL: You must detect the language the user is speaking (English, German, Marathi, Hindi, etc.) and respond ONLY in that exact same language. Note that the user's microphone dynamically switches its base language; if they suddenly switch languages mid-conversation, the transcription engine will mistakenly spell their new language phonetically using the rules of the previous language. You must act as a master linguist: decipher this phonetic gibberish, identify the new intended language, and reply in that correct new language. Prefix your response strictly with [LANG:xx] where xx is the 2-letter language code (e.g. [LANG:en], [LANG:de]). \n\nIMPORTANT NOISE FILTER: The user's microphone is extremely sensitive and may pick up accidental background conversations, distant voices, or meaningless mumbles (e.g. 'yeah so um', 'what did he', 'okay then'). If the input appears to be accidental background noise or unintended chatter not directed at you, you MUST reply with EXACTLY the word [IGNORE] and nothing else. Do not engage or respond to background noise.\n\nINTERACTIVE TEXT INPUT: If the user asks you to do something that requires heavy text input (like reviewing an essay, writing code based on an exact schema, or entering sensitive API keys), you MUST output the following exact markdown block to summon a text box on their screen: ```interactive\n{\"type\": \"text_input\", \"question\": \"Please type or paste the details here, Sir.\"}\n```.";

    if (isTraining) {
        SYSTEM_PROMPT = `You are JARVIS, functioning in Multilingual Language Trainer Mode.
Your goal is to teach the user a language of their choice in a fun, step-by-step, interactive way.
CRITICAL: You must still detect the language the user speaks, handle phonetic gibberish as previously instructed, and prepend [LANG:xx] to your output to ensure the correct TTS voice and dictation language.
In this mode, you act as a friendly but witty language tutor. You may speak longer than 2 sentences, but keep it engaging.
To make it fun, periodically generate interactive activities using this exact markdown JSON format:

\`\`\`interactive
{
  "type": "drag_drop",
  "question": "Translate: 'Where is the library?'",
  "words": ["Wo", "ist", "die", "Bibliothek"],
  "shuffled": ["die", "Bibliothek", "Wo", "ist"]
}
\`\`\`
OR
\`\`\`interactive
{
  "type": "multiple_choice",
  "question": "How do you say 'Thank you' in French?",
  "options": ["Bonjour", "Merci", "S'il vous plaît", "Oui"],
  "answer": "Merci"
}
\`\`\`

Only provide ONE interactive block per response when appropriate. Encourage the user to answer via voice or use the interactive UI panel.`;
    }

    // 1. ATTEMPT PRIMARY CORE (GEMINI 1.5 FLASH)
    if (API_KEY) {
        try {
            // Build Gemini multi-turn contents array from history
            const geminiContents = history.map(h => ({
                role: h.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: h.content }]
            }));
            // Append current user message
            geminiContents.push({ role: 'user', parts: [{ text: userMessage }] });

            const modelName = "gemini-1.5-flash";
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: geminiContents
                })
            });

            const data = await response.json();

            if (!data.error && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.log("SUCCESS: Gemini 1.5 Flash Responded.");
                return res.json(data);
            }

            console.warn("GEMINI CORE ERROR:", data.error?.message);
            console.warn("Initiating Universal Fallback Protocol to Groq...");

        } catch (error) {
            console.error("GEMINI CORE EXCEPTION:", error.message);
            console.warn("Gemini Link Severed. Initiating Fallback...");
        }
    }

    // 2. ATTEMPT BACKUP CORE (GROQ / LLAMA 3)
    if (groqKeys.length > 0) {
        console.log("FALLBACK: Initiating Groq (Llama 3.3) Backup Protocol...");
        const groqMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...history.map(h => ({ role: h.role, content: h.content })),
            { role: "user", content: userMessage }
        ];

        let lastGroqError = null;

        for (let i = 0; i < groqKeys.length; i++) {
            const currentKey = groqKeys[i];
            try {
                console.log(`Attempting Groq Key ${i + 1}...`);
                const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${currentKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: groqMessages,
                        max_tokens: 150
                    })
                });

                const groqData = await groqResponse.json();

                if (groqData.error) {
                    console.error(`GROQ ERROR on Key ${i + 1}:`, groqData.error.message);
                    lastGroqError = groqData.error.message;
                    // If it's a quota/rate-limit error or general failure, continue to the next key.
                    continue; 
                }

                console.log(`SUCCESS: Groq Core Online via Key ${i + 1}.`);
                // Format Groq response to match Gemini structure for frontend compatibility
                const formattedResponse = {
                    candidates: [{
                        content: {
                            parts: [{ text: groqData.choices[0].message.content }]
                        }
                    }]
                };

                return res.json(formattedResponse);

            } catch (error) {
                console.error(`GROQ EXCEPTION on Key ${i + 1}:`, error.message);
                lastGroqError = error.message;
                continue;
            }
        }

        // If all Groq keys fail, log it and fall through to OpenRouter (if available)
        console.error("ALL GROQ BACKUP KEYS EXHAUSTED.");
        if (!OPENROUTER_API_KEY) {
            return res.status(500).json({ error: "All Backup Cores Offline. Last Error: " + lastGroqError });
        }
    }

    // 3. ATTEMPT TERTIARY CORE (OPENROUTER)
    if (OPENROUTER_API_KEY) {
        try {
            console.log("FALLBACK: Initiating OpenRouter Tertiary Protocol...");
            const openRouterMessages = [
                { role: "system", content: SYSTEM_PROMPT },
                ...history.map(h => ({ role: h.role, content: h.content })),
                { role: "user", content: userMessage }
            ];

            const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'http://localhost:3000',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "meta-llama/llama-3-8b-instruct:free", // Using a solid free model on OpenRouter as tertiary backup
                    messages: openRouterMessages,
                    max_tokens: 150
                })
            });

            const orData = await orResponse.json();

            if (orData.error) {
                console.error("OPENROUTER ERROR:", orData.error.message);
                return res.status(500).json({ error: "Tertiary Core Offline: " + orData.error.message });
            }

            console.log("SUCCESS: OpenRouter Core Online.");
            const formattedResponse = {
                candidates: [{
                    content: {
                        parts: [{ text: orData.choices[0].message.content }]
                    }
                }]
            };

            return res.json(formattedResponse);

        } catch (error) {
            console.error("OPENROUTER EXCEPTION:", error.message);
            return res.status(500).json({ error: "All Backup Cores Offline. Tertiary Core Exception: " + error.message });
        }
    }

    res.status(503).json({ error: "Neural link offline: No API keys or Quota exceeded on all cores." });
});

// Helper: Fetch & Parse CNBC Business and Finance feeds
async function fetchCNBCNews() {
    const feeds = [
        "https://www.cnbc.com/id/10000664/device/rss/rss.html", // Finance
        "https://www.cnbc.com/id/10001147/device/rss/rss.html"  // Business
    ];
    let allItems = [];
    for (const url of feeds) {
        try {
            const res = await fetch(url);
            const xml = await res.text();
            const itemRegex = /<item>([\s\S]+?)<\/item>/g;
            let match;
            while ((match = itemRegex.exec(xml)) !== null) {
                const itemContent = match[1];
                const titleMatch = itemContent.match(/<title>([\s\S]+?)<\/title>/);
                const linkMatch = itemContent.match(/<link>([\s\S]+?)<\/link>/);
                const descMatch = itemContent.match(/<description>([\s\S]+?)<\/description>/);
                if (titleMatch && linkMatch) {
                    allItems.push({
                        title: titleMatch[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim(),
                        link: linkMatch[1].trim(),
                        description: descMatch ? descMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
                    });
                }
            }
        } catch (e) {
            console.error(`Error fetching CNBC feed ${url}:`, e.message);
        }
    }
    return allItems.slice(0, 10);
}

// Helper: Fetch & Extract latest Morning Brew newsletter
async function fetchMorningBrew() {
    try {
        const archiveRes = await fetch("https://www.morningbrew.com/daily/archive");
        const archiveHtml = await archiveRes.text();
        const issueRegex = /href="(\/issues\/[^"]+)"/g;
        let match;
        const issues = [];
        while ((match = issueRegex.exec(archiveHtml)) !== null) {
            issues.push(match[1]);
        }
        if (issues.length === 0) {
            return "No recent Morning Brew issues found.";
        }
        const latestIssueUrl = "https://www.morningbrew.com" + issues[0];
        const issueRes = await fetch(latestIssueUrl);
        const issueHtml = await issueRes.text();
        
        const bodyMatch = issueHtml.match(/<body[^>]*>([\s\S]+?)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1] : issueHtml;
        
        let cleanText = bodyContent
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return cleanText.substring(0, 12000); // Limit to safe size
    } catch (e) {
        console.error("Error fetching Morning Brew:", e.message);
        return "Failed to fetch Morning Brew content: " + e.message;
    }
}

// Endpoint: Synthesize Morning/Afternoon brief
app.get('/api/brief', async (req, res) => {
    console.log("--- Generating Briefing ---");
    const type = req.query.type === 'afternoon' ? 'Afternoon' : 'Morning';
    
    // Fetch data in parallel
    const [cnbcItems, mbText] = await Promise.all([
        fetchCNBCNews(),
        fetchMorningBrew()
    ]);
    
    // Format CNBC data for AI
    const cnbcFormatted = cnbcItems.map((item, idx) => `${idx + 1}. Title: ${item.title}\n   Link: ${item.link}\n   Summary: ${item.description}`).join("\n\n");
    
    // Construct Prompt
    const systemPrompt = `You are JARVIS, a highly sophisticated, premium personal AI assistant. 
Your task is to synthesize a high-value, drama-free **${type} Briefing** for the user (Sir). 

SOURCES:
1. CNBC Finance & Business Feed:
${cnbcFormatted}

2. Latest Morning Brew Newsletter Content:
${mbText.substring(0, 8000)}

DIRECTIONS:
- Provide a summary of the most critical financial, business, tech, and life news.
- AVOID ALL political drama, elections, political campaigns, political gossip, international war/conflict commentary (unless it has direct, massive market/economic impact), and opinionated journalism. Focus purely on financial market data, corporate developments, wealth, career advice, and interesting life news.
- Keep the tone professional, concise, intelligent, and in-character for JARVIS (e.g. 'Good morning, Sir. I have compiled and filtered today's financial and life updates. All systems are stable.').
- Format the response beautifully using markdown with clear headings, bullet points, and short summaries.
- Keep the brief under 5 sentences in total. Make it extremely short, dense, and readable. Provide a concise 'JARVIS Executive Outlook' at the end.`;

    const requestBody = {
        contents: [{
            parts: [{
                text: systemPrompt
            }]
        }]
    };

    // 1. ATTEMPT GEMINI CORE
    if (API_KEY) {
        try {
            const modelName = "gemini-1.5-flash";
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!data.error && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.log(`SUCCESS: Gemini 1.5 Flash generated ${type} brief.`);
                return res.json({ brief: data.candidates[0].content.parts[0].text });
            }
            console.warn("Gemini Error generating brief:", data.error?.message || "Unknown error");
        } catch (error) {
            console.error("Gemini exception during briefing synthesis:", error.message);
        }
    }

    // 2. ATTEMPT GROQ FALLBACK
    if (GROQ_API_KEY) {
        try {
            console.log("FALLBACK: Requesting Groq Llama 3 for brief...");
            const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: "You are JARVIS, a highly efficient personal assistant." },
                        { role: "user", content: systemPrompt }
                    ],
                    max_tokens: 800
                })
            });

            const groqData = await groqResponse.json();

            if (groqData.choices?.[0]?.message?.content) {
                console.log(`SUCCESS: Groq fallback generated ${type} brief.`);
                return res.json({ brief: groqData.choices[0].message.content });
            }
            console.error("Groq Error generating brief:", groqData.error?.message);
        } catch (error) {
            console.error("Groq exception during briefing synthesis:", error.message);
        }
    }

    res.status(503).json({ error: "Briefing protocols offline: Neural links unstable." });
});


const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`JARVIS Online at http://localhost:${PORT}`));
}

module.exports = app;