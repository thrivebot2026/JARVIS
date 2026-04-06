# JARVIS | Personal Assistant

A sophisticated, premium AI assistant interface inspired by the JARVIS system from Marvel's Iron Man. Built with a high-performance Node.js backend and a modern, glassmorphic frontend utilizing a dual-brain architecture (Gemini 1.5 Flash + Groq Llama 3).

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18 or higher recommended for built-in fetch support)
- **A Modern Browser** (Chrome or Edge recommended for Web Speech API support)

### 2. Installation
Clone the project or navigate to the project folder and install dependencies:
```bash
npm install
```

### 3. Configuration
Ensure your `.env` file in the root directory contains your API keys:
```env
GEMINI_API_KEY=your_google_gemini_key
GROQ_API_KEY=your_groq_api_key
```

### 4. Launching JARVIS
Start the server:
```bash
node server.js
```
Open your browser and navigate to:
[http://localhost:3000](http://localhost:3000)

---

## 🎧 User Interface Guide

- **🎙️ Microphone**: Click the microphone icon or say "Hey Jarvis" to start interacting.
- **⏮️ Chat Log**: View your conversation history on the left panel (persists for 24 hours).
- **Clock & Date**: Real-time display in CST/CDT format (MM/DD/YYYY, H:MM AM/PM).
- **HUD Feedback**: The central rings and soundwaves pulse dynamically based on JARVIS's state (Listening, Speaking, or Cooldown).

---

## 🛠️ Technical Features

### **Multi-Neural Link (Dual-Brain)**
JARVIS uses a sophisticated failover system to ensure 100% uptime:
1. **Primary Core**: **Google Gemini 1.5 Flash** (High-speed, efficient multimodal model).
2. **Backup Core**: **Groq (Llama 3.3 70B)**. If Gemini hits a quota limit (Code 429), JARVIS silently fails over to Groq to fulfill the request.

### **Local Conversational Intelligence**
To save API tokens and provide instant feedback, JARVIS handles common social cues locally:
- **Greetings**: "Hey Jarvis", "Are you there?"
- **Gratitude**: "Thanks", "Thank you"
- **Farewells**: "Goodbye", "See you later"
- **Status**: "How are you?"

### **Feedback Loop Suppression**
- **Echo Cancellation**: JARVIS's microphone will ignore its own voice synthesis during playback to prevent feedback loops.
- **Session Cooldown**: A 3-second "turn-taking" delay is enforced after JARVIS speaks to ensure natural pacing and prevent crosstalk.

### **Comprehensive Logging**
The **Chat Log** captures everything:
- All AI responses (Gemini & Groq).
- Every internal shortcut (opening Netflix, Gmail, etc.).
- Even "System Errors" and "Quota Warnings" are logged for clear transparency.

---

## 📡 API Architecture

### **AI Core Interface**
JARVIS communicates with the backend via the `/api/ai` endpoint. The server handles normalized responses, so the frontend receives a consistent Gemini-style JSON regardless of the underlying model.

### **Voice Settings**
- **Accent**: English (UK) / British Male George.
- **Speed**: Optimized at `1.3x` for clear but rapid information delivery.
- **Interruption**: (Disabled in current version to prioritize echo-suppression) System waits for user turn after cooling.

---

## 🚀 Deployment

### Deploying to Vercel
1. **GitHub Push**: The project is configured for seamless Vercel integration.
2. **Account Connection**: Connect your GitHub repository to [Vercel](https://vercel.com).
3. **Environment Variables**: In the Vercel Dashboard, add the following under **Project Settings > Environment Variables**:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `GROQ_API_KEY`: Your Groq API Key.
4. **Deploy**: Vercel will automatically build and deploy the application.

---

> [!IMPORTANT]
> Ensure you have an active internet connection for the neural links to the AI cores. If both Gemini and Groq fail, JARVIS will report a "Neural Link Offline" status.
> When deployed to Vercel, the app will be accessible via a `vercel.app` URL without needing `localhost`.
