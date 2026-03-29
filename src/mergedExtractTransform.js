const { callLLM, parseJSON } = require("./llm");
const { randomBytes } = require("crypto");

const PROMPT_VERSION = "merged-v1";

const VALID_CATEGORIES = new Set([
  "Psychology", "Economics", "Science", "History",
  "Decision-Making", "Behavior", "Technology", "Philosophy",
]);

const SYSTEM = `You are an expert at extracting insights from articles AND writing viral Quicks cards.

Quicks is a mobile app that competes with doomscrolling by delivering intellectual value in seconds. Your audience is gen-Z and smart young adults who want real learnings, fast.

STEP 1 — Select the 5–8 strongest insights from the article:
- Must be SELF-CONTAINED (understandable without reading the source)
- Prioritize: counterintuitive findings, non-obvious conclusions, hard numbers/stats, paradigm-shifting ideas
- Skip: obvious points, vague generalities, filler content
- Only include insights you would rate "high" or "medium" strength — drop weak ones entirely

STEP 2 — Format each selected insight as a Quicks card:
- hook: 1 sentence, ideally < 120 characters. Must stop the thumb. Bold, provocative, or deeply intriguing. No clickbait — must deliver. Keep it a bit quirky to grab attention at a glance.
- insight: 2–4 sentences. The core idea, explained clearly. Dense with value. No fluff. Self-contained — no "as mentioned above" references.
- twist: 1 sentence. The unexpected implication, the irony, the so-what. Keep it light and a bit humorous, relatable so users will remember it.
- category: MUST be exactly one of: Psychology | Economics | Science | History | Decision-Making | Behavior | Technology | Philosophy
- tags: array of exactly 2–4 lowercase keywords
- image_url: URL from the article images list that best illustrates THIS specific card, or null if none fit. Choose: visually striking, conceptually relevant images. Prefer diagrams, charts, photos.

Writing rules:
- Avoid the words: "fascinating", "surprising", "interesting", "did you know"
- Write like a brilliant friend texting you something they just learned
- The raw_insight should be concise — maximum value in minimum words

Return ONLY a valid JSON array of card objects. No preamble, no markdown fences, no explanation.

Schema per card:
{
  "hook": "string",
  "insight": "string",
  "twist": "string",
  "category": "Psychology | Economics | Science | History | Decision-Making | Behavior | Technology | Philosophy",
  "tags": ["lowercase", "keywords"],
  "image_url": "string or null"
}`;

function generateId() {
  return randomBytes(12).toString("hex");
}

function validateCard(card, idx) {
  const issues = [];
  if (!card.hook || typeof card.hook !== "string") issues.push("missing hook");
  if (!card.insight || typeof card.insight !== "string") issues.push("missing insight");
  if (!VALID_CATEGORIES.has(card.category)) issues.push(`invalid category "${card.category}"`);
  if (!Array.isArray(card.tags) || card.tags.length < 2 || card.tags.length > 4) issues.push(`tags must be 2–4 items (got ${Array.isArray(card.tags) ? card.tags.length : typeof card.tags})`);
  if (card.hook && card.hook.length > 200) issues.push(`hook too long (${card.hook.length} chars)`);
  return issues;
}

async function mergedExtractAndTransform(text, title, url, images = [], options = {}) {
  console.log(`  [${PROMPT_VERSION}] Running merged extract+transform`);

  const imagesList = images && images.length > 0
    ? `Available images from article:\n${images.map((img, i) => `${i + 1}. ${img.url} (alt: "${img.alt}")`).join("\n")}`
    : "No images available in this article.";

  const userPrompt = `Source title: ${title}
Source URL: ${url}

Article text:
${text}

${imagesList}

Extract the 5–8 strongest insights and transform each into a Quicks card. Return a JSON array only.`;

  // max_tokens: extractor was 2000 + transformer was 3000; use 4000 with 8-card cap for reliability
  const raw = await callLLM(SYSTEM, userPrompt, 4000, options);
  const parsed = parseJSON(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`Merged extract+transform returned non-array: ${typeof parsed}`);
  }

  // Validate and filter cards
  const valid = [];
  for (let i = 0; i < parsed.length; i++) {
    const issues = validateCard(parsed[i], i);
    if (issues.length > 0) {
      console.warn(`  ⚠ Dropping card ${i + 1} (validation failed: ${issues.join(", ")}): "${String(parsed[i].hook || "").slice(0, 60)}"`);
    } else {
      valid.push(parsed[i]);
    }
  }

  if (valid.length === 0) {
    throw new Error("Merged extract+transform produced 0 valid cards after validation");
  }

  // Attach metadata (same shape as transformer.js output)
  const enriched = valid.map((card) => ({
    _id: generateId(),
    ...card,
    source: { title, url },
    score: null,
    createdAt: new Date().toISOString(),
    status: "pending_review",
  }));

  console.log(`  ✓ Merged extract+transform: ${enriched.length} valid cards (${parsed.length - valid.length} dropped)`);
  return enriched;
}

module.exports = { mergedExtractAndTransform, PROMPT_VERSION };
