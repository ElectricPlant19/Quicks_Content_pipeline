const { callLLM, parseJSON } = require("./llm");

const SYSTEM = `You are an expert at extracting the most intellectually striking insights from articles and long-form text.

Your job: find the 5–10 most surprising, counterintuitive, or genuinely useful insights from the provided text.

Rules:
- Each insight must be SELF-CONTAINED (understandable without reading the source)
- Prioritize: counterintuitive findings, non-obvious conclusions, hard numbers/stats, paradigm-shifting ideas
- Skip: obvious points, vague generalities, filler content
- Focus on: psychology, economics, decision-making, behavioral science, science, history — wherever the text leads andmake sure that this is mostly for the gen-Z audience and people who are trying to get some real learnings in a quick and easy way.
- Keep the heading of each card a bit quirky something which catches the eye so that the attention is grabbed just by looking at it and the user is forced to read it intrinsically.
- The raw_insight should be in 1-3 sentences or to say on the least words possible but the effeciency and value at the maximum is restored and should be very concise and easy to understand.

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

async function extractInsights(text, title, url, images = []) {
  const userPrompt = `Source title: ${title}
Source URL: ${url}

Article text:
${text}

Extract the 5–10 best insights. Return JSON only.`;

  const raw = await callLLM(SYSTEM, userPrompt, 2000);
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
