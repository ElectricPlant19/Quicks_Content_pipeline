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
    existingHooks = [] 
  } = options;

  console.log(`\n🔗 Processing: ${url}`);

  // Stage 1: Fetch
  const { text, title } = await fetchAndClean(url);
  console.log(`  ✓ Fetched: ${title}`);

  // Stage 2: Extract
  const extracted = await extractInsights(text, title, url);

  // Stage 3: Transform
  const cards = await transformToCards(extracted);

  // Stage 4: Score
  const scored = await scoreCards(cards);

  // Bonus: Dedup
  const { unique, duplicates } = await deduplicateCards(scored, existingHooks);

  // Status updates for return
  const results = {
    title,
    url,
    cards: unique,
    duplicateCount: duplicates.length,
    timestamp: new Date().toISOString()
  };

  if (!dryRun) {
    writeOutputs(unique, {
      urls: [url],
      durationMs: 0,
    }, outputDir);
  }

  return results;
}

module.exports = { runPipeline };
