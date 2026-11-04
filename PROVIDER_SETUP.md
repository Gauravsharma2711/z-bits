# Z-Bits — AI Provider Configuration & Local Setup Guide

**Target Version:** Z-Bits 0.42.0+  
**Audience:** Developers & Hackathon Evaluators  
**Security Notice:** Never paste private API keys into files committed to source control.

---

## 1. Supported AI Providers

Z-Bits supports five primary provider routes:
1. **Google Gemini** (Recommended for free-tier development)
2. **Anthropic Claude Code**
3. **OpenAI-Compatible Endpoints** (Groq, Together, DeepSeek, OpenRouter)
4. **Ollama** (Local-only, privacy-focused)
5. **OpenCode Runtime**

---

## 2. Environment Configuration (`.env`)

To connect AI providers locally, copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

### 2.1 Google Gemini Setup (Recommended)
1. Generate a free API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Add your key to `.env`:
   ```env
   GEMINI_API_KEY=AIzaSy...your_gemini_key_here
   ```
3. Supported models:
   - `gemini-2.5-flash` (Fast, generous rate limit)
   - `gemini-2.5-pro` (Complex reasoning)
   - `gemini-flash-lite-latest` (Minimal token usage)

### 2.2 Claude Code Setup
If you have Claude Code installed globally:
1. Run in your terminal:
   ```bash
   claude auth login
   ```
2. Or provide an Anthropic API key in `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```
3. Supported models:
   - `claude-code/sonnet` (Default heavy reasoning)
   - `claude-code/opus`
   - `claude-code/haiku` (Fast light tasks)

### 2.3 OpenAI-Compatible Endpoints (Groq, Together, DeepSeek, OpenRouter)
Configure any standard OpenAI-compatible base URL and API key in `.env`:
```env
OPENAI_API_KEY=sk-...your_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
```
For DeepSeek directly:
```env
OPENAI_API_KEY=sk-...your_deepseek_key
OPENAI_BASE_URL=https://api.deepseek.com/v1
```

### 2.4 Local Ollama Setup
1. Download and start [Ollama](https://ollama.com).
2. Pull your chosen models:
   ```bash
   ollama pull llama3.1
   ollama pull qwen2.5-coder
   ```
3. Start the Ollama daemon:
   ```bash
   ollama serve
   ```
4. Set `.env` to point to Ollama:
   ```env
   OPENAI_BASE_URL=http://127.0.0.1:11434/v1
   OPENAI_API_KEY=ollama
   ```

---

## 3. Web UI Configuration (In-App)

You can also manage connections directly from the Z-Bits Studio web interface:

1. Start Z-Bits:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:4310` in your browser.
3. Navigate to **Settings** (`gear icon`) → **AI Connections**.
4. Click **Connect** on your preferred provider:
   - For **Google Gemini**: Paste your AI Studio key directly. Z-Bits stores it encrypted in the server vault (`AES-256-GCM`).
   - For **OpenAI-Compatible**: Enter the Base URL and API key.
5. Click **Test Connection** to execute a real probe and verify model availability and round-trip latency.

---

## 4. Troubleshooting

| Symptom | Cause | Solution |
|---|---|---|
| `Missing Gemini API key` | Neither `GEMINI_API_KEY` nor an in-app vault key was provided. | Add `GEMINI_API_KEY=...` to `.env` or paste the key into Studio AI settings. |
| `Claude API rate limit or quota exceeded: 403` | Claude subscription or prepaid balance is exhausted. | Recharge balance in Anthropic Console or switch teammate to Gemini. |
| `Ollama server is not running on 127.0.0.1:11434` | Ollama service is stopped. | Run `ollama serve` in a background terminal. |
| `The connection test timed out` | Provider is experiencing high latency or rate-limiting. | Wait for the 60-second cooldown and test again, or choose a lighter model. |
| `'C:\Program' is not recognized` | Unquoted batch file invocation on Windows. | Resolved in Phase 02; ensure latest code is running. |
