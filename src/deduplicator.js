const { callClaude, parseJSON } = require("./claude");

/**
 * Simple token-based similarity using Jaccard index.
 * Fast, no API call needed for obvious duplicates.
 */
function tokenize(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function jaccardSimilarity(setA, setB) {
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Fast local dedup pass using Jaccard similarity.
 * Flags cards with > 40% token overlap as duplicates.
 */
function localDedup(cards) {
  const flagged = new Set();
  const tokenSets = cards.map((c) =>
    tokenize(`${c.hook} ${c.insight} ${c.twist || ""}`)
  );

  for (let i = 0; i < cards.length; i++) {
    if (flagged.has(i)) continue;
    for (let j = i + 1; j < cards.length; j++) {
      if (flagged.has(j)) continue;
      const sim = jaccardSimilarity(tokenSets[i], tokenSets[j]);
      if (sim > 0.4) {
        // Keep the one with higher score
        const keepI = (cards[i].score || 0) >= (cards[j].score || 0);
        flagged.add(keepI ? j : i);
        console.log(
          `  ⚠ Duplicate pair (${(sim * 100).toFixed(0)}% similar): "${cards[keepI ? j : i].hook.slice(0, 60)}…"`
        );
      }
    }
  }

  return cards.map((c, i) => ({
    ...c,
    duplicate: flagged.has(i),
  }));
}

/**
 * AI dedup pass for semantic duplicates — same idea, different words.
 * Only runs on cards that passed local dedup.
 */
async function semanticDedup(cards, existingHooks = []) {
  const candidates = cards.filter((c) => !c.duplicate);
  if (candidates.length === 0) return cards;

  // Only call AI if we have existing hooks to compare against
  if (existingHooks.length === 0) {
    console.log(`  ✓ No existing cards to compare against, skipping semantic dedup`);
    return cards;
  }

  const SYSTEM = `You are checking for semantic duplicates in a content library.

Given a list of NEW card hooks and a list of EXISTING hooks, identify which new hooks convey the same core idea as an existing hook — even if worded differently.

Return a JSON array of indices (0-based) of the NEW hooks that are semantic duplicates of existing ones.
Example: [0, 3] means new cards at index 0 and 3 are duplicates.
Return [] if no duplicates found.
Return ONLY the JSON array.`;

  const userPrompt = `NEW hooks to check:
${candidates.map((c, i) => `${i}. ${c.hook}`).join("\n")}

EXISTING hooks in library (sample):
${existingHooks.slice(0, 50).map((h, i) => `${i}. ${h}`).join("\n")}`;

  try {
    const raw = await callClaude(SYSTEM, userPrompt, 500);
    const dupIndices = new Set(parseJSON(raw));

    let semanticDupCount = 0;
    let candidateIdx = 0;
    const result = cards.map((card) => {
      if (card.duplicate) return card;
      const isDup = dupIndices.has(candidateIdx++);
      if (isDup) semanticDupCount++;
      return { ...card, duplicate: isDup || card.duplicate };
    });

    console.log(`  ✓ Semantic dedup: ${semanticDupCount} additional duplicates found`);
    return result;
  } catch (err) {
    console.warn(`  ⚠ Semantic dedup failed, skipping: ${err.message}`);
    return cards;
  }
}

async function deduplicateCards(cards, existingHooks = []) {
  console.log(`  Running local dedup on ${cards.length} cards...`);
  const afterLocal = localDedup(cards);

  console.log(`  Running semantic dedup...`);
  const afterSemantic = await semanticDedup(afterLocal, existingHooks);

  const unique = afterSemantic.filter((c) => !c.duplicate);
  const dupes = afterSemantic.filter((c) => c.duplicate);

  console.log(`  ✓ Dedup complete: ${unique.length} unique, ${dupes.length} removed`);
  return { unique, duplicates: dupes };
}

module.exports = { deduplicateCards };