const { callLLM, parseJSON } = require("./llm");
// No external uuid package needed as we use native crypto below


// Node's built-in crypto for UUID-like IDs
function generateId() {
  return require("crypto").randomBytes(12).toString("hex");
}

const SYSTEM = `You are a master writer for Quicks — a mobile app that competes with doomscrolling by delivering intellectual value in seconds.

Your job: transform a raw insight into a perfectly structured Quicks card.

Card Schema:
{
  "hook": "1 sentence. Must stop the thumb. Be bold, provocative, or deeply intriguing. No clickbait — must deliver.",
  "insight": "2–4 sentences. The core idea, explained clearly. Dense with value. No fluff.",
  "twist": "1 sentence OR null. The unexpected implication, the irony, the so-what. Only include if genuinely powerful.",
  "category": "one of: Psychology | Economics | Science | History | Decision-Making | Behavior | Technology | Philosophy",
  "tags": ["array", "of", "2-4", "lowercase", "keywords"]
}

Rules:
- Hook must be < 120 characters ideally
- Insight must be self-contained — no "as mentioned above" references
- Avoid: "fascinating", "surprising", "interesting", "did you know"
- Write like a brilliant friend texting you something they just learned
- Return ONLY valid JSON array. No preamble, no fences.`;

async function transformToCards(extractionResult) {
  const { source_title, source_url, insights } = extractionResult;

  const insightList = insights
    .map((ins, i) => `${i + 1}. [${ins.type}] ${ins.raw_insight}`)
    .join("\n\n");

  const userPrompt = `Source: "${source_title}" (${source_url})

Raw insights to transform:
${insightList}

Transform each into a Quicks card. Return a JSON array of card objects.`;

  const raw = await callLLM(SYSTEM, userPrompt, 3000);
  const cards = parseJSON(raw);

  // Attach metadata
  const enriched = cards.map((card) => ({
    _id: generateId(),
    ...card,
    source: {
      title: source_title,
      url: source_url,
    },
    score: null, // filled by scorer
    createdAt: new Date().toISOString(),
    status: "pending_review",
  }));

  console.log(`  ✓ Transformed ${enriched.length} cards`);
  return enriched;
}

module.exports = { transformToCards };
