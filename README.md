# Quicks Content Pipeline

AI-powered pipeline that turns any article URL into scored, deduped Quicks cards — ready for MongoDB.

---

## Pipeline Stages

```
URL → Fetch & Clean → Extract Insights → Transform to Cards → Score → Dedup → Output
```

| Stage | File | What it does |
|---|---|---|
| 1. Fetch | `src/fetcher.js` | Downloads URL, strips boilerplate, extracts clean text |
| 2. Extract | `src/extractor.js` | Finds 5–10 best insights via Claude API |
| 3. Transform | `src/transformer.js` | Formats each insight into Hook / Insight / Twist / Category / Tags |
| 4. Score | `src/scorer.js` | Rates each card on 5 dimensions, sets verdict: `publish / review / reject` |
| 5. Dedup | `src/deduplicator.js` | Removes duplicates via Jaccard similarity + semantic AI check |
| 6. Output | `src/output.js` | Writes full JSON + MongoDB-insert-ready JSON |

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY (and optionally MONGODB_URI)
```

---

## Usage

### Single URL
```bash
node pipeline.js https://example.com/article
```

### Multiple URLs
```bash
node pipeline.js https://url1.com https://url2.com https://url3.com
```

### From a file
```bash
node pipeline.js --file urls.txt
```

### Options
```bash
--output <dir>    Output directory (default: ./output)
--dry-run         Run pipeline without writing files
```

---

## Output Files

Each run creates two files in `./output/`:

### `run_<timestamp>.json`
Full pipeline output with all metadata, scores, and rejected cards. Use for review and auditing.

```json
{
  "meta": {
    "total": 12,
    "approved": 7,
    "pending": 3,
    "rejected": 2
  },
  "cards": [
    {
      "_id": "a1b2c3d4e5f6...",
      "hook": "The more choices you have, the less satisfied you'll be with any of them.",
      "insight": "Barry Schwartz's paradox of choice...",
      "twist": "The solution isn't fewer options — it's deciding in advance what 'good enough' means.",
      "category": "Psychology",
      "tags": ["decision-making", "choice", "paradox"],
      "score": 8.45,
      "scoring": {
        "hook_strength": 9,
        "insight_density": 8,
        "twist_impact": 7,
        "shareability": 9,
        "clarity": 9,
        "verdict": "publish",
        "weakness": null
      },
      "status": "approved",
      "source": { "title": "...", "url": "..." },
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### `mongo_insert_<timestamp>.json`
Clean array of approved + pending_review cards, ready to insert directly into MongoDB.

```bash
# Insert into MongoDB
mongoimport --uri "$MONGODB_URI" --collection facts \
  --file output/mongo_insert_<timestamp>.json \
  --jsonArray
```

### `Fact.model.js`
Mongoose schema definition — copy into your backend `models/` folder.

---

## Scoring System

Cards are scored 0–10 on five dimensions:

| Dimension | Weight | Description |
|---|---|---|
| Hook Strength | 30% | Does it stop the scroll? |
| Insight Density | 30% | Value per word |
| Twist Impact | 15% | Does it reframe everything? |
| Shareability | 15% | Would someone screenshot this? |
| Clarity | 10% | Understandable in one read? |

**Verdicts:**
- `publish` → score ≥ 7.0 → status: `approved`
- `review` → score 5.0–6.9 → status: `pending_review`
- `reject` → score < 5.0 → status: `rejected`

---

## Card Schema

```
hook      — 1 sentence, < 120 chars. Makes you NEED to read on.
insight   — 2–4 sentences. Dense with value.
twist     — 1 sentence or null. The unexpected implication.
category  — Psychology | Economics | Science | History | Decision-Making | Behavior | Technology | Philosophy
tags      — 2–4 lowercase keywords
score     — 0–10 float
status    — approved | pending_review | rejected
```

---

## Deduplication

Two-pass dedup runs on every batch:

1. **Local (Jaccard)** — Fast token-overlap check. Flags pairs with > 40% overlap.
2. **Semantic (AI)** — Claude checks for same-idea cards worded differently, comparing against all previously generated hooks.

Previously run outputs are automatically loaded from `./output/` so cross-run duplicates are caught too.

---

## Tips

- **Best inputs:** Long-form essays, research summaries, book chapters, behavioral science articles
- **Avoid:** News articles, opinion pieces, listicles, paywalled content
- **Quality signal:** Aim for > 60% approval rate. If lower, improve your source URLs.
- **Batch size:** 5–10 URLs per run is ideal. Too many in one run risks rate limits.