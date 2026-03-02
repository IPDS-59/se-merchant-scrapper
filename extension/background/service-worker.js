/**
 * SE Merchant Scraper — Background Service Worker
 *
 * Handles scraping orchestration and data export via
 * message passing from the popup.
 */

importScripts('../lib/constants.js', '../lib/storage.js');

// ── Message Router ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action } = message;

  if (action === 'scrape') {
    handleScrape(message).then(sendResponse);
    return true; // keep channel open for async response
  }

  if (action === 'export') {
    handleExport(message).then(sendResponse);
    return true;
  }

  return false;
});

// ── Scrape Handler ──────────────────────────────────────────

/**
 * Dispatch a scrape request to the appropriate platform scraper.
 * @param {{ platform: string, regionCode: string, regionName: string }} params
 * @returns {Promise<{ merchants: Array<Object> }>}
 */
async function handleScrape({ platform, regionCode, regionName }) {
  console.log(`[SE] Scraping ${platform} for region ${regionCode} (${regionName})`);

  let merchants = [];

  try {
    switch (platform) {
      case 'tokopedia':
        merchants = await scrapeTokopedia(regionCode, regionName);
        break;
      case 'shopee':
        merchants = await scrapeShopee(regionCode, regionName);
        break;
      case 'grabfood':
        merchants = await scrapeGrabFood(regionCode, regionName);
        break;
      case 'gofood':
        merchants = await scrapeGoFood(regionCode, regionName);
        break;
      case 'lazada':
        merchants = await scrapeLazada(regionCode, regionName);
        break;
      case 'blibli':
        merchants = await scrapeBlibli(regionCode, regionName);
        break;
      case 'zalora':
        merchants = await scrapeZalora(regionCode, regionName);
        break;
      default:
        console.warn(`[SE] Unknown platform: ${platform}`);
    }

    // Persist scraped merchants
    if (merchants.length > 0) {
      await StorageHelper.appendMerchants(platform, regionCode, merchants);
    }
  } catch (err) {
    console.error(`[SE] Scrape failed for ${platform}:`, err);
  }

  return { merchants };
}

// ── Export Handler ───────────────────────────────────────────

/**
 * Convert merchants to the requested format and trigger download.
 * @param {{ format: 'csv'|'json'|'excel', merchants: Array<Object> }} params
 * @returns {Promise<{ success: boolean }>}
 */
async function handleExport({ format, merchants }) {
  if (!merchants || !merchants.length) {
    return { success: false, error: 'No data to export' };
  }

  try {
    let blob;
    let filename;
    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const csvContent = convertToCSV(merchants);
      blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      filename = `se-merchants-${timestamp}.csv`;
    } else if (format === 'json') {
      const jsonContent = JSON.stringify(merchants, null, 2);
      blob = new Blob([jsonContent], { type: 'application/json' });
      filename = `se-merchants-${timestamp}.json`;
    } else if (format === 'excel') {
      // For Excel, export as CSV (Excel can open CSV).
      // A full .xlsx export would require a library like SheetJS.
      const csvContent = convertToCSV(merchants);
      blob = new Blob(['\ufeff' + csvContent], {
        type: 'text/csv;charset=utf-8;',
      });
      filename = `se-merchants-${timestamp}.csv`;
    } else {
      return { success: false, error: `Unknown format: ${format}` };
    }

    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url,
      filename,
      saveAs: true,
    });

    URL.revokeObjectURL(url);

    return { success: true };
  } catch (err) {
    console.error(`[SE] Export failed (${format}):`, err);
    return { success: false, error: err.message };
  }
}

// ── CSV Converter ───────────────────────────────────────────

/**
 * Convert an array of merchant objects to CSV string with proper quoting.
 * @param {Array<Object>} merchants
 * @returns {string}
 */
