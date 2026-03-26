#!/usr/bin/env node

/**
 * Quicks Content Pipeline — CLI Entrypoint
 * ==========================================
 * Usage:
 *   node pipeline.js <url> [url2] [url3] ...
 *   node pipeline.js --file urls.txt
 *
 * Options:
 *   --output <dir>    Output directory (default: ./output)
 *   --dry-run         Run pipeline but don't write files
 */

require("dotenv").config();
const { runPipeline } = require("./src/pipelineCore");
const { loadExistingHooks } = require("./src/output");
const connectDB = require("./src/db");
const fs = require("fs");

// ─── Argument Parsing ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {};
const urls = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--file") {
    const file = args[++i];
    if (!file || !fs.existsSync(file)) {
      console.error(`❌ File not found: ${file}`);
      process.exit(1);
    }
    const lines = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")); // skip empty lines and comments
    urls.push(...lines);
  } else if (args[i] === "--output") {
    flags.output = args[++i];
  } else if (args[i] === "--dry-run") {
    flags.dryRun = true;
  } else if (args[i].startsWith("http")) {
    urls.push(args[i]);
  }
}

const OUTPUT_DIR = flags.output || "./output";

async function run() {
  if (!process.env.GROQ_API_KEY && !process.env.GROK_API_KEY) {
    console.error("❌ GROQ_API_KEY is not set in .env (or legacy GROK_API_KEY)");
    process.exit(1);
  }

  if (urls.length === 0) {
    console.log(
      "Usage: node pipeline.js <url> [url2] ...\n" +
      "       node pipeline.js --file urls.txt\n" +
      "       node pipeline.js --output ./my-output --dry-run <url>"
    );
    process.exit(0);
  }

  // Connect to MongoDB
  await connectDB();

  const existingHooks = loadExistingHooks(OUTPUT_DIR);

  const allResults = [];
  let totalCards = 0;
  let totalDuplicates = 0;
  let totalErrors = 0;

  for (const url of urls) {
    const result = await runPipeline(url, {
      outputDir: OUTPUT_DIR,
      existingHooks,
      dryRun: flags.dryRun,
    });

    allResults.push(result);

    if (result.error) {
      totalErrors++;
    } else {
      totalCards += (result.cards || []).length;
      totalDuplicates += result.duplicateCount || 0;
      // Add new hooks to existing set for cross-URL dedup within this run
      if (result.cards) {
        existingHooks.push(...result.cards.map((c) => c.hook).filter(Boolean));
      }
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log("  Pipeline Summary");
  console.log("══════════════════════════════════════════");
  console.log(`  URLs processed:  ${urls.length}`);
  console.log(`  Total cards:     ${totalCards}`);
  console.log(`  Duplicates:      ${totalDuplicates}`);
  console.log(`  Errors:          ${totalErrors}`);
  if (flags.dryRun) {
    console.log("  Mode:            DRY RUN (no files written)");
  }
  console.log("══════════════════════════════════════════\n");

  if (totalErrors > 0) {
    console.error("Failed URLs:");
    allResults
      .filter((r) => r.error)
      .forEach((r) => console.error(`  - ${r.url}: ${r.error}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
