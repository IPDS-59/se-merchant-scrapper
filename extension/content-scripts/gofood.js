/**
 * SE Merchant Scraper — GoFood Content Script
 *
 * Injected on gofood.co.id restaurant listing pages. Listens for a
 * `startScrape` message from the service worker, extracts restaurant
 * data from the DOM, auto-scrolls to load more, deduplicates, and
 * sends results back via chrome.runtime.sendMessage.
 */

(function () {
  'use strict';

  // -- Configuration --------------------------------------------------------

  const SCROLL_DELAY_MS = 1200;
  const PAGE_LOAD_TIMEOUT_MS = 15000;
  const MAX_SCROLL_ATTEMPTS = 40;
  const SCROLL_IDLE_WAIT_MS = 2000;

  // -- Selectors & Patterns -------------------------------------------------

  /**
   * GoFood uses a React/Next.js-based SPA. Restaurant cards are rendered
   * as anchor-wrapped card components inside a listing grid. The selectors
   * below target common structural patterns observed on the site.
   */
  const SELECTORS = {
    /** Restaurant card link — each card is typically an <a> to the restaurant page. */
    restaurantCard: [
      'a[href*="/restaurant/"]',
      '[class*="restaurant"] a',
      '[class*="merchant"] a',
      '[data-testid*="restaurant"]',
      '[data-testid*="merchant"]',
    ],
    /** Wrapper / container that holds the list of restaurant cards. */
    listingContainer: [
      '[class*="restaurant-list"]',
      '[class*="merchant-list"]',
      '[class*="outlet-list"]',
      'main',
      '#__next',
    ],
  };

  // -- Utility Helpers ------------------------------------------------------

  /**
   * Wait for at least one element matching any of the given selectors.
   * @param {string[]} selectors
   * @param {number} [timeoutMs]
   * @returns {Promise<Element|null>}
   */
  function waitForAnyElement(selectors, timeoutMs = PAGE_LOAD_TIMEOUT_MS) {
    return new Promise((resolve) => {
      // Check immediately
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          resolve(el);
          return;
        }
      }

      const observer = new MutationObserver(() => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            observer.disconnect();
            resolve(el);
            return;
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            resolve(el);
            return;
          }
        }
        resolve(null);
      }, timeoutMs);
    });
  }

  /**
   * Sleep for a given number of milliseconds.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Auto-scroll to the bottom of the page in steps to trigger
   * infinite-scroll / lazy-loading of additional restaurant cards.
   * Returns when no new content has been loaded after consecutive attempts.
   * @returns {Promise<void>}
   */
  async function autoScroll() {
    let previousHeight = 0;
    let idleCount = 0;
    let attempts = 0;

    while (attempts < MAX_SCROLL_ATTEMPTS) {
      const currentHeight = document.documentElement.scrollHeight;

      if (currentHeight === previousHeight) {
        idleCount++;
        // If height unchanged for 3 consecutive checks, assume all loaded
        if (idleCount >= 3) break;
      } else {
        idleCount = 0;
      }

      previousHeight = currentHeight;
      window.scrollTo({ top: currentHeight, behavior: 'smooth' });
      await sleep(SCROLL_DELAY_MS);
      attempts++;
    }

    // Final wait for any trailing lazy renders
    await sleep(SCROLL_IDLE_WAIT_MS);
  }

  // -- Extraction Logic -----------------------------------------------------

  /**
   * Query all restaurant card elements on the page using multiple
   * selector strategies.
   * @returns {Element[]}
   */
  function findRestaurantCards() {
    // Strategy 1: links that contain "/restaurant/" in href
    const restaurantLinks = document.querySelectorAll('a[href*="/restaurant/"]');
    if (restaurantLinks.length > 0) return Array.from(restaurantLinks);

    // Strategy 2: try each known selector
    for (const sel of SELECTORS.restaurantCard) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length > 0) return Array.from(nodes);
    }

    // Strategy 3: broad heuristic — look for cards containing restaurant-like content
    const allLinks = document.querySelectorAll('a[href]');
    const candidates = [];
    for (const link of allLinks) {
      const href = link.getAttribute('href') || '';
      if (
        href.includes('/restaurant/') ||
        href.includes('/merchant/') ||
        href.includes('/outlet/')
      ) {
        candidates.push(link);
      }
    }
    return candidates;
  }

  /**
   * Extract the restaurant name from a card element.
   * @param {Element} card
   * @returns {string}
   */
  function extractName(card) {
    // Try heading elements first
    const heading =
      card.querySelector('h3') ||
      card.querySelector('h2') ||
      card.querySelector('h4') ||
      card.querySelector('[class*="name"]') ||
      card.querySelector('[class*="title"]');

    if (heading) {
      const text = heading.textContent.trim();
      if (text) return text;
    }

    // Fallback: use the first significant text node
    const textEls = card.querySelectorAll('span, p, div');
    for (const el of textEls) {
      const text = el.textContent.trim();
      // Skip very short or obviously non-name text
      if (
        text.length > 2 &&
        text.length < 100 &&
        !text.includes('km') &&
        !text.match(/^\d/) &&
        !text.includes('Rp') &&
        !text.includes('min')
      ) {
        return text;
      }
    }

    // Last resort: aria-label or title attribute
    return (
      card.getAttribute('aria-label') ||
      card.getAttribute('title') ||
      ''
    );
  }

  /**
   * Extract the restaurant URL from a card element.
   * @param {Element} card
   * @returns {string}
   */
  function extractUrl(card) {
    // If the card itself is an <a>, use its href
    if (card.tagName === 'A' && card.href) {
      return normalizeUrl(card.href);
    }

    // Otherwise look for the first relevant link
    const link = card.querySelector('a[href*="/restaurant/"]') ||
      card.querySelector('a[href]');

    if (link) {
      return normalizeUrl(link.href);
    }

    return '';
  }

  /**
   * Normalize a GoFood URL to a canonical form.
   * @param {string} href
   * @returns {string}
   */
  function normalizeUrl(href) {
    try {
      const url = new URL(href, 'https://gofood.co.id');
      // Strip query params and hash for cleaner dedup
      return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
    } catch {
      return href || '';
    }
  }

  /**
   * Extract a merchant ID (slug) from the restaurant URL.
   * GoFood URLs look like: /city/restaurant/slug-uuid
   * @param {string} url
   * @returns {string}
   */
  function extractMerchantId(url) {
    try {
      const parsed = new URL(url, 'https://gofood.co.id');
      const segments = parsed.pathname.split('/').filter(Boolean);
      // The restaurant slug is typically the last segment
      return segments[segments.length - 1] || '';
    } catch {
      return '';
    }
  }

  /**
   * Extract cuisine / category info from a card.
   * GoFood typically shows cuisine types like "Aneka Nasi", "Minuman", etc.
   * @param {Element} card
   * @returns {string}
   */
  function extractCuisine(card) {
    // Look for elements with cuisine/category-related classes
    const cuisineEl =
      card.querySelector('[class*="cuisine"]') ||
      card.querySelector('[class*="category"]') ||
      card.querySelector('[class*="tag"]');

    if (cuisineEl) {
      return cuisineEl.textContent.trim();
    }

    // Heuristic: cuisine text is often a smaller/secondary text element
    // after the restaurant name, before rating/distance info
    const spans = card.querySelectorAll('span, p');
    for (const span of spans) {
      const text = span.textContent.trim();
      // Cuisine labels are typically short, no numbers, no currency
      if (
        text.length > 2 &&
        text.length < 60 &&
        !text.includes('km') &&
        !text.includes('min') &&
        !text.includes('Rp') &&
        !text.match(/^\d/) &&
        !text.match(/rating/i) &&
        text !== extractName(card)
      ) {
        // Check parent isn't a heading (which we use for name)
        const parent = span.closest('h2, h3, h4');
        if (!parent) {
          return text;
        }
      }
    }

    return '';
  }

  /**
   * Extract rating from a restaurant card.
   * @param {Element} card
   * @returns {number|null}
   */
  function extractRating(card) {
    // Look for rating-specific elements
    const ratingEl =
      card.querySelector('[class*="rating"]') ||
      card.querySelector('[aria-label*="rating"]') ||
      card.querySelector('[class*="star"]');

    if (ratingEl) {
      const text = ratingEl.textContent.trim();
      const match = text.match(/([\d.]+)/);
      if (match) {
        const val = parseFloat(match[1]);
        if (val >= 0 && val <= 5) return val;
      }
    }

    // Heuristic: find a standalone decimal number near a star icon
    const allEls = card.querySelectorAll('span, div, p');
    for (const el of allEls) {
      const text = el.textContent.trim();
      const ratingMatch = text.match(/^([\d.]+)$/);
      if (ratingMatch) {
        const val = parseFloat(ratingMatch[1]);
        if (val >= 1 && val <= 5) {
          // Confirm proximity to a star icon
          const parent = el.parentElement;
          if (parent) {
            const hasStar =
              parent.querySelector('svg') ||
              parent.querySelector('img[src*="star"]') ||
              parent.querySelector('img[alt*="star"]') ||
              parent.querySelector('[class*="star"]');
            if (hasStar) return val;
          }
        }
      }
    }

    // Broader search: "4.5 / 5" or "4.5" near star elements
    const starEls = card.querySelectorAll('svg, img[src*="star"], [class*="star"]');
    for (const star of starEls) {
      const sibling = star.nextElementSibling || star.previousElementSibling;
      if (sibling) {
        const match = sibling.textContent.trim().match(/([\d.]+)/);
        if (match) {
          const val = parseFloat(match[1]);
          if (val >= 1 && val <= 5) return val;
        }
      }
      // Check parent text
      const parent = star.parentElement;
      if (parent) {
        const match = parent.textContent.trim().match(/([\d.]+)/);
        if (match) {
          const val = parseFloat(match[1]);
          if (val >= 1 && val <= 5) return val;
        }
      }
    }

    return null;
  }

  /**
   * Extract address / location text from a card.
   * GoFood cards often show distance ("1.2 km") rather than a full address.
   * We capture whatever location-related text is available.
   * @param {Element} card
   * @returns {string}
   */
  function extractAddress(card) {
    const addrEl =
      card.querySelector('[class*="address"]') ||
      card.querySelector('[class*="location"]') ||
      card.querySelector('[class*="distance"]');

    if (addrEl) {
      return addrEl.textContent.trim();
    }

    // Look for distance text like "1.2 km"
    const allEls = card.querySelectorAll('span, p, div');
    for (const el of allEls) {
      const text = el.textContent.trim();
      if (text.match(/[\d.]+\s*km/i)) {
        return text;
      }
    }

    return '';
  }

  /**
   * Extract image URL from a restaurant card.
   * @param {Element} card
   * @returns {string}
   */
  function extractImageUrl(card) {
    const img = card.querySelector('img[src]');
    if (img) {
      return img.getAttribute('src') || '';
    }

    // Check for background-image style
    const bgEls = card.querySelectorAll('[style*="background-image"]');
    for (const el of bgEls) {
      const style = el.getAttribute('style') || '';
      const match = style.match(/url\(["']?([^"')]+)["']?\)/);
      if (match) return match[1];
    }

    return '';
  }

  // -- Main Scraping Routine ------------------------------------------------

  /**
   * Collect unique restaurants from all cards visible on the page.
   * @param {Map<string, Object>} merchantMap
   * @param {string} regionCode
   * @param {string} regionName
   */
  function collectRestaurants(merchantMap, regionCode, regionName) {
    const cards = findRestaurantCards();

    for (const card of cards) {
      const name = extractName(card);
      if (!name) continue;

      const url = extractUrl(card);
      // Deduplicate by name + URL composite key
      const dedupKey = `${name.toLowerCase()}|${url}`;

      if (merchantMap.has(dedupKey)) continue;

      const merchantId = extractMerchantId(url);
      const cuisine = extractCuisine(card);
      const rating = extractRating(card);
      const address = extractAddress(card);
      const imageUrl = extractImageUrl(card);

      merchantMap.set(dedupKey, {
        platform: 'gofood',
        merchantName: name,
        merchantUrl: url,
        merchantId: merchantId,
        address: address,
        provinceCode: regionCode,
        provinceName: regionName,
        regencyCode: '',
        regencyName: '',
        districtCode: '',
        districtName: '',
        category: cuisine,
        rating: rating,
        totalProducts: null,
        totalSold: null,
        joinDate: '',
        isOfficialStore: false,
        phone: '',
        description: imageUrl ? `image:${imageUrl}` : '',
        scrapedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Core scraping routine: wait for listings, auto-scroll to load all,
   * collect restaurant data, and return results.
   * @param {string} regionCode
   * @param {string} regionName
   * @returns {Promise<Object[]>}
   */
  async function scrapeRestaurants(regionCode, regionName) {
    const merchantMap = new Map();

    console.log('[SE-GoFood] Waiting for restaurant listings to load...');

    // Wait for the listing container or restaurant cards to appear
    const container = await waitForAnyElement(SELECTORS.listingContainer);

    if (!container) {
      console.warn('[SE-GoFood] Listing container not found.');
      return [];
    }

    // Give the page extra time to render initial cards
    await sleep(2000);

    // Collect initial restaurants before scrolling
    collectRestaurants(merchantMap, regionCode, regionName);
    console.log(
      `[SE-GoFood] Initial collection: ${merchantMap.size} restaurants`
    );

    // Auto-scroll to load more restaurants
    console.log('[SE-GoFood] Auto-scrolling to load more...');
    let previousCount = merchantMap.size;
    let scrollRounds = 0;
    const MAX_SCROLL_ROUNDS = 10;

    while (scrollRounds < MAX_SCROLL_ROUNDS) {
      await autoScroll();
      collectRestaurants(merchantMap, regionCode, regionName);

      const newCount = merchantMap.size;
      console.log(
        `[SE-GoFood] Scroll round ${scrollRounds + 1}: ${newCount} restaurants (${newCount - previousCount} new)`
      );

      if (newCount === previousCount) {
        // No new restaurants found after scrolling — we are done
        console.log('[SE-GoFood] No new restaurants after scroll, stopping.');
        break;
      }

      previousCount = newCount;
      scrollRounds++;
    }

    console.log(
      `[SE-GoFood] Scraping complete. Total unique restaurants: ${merchantMap.size}`
    );

    return Array.from(merchantMap.values());
  }

  // -- Message Listener -----------------------------------------------------

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action !== 'startScrape' || message.platform !== 'gofood') {
      return false;
    }

    const { regionCode, regionName } = message;

    console.log(
      `[SE-GoFood] Received startScrape for region ${regionCode} (${regionName})`
    );

    scrapeRestaurants(regionCode, regionName)
      .then((merchants) => {
        sendResponse({ success: true, merchants });
      })
      .catch((err) => {
        console.error('[SE-GoFood] Scraping error:', err);
        sendResponse({ success: false, merchants: [], error: err.message });
      });

    // Return true to keep the message channel open for the async response
    return true;
  });

  console.log('[SE-GoFood] Content script loaded and ready.');
})();