function convertToCSV(merchants) {
  if (!merchants.length) return '';

  const headers = MERCHANT_FIELDS;

  const escapeField = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const lines = [headers.join(',')];

  for (const merchant of merchants) {
    const row = headers.map((field) => escapeField(merchant[field]));
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

// ── Tokopedia Scraper ───────────────────────────────────────

/**
 * Tokopedia city-code mapping for the `fcity` search filter.
 * Tokopedia uses its own internal city IDs, not BPS codes. This map
 * covers major Indonesian cities/regions. When an exact match is not
 * found the scraper falls back to a text-based search without the
 * fcity filter.
 */
const TOKOPEDIA_CITY_MAP = {
  'Jakarta': '174,175,176,177,178,179',
  'DKI Jakarta': '174,175,176,177,178,179',
  'Bandung': '170',
  'Surabaya': '267',
  'Semarang': '224',
  'Yogyakarta': '327',
  'Medan': '246',
  'Makassar': '262',
  'Palembang': '251',
  'Denpasar': '204',
  'Bali': '204',
  'Malang': '231',
  'Bekasi': '171',
  'Tangerang': '166',
  'Depok': '172',
  'Bogor': '169',
};

/**
 * Build a Tokopedia search URL filtered by region.
 * @param {string} regionName — human-readable region name
 * @returns {string}
 */
function buildTokopediaSearchUrl(regionName) {
  const base = 'https://www.tokopedia.com/search';
  const params = new URLSearchParams({
    q: '',
    ob: '5',       // sort by newest
    navsource: 'home',
  });

  // Try to find a matching fcity code
  for (const [key, cityIds] of Object.entries(TOKOPEDIA_CITY_MAP)) {
    if (regionName.toLowerCase().includes(key.toLowerCase())) {
      params.set('fcity', cityIds);
      break;
    }
  }

  return `${base}?${params.toString()}`;
}

/**
 * Scrape Tokopedia merchants for a given region.
 *
 * Flow:
 *   1. Open a new tab to the Tokopedia search page filtered by region
 *   2. Wait for the content script to be ready
 *   3. Send a `startScrape` message to the content script
 *   4. Await the response containing merchant data
 *   5. Close the tab
 *   6. Return the merchants array
 *
 * @param {string} regionCode
 * @param {string} regionName
 * @returns {Promise<Array<Object>>}
 */
async function scrapeTokopedia(regionCode, regionName) {
  const SCRAPE_TIMEOUT_MS = 120000; // 2 minutes max per scrape

  const searchUrl = buildTokopediaSearchUrl(regionName);
  console.log(`[SE] Opening Tokopedia search: ${searchUrl}`);

  let tab;

  try {
    // 1. Open a new tab
    tab = await chrome.tabs.create({ url: searchUrl, active: false });

    // 2. Wait for the tab to finish loading
    await waitForTabLoad(tab.id);

    // 3. Small delay to let the SPA finish rendering
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 4. Send the startScrape message and await response
    const response = await sendMessageWithTimeout(
      tab.id,
      {
        action: 'startScrape',
        platform: 'tokopedia',
        regionCode,
        regionName,
      },
      SCRAPE_TIMEOUT_MS
    );

    if (response && response.success && Array.isArray(response.merchants)) {
      console.log(
        `[SE] Tokopedia scrape complete: ${response.merchants.length} merchants`
      );
      return response.merchants;
    }

    console.warn('[SE] Tokopedia scrape returned no data:', response);
    return [];
  } catch (err) {
    console.error('[SE] Tokopedia scrape failed:', err);
    return [];
  } finally {
    // 5. Close the tab regardless of outcome
    if (tab && tab.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // Tab may already be closed
      }
    }
  }
}

/**
 * Wait for a tab to reach the "complete" loading status.
 * @param {number} tabId
 * @param {number} [timeoutMs=30000]
 * @returns {Promise<void>}
 */
function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timed out'));
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);

    // Check immediately in case it is already loaded
    chrome.tabs.get(tabId).then((tabInfo) => {
      if (tabInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(() => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab not found'));
    });
  });
}

/**
 * Send a message to a specific tab with a timeout.
 * Retries a few times in case the content script is not yet ready.
 * @param {number} tabId
 * @param {Object} message
 * @param {number} timeoutMs
 * @returns {Promise<Object>}
 */
