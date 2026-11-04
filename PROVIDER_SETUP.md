# Z-Bits AI Provider Setup Guide

Z-Bits features a **Universal AI Provider Architecture**. You can connect your preferred AI models and services without being locked into a single vendor.

---

## 1. Google Gemini (Native `@google/genai` SDK)

Z-Bits uses Google's latest official `@google/genai` TypeScript SDK.

### Configuration
1. Obtain an API key from [Google AI Studio](https://aistudio.google.com/).
2. You can provide the key either via environment variable or in the Z-Bits web interface:
   - **Environment:**
     ```bash
     export GEMINI_API_KEY="AIzaSy..."
     ```
   - **In UI:** Navigate to **AI Providers** &rarr; select **Google Gemini** &rarr; paste your API key &rarr; click **Save**.
3. **Supported Models:**
   - `google/gemini-2.5-flash` (Recommended default: fast, highly capable, supports tools and vision)
   - `google/gemini-2.5-pro` (Complex reasoning, deep analysis, coding)
   - `google/gemini-2.0-flash`
   - `google/gemini-1.5-flash`
   - `google/gemini-1.5-pro`

### Security Note
Your Gemini API key is authenticated exclusively on the Z-Bits server backend. It is **never** sent to browser JavaScript, localStorage, or logged in transcripts.

---

## 2. AWS Bedrock

Z-Bits offers first-class AWS Bedrock support through two integration paths:

### Option A: Native Bedrock Converse API (`@aws-sdk/client-bedrock-runtime`)
Uses the official AWS SDK v3 Bedrock Converse and ConverseStream APIs.

1. **Authentication Options:**
   - **AWS SDK Credential Provider Chain:** Reads standard `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` from your environment.
   - **Shared Profiles:** Uses `~/.aws/credentials` and `~/.aws/config`.
   - **IAM Roles:** When deployed on AWS EC2, ECS, or Lambda, automatically assumes the attached IAM role.
2. **Environment Variables:**
   ```bash
   export AWS_REGION="us-east-1"
   export AWS_ACCESS_KEY_ID="AKIA..."
   export AWS_SECRET_ACCESS_KEY="..."
   # Optional: export AWS_SESSION_TOKEN="..."
   ```
3. **Supported Models:**
   - `bedrock/us.anthropic.claude-3-5-sonnet-20241022-v2:0` (Premier model for coding, autonomous execution)
   - `bedrock/us.anthropic.claude-3-5-haiku-20241022-v1:0` (High speed, cost-efficient)
   - `bedrock/amazon.nova-pro-v1:0`
   - `bedrock/amazon.nova-lite-v1:0`
   - `bedrock/meta.llama3-3-70b-instruct-v1:0`
   - `bedrock/mistral.mistral-large-2407-v1:0`

### Option B: AWS Bedrock OpenAI-Compatible Endpoint
If you prefer Bedrock's OpenAI-compatible endpoint interface:
1. Endpoint URL format:
   ```text
   https://bedrock-runtime.{region}.amazonaws.com/openai/v1
   ```
2. In **AI Providers** &rarr; **Add Custom Provider**:
   - Provider Name: `AWS Bedrock (OpenAI Endpoint)`
   - Base URL: `https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1`
   - API Key: Your Bedrock API token
   - Model: `anthropic.claude-3-5-sonnet-20241022-v2:0`

---

## 3. Generic OpenAI-Compatible Providers

You can connect any inference provider or local server that implements the standard OpenAI chat completions endpoint (e.g. Groq, Together AI, OpenRouter, DeepSeek, vLLM, Ollama, LM Studio).

### Setup in UI or Environment
- **Groq:**
  - Base URL: `https://api.groq.com/openai/v1`
  - Model: `llama-3.3-70b-versatile`
  - API Key: `gsk_...`
- **Together AI:**
  - Base URL: `https://api.together.xyz/v1`
  - Model: `meta-llama/Llama-3-70b-chat-hf`
  - API Key: `...`
- **Local Ollama:**
  - Base URL: `http://localhost:11434/v1`
  - Model: `llama3.2`
  - API Key: `ollama` (placeholder)

---

## 4. Preserved Built-in Providers

All existing provider integrations remain fully functional:
- **Claude Code:** Automatically detects local Claude Code installation.
- **OpenCode Go:** Built-in multi-model runner.
- **OpenAI:** Direct OpenAI API integration (`OPENAI_API_KEY`).
- **GitHub Copilot / ChatGPT Plan:** Direct web sign-in integration where supported.

