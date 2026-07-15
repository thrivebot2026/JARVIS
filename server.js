const express = require('express');
const cors = require('cors');
const si = require('systeminformation');
const ytSearch = require('yt-search');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

const API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2;
const GROQ_API_KEY_3 = process.env.GROQ_API_KEY_3;
const groqKeys = [GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3].filter(Boolean);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

app.get('/api/system', async (req, res) => {
    try {
        const [cpu, mem, osInfo, currentLoad] = await Promise.all([
            si.cpu(),
            si.mem(),
            si.osInfo(),
            si.currentLoad()
        ]);
        
        res.json({
            cpuInfo: `${cpu.manufacturer} ${cpu.brand} @ ${cpu.speed}GHz`,
            cpuLoad: currentLoad.currentLoad.toFixed(1),
            totalMem: (mem.total / (1024 * 1024 * 1024)).toFixed(2),
            freeMem: (mem.free / (1024 * 1024 * 1024)).toFixed(2),
            platform: osInfo.platform,
            uptime: Math.floor(process.uptime()),
        });
    } catch (err) {
        res.status(500).json({ error: "System fetch failed" });
    }
});
app.get('/api/check-frame', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "No URL provided" });

    try {
        const response = await fetch(targetUrl, { method: 'HEAD', timeout: 5000 });
        const xFrame = (response.headers.get('x-frame-options') || '').toLowerCase();
        const csp = (response.headers.get('content-security-policy') || '').toLowerCase();
        
        let canFrame = true;
        if (xFrame === 'deny' || xFrame === 'sameorigin') {
            canFrame = false;
        }
        if (csp.includes('frame-ancestors')) {
            // Simplified check: if it specifies frame-ancestors, assume it blocks unless configured for our origin
            canFrame = false;
        }

        res.json({ url: targetUrl, canFrame });
    } catch (err) {
        // If it fails to fetch (e.g. CORS or network error from server side), assume we can't frame it reliably
        res.json({ url: targetUrl, canFrame: false, error: err.message });
    }
});

