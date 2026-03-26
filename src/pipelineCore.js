const { fetchAndClean } = require("./fetcher");
const { extractInsights } = require("./extractor");
const { transformToCards } = require("./transformer");
const { scoreCards } = require("./scorer");
const { deduplicateCards } = require("./deduplicator");
const { writeOutputs, loadExistingHooks } = require("./output");

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
    console.log(`\n🔗 Processing: ${url}`);
    throwIfAborted();

    // Stage 1: Fetch
    const { text, title, images } = await fetchAndClean(url, { signal });
    console.log(`  ✓ Fetched: ${title} (${images?.length || 0} images found)`);
    throwIfAborted();

    // Stage 2: Extract
    const extracted = await extractInsights(text, title, url, images, { signal });
    throwIfAborted();

    // Stage 3: Transform
    const cards = await transformToCards(extracted, { signal });
    throwIfAborted();

    // Stage 4: Score
    const scored = await scoreCards(cards, { signal });
    throwIfAborted();

    // Bonus: Dedup
    const { unique, duplicates } = await deduplicateCards(scored, existingHooks);

    const durationMs = Date.now() - startTime;

    // Status updates for return
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