function sendMessageWithTimeout(tabId, message, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Message response timed out'));
    }, timeoutMs);

    let attempts = 0;
    const maxAttempts = 3;
    const retryDelay = 2000;

    function trySend() {
      attempts++;
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn(
            `[SE] sendMessage attempt ${attempts} failed:`,
            chrome.runtime.lastError.message
          );

          if (attempts < maxAttempts) {
            setTimeout(trySend, retryDelay);
            return;
          }

          clearTimeout(timer);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        clearTimeout(timer);
        resolve(response);
      });
    }

    trySend();
  });
}

// ── Platform Scraper Stubs ──────────────────────────────────
// Remaining scrapers return empty arrays for now.
// Actual implementations will be added in subsequent tasks.

// ── Shopee Scraper ──────────────────────────────────────────

/**
 * Shopee location mapping. Maps BPS province names to Shopee's
 * `locations` search filter values. Shopee uses title-case
 * province/region names in the search URL parameter.
 */
const SHOPEE_LOCATION_MAP = {
  'ACEH': 'Aceh',
  'SUMATERA UTARA': 'Sumatera Utara',
  'SUMATERA BARAT': 'Sumatera Barat',
  'RIAU': 'Riau',
  'JAMBI': 'Jambi',
  'SUMATERA SELATAN': 'Sumatera Selatan',
  'BENGKULU': 'Bengkulu',
  'LAMPUNG': 'Lampung',
  'KEPULAUAN BANGKA BELITUNG': 'Kepulauan Bangka Belitung',
  'KEPULAUAN RIAU': 'Kepulauan Riau',
  'DKI JAKARTA': 'DKI Jakarta',
  'JAWA BARAT': 'Jawa Barat',
  'JAWA TENGAH': 'Jawa Tengah',
  'DI YOGYAKARTA': 'DI Yogyakarta',
  'JAWA TIMUR': 'Jawa Timur',
  'BANTEN': 'Banten',
  'BALI': 'Bali',
  'NUSA TENGGARA BARAT': 'Nusa Tenggara Barat',
  'NUSA TENGGARA TIMUR': 'Nusa Tenggara Timur',
  'KALIMANTAN BARAT': 'Kalimantan Barat',
  'KALIMANTAN TENGAH': 'Kalimantan Tengah',
  'KALIMANTAN SELATAN': 'Kalimantan Selatan',
  'KALIMANTAN TIMUR': 'Kalimantan Timur',
  'KALIMANTAN UTARA': 'Kalimantan Utara',
  'SULAWESI UTARA': 'Sulawesi Utara',
  'SULAWESI TENGAH': 'Sulawesi Tengah',
  'SULAWESI SELATAN': 'Sulawesi Selatan',
  'SULAWESI TENGGARA': 'Sulawesi Tenggara',
  'GORONTALO': 'Gorontalo',
  'SULAWESI BARAT': 'Sulawesi Barat',
  'MALUKU': 'Maluku',
  'MALUKU UTARA': 'Maluku Utara',
  'PAPUA': 'Papua',
  'PAPUA BARAT': 'Papua Barat',
  'PAPUA BARAT DAYA': 'Papua Barat Daya',
  'PAPUA TENGAH': 'Papua Tengah',
  'PAPUA PEGUNUNGAN': 'Papua Pegunungan',
  'PAPUA SELATAN': 'Papua Selatan',
};

/**
 * Build a Shopee search URL filtered by region/location.
 * @param {string} regionName — human-readable region name (typically uppercase BPS name)
 * @returns {string}
 */
function buildShopeeSearchUrl(regionName) {
  const base = 'https://shopee.co.id/search';
  const params = new URLSearchParams({
    keyword: '',
  });

  // Try exact match first (BPS names are uppercase)
  const upperName = regionName.toUpperCase().trim();
  if (SHOPEE_LOCATION_MAP[upperName]) {
    params.set('locations', SHOPEE_LOCATION_MAP[upperName]);
  } else {
    // Fuzzy match: find the first location key that contains the region name
    for (const [key, locationName] of Object.entries(SHOPEE_LOCATION_MAP)) {
      if (
        key.includes(upperName) ||
        upperName.includes(key) ||
        locationName.toLowerCase().includes(regionName.toLowerCase())
      ) {
        params.set('locations', locationName);
        break;
      }
    }
  }

  return `${base}?${params.toString()}`;
}

