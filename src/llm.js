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

/**
 * Calls Groq (Llama 3.3 70B) with a system prompt and user prompt.
 * No retries: fail fast so UI is not blocked.
 */
function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason || new Error("Operation aborted.");
  }
}

async function callLLM(system, prompt, maxTokens = 1000, options = {}) {
  await acquireSemaphore();

  try {
    const apiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GROQ_API_KEY (or legacy GROK_API_KEY).");
    }

    const requestTimeoutMs = Number(process.env.LLM_REQUEST_TIMEOUT_MS || 30000);
    const signal = options.signal;
    throwIfAborted(signal);

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
        signal,
      });

      return response.data.choices[0].message.content;
    } catch (err) {
      if (err.name === "CanceledError" || err.code === "ERR_CANCELED") {
        throw new Error("LLM request aborted.");
      }
      if (err.response) {
        console.error(`  ❌ Groq API Details:`, JSON.stringify(err.response.data, null, 2));
      }
      const msg = err.response?.data?.error?.message || err.message;
      console.error(`  ❌ Groq API error: ${msg}`);
      throw new Error(`Groq API failed: ${msg}`);
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
