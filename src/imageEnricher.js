const openverse = require("./imageProviders/openverse");
const pexels = require("./imageProviders/pexels");

const BLOCKED_URL_PATTERNS = [
  "getty", "shutterstock", "istock", "123rf", "depositphotos", "watermark", "alamy",
];

// Common English stop words to skip when extracting hook nouns
const STOP_WORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","shall","can",
  "of","in","on","at","to","for","with","by","from","up","about","into","through",
  "and","but","or","nor","so","yet","both","either","not","no","than","that","this",
  "it","its","they","their","we","our","you","your","he","she","his","her","who",
  "what","which","how","when","where","why","if","as","after","before","since","while",
  "most","more","some","any","all","each","every","much","many","such","own","same",
]);

const CONFIG = {
  get enabled()       { return (process.env.IMAGE_ENRICH_ENABLED || "true") !== "false"; },
  get maxCandidates() { return parseInt(process.env.IMAGE_ENRICH_MAX_CANDIDATES || "20", 10); },
  get minShortEdge()  { return parseInt(process.env.IMAGE_MIN_SHORT_EDGE || "400", 10); },
  get minArea()       { return parseInt(process.env.IMAGE_MIN_AREA || "250000", 10); },
  get allowedLicenses() {
    return (process.env.IMAGE_ALLOWED_LICENSES || "CC0,CC-BY,CC-BY-SA")
      .split(",").map(l => l.trim());
  },
  get preferAspect()  { return (process.env.IMAGE_PREFER_ASPECT || "portrait").toLowerCase(); },
};

const PROVIDERS = [
  { module: openverse, priority: 1.0, name: "openverse" },
  { module: pexels,    priority: 0.8, name: "pexels" },
];

/**
 * Fill missing image_url fields on cards using open-license image APIs.
 * Non-fatal: cards with no suitable match keep image_url: null.
 *
 * @param {object[]} cards
 * @param {{ sourceUrl?, sourceTitle?, articleImages? }} context
 * @param {{ signal?, timeoutMs? }} options
 * @returns {Promise<{ cards: object[], stats: object }>}
 */
