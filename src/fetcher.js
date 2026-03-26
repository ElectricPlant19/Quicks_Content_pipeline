const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Fetches a URL and extracts clean readable text from it.
 * Strips nav, footer, ads, scripts, and boilerplate.
 * Also extracts relevant images from the article.
 */
async function fetchAndClean(url) {
  const res = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; QuicksPipeline/1.0; +https://quicks.app)",
    },
    timeout: 15000,
  });

  const $ = cheerio.load(res.data);

  // Remove noise elements
  $(
    "script, style, nav, footer, header, aside, .ad, .ads, .advertisement, .cookie, .popup, .modal, iframe, form"
  ).remove();

  // Try to find the main content block
  const candidates = [
    "article",
    "main",
    '[role="main"]',
    ".post-content",
    ".entry-content",
    ".article-body",
    ".content",
    "#content",
    "body",
  ];

  let text = "";
  for (const selector of candidates) {
    const el = $(selector).first();
    if (el.length && el.text().trim().length > 300) {
      text = el.text();
      break;
    }
  }

  // Normalize whitespace
  text = text
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();

  const title = $("title").first().text().trim() || url;

  // Extract images from the article
  const images = [];
  const seenUrls = new Set();

  // Find images in main content area
  for (const selector of candidates) {
    const el = $(selector).first();
    if (el.length) {
      el.find("img").each((_, img) => {
        const src = $(img).attr("src");
        const alt = $(img).attr("alt") || "";
        const dataSrc = $(img).attr("data-src");

        // Prefer data-src (lazy loading) or src
        const imgUrl = dataSrc || src;

        if (!imgUrl || seenUrls.has(imgUrl)) return;

        // Skip tiny images, icons, and data URIs
        if (imgUrl.startsWith("data:")) return;
        if (imgUrl.includes("icon") || imgUrl.includes("logo")) return;
        if (imgUrl.length < 10) return;

        // Convert relative URLs to absolute
        let absoluteUrl;
        try {
          absoluteUrl = new URL(imgUrl, url).href;
        } catch {
          return;
        }

        seenUrls.add(absoluteUrl);
        images.push({
          url: absoluteUrl,
          alt: alt.trim(),
          width: parseInt($(img).attr("width") || "0", 10),
          height: parseInt($(img).attr("height") || "0", 10),
        });
      });
      if (images.length > 0) break;
    }
  }

  if (text.length < 200) {
    throw new Error(
      `Could not extract meaningful content from URL: ${url} (got ${text.length} chars)`
    );
  }

  // Truncate to ~12000 chars (Llama 3.3 70B supports 128k context, so there's room)
  const CONTENT_LIMIT = 12000;
  let truncated = text;
  if (text.length > CONTENT_LIMIT) {
    // Try to truncate at a sentence or paragraph boundary
    let cutoff = text.lastIndexOf(".", CONTENT_LIMIT);
    if (cutoff < CONTENT_LIMIT * 0.8) {
      // If no good sentence boundary found, try paragraph
      cutoff = text.lastIndexOf("\n", CONTENT_LIMIT);
    }
    if (cutoff < CONTENT_LIMIT * 0.8) {
      // Fall back to space boundary to avoid mid-word cuts
      cutoff = text.lastIndexOf(" ", CONTENT_LIMIT);
    }
    if (cutoff < CONTENT_LIMIT * 0.8) {
      cutoff = CONTENT_LIMIT;
    }
    truncated = text.slice(0, cutoff + 1) +
      `\n\n[Content truncated at ${cutoff + 1} characters. Original length: ${text.length}]`;
  }

  return { url, title, text: truncated, charCount: text.length, images };
}

module.exports = { fetchAndClean };
