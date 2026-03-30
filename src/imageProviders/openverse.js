const axios = require("axios");

const OPENVERSE_API = "https://api.openverse.org/v1/images/";

const LICENSE_SLUG_MAP = {
  "CC0":     "cc0",
  "CC-BY":   "by",
  "CC-BY-SA":"by-sa",
};

const LICENSE_NORMALIZE = {
  cc0: "CC0", by: "CC-BY", "by-sa": "CC-BY-SA",
  "by-nc": "CC-BY-NC", "by-nd": "CC-BY-ND", "by-nc-sa": "CC-BY-NC-SA",
};

/**
 * Search Openverse for open-license images.
 * @param {string} query
 * @param {{ signal?, maxCandidates?, allowedLicenses? }} opts
 * @returns {Promise<NormalizedImage[]>}
 */
async function searchImages(query, opts = {}) {
  const { signal, maxCandidates = 20, allowedLicenses = ["CC0", "CC-BY", "CC-BY-SA"] } = opts;

  const licenseSlugs = allowedLicenses
    .map(l => LICENSE_SLUG_MAP[l])
    .filter(Boolean)
    .join(",");

  const response = await axios.get(OPENVERSE_API, {
    params: {
      q: query,
      page_size: Math.min(maxCandidates, 20),
      license: licenseSlugs || undefined,
      mature: false,
    },
    signal,
    timeout: 8000,
    headers: { "User-Agent": "Quicks/1.0 (image-enricher)" },
  });

  const results = response.data?.results || [];
  return results.map(img => ({
    url: img.url,
    pageUrl: img.foreign_landing_url || null,
    license: LICENSE_NORMALIZE[img.license] || img.license?.toUpperCase() || null,
    author: img.creator || null,
    width: img.width || 0,
    height: img.height || 0,
    title: img.title || "",
    tags: (img.tags || []).map(t => (typeof t === "string" ? t : t.name)).filter(Boolean),
    provider: "openverse",
    attributionRequired: img.license !== "cc0",
  }));
}

module.exports = { searchImages };