async function enrichCardsWithImages(cards, context = {}, options = {}) {
  const stats = {
    cards_missing_image_before: 0,
    cards_filled_by_enricher: 0,
    fill_rate: 0,
    provider_hit_distribution: {},
    license_reject_count: 0,
  };

  if (!CONFIG.enabled) {
    console.log("  ℹ Image enrichment disabled (IMAGE_ENRICH_ENABLED=false)");
    return { cards, stats };
  }

  const { signal } = options;
  const { sourceTitle } = context;

  const enriched = await Promise.all(
    cards.map(async (card) => {
      if (isValidUrl(card.image_url)) return card;
      stats.cards_missing_image_before++;

      try {
        const query = buildQuery(card, sourceTitle);
        const { candidates, providerCounts } = await fetchCandidates(query, { signal });
        const { kept, filterLog } = filterCandidates(candidates);

        stats.license_reject_count += filterLog.license;

        console.log(
          `  [enrich] "${String(card.hook || "").slice(0, 45)}"` +
          ` query="${query}"` +
          ` fetched=${Object.entries(providerCounts).map(([k,v]) => `${k}:${v}`).join(" ")}` +
          ` blocked=${filterLog.blocked} license=${filterLog.license} dim=${filterLog.dimension}` +
          ` final=${kept.length}`
        );

        const ranked = rankCandidates(kept, card);
        if (ranked.length === 0) return card;

        const winner = ranked[0];
        stats.cards_filled_by_enricher++;
        stats.provider_hit_distribution[winner.provider] =
          (stats.provider_hit_distribution[winner.provider] || 0) + 1;

        return {
          ...card,
          image_url: winner.url,
          image_source_provider: winner.provider,
          image_source_page: winner.pageUrl || null,
          image_license: winner.license || null,
          image_author: winner.author || null,
          image_attribution_required: winner.attributionRequired || false,
          image_confidence: parseFloat(winner._score.toFixed(3)),
        };
      } catch (err) {
        console.warn(`  ⚠ Image enrichment skipped for "${String(card.hook || "").slice(0, 50)}": ${err.message}`);
        return card;
      }
    })
  );

  if (stats.cards_missing_image_before > 0) {
    stats.fill_rate = parseFloat(
      (stats.cards_filled_by_enricher / stats.cards_missing_image_before).toFixed(2)
    );
  }

  const filled = stats.cards_filled_by_enricher;
  const missing = stats.cards_missing_image_before;
  console.log(
    `  ✓ Image enrichment: ${filled}/${missing} filled ` +
    `(${(stats.fill_rate * 100).toFixed(0)}% fill rate, ` +
    `${stats.license_reject_count} license rejects)`
  );

  return { cards: enriched, stats };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function isValidUrl(str) {
  if (!str || typeof str !== "string") return false;
  try {
    const { protocol } = new URL(str);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Build a search query from hook nouns + top tags + category.
 * Falls back to category + source title terms if the primary parts are empty.
 */
function buildQuery(card, sourceTitle) {
  const hookNouns = extractNouns(card.hook || "", 3);
  const tags = Array.isArray(card.tags) ? card.tags.slice(0, 2) : [];
  const category = card.category || "";

  const primary = [...new Set([...hookNouns, ...tags, category])].filter(Boolean);
  if (primary.length) return primary.join(" ");

  // Fallback: category + meaningful words from source title
  const titleTerms = extractNouns(sourceTitle || "", 2);
  return [...new Set([category, ...titleTerms])].filter(Boolean).join(" ");
}

/** Extract up to `limit` meaningful (non-stop-word, length ≥ 4) words from text. */
function extractNouns(text, limit) {
  return text
    .replace(/[^a-zA-Z\s]/g, " ")
    .split(/\s+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .slice(0, limit);
}

async function fetchCandidates(query, opts) {
  const results = await Promise.allSettled(
    PROVIDERS.map(({ module, priority, name }) =>
      module.searchImages(query, {
        ...opts,
        maxCandidates: CONFIG.maxCandidates,
        allowedLicenses: CONFIG.allowedLicenses,
      }).then(images => images.map(img => ({ ...img, _providerPriority: priority, provider: img.provider || name })))
    )
  );

  const providerCounts = {};
  const candidates = [];

  results.forEach((result, i) => {
    const name = PROVIDERS[i].name;
    if (result.status === "fulfilled") {
      providerCounts[name] = result.value.length;
      candidates.push(...result.value);
    } else {
      providerCounts[name] = 0;
      console.warn(`  ⚠ Provider "${name}" failed: ${result.reason?.message || result.reason}`);
    }
  });

  return { candidates, providerCounts };
}

function filterCandidates(candidates) {
  const filterLog = { blocked: 0, license: 0, dimension: 0 };
  const kept = [];

  for (const img of candidates) {
    const urlLower = (img.url || "").toLowerCase();
    const titleLower = (img.title || "").toLowerCase();

    if (BLOCKED_URL_PATTERNS.some(p => urlLower.includes(p) || titleLower.includes(p))) {
      filterLog.blocked++;
      continue;
    }

    if (img.provider !== "pexels" && !CONFIG.allowedLicenses.includes(img.license)) {
      filterLog.license++;
      continue;
    }

    // Use minShortEdge + minArea instead of separate width/height hard cuts.
    // Skip dimension check entirely when provider reports 0 (unknown).
    if (img.width > 0 && img.height > 0) {
      const shortEdge = Math.min(img.width, img.height);
      const area = img.width * img.height;
      if (shortEdge < CONFIG.minShortEdge || area < CONFIG.minArea) {
        filterLog.dimension++;
        continue;
      }
    }

    kept.push(img);
  }

  return { kept, filterLog };
}

function rankCandidates(candidates, card) {
  const queryTerms = buildQuery(card).toLowerCase().split(/\s+/).filter(Boolean);
  const cardTags = (card.tags || []).map(t => t.toLowerCase());
  const cardCategory = (card.category || "").toLowerCase();

  return candidates
    .map(img => {
      const textScore     = scoreTextRelevance(img, queryTerms);
      const tagScore      = scoreTagOverlap(img, cardTags, cardCategory);
      const aspectScore   = scoreAspectRatio(img);
      const resScore      = scoreResolution(img);
      const providerScore = img._providerPriority ?? 0.5;

      const _score =
        textScore     * 0.4 +
        tagScore      * 0.2 +
        aspectScore   * 0.2 +
        resScore      * 0.1 +
        providerScore * 0.1;

      return { ...img, _score };
    })
    .sort((a, b) => b._score - a._score);
}

function scoreTextRelevance(img, queryTerms) {
  if (!queryTerms.length) return 0;
  const haystack = `${img.title} ${(img.tags || []).join(" ")}`.toLowerCase();
  const hits = queryTerms.filter(t => haystack.includes(t)).length;
  return hits / queryTerms.length;
}

function scoreTagOverlap(img, cardTags, cardCategory) {
  const allTerms = [...cardTags, cardCategory].filter(Boolean);
  if (!allTerms.length) return 0;
  const haystack = `${img.title} ${(img.tags || []).join(" ")}`.toLowerCase();
  const hits = allTerms.filter(t => haystack.includes(t)).length;
  return hits / allTerms.length;
}

function scoreAspectRatio(img) {
  if (!img.width || !img.height) return 0.5; // unknown — neutral
  if (CONFIG.preferAspect === "any") return 0.5;
  const ratio = img.height / img.width;
  if (ratio >= 1.2) return 1.0; // portrait
  if (ratio >= 0.8) return 0.5; // square
  return 0.2;                   // landscape
}

function scoreResolution(img) {
  if (!img.width || !img.height) return 0.5;
  const area = img.width * img.height;
  const targetArea = 800 * 1200; // portrait HD target
  return Math.min(area / targetArea, 1.0);
}

module.exports = { enrichCardsWithImages };