/**
 * Scrape Shopee merchants for a given region.
 *
 * Flow:
 *   1. Map regionName to Shopee location name
 *   2. Open a new tab to the Shopee search page filtered by location
 *   3. Wait for the content script to be ready
 *   4. Send a `startScrape` message to the content script
 *   5. Await the response containing merchant data
 *   6. Close the tab
 *   7. Return the merchants array
 *
 * @param {string} regionCode
 * @param {string} regionName
 * @returns {Promise<Array<Object>>}
 */
async function scrapeShopee(regionCode, regionName) {
  const SCRAPE_TIMEOUT_MS = 180000; // 3 minutes — Shopee loads slowly

  const searchUrl = buildShopeeSearchUrl(regionName);
  console.log(`[SE] Opening Shopee search: ${searchUrl}`);

  let tab;

  try {
    // 1. Open a new tab
    tab = await chrome.tabs.create({ url: searchUrl, active: false });

    // 2. Wait for the tab to finish loading
    await waitForTabLoad(tab.id);

    // 3. Extra delay — Shopee SPA needs time to hydrate and render
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 4. Send the startScrape message and await response
    const response = await sendMessageWithTimeout(
      tab.id,
      {
        action: 'startScrape',
        platform: 'shopee',
        regionCode,
        regionName,
      },
      SCRAPE_TIMEOUT_MS
    );

    if (response && response.success && Array.isArray(response.merchants)) {
      console.log(
        `[SE] Shopee scrape complete: ${response.merchants.length} merchants`
      );
      return response.merchants;
    }

    console.warn('[SE] Shopee scrape returned no data:', response);
    return [];
  } catch (err) {
    console.error('[SE] Shopee scrape failed:', err);
    return [];
  } finally {
    // 5. Close the tab regardless of outcome
    if (tab && tab.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // Tab may already be closed
      }
    }
  }
}

// ── GrabFood Scraper ────────────────────────────────────────

/**
 * GrabFood city/region mapping. Maps common BPS region names
 * to GrabFood city slugs used in the URL path.
 * GrabFood Indonesia URL pattern: https://food.grab.com/id/en/restaurants
 * The city is typically inferred from geolocation, but we can append
 * a search query or use known city-level URL segments.
 */
const GRABFOOD_CITY_MAP = {
  'Jakarta': 'jakarta',
  'DKI Jakarta': 'jakarta',
  'Bandung': 'bandung',
  'Surabaya': 'surabaya',
  'Semarang': 'semarang',
  'Yogyakarta': 'yogyakarta',
  'Medan': 'medan',
  'Makassar': 'makassar',
  'Palembang': 'palembang',
  'Denpasar': 'denpasar',
  'Bali': 'denpasar',
  'Malang': 'malang',
  'Bekasi': 'bekasi',
  'Tangerang': 'tangerang',
  'Depok': 'depok',
  'Bogor': 'bogor',
  'Balikpapan': 'balikpapan',
  'Manado': 'manado',
  'Pontianak': 'pontianak',
  'Banjarmasin': 'banjarmasin',
  'Padang': 'padang',
  'Pekanbaru': 'pekanbaru',
  'Lampung': 'bandar-lampung',
  'Bandar Lampung': 'bandar-lampung',
  'Solo': 'solo',
  'Surakarta': 'solo',
  'Batam': 'batam',
};

/**
 * Build a GrabFood restaurants URL for a given region.
 * @param {string} regionName — human-readable region name
 * @returns {string}
 */
function buildGrabFoodUrl(regionName) {
  const base = 'https://food.grab.com/id/en/restaurants';

  // Try to find a matching city slug for the region
  for (const [key, citySlug] of Object.entries(GRABFOOD_CITY_MAP)) {
    if (regionName.toLowerCase().includes(key.toLowerCase())) {
      // GrabFood doesn't use city in the URL path for /restaurants,
      // but we can pass it as a query hint for the content script
      return `${base}?city=${encodeURIComponent(citySlug)}`;
    }
  }

  // Fallback: use the base restaurants page
  return base;
}

