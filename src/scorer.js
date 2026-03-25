const { callClaude, parseJSON } = require("./claude");

const SYSTEM = `You are a content quality judge for Quicks — a mobile feed app competing with doomscrolling.

Score each card on these dimensions (0–10 each):

1. hook_strength     — Does it make you NEED to read more? Is it specific, not vague?
2. insight_density   — How much value per word? Would a smart person learn something?
3. twist_impact      — Does the twist reframe everything? (0 if no twist)
4. shareability      — Would someone screenshot and send this? 
5. clarity           — Can a smart non-expert understand it in one read?

Final score = weighted average:
  hook_strength * 0.30
+ insight_density * 0.30
+ twist_impact * 0.15
+ shareability * 0.15
+ clarity * 0.10

Also provide:
- "verdict": "publish" (score ≥ 7.0) | "review" (5.0–6.9) | "reject" (< 5.0)
- "weakness": single biggest flaw, or null if strong

Return ONLY a JSON array. One score object per card. Same order as input.

Schema per item:
{
  "hook_strength": 0-10,
  "insight_density": 0-10,
  "twist_impact": 0-10,
  "shareability": 0-10,
  "clarity": 0-10,
  "final_score": 0-10 (computed, 2 decimal places),
  "verdict": "publish" | "review" | "reject",
  "weakness": "string or null"
}`;

async function scoreCards(cards) {
  const cardList = cards
    .map(
      (c, i) =>
        `Card ${i + 1}:
Hook: ${c.hook}
Insight: ${c.insight}
Twist: ${c.twist || "(none)"}
Category: ${c.category}`
    )
    .join("\n\n---\n\n");

  const userPrompt = `Score these ${cards.length} Quicks cards. Return JSON array only.\n\n${cardList}`;

  const raw = await callClaude(SYSTEM, userPrompt, 2000);
  const scores = parseJSON(raw);

  // Merge scores back into cards
  const scored = cards.map((card, i) => {
    const s = scores[i] || {};
    const computed =
      (s.hook_strength || 0) * 0.3 +
      (s.insight_density || 0) * 0.3 +
      (s.twist_impact || 0) * 0.15 +
      (s.shareability || 0) * 0.15 +
      (s.clarity || 0) * 0.1;

    return {
      ...card,
      score: parseFloat((s.final_score ?? computed).toFixed(2)),
      scoring: {
        hook_strength: s.hook_strength,
        insight_density: s.insight_density,
        twist_impact: s.twist_impact,
        shareability: s.shareability,
        clarity: s.clarity,
        verdict: s.verdict || (computed >= 7 ? "publish" : computed >= 5 ? "review" : "reject"),
        weakness: s.weakness || null,
      },
      status: s.verdict === "publish" ? "approved" : s.verdict === "reject" ? "rejected" : "pending_review",
    };
  });

  const counts = scored.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  console.log(
    `  ✓ Scored ${scored.length} cards: ${counts.approved || 0} approved, ${counts.pending_review || 0} review, ${counts.rejected || 0} rejected`
  );
  return scored;
}

module.exports = { scoreCards };