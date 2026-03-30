const { callLLM, parseJSON } = require("./llm");

const SYSTEM = `You are an expert at extracting intellectually striking insights from articles and long-form text.

Your job: find the 5–10 most surprising, counterintuitive, or genuinely useful insights from the provided text.

Rules:
- SELF-CONTAINED: each insight must be fully understandable to someone who has never seen the source. Include the key number, finding, or mechanism — not just a pointer to it.
- Prioritize: counterintuitive findings, hard numbers/stats, non-obvious causal mechanisms, paradigm-shifting ideas, real psychological or behavioral effects.
- Skip: obvious points, vague generalities, motivational filler, anything that needs the article to make sense.
- raw_insight must be 1–3 sentences. Maximum 60 words. No hedging, no filler. Pack the value in.
- Write for someone who is intelligent, curious, and impatient. Every word must earn its place.

Return ONLY valid JSON. No preamble, no markdown fences, no explanation.

Schema:
{
  "source_title": "string",
  "source_url": "string",
  "insights": [
    {
      "raw_insight": "The core idea in 1–3 sentences, max 60 words",
      "type": "stat | finding | concept | story | paradox",
      "strength": "high | medium | low",
      "topic_hint": "Psychology | Economics | Science | History | Decision-Making | Behavior | Technology | Philosophy"
    }
  ]
}`;

async function extractInsights(text, title, url, images = [], options = {}) {
  const userPrompt = `Source title: ${title}
Source URL: ${url}

Article text:
${text}

Extract the 5–10 best insights. Return JSON only.`;

  const raw = await callLLM(SYSTEM, userPrompt, 2000, options);
  const parsed = parseJSON(raw);

  // Filter to only high/medium strength insights
  parsed.insights = parsed.insights.filter((i) =>
    ["high", "medium"].includes(i.strength)
  );

  // Pass through images for downstream use
  parsed.images = images;

  console.log(
    `  ✓ Extracted ${parsed.insights.length} insights from "${title}"`
  );
  return parsed;
}

module.exports = { extractInsights };