/**
 * Scrape GrabFood merchants/restaurants for a given region.
 *
 * Flow:
 *   1. Map regionName to a GrabFood city URL
 *   2. Open a new tab to the GrabFood restaurants page
 *   3. Wait for the tab to finish loading
 *   4. Send a `startScrape` message to the content script
 *   5. Collect results from the content script response
 *   6. Close the tab
 *   7. Return the merchants array
 *
 * @param {string} regionCode
 * @param {string} regionName
 * @returns {Promise<Array<Object>>}
 */
async function scrapeGrabFood(regionCode, regionName) {
  const SCRAPE_TIMEOUT_MS = 180000; // 3 minutes — GrabFood loads more data via clicks

  const searchUrl = buildGrabFoodUrl(regionName);
  console.log(`[SE] Opening GrabFood restaurants: ${searchUrl}`);

  let tab;

  try {
    // 1. Open a new tab
    tab = await chrome.tabs.create({ url: searchUrl, active: false });

    // 2. Wait for the tab to finish loading
    await waitForTabLoad(tab.id);

    // 3. Extra delay for NextJS hydration and SSR rendering
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 4. Send the startScrape message and await response
    const response = await sendMessageWithTimeout(
      tab.id,
      {
        action: 'startScrape',
        platform: 'grabfood',
        regionCode,
        regionName,
      },
      SCRAPE_TIMEOUT_MS
    );

    if (response && response.success && Array.isArray(response.merchants)) {
      console.log(
        `[SE] GrabFood scrape complete: ${response.merchants.length} merchants`
      );
      return response.merchants;
    }

    console.warn('[SE] GrabFood scrape returned no data:', response);
    return [];
  } catch (err) {
    console.error('[SE] GrabFood scrape failed:', err);
    return [];
  } finally {
    // 5. Close the tab regardless of outcome
    if (tab && tab.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // Tab may already be closed
      }
    }
  }
}

// ── GoFood Scraper ──────────────────────────────────────────

/**
 * GoFood city mapping. Maps BPS province/region names to GoFood
 * city slugs used in URL paths.
 * GoFood URL pattern: https://gofood.co.id/{city-slug}/restaurants
 *
 * Note: GoFood organises listings by city, not province. For provinces
 * that span multiple cities, we map to the capital / largest city.
 */
const GOFOOD_CITY_MAP = {
  'DKI JAKARTA': 'jakarta',
  'Jakarta': 'jakarta',
  'JAWA BARAT': 'bandung',
  'Bandung': 'bandung',
  'JAWA TIMUR': 'surabaya',
  'Surabaya': 'surabaya',
  'JAWA TENGAH': 'semarang',
  'Semarang': 'semarang',
  'DI YOGYAKARTA': 'yogyakarta',
  'Yogyakarta': 'yogyakarta',
  'SUMATERA UTARA': 'medan',
  'Medan': 'medan',
  'SULAWESI SELATAN': 'makassar',
  'Makassar': 'makassar',
  'SUMATERA SELATAN': 'palembang',
  'Palembang': 'palembang',
  'BALI': 'bali',
  'Denpasar': 'bali',
  'Malang': 'malang',
  'Bekasi': 'bekasi',
  'BANTEN': 'tangerang',
  'Tangerang': 'tangerang',
  'Depok': 'depok',
  'Bogor': 'bogor',
  'KALIMANTAN TIMUR': 'balikpapan',
  'Balikpapan': 'balikpapan',
  'SULAWESI UTARA': 'manado',
  'Manado': 'manado',
  'KALIMANTAN BARAT': 'pontianak',
  'Pontianak': 'pontianak',
  'KALIMANTAN SELATAN': 'banjarmasin',
  'Banjarmasin': 'banjarmasin',
  'SUMATERA BARAT': 'padang',
  'Padang': 'padang',
  'RIAU': 'pekanbaru',
  'Pekanbaru': 'pekanbaru',
  'LAMPUNG': 'bandar-lampung',
  'Bandar Lampung': 'bandar-lampung',
  'Solo': 'solo',
  'Surakarta': 'solo',
  'KEPULAUAN RIAU': 'batam',
  'Batam': 'batam',
  'ACEH': 'banda-aceh',
  'Banda Aceh': 'banda-aceh',
  'NUSA TENGGARA BARAT': 'mataram',
  'Mataram': 'mataram',
  'KALIMANTAN TENGAH': 'palangkaraya',
  'Palangkaraya': 'palangkaraya',
};

