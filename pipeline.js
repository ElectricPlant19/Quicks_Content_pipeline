#!/usr/bin/env node

/**
 * Quicks Content Pipeline
 * ========================
 * Usage:
 *   node pipeline.js <url> [url2] [url3] ...
 *   node pipeline.js --file urls.txt
 *
 * Options:
 *   --output <dir>    Output directory (default: ./output)
 *   --skip-rejected   Exclude rejected cards from output JSON
 *   --dry-run         Run pipeline but don't write files
 */

require("dotenv").config();
const { runPipeline } = require("./src/pipelineCore");
const { loadExistingHooks } = require("./src/output");
const connectDB = require("./src/db");
const fs = require("fs");

// ... (rest of the file)

// ─── Argument Parsing ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {};
const urls = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--file") {
    const file = args[++i];
    const lines = fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
    urls.push(...lines);
  } else if (args[i] === "--output") {
    flags.output = args[++i];
  } else if (args[i] === "--skip-rejected") {
    flags.skipRejected = true;
  } else if (args[i] === "--dry-run") {
    flags.dryRun = true;
  } else if (args[i].startsWith("http")) {
    urls.push(args[i]);
  }
}

const OUTPUT_DIR = flags.output || "./output";

async function run() {
  if (!process.env.GROK_API_KEY) {
    console.error("❌ GROK_API_KEY is not set in .env");
    process.exit(1);
  }

  // Connect to MongoDB
  await connectDB();

  if (urls.length === 0) {
    console.log("Usage: node pipeline.js <url>");
    process.exit(0);
  }

  const existingHooks = loadExistingHooks(OUTPUT_DIR);
  
  for (const url of urls) {
    try {
      await runPipeline(url, { outputDir: OUTPUT_DIR, existingHooks, dryRun: flags.dryRun });
    } catch (err) {
      console.error(`❌ Failed: ${err.message}`);
    }
  }
}

run();