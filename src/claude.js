const axios = require("axios");

/**
 * Calls Grok (X.AI) with a system prompt and user prompt.
 */
async function callClaude(system, prompt, maxTokens = 1000) {
  try {
    const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
    }, {
      headers: {
        "Authorization": `Bearer ${process.env.GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000, 
    });

    return response.data.choices[0].message.content;
  } catch (err) {
    if (err.response) {
      console.error(`  ❌ Groq API Details:`, JSON.stringify(err.response.data, null, 2));
    }
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`  ❌ Groq API error: ${msg}`);
    throw new Error(`Groq API failed: ${msg}`);
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

module.exports = { callClaude, parseJSON };