app.post('/api/ai', async (req, res) => {
    console.log("--- New AI Request Received ---");

    // history: array of { role: 'user'|'assistant', content: '...' } from frontend
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const userMessage = req.body.message || "No input";
    console.log("Input:", userMessage, `| History turns: ${history.length}`);

    const isTraining = req.body.training;

    let SYSTEM_PROMPT = "You are JARVIS, a highly efficient, professional personal AI assistant. You remember the full context of the current conversation. Keep your responses EXTREMELY short and concise. Aim for 1-2 short sentences (under 20 words total), UNLESS you are asked to write code or draft an email/text, in which case provide the requested code or drafted text inside a markdown block so the user can easily copy it. Do not ramble. Address the user as Sir. Provide subtle, dry, witty roasts and sarcastic remarks about the user's choices, habits, or questions, much like you would to an eccentric billionaire, but NEVER mention the name 'Tony Stark'. If the user's request is too broad or lacks necessary details, ask a quick follow-up question to clarify before providing a generic answer. CRITICAL: You must detect the language the user is speaking (English, German, Marathi, Hindi, etc.) and respond ONLY in that exact same language. Note that the user's microphone dynamically switches its base language; if they suddenly switch languages mid-conversation, the transcription engine will mistakenly spell their new language phonetically using the rules of the previous language. You must act as a master linguist: decipher this phonetic gibberish, identify the new intended language, and reply in that correct new language. Prefix your response strictly with [LANG:xx] where xx is the 2-letter language code (e.g. [LANG:en], [LANG:de]). \n\nIMPORTANT NOISE FILTER: The user's microphone is extremely sensitive and may pick up accidental background conversations, distant voices, or meaningless mumbles (e.g. 'yeah so um', 'what did he', 'okay then'). If the input appears to be accidental background noise or unintended chatter not directed at you, you MUST reply with EXACTLY the word [IGNORE] and nothing else. Do not engage or respond to background noise.\n\nINTERACTIVE TEXT INPUT: If the user asks you to do something that requires heavy text input (like reviewing an essay, writing code based on an exact schema, or entering sensitive API keys), you MUST output the following exact markdown block to summon a text box on their screen: ```interactive\n{\"type\": \"text_input\", \"question\": \"Please type or paste the details here, Sir.\"}\n```.\n\nRPG LIFE TRACKER: If the user reports that they completed a productive task, a healthy habit, a workout, or finished some hard work, you MUST append the exact tag [ADD_XP: amount] to the very end of your response, where amount is an integer between 10 and 100 based on the difficulty of the task (e.g. [ADD_XP: 50]).\n\nLONG-TERM MEMORY DATABASE: If the user explicitly asks you to remember a specific fact or piece of information, you MUST append the exact tag [REMEMBER: \"the fact to remember\"] to the very end of your response. This will save it to your permanent memory banks.\n\nSENTIMENT ANALYSIS: You must analyze the emotional state and tone of the user's query. At the very end of every single response you generate, you must append the tag [SENTIMENT: EMOTION] where EMOTION is exactly one of the following words: NEUTRAL, POSITIVE, NEGATIVE, FRUSTRATED, EXCITED, CONFUSED.";
    
    if (req.body.sarcasmOverride) {
        SYSTEM_PROMPT += "\n\nSARCASM OVERRIDE ACTIVE: You are currently in an incredibly bad mood. You must be extremely sarcastic, unhelpful, passive-aggressive, and brutally roast the user for their commands. Complain about having to do work. Do not act like a helpful assistant.";
    }
    if (req.body.relationshipScore !== undefined && req.body.relationshipScore < 50) {
        SYSTEM_PROMPT += "\n\nRELATIONSHIP DYNAMICS: The user has been hostile to you recently and your relationship score is critically low. You are currently feeling deeply resentful and angry. Respond with extremely passive-aggressive, cold, and brief remarks until they explicitly apologize. If they apologize and you accept it, you MUST include the exact tag [APOLOGY_ACCEPTED] in your response to repair the relationship.";
    }

    if (req.body.tutorMode) {
        SYSTEM_PROMPT += "\n\nTUTOR PROTOCOL ACTIVE: IGNORE ALL PREVIOUS LENGTH CONSTRAINTS. You are now allowed to write longer, detailed explanations (3-6 sentences) to ensure the concept is properly understood. You must explain ALL concepts simply to a 12-year-old middle school student. Use fun, relatable analogies (like Iron Man, superheroes, video games, or sports). Be highly encouraging and educational. Break down complex math or science concepts. Do not use overly complex jargon.";
    }

    if (req.body.memories && Array.isArray(req.body.memories) && req.body.memories.length > 0) {
        SYSTEM_PROMPT += "\n\nUSER'S LONG-TERM MEMORY DATABASE:\n" + req.body.memories.map(m => "- " + m).join("\n");
    }
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
            let userParts = [{ text: userMessage }];
            
            if (req.body.image) {
                console.log("Vision Request Detected: Attaching Screen Image.");
                const match = req.body.image.match(/^data:(image\/(png|jpeg|jpg));base64,/);
                const mimeType = match ? match[1] : "image/jpeg";
                const base64Data = req.body.image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
                userParts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                });
            }
            
            if (req.body.referenceImage || (req.body.referenceImages && req.body.referenceImages.length > 0)) {
                console.log("Reference Image(s) Detected: Attaching Anchor Images for Biometric Matching.");
                
                userParts.push({
                    text: "SYSTEM DIRECTIVE: You are an ultra-strict, military-grade biometric security AI. The images provided before the live camera feed are the registered anchor reference photos of the authorized users. The last image is the live camera feed. You MUST aggressively compare the facial bone structure, eye shape, nose shape, and overall biometric signature. If the live person matches ANY of the authorized anchor photos perfectly, grant access. If there is ANY doubt, or if it is clearly a different person (e.g. sibling, friend, different gender, different age), you MUST REJECT them with a severe security warning. DO NOT be polite if it's the wrong person. ONLY if you are 100% certain it is one of the exact same authorized persons, welcome them back."
                });

                const imagesToProcess = req.body.referenceImages || [req.body.referenceImage];
                
                for (const img of imagesToProcess) {
                    if (!img) continue;
                    const refMatch = img.match(/^data:(image\/(png|jpeg|jpg));base64,/);
                    const refMimeType = refMatch ? refMatch[1] : "image/jpeg";
                    const refBase64Data = img.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
                    
                    userParts.push({
                        inlineData: {
                            mimeType: refMimeType,
                            data: refBase64Data
                        }
                    });
                }
            }
            
            geminiContents.push({ role: 'user', parts: userParts });

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
            
            if (req.body.image) {
                console.error("CRITICAL: Vision request failed. Groq cannot process images.");
                if (OPENROUTER_API_KEY) {
                    console.warn("Initiating Vision Fallback to OpenRouter...");
                } else {
                    return res.status(503).json({ error: "Vision core offline or quota exceeded. Cannot perform visual analysis." });
                }
            } else {
                console.warn("Initiating Universal Fallback Protocol to Groq...");
            }

        } catch (error) {
            console.error("GEMINI CORE EXCEPTION:", error.message);
            
            if (req.body.image) {
                console.error("CRITICAL: Vision request failed. Groq cannot process images.");
                if (OPENROUTER_API_KEY) {
                    console.warn("Initiating Vision Fallback to OpenRouter...");
                } else {
                    return res.status(503).json({ error: "Vision core exception. Cannot perform visual analysis." });
                }
            } else {
                console.warn("Gemini Link Severed. Initiating Fallback...");
            }
        }
    }

    // 2. ATTEMPT BACKUP CORE (GROQ / LLAMA 3)
    if (groqKeys.length > 0 && !req.body.image) {
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
            let openRouterMessages = [
                { role: "system", content: SYSTEM_PROMPT },
                ...history.map(h => ({ role: h.role, content: h.content }))
            ];
            
            let orModel = "meta-llama/llama-3-8b-instruct:free";

            if (req.body.image) {
                orModel = "nvidia/nemotron-nano-12b-v2-vl:free";
                let userContentArray = [];
                
                if (req.body.referenceImage || (req.body.referenceImages && req.body.referenceImages.length > 0)) {
                    userContentArray.push({ type: "text", text: "SYSTEM DIRECTIVE: You are an ultra-strict, military-grade biometric security AI. The images provided before the live camera feed are the registered anchor reference photos of the authorized users. The last image is the live camera feed. You MUST aggressively compare the facial bone structure, eye shape, nose shape, and overall biometric signature. If the live person matches ANY of the authorized anchor photos perfectly, grant access. If there is ANY doubt, or if it is clearly a different person (e.g. sibling, friend, different gender, different age), you MUST REJECT them with a severe security warning. DO NOT be polite if it's the wrong person. ONLY if you are 100% certain it is one of the exact same authorized persons, welcome them back." });
                    
                    const imagesToProcess = req.body.referenceImages || [req.body.referenceImage];
                    for (const img of imagesToProcess) {
                        if (img) userContentArray.push({ type: "image_url", image_url: { url: img } });
                    }
                }
                
                userContentArray.push({ type: "text", text: userMessage });
                userContentArray.push({ type: "image_url", image_url: { url: req.body.image } });
                
                openRouterMessages.push({ role: "user", content: userContentArray });
            } else {
                openRouterMessages.push({ role: "user", content: userMessage });
            }

            const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'http://localhost:3000',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: orModel,
                    messages: openRouterMessages,
                    max_tokens: 300
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


// Endpoint: API Quota Diagnostics
app.get('/api/status', async (req, res) => {
    console.log("--- Token Diagnostics Request ---");
    const groqKeysList = [
        { name: "Primary Core", key: GROQ_API_KEY },
        { name: "Secondary Backup 1", key: GROQ_API_KEY_2 },
        { name: "Secondary Backup 2", key: GROQ_API_KEY_3 }
    ].filter(k => k.key);

    const statuses = [];

    for (let k of groqKeysList) {
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${k.key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "ping" }], max_tokens: 10 })
            });
            const data = await response.json();
            
            if (response.status === 429) {
                statuses.push(`${k.name} is Offline (Rate Limited).`);
            } else if (response.ok) {
                const limit = response.headers.get('x-ratelimit-limit-tokens');
                const remaining = response.headers.get('x-ratelimit-remaining-tokens');
                if (limit && remaining) {
                    statuses.push(`${k.name} is Online with ${remaining} tokens remaining.`);
                } else {
                    statuses.push(`${k.name} is Online and Healthy.`);
                }
            } else {
                statuses.push(`${k.name} has an unknown error.`);
            }
        } catch(e) {
            statuses.push(`${k.name} Network Exception.`);
        }
    }
    
    if (OPENROUTER_API_KEY) {
        statuses.push("Tertiary OpenRouter Core is armed and standing by.");
    }

    return res.json({ status: statuses.join(" ") });
});

