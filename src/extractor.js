const { callClaude, parseJSON } = require("./claude");

const SYSTEM = `You are an expert at extracting the most intellectually striking insights from articles and long-form text.

Your job: find the 5–10 most surprising, counterintuitive, or genuinely useful insights from the provided text.

Rules:
- Each insight must be SELF-CONTAINED (understandable without reading the source)
- Prioritize: counterintuitive findings, non-obvious conclusions, hard numbers/stats, paradigm-shifting ideas
- Skip: obvious points, vague generalities, filler content
- Focus on: psychology, economics, decision-making, behavioral science, science, history — wherever the text leads

Return ONLY valid JSON. No preamble, no markdown fences, no explanation.

Schema:
{
  "source_title": "string",
  "source_url": "string",
  "insights": [
    {
      "raw_insight": "The core idea in 1–3 sentences",
      "type": "stat | finding | concept | story | paradox",
      "strength": "high | medium | low",
      "topic_hint": "psychology | economics | science | history | decision-making | other"
    }
  ]
}`;

async function extractInsights(text, title, url) {
  const userPrompt = `Source title: ${title}
Source URL: ${url}

Article text:
${text}

Extract the 5–10 best insights. Return JSON only.`;

  const raw = await callClaude(SYSTEM, userPrompt, 2000);
  const parsed = parseJSON(raw);

  // Filter to only high/medium strength insights
  parsed.insights = parsed.insights.filter((i) =>
    ["high", "medium"].includes(i.strength)
  );

  console.log(
    `  ✓ Extracted ${parsed.insights.length} insights from "${title}"`
  );
  return parsed;
}

module.exports = { extractInsights };