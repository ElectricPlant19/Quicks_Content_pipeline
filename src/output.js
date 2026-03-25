const fs = require("fs");
const path = require("path");
const Fact = require("./models/Fact");

/**
 * Writes output to JSON files and persists to MongoDB.
 */
async function writeOutputs(cards, runMeta, outputDir = "./output") {
  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // 1. Full JSON with all metadata
  const fullPath = path.join(outputDir, `run_${timestamp}.json`);
  const fullOutput = {
    meta: {
      ...runMeta,
      exportedAt: new Date().toISOString(),
      total: cards.length,
      approved: cards.filter((c) => c.status === "approved").length,
      pending: cards.filter((c) => c.status === "pending_review").length,
      rejected: cards.filter((c) => c.status === "rejected").length,
    },
    cards,
  };
  fs.writeFileSync(fullPath, JSON.stringify(fullOutput, null, 2));

  // 2. MongoDB Persistence
  // Only save approved or pending review cards
  const toSave = cards.filter((c) => c.status !== "rejected");
  
  if (toSave.length > 0) {
    try {
      console.log(`  💾 Persisting ${toSave.length} cards to MongoDB...`);
      // Use bulkWrite for efficiency or just many saves (Fact.insertMany is better)
      const operations = toSave.map(card => ({
        updateOne: {
          filter: { hook: card.hook }, // Avoid duplicates by hook
          update: { $set: card },
          upsert: true
        }
      }));
      
      await Fact.bulkWrite(operations);
      console.log(`  ✓ MongoDB updated successfully.`);
    } catch (err) {
      console.warn(`  ⚠ MongoDB persistence failed: ${err.message}`);
    }
  }

  // 3. Mongo-insert-ready JSON (stayer as a backup/export)
  const mongoPath = path.join(outputDir, `mongo_insert_${timestamp}.json`);
  const mongoReady = toSave.map(({ duplicate, ...card }) => card);
  fs.writeFileSync(mongoPath, JSON.stringify(mongoReady, null, 2));

  return { fullPath, mongoPath, count: mongoReady.length };

}

/**
 * Loads existing hooks from a previous run for dedup comparison.
 */
function loadExistingHooks(outputDir = "./output") {
  const hooks = [];
  if (!fs.existsSync(outputDir)) return hooks;

  const files = fs.readdirSync(outputDir).filter((f) => f.startsWith("run_"));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(outputDir, file), "utf8"));
      if (data.cards) {
        hooks.push(...data.cards.map((c) => c.hook).filter(Boolean));
      }
    } catch (_) {}
  }
  return hooks;
}

module.exports = { writeOutputs, loadExistingHooks };