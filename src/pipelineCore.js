const { fetchAndClean } = require("./fetcher");
const { extractInsights } = require("./extractor");
const { transformToCards } = require("./transformer");
const { scoreCards } = require("./scorer");
const { deduplicateCards } = require("./deduplicator");
const { writeOutputs, loadExistingHooks } = require("./output");
const { mergedExtractAndTransform, PROMPT_VERSION } = require("./mergedExtractTransform");
const { enrichCardsWithImages } = require("./imageEnricher");

/**
 * Pipeline modes:
 *   legacy  (default) — 3 LLM calls: extract → transform → score
 *   merged            — 2 LLM calls: extract+transform (merged) → score
 *
 * Set via env: PIPELINE_MODE=merged
 *
 * The merged path uses prompt version logged as PROMPT_VERSION from
 * mergedExtractTransform.js for debugging reproducibility.
 */
const PIPELINE_MODE = (process.env.PIPELINE_MODE || "legacy").toLowerCase();

async function runPipeline(url, options = {}) {
  const {
    outputDir = "./output",
    dryRun = false,
    existingHooks = [],
    signal,
  } = options;

  const startTime = Date.now();
  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw signal.reason || new Error("Pipeline aborted.");
    }
  };

  try {
    console.log(`\n🔗 Processing: ${url} [mode=${PIPELINE_MODE}]`);
    throwIfAborted();

    // Stage 1: Fetch
    const { text, title, images } = await fetchAndClean(url, { signal });
    console.log(`  ✓ Fetched: ${title} (${images?.length || 0} images found)`);
    throwIfAborted();

    let cards;

    if (PIPELINE_MODE === "merged") {
      // ── Merged path: 2 LLM calls total ──────────────────────────────────
      console.log(`  [prompt=${PROMPT_VERSION}]`);

      // Call 1: extract + transform in one shot
      cards = await mergedExtractAndTransform(text, title, url, images, { signal });
      throwIfAborted();
    } else {
      // ── Legacy path: 3 LLM calls total ──────────────────────────────────

      // Stage 2: Extract
      const extracted = await extractInsights(text, title, url, images, { signal });
      throwIfAborted();

      // Stage 3: Transform
      cards = await transformToCards(extracted, { signal });
      throwIfAborted();
    }

    // Stage 3.5: Image enrichment — fills missing image_url via open-license APIs
    let enrichStats = {};
    try {
      const enrichResult = await enrichCardsWithImages(
        cards,
        { sourceUrl: url, sourceTitle: title, articleImages: images },
        { signal }
      );
      cards = enrichResult.cards;
      enrichStats = enrichResult.stats;
    } catch (enrichErr) {
      console.warn(`  ⚠ Image enrichment stage failed: ${enrichErr.message}`);
    }
    throwIfAborted();

    // Stage 4: Score (both paths)
    const scored = await scoreCards(cards, { signal });
    throwIfAborted();

    // Bonus: Dedup
    const { unique, duplicates } = await deduplicateCards(scored, existingHooks);

    const durationMs = Date.now() - startTime;

    const results = {
      title,
      url,
      cards: unique,
      duplicateCount: duplicates.length,
      durationMs,
      timestamp: new Date().toISOString(),
    };

    if (!dryRun) {
      try {
        await writeOutputs(unique, {
          urls: [url],
          durationMs,
          enrichment: enrichStats,
        }, outputDir);
      } catch (persistErr) {
        console.error(`  ⚠ Persistence error for ${url}: ${persistErr.message}`);
        results.persistenceError = true;
      }
    }

    return results;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error(`  ❌ Pipeline failed for ${url}: ${err.message}`);
    return {
      url,
      error: err.message,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = { runPipeline };
