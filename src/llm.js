const axios = require("axios");

// Simple concurrency limiter (semaphore pattern)
const MAX_CONCURRENT_LLM_CALLS = 3;
let activeCalls = 0;
const waitQueue = [];

function acquireSemaphore() {
  return new Promise((resolve) => {
    if (activeCalls < MAX_CONCURRENT_LLM_CALLS) {
      activeCalls++;
      resolve();
    } else {
      waitQueue.push(resolve);
    }
  });
}

function releaseSemaphore() {
  activeCalls--;
  if (waitQueue.length > 0) {
    activeCalls++;
    const next = waitQueue.shift();
    next();
  }
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Calls Groq (Llama 3.3 70B) with a system prompt and user prompt.
 * Includes retry logic with exponential backoff and rate-limit handling.
 */
async function callLLM(system, prompt, maxTokens = 1000) {
  await acquireSemaphore();

  try {
    const apiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GROQ_API_KEY (or legacy GROK_API_KEY).");
    }

    const requestTimeoutMs = Number(process.env.LLM_REQUEST_TIMEOUT_MS || 30000);
    const maxRetries = Number(process.env.LLM_MAX_RETRIES || MAX_RETRIES);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.1,
        }, {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: requestTimeoutMs,
        });

        return response.data.choices[0].message.content;
      } catch (err) {
        const status = err.response?.status;
        const isRetryable = status === 429 || status >= 500;

        if (!isRetryable || attempt === maxRetries) {
          if (err.response) {
            console.error(`  ❌ Groq API Details:`, JSON.stringify(err.response.data, null, 2));
          }
          const msg = err.response?.data?.error?.message || err.message;
          console.error(`  ❌ Groq API error: ${msg}`);
          throw new Error(`Groq API failed: ${msg}`);
        }

        // Compute delay: respect Retry-After header or use exponential backoff
        let delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        if (status === 429 && err.response?.headers?.["retry-after"]) {
          const retryAfter = parseInt(err.response.headers["retry-after"], 10);
          if (!isNaN(retryAfter)) {
            delayMs = retryAfter * 1000;
          }
        }

        console.warn(`  ⚠ Groq API attempt ${attempt}/${maxRetries} failed (HTTP ${status}), retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  } finally {
    releaseSemaphore();
  }
}

/**
 * Robustly parses JSON from AI response.
 * Handles cases where the AI might wrap JSON in markdown blocks.
 */
function parseJSON(text) {
  try {
    // 1. Try direct parse
    return JSON.parse(text);
  } catch (e) {
    // 2. Try to find JSON block in markdown
    const jsonMatch = text.match(/```(?:json)?([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (e2) {
        throw new Error(`Failed to parse extracted JSON block: ${e2.message}`);
      }
    }
    
    // 3. Try to find anything between { and } or [ and ]
    const bruteMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (bruteMatch) {
      try {
        return JSON.parse(bruteMatch[1].trim());
      } catch (e3) {
        throw new Error(`Failed to parse best-effort JSON match: ${e3.message}`);
      }
    }

    throw new Error(`Could not find valid JSON in AI response: ${text.slice(0, 100)}...`);
  }
}

module.exports = { callLLM, parseJSON };
