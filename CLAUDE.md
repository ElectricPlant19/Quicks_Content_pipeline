# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Running the pipeline
```bash
# CLI: process one or more URLs
node pipeline.js https://example.com/article
node pipeline.js https://url1.com https://url2.com
node pipeline.js --file urls.txt

# Options
node pipeline.js <url> --output ./output --dry-run --mode merged
```

### Running the web server (vanilla JS frontend)
```bash
npm start          # node server.js, port 3000
```

### Running the React frontend
```bash
cd quicks-web
npm install
npm run dev        # Vite dev server (proxies /api → localhost:5001)

# In a separate terminal:
node quicks-web/api/server.js   # Backend API on port 5001
```

### Environment setup
Copy `.env.example` to `.env` and fill in:
- `GROK_API_KEY` — Groq API key (used to call Llama 3.3 70B)
- `MONGODB_URI` — MongoDB connection string
- `PORT` — Web server port (default 3000)
- `PIPELINE_MODE` — `legacy` (default, 3 LLM calls) or `merged` (2 LLM calls)
- `PIPELINE_TIMEOUT_MS` — Max pipeline duration (default 90000)
- `LLM_REQUEST_TIMEOUT_MS` — Per-LLM-call timeout (default 30000)
- `IMAGE_ENRICH_ENABLED` — `true` (default) or `false` to skip enrichment stage
- `IMAGE_ENRICH_MAX_CANDIDATES` — Images fetched from Pexels (default 20)
- `IMAGE_MIN_SHORT_EDGE` — Min pixels on the short edge (default 400)
- `IMAGE_MIN_AREA` — Min total pixel area (default 250000)
- `IMAGE_PREFER_ASPECT` — `portrait` (default) or `any`
- `PEXELS_API_KEY` — Pexels API key (required for enrichment; enricher skips entirely if absent)

## Architecture

### Pipeline stages
The core pipeline in `src/pipelineCore.js` runs these stages sequentially:

1. **Fetch** (`src/fetcher.js`) — Downloads URL, strips nav/ads/boilerplate with Cheerio, extracts images, truncates to ~12,000 chars
2. **Extract** (`src/extractor.js`) — LLM call: finds 5–10 high/medium-strength insights from the article text
3. **Transform** (`src/transformer.js`) — LLM call: formats each insight into a card with `hook`, `insight`, `twist`, `category`, `tags`, `image_url`
3.5. **Image Enrich** (`src/imageEnricher.js`) — Fills `image_url: null` cards via open-license image APIs (Openverse → Pexels). Non-fatal; cards keep `null` if no match. Runs after transform, before score so the scorer evaluates the final image.
4. **Score** (`src/scorer.js`) — LLM call: rates each card on 6 dimensions (hook_strength 25%, insight_density 25%, twist_impact 15%, shareability 15%, clarity 10%, visual_appeal 10%) → verdict: `publish`/`review`/`reject`
5. **Dedup** (`src/deduplicator.js`) — Two-pass: Jaccard similarity (token overlap >40% = duplicate), then optional semantic LLM dedup against existing hooks
6. **Output** (`src/output.js`) — Writes `run_<timestamp>.json` (full audit log), `mongo_insert_<timestamp>.json` (clean array), and persists to MongoDB via `bulkWrite` upsert. Run metadata includes `enrichment` stats block.

### Pipeline modes
- **Legacy** (default): stages 2 + 3 are separate LLM calls (extract, then transform)
- **Merged**: stages 2+3 combined in `src/mergedExtractTransform.js` — one LLM call for both, reducing total calls from 3 to 2. Select with `--mode merged` or `PIPELINE_MODE=merged`

### LLM layer (`src/llm.js`)
All LLM calls go through `src/llm.js`, which wraps the Groq API (OpenAI-compatible endpoint). Key behavior:
- Concurrency limited to 3 simultaneous calls (semaphore)
- `parseJSON()` tries direct parse → markdown code block extraction → brute-force `{...}` match
- No retries — fails fast on API errors

### Web server (`server.js`)
Express API with a single `POST /api/process` endpoint. Includes SSRF protection (rejects private IP ranges) and domain blocklist (`BLOCKED_DOMAINS` env var). Abort-signal propagation cancels in-flight pipeline if the client disconnects.

### Card schema
Cards stored in MongoDB `facts` collection (schema: `src/models/Fact.js`):
```
hook, insight, twist, image_url, category, tags, score, scoring{...}, source{title, url}, status, createdAt
```
- `status` is one of: `approved` (score ≥ 7.0), `pending_review` (5.0–6.9), `rejected` (<5.0)
- 8 valid categories: Psychology, Economics, Science, History, Decision-Making, Behavior, Technology, Philosophy

Image metadata fields (all nullable; populated by image enricher):
```
image_source_provider, image_source_page, image_license, image_author,
image_attribution_required, image_confidence,
image_storage_key (reserved), image_cdn_url (reserved)
```

### Image enricher (`src/imageEnricher.js`)
Fills missing `image_url` fields after transform using the Pexels API.

**Provider** (`src/imageProviders/pexels.js`):
- Pexels API (`PEXELS_API_KEY`), all photos free to use, requests portrait orientation natively
- Rate limited: 180 req/hr cap (10% buffer below Pexels free-tier limit of 200/hr) with 350ms minimum gap between requests

**Query building:** hook nouns (stop-word filtered, len ≥ 4) + top 2 tags + category. Falls back to category + source title nouns if empty.

**Filtering:** blocked domains (Getty, Shutterstock, etc.), `minShortEdge` + `minArea` (not separate width/height — avoids killing valid portrait images).

**Ranking (5 factors):** text relevance 40% · tag/category overlap 20% · aspect ratio 20% (portrait h/w ≥ 1.2 scores 1.0, landscape 0.2) · resolution 10% · provider priority 10%.

**Debug log per card:**
```
[enrich] "hook..." query="..." fetched=pexels:20 blocked=0 dim=3 final=17
```

### Two frontends
- `public/` — Vanilla JS + glassmorphism CSS, served by `server.js`
- `quicks-web/` — React/Vite app, reads from `quicks-web/api/server.js` (port 5001) which connects to MongoDB independently

### Pagination (quicks-web)
`/api/facts` uses **cursor-based pagination**, not skip/limit:
- Query params: `limit` (default 24, max 100), `cursor` (opaque base64url-encoded JSON)
- Response shape: `{ items, nextCursor, hasMore }`
- Cursor encodes `{ createdAt, _id }` of the last item; Mongo query uses `$or` to page stably
- Sort: `{ createdAt: -1, _id: -1 }` — requires compound index `{ status, createdAt, _id }`
- Backend uses `.lean()` and `.select(...)` (no `scoring` field sent to client)

Frontend infinite scroll (`quicks-web/src/App.jsx`):
- `IntersectionObserver` root is `.app-container` (the `overflow-y: scroll` div), not `window` — required for snap-scroll layout
- State refs (`cursorRef`, `hasMoreRef`, `loadingMoreRef`) mirror state values to avoid stale closures inside the observer callback
- `AbortController` cancels in-flight fetches on unmount
- Error states: full-screen error + Retry on initial failure; inline error + Retry on load-more failure (existing cards preserved)
