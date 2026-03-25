require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { runPipeline } = require("./src/pipelineCore");
const { loadExistingHooks } = require("./src/output");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Connect to Database
const connectDB = require("./src/db");
connectDB();

// API Endpoint to process a URL
app.post("/api/process", async (req, res) => {
  const { url } = req.body;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "Invalid URL provided." });
  }

  try {
    console.log(`\n🚀 Web Request: Processing ${url}`);
    
    // Load existing hooks for deduplication
    const existingHooks = loadExistingHooks(path.join(__dirname, "output"));
    
    // Run the pipeline
    const results = await runPipeline(url, { 
      outputDir: path.join(__dirname, "output"),
      existingHooks 
    });

    res.json(results);
  } catch (err) {
    console.error(`❌ Pipeline Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✨ Quicks Server running at http://localhost:${PORT}`);
});