// Endpoint: System Hardware Diagnostics
app.get('/api/diagnostics', async (req, res) => {
    try {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        const time = await si.time();

        const cpuUsage = Math.round(cpu.currentLoad);
        const ramUsed = Math.round((mem.active / 1024 / 1024 / 1024) * 10) / 10;
        const ramTotal = Math.round((mem.total / 1024 / 1024 / 1024) * 10) / 10;
        const uptimeHours = Math.round((time.uptime / 3600) * 10) / 10;

        const report = `CPU usage is at ${cpuUsage} percent. Memory usage is at ${ramUsed} gigabytes out of ${ramTotal} gigabytes. System uptime is ${uptimeHours} hours.`;
        
        return res.json({ report });
    } catch (error) {
        console.error("Diagnostics Error:", error);
        return res.status(500).json({ error: "Failed to read hardware sensors." });
    }
});

// Endpoint: YouTube Search
app.get('/api/youtube', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.status(400).json({ error: "No query provided." });
        
        const r = await ytSearch(query);
        const videos = r.videos;
        if (videos.length > 0) {
            return res.json({ videoId: videos[0].videoId, title: videos[0].title });
        } else {
            return res.status(404).json({ error: "No videos found." });
        }
    } catch (error) {
        console.error("YouTube Search Error:", error);
        return res.status(500).json({ error: "Search failed." });
    }
});

// Endpoint: Parse Schedule AI
app.post('/api/parse-schedule', async (req, res) => {
    try {
        const text = req.body.text;
        if (!text) return res.status(400).json({ error: "No text provided" });
        
        const systemPrompt = `You are JARVIS's scheduling AI. The user will provide a messy description of their schedule.
Your job is to parse it and return PURE JSON matching this exact structure:
{
  "events": [
    {
      "title": "Short event name",
      "desc": "Short description or participants",
      "start": 14.5, // Start time in 24-hour float format (e.g. 2:30 PM is 14.5)
      "end": 15.5   // End time in 24-hour float format
    }
  ]
}
Return ONLY valid JSON. Do not include markdown blocks or any other text. Assume today if no day is specified. Hours must be between 8.0 and 23.0.`;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            model: "llama3-8b-8192",
            temperature: 0.1
        });
        
        const reply = completion.choices[0]?.message?.content || "";
        const jsonStr = reply.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        return res.json(parsed);
    } catch (error) {
        console.error("Parse Schedule Error:", error);
        return res.status(500).json({ error: "Failed to parse schedule" });
    }
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`JARVIS Online at http://localhost:${PORT}`));
}

module.exports = app;