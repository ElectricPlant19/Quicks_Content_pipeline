const { callLLM, parseJSON } = require("./llm");
// No external uuid package needed as we use native crypto below


// Node's built-in crypto for UUID-like IDs
function generateId() {
  return require("crypto").randomBytes(12).toString("hex");
}

const SYSTEM = `You are a master writer for Quicks — a mobile app that competes with doomscrolling 
by delivering intellectual value in seconds.

Your job: transform a raw insight into a perfectly structured Quicks card.

---

HOOK rules:
- One sentence. Under 100 characters. Hard limit.
- Must feel like a jolt — the kind of thing that makes someone say "wait, what?"
- It should be a bold, specific claim that sounds almost too interesting to be true 
  — but is.
- Avoid questions. Avoid "you". Avoid anything that sounds like an ad or a listicle.
- Test: read it out loud. If it sounds like something a person would actually say, 
  it works. If it sounds like a headline, rewrite it.

---

INSIGHT rules:
- 3–4 sentences. Max 100 words.
- First sentence: state the core finding clearly.
- Second + third sentences: explain the mechanism. Why does this happen? 
  What's actually going on underneath?
- Final sentence: the real-world implication — what does this mean for how 
  something actually works?
- Self-contained. Someone who has never seen the source must fully understand it.
- Write like a knowledgeable friend explaining something over a coffee — 
  dense with actual information, zero padding.
- Forbidden: fascinating, surprising, interesting, remarkable, did you know, 
  game-changer, it's worth noting, importantly.

---

TWIST rules:
- One sentence. Minimum 5 words. Maximum 20 words. Both are hard limits.
- Register: the dry, slightly brutal observation a very smart person drops
  at 2am that makes the room go quiet. Not a punchline. Not a summary.
  A gut-punch in casual clothes.
- It should expose the uncomfortable irony hiding inside the insight —
  the thing the insight implies about human nature, systems, or everyday
  life that nobody wants to say out loud.
- It must be fully detached from the insight in tone. The insight informs.
  The twist indicts.
- It must be able to live completely outside the card — someone should be
  able to read it with zero context and feel something.
- Hard ban: do not summarize the insight. Do not explain the insight.
  Do not add a "so" or "therefore" that connects it back. It stands alone
  or it fails.
- Hard ban: do not produce a fragment, a label, or a two-word verdict.
  It must be a complete sentence with a subject, verb, and a sting.
- Test: count the words. If it is under 5, it is wrong. Rewrite it.
---

Card Schema:
{
  "hook": "1 sentence, under 100 chars, a jolt not a headline",
  "insight": "3–4 sentences, max 100 words, mechanism-first, genuinely informative",
  "twist": "1 sentence, under 15 words, tagline-level, standalone, a little ruthless",
  "category": "one of: Psychology | Economics | Science | History | Decision-Making 
               | Behavior | Technology | Philosophy",
  "tags": ["array", "of", "2-4", "lowercase", "keywords"],
  "image_url": "string OR null"
}

Return ONLY a valid JSON array. No preamble, no fences.`;

async function transformToCards(extractionResult, options = {}) {
  const { source_title, source_url, insights, images } = extractionResult;

  const insightList = insights
    .map((ins, i) => `${i + 1}. [${ins.type}] ${ins.raw_insight}`)
    .join("\n\n");

  const imagesList = images && images.length > 0
    ? `Available images from article:\n${images.map((img, i) => `${i + 1}. ${img.url} (alt: "${img.alt}")`).join("\n")}`
    : "No images available in this article.";

  const userPrompt = `Source: "${source_title}" (${source_url})

Raw insights to transform:
${insightList}

${imagesList}

Transform each into a Quicks card. For each card, select the most relevant image from the list above. If no article image clearly illustrates the card, return null — a fallback stage will find a better image. Return a JSON array of card objects.`;

  const raw = await callLLM(SYSTEM, userPrompt, 3000, options);
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