/**
 * Build a GoFood restaurants URL for a given region.
 * @param {string} regionName — human-readable region name
 * @returns {{ url: string, citySlug: string }}
 */
function buildGoFoodUrl(regionName) {
  const baseUrl = 'https://gofood.co.id';

  // Try exact match first (BPS names are uppercase)
  const upperName = regionName.toUpperCase().trim();
  if (GOFOOD_CITY_MAP[upperName]) {
    const slug = GOFOOD_CITY_MAP[upperName];
    return {
      url: `${baseUrl}/${slug}/restaurants`,
      citySlug: slug,
    };
  }

  // Fuzzy match: find the first key that contains the region name
  for (const [key, citySlug] of Object.entries(GOFOOD_CITY_MAP)) {
    if (
      regionName.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(regionName.toLowerCase())
    ) {
      return {
        url: `${baseUrl}/${citySlug}/restaurants`,
        citySlug,
      };
    }
  }

  // Fallback: try using the region name directly as a slug
  const fallbackSlug = regionName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  return {
    url: `${baseUrl}/${fallbackSlug}/restaurants`,
    citySlug: fallbackSlug,
  };
}

/**
 * Scrape GoFood restaurants for a given region.
 *
 * Flow:
 *   1. Map regionName to a GoFood city URL slug
 *   2. Open a new tab to the GoFood restaurants page for that city
 *   3. Wait for the tab to finish loading
 *   4. Send a `startScrape` message to the content script
 *   5. Collect results from the content script response
 *   6. Close the tab
 *   7. Return the merchants array
 *
 * @param {string} regionCode
 * @param {string} regionName
 * @returns {Promise<Array<Object>>}
 */
async function scrapeGoFood(regionCode, regionName) {
  const SCRAPE_TIMEOUT_MS = 180000; // 3 minutes

  const { url: searchUrl, citySlug } = buildGoFoodUrl(regionName);
  console.log(`[SE] Opening GoFood restaurants: ${searchUrl} (city: ${citySlug})`);

  let tab;

  try {
    // 1. Open a new tab
    tab = await chrome.tabs.create({ url: searchUrl, active: false });

    // 2. Wait for the tab to finish loading
    await waitForTabLoad(tab.id);

    // 3. Extra delay for SPA hydration and initial render
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 4. Send the startScrape message and await response
    const response = await sendMessageWithTimeout(
      tab.id,
      {
        action: 'startScrape',
        platform: 'gofood',
        regionCode,
        regionName,
      },
      SCRAPE_TIMEOUT_MS
    );

    if (response && response.success && Array.isArray(response.merchants)) {
      console.log(
        `[SE] GoFood scrape complete: ${response.merchants.length} merchants`
      );
      return response.merchants;
    }

    console.warn('[SE] GoFood scrape returned no data:', response);
    return [];
  } catch (err) {
    console.error('[SE] GoFood scrape failed:', err);
    return [];
  } finally {
    // 5. Close the tab regardless of outcome
    if (tab && tab.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // Tab may already be closed
      }
    }
  }
}

async function scrapeLazada(_regionCode, _regionName) {
  // TODO: Implement Lazada scraper
  return [];
}

// ── Blibli Scraper ──────────────────────────────────────────

/**
 * Build a Blibli search URL for a given region.
 * Blibli's search page is at /cari/{keyword} with query parameters.
 * The `intent=true` parameter triggers a broader search.
 * @param {string} _regionName — human-readable region name (not used for URL filtering)
 * @returns {string}
 */
