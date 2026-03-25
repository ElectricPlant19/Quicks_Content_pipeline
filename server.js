require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const dns = require("dns");
const { promisify } = require("util");
const { runPipeline } = require("./src/pipelineCore");
const { loadExistingHooks } = require("./src/output");

const dnsLookup = promisify(dns.lookup);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Connect to Database
const connectDB = require("./src/db");
connectDB();

/**
 * Validates a URL for safety: rejects malformed URLs, non-HTTP protocols,
 * and private/internal IP addresses (SSRF protection).
 */
async function validateUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Malformed URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https protocols are allowed.");
  }

  // Resolve hostname and check for private/internal IPs
  try {
    const { address } = await dnsLookup(parsed.hostname);
    if (isPrivateIP(address)) {
      throw new Error("URLs pointing to private/internal networks are not allowed.");
    }
  } catch (err) {
    if (err.message.includes("private/internal")) throw err;
    throw new Error(`Could not resolve hostname: ${parsed.hostname}`);
  }

  return parsed;
}

/**
 * Checks if an IP address belongs to a private/internal range.
 */
function isPrivateIP(ip) {
  // IPv6 loopback
  if (ip === "::1") return true;

  // IPv4 checks
  const parts = ip.split(".").map(Number);
  if (parts.length === 4) {
    // 127.x.x.x (loopback)
    if (parts[0] === 127) return true;
    // 10.x.x.x (private)
    if (parts[0] === 10) return true;
    // 172.16.x.x – 172.31.x.x (private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.x.x (private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 0.0.0.0
    if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0) return true;
    // 169.254.x.x (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
  }

  return false;
}

// Domain blocklist (configurable via env var, comma-separated)
const BLOCKED_DOMAINS = (process.env.BLOCKED_DOMAINS || "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

// API Endpoint to process a URL
app.post("/api/process", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required." });
  }

  try {
    // Input sanitization and SSRF protection
    const parsed = await validateUrl(url);

    // Check domain blocklist
    if (BLOCKED_DOMAINS.length > 0 && BLOCKED_DOMAINS.includes(parsed.hostname.toLowerCase())) {
      return res.status(403).json({ error: "This domain is blocked." });
    }

    console.log(`\n🚀 Web Request: Processing ${url}`);
    
    // Load existing hooks for deduplication
    const existingHooks = loadExistingHooks(path.join(__dirname, "output"));
    
    // Run the pipeline
    const results = await runPipeline(url, { 
      outputDir: path.join(__dirname, "output"),
      existingHooks 
    });

    if (results.error) {
      return res.status(500).json(results);
    }

    res.json(results);
  } catch (err) {
    console.error(`❌ Pipeline Error: ${err.message}`);
    res.status(err.message.includes("Malformed") || err.message.includes("protocol") || err.message.includes("private") || err.message.includes("blocked") ? 400 : 500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✨ Quicks Server running at http://localhost:${PORT}`);
});