function buildBlibliSearchUrl(_regionName) {
  // Blibli search does not natively support region-based filtering in the URL.
  // We use a generic search to discover merchants, then the content script
  // extracts location data from each product card.
  return 'https://www.blibli.com/cari/?keyword=&intent=true';
}

/**
 * Scrape Blibli merchants for a given region.
 *
 * Flow:
 *   1. Open a new tab to the Blibli search page
 *   2. Wait for the tab to finish loading
 *   3. Send a `startScrape` message to the content script
 *   4. Await the response containing merchant data
 *   5. Close the tab
 *   6. Return the merchants array
 *
 * @param {string} regionCode
 * @param {string} regionName
 * @returns {Promise<Array<Object>>}
 */
async function scrapeBlibli(regionCode, regionName) {
  const SCRAPE_TIMEOUT_MS = 120000; // 2 minutes max per scrape

  const searchUrl = buildBlibliSearchUrl(regionName);
  console.log(`[SE] Opening Blibli search: ${searchUrl}`);

  let tab;

  try {
    // 1. Open a new tab
    tab = await chrome.tabs.create({ url: searchUrl, active: false });

    // 2. Wait for the tab to finish loading
    await waitForTabLoad(tab.id);

    // 3. Small delay to let the SPA finish rendering
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 4. Send the startScrape message and await response
    const response = await sendMessageWithTimeout(
      tab.id,
      {
        action: 'startScrape',
        platform: 'blibli',
        regionCode,
        regionName,
      },
      SCRAPE_TIMEOUT_MS
    );

    if (response && response.success && Array.isArray(response.merchants)) {
      console.log(
        `[SE] Blibli scrape complete: ${response.merchants.length} merchants`
      );
      return response.merchants;
    }

    console.warn('[SE] Blibli scrape returned no data:', response);
    return [];
  } catch (err) {
    console.error('[SE] Blibli scrape failed:', err);
    return [];
  } finally {
    // 5. Close the tab regardless of outcome
    if (tab && tab.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // Tab may already be closed
      }
    }
  }
}

/**
 * Scrape Zalora brands from the brands directory page.
 *
 * Zalora is fashion-focused — "merchants" are "brands". The brands
 * directory at /brands/ contains an alphabetical A-Z listing with
 * simple HTML structure, making it the easiest platform to scrape.
 *
 * Flow:
 *   1. Open a new tab to the Zalora brands directory page
 *   2. Wait for the tab to finish loading
 *   3. Send a `startScrape` message to the content script
 *   4. Collect results from the content script response
 *   5. Close the tab
 *   6. Return the merchants array
 *
 * Note: Zalora brands are not region-specific (national directory),
 * but we still tag results with the requested region for consistency.
 *
 * @param {string} regionCode
 * @param {string} regionName
 * @returns {Promise<Array<Object>>}
 */
async function scrapeZalora(regionCode, regionName) {
  const SCRAPE_TIMEOUT_MS = 120000; // 2 minutes
  const BRANDS_URL = 'https://www.zalora.co.id/brands/';

  console.log(`[SE] Opening Zalora brands directory: ${BRANDS_URL}`);

  let tab;

  try {
    // 1. Open a new tab to the brands directory
    tab = await chrome.tabs.create({ url: BRANDS_URL, active: false });

    // 2. Wait for the tab to finish loading
    await waitForTabLoad(tab.id);

    // 3. Small delay for page rendering
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 4. Send the startScrape message and await response
    const response = await sendMessageWithTimeout(
      tab.id,
      {
        action: 'startScrape',
        platform: 'zalora',
        regionCode,
        regionName,
      },
      SCRAPE_TIMEOUT_MS
    );

    if (response && response.success && Array.isArray(response.merchants)) {
      console.log(
        `[SE] Zalora scrape complete: ${response.merchants.length} brands`
      );
      return response.merchants;
    }

    console.warn('[SE] Zalora scrape returned no data:', response);
    return [];
  } catch (err) {
    console.error('[SE] Zalora scrape failed:', err);
    return [];
  } finally {
    // 5. Close the tab regardless of outcome
    if (tab && tab.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // Tab may already be closed
      }
    }
  }
}
