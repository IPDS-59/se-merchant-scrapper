/**
 * SE Merchant Scraper — Popup Controller
 *
 * Handles UI interactions: region selection, platform selection,
 * scraping orchestration, results display, and data export.
 */

(function () {
  'use strict';

  // ── DOM References ──────────────────────────────────────────

  const selectProvince = document.getElementById('select-province');
  const selectRegency = document.getElementById('select-regency');
  const selectDistrict = document.getElementById('select-district');
  const platformGrid = document.getElementById('platform-grid');
  const btnStart = document.getElementById('btn-start');
  const progressSection = document.getElementById('progress-section');
  const progressBar = document.getElementById('progress-bar');
  const progressLabel = document.getElementById('progress-label');
  const resultsSection = document.getElementById('results-section');
  const resultsSummary = document.getElementById('results-summary');
  const exportSection = document.getElementById('export-section');
  const btnSubmit = document.getElementById('btn-submit');

  // ── Helpers ─────────────────────────────────────────────────

  /**
   * Convert a string to Title Case.
   * @param {string} str
   * @returns {string}
   */
  function titleCase(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Clear all options from a <select> except the first placeholder.
   * @param {HTMLSelectElement} selectEl
   */
  function clearSelect(selectEl) {
    while (selectEl.options.length > 1) {
      selectEl.remove(1);
    }
    selectEl.value = '';
    selectEl.disabled = true;
  }

  /**
   * Populate a <select> with option data.
   * @param {HTMLSelectElement} selectEl
   * @param {Array<{kode_bps: string, nama_bps: string}>} items
   */
  function populateSelect(selectEl, items) {
    clearSelect(selectEl);
    for (const item of items) {
      const opt = document.createElement('option');
      opt.value = item.kode_bps;
      opt.textContent = titleCase(item.nama_bps);
      selectEl.appendChild(opt);
    }
    selectEl.disabled = false;
  }

  /**
   * Get the list of selected platform keys.
   * @returns {string[]}
   */
  function getSelectedPlatforms() {
    const checked = platformGrid.querySelectorAll(
      'input[type="checkbox"]:checked'
    );
    return Array.from(checked).map((cb) => cb.value);
  }

  /**
   * Get the most specific selected region code and name.
   * Priority: district > regency > province.
   * @returns {{ code: string, name: string } | null}
   */
  function getSelectedRegion() {
    const selects = [selectDistrict, selectRegency, selectProvince];
    for (const sel of selects) {
      if (sel.value) {
        return {
          code: sel.value,
          name: sel.options[sel.selectedIndex].textContent,
        };
      }
    }
    return null;
  }

  /**
   * Update the start button enabled state.
   */
  function updateStartButton() {
    const hasPlatforms = getSelectedPlatforms().length > 0;
    const hasRegion = getSelectedRegion() !== null;
    btnStart.disabled = !(hasPlatforms && hasRegion);
  }

  // ── BPS Region API ──────────────────────────────────────────

  /**
   * Fetch regions from the BPS Wilayah API with local caching.
   * @param {'provinsi'|'kabupaten'|'kecamatan'} [level='provinsi']
   * @param {string} [parentCode='']
   * @returns {Promise<Array<{kode_bps: string, nama_bps: string}>>}
   */
  async function fetchBpsRegions(level = 'provinsi', parentCode = '') {
    const cacheKey = `${level}_${parentCode}`;
    const cache = (await StorageHelper.get(STORAGE_KEYS.regionsCache)) || {};

    if (cache[cacheKey]) {
      return cache[cacheKey];
    }

    const params = new URLSearchParams({ level });
    if (parentCode) {
      params.set('parent', parentCode);
    }

    const url = `${BPS_API_BASE}?${params.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      // Cache the result
      cache[cacheKey] = data;
      await StorageHelper.set(STORAGE_KEYS.regionsCache, cache);

      return data;
    } catch (err) {
      console.error(`Failed to fetch regions (${level}, ${parentCode}):`, err);
      return [];
    }
  }

  // ── Cascading Dropdown Loaders ──────────────────────────────

  async function loadProvinces() {
    selectProvince.disabled = true;
    const provinces = await fetchBpsRegions('provinsi');
    populateSelect(selectProvince, provinces);
  }

  async function loadRegencies(provinceCode) {
    clearSelect(selectRegency);
    clearSelect(selectDistrict);

    if (!provinceCode) return;

    selectRegency.disabled = true;
    const regencies = await fetchBpsRegions('kabupaten', provinceCode);
    populateSelect(selectRegency, regencies);
  }

  async function loadDistricts(regencyCode) {
    clearSelect(selectDistrict);

    if (!regencyCode) return;

    selectDistrict.disabled = true;
    const districts = await fetchBpsRegions('kecamatan', regencyCode);
    populateSelect(selectDistrict, districts);
  }

  // ── Platform Rendering ──────────────────────────────────────

  function renderPlatforms() {
    for (const [key, platform] of Object.entries(PLATFORMS)) {
      const label = document.createElement('label');
      label.className = 'platform-checkbox';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = key;
      checkbox.addEventListener('change', updateStartButton);

      const dot = document.createElement('span');
      dot.className = 'platform-checkbox__dot';
      dot.style.backgroundColor = platform.color;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'platform-checkbox__label';
      nameSpan.textContent = platform.name;

      label.appendChild(checkbox);
      label.appendChild(dot);
      label.appendChild(nameSpan);
      platformGrid.appendChild(label);
    }
  }

  // ── Scraping ────────────────────────────────────────────────

  async function startScraping() {
    const platforms = getSelectedPlatforms();
    const region = getSelectedRegion();

    if (!platforms.length || !region) return;

    // Show progress, hide results/export
    progressSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    exportSection.classList.add('hidden');
    btnStart.disabled = true;

    const results = {};
    const total = platforms.length;
    let completed = 0;

    for (const platform of platforms) {
      progressLabel.textContent = `Scraping ${PLATFORMS[platform].name}...`;

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'scrape',
          platform,
          regionCode: region.code,
          regionName: region.name,
        });

        results[platform] = response?.merchants || [];
      } catch (err) {
        console.error(`Scrape error (${platform}):`, err);
        results[platform] = [];
      }

      completed++;
      const pct = Math.round((completed / total) * 100);
      progressBar.style.width = `${pct}%`;
    }

    progressLabel.textContent = 'Selesai!';
    btnStart.disabled = false;

    showResults(results);
  }

  // ── Results Display ─────────────────────────────────────────

  /**
   * Render a summary table of scraping results.
   * Uses safe DOM methods (createElement, textContent, appendChild).
   * @param {Object<string, Array>} results — { platform: merchants[] }
   */
  function showResults(results) {
    resultsSummary.textContent = '';

    const table = document.createElement('table');
    table.className = 'results-table';

    // Header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const thPlatform = document.createElement('th');
    thPlatform.textContent = 'Platform';
    headerRow.appendChild(thPlatform);

    const thCount = document.createElement('th');
    thCount.textContent = 'Merchant';
    headerRow.appendChild(thCount);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body rows
    const tbody = document.createElement('tbody');
    let grandTotal = 0;

    for (const [platform, merchants] of Object.entries(results)) {
      const row = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.textContent = PLATFORMS[platform]?.name || platform;
      row.appendChild(tdName);

      const tdCount = document.createElement('td');
      tdCount.textContent = merchants.length.toLocaleString('id-ID');
      row.appendChild(tdCount);

      tbody.appendChild(row);
      grandTotal += merchants.length;
    }

    table.appendChild(tbody);
    resultsSummary.appendChild(table);

    // Total
    const totalDiv = document.createElement('div');
    totalDiv.className = 'results-total';
    totalDiv.textContent = `Total: ${grandTotal.toLocaleString('id-ID')} merchant`;
    resultsSummary.appendChild(totalDiv);

    resultsSection.classList.remove('hidden');
    exportSection.classList.remove('hidden');
  }

  // ── Export ──────────────────────────────────────────────────

  /**
   * Export scraped data in the requested format.
   * @param {'excel'|'csv'|'json'} format
   */
  async function exportData(format) {
    const merchants = await StorageHelper.getMerchants();

    try {
      await chrome.runtime.sendMessage({
        action: 'export',
        format,
        merchants,
      });
    } catch (err) {
      console.error(`Export error (${format}):`, err);
    }
  }

  // ── Submit to Server ────────────────────────────────────────

  async function submitToApi() {
    const apiUrl = await StorageHelper.get(STORAGE_KEYS.apiUrl);

    if (!apiUrl) {
      alert('API URL belum dikonfigurasi. Buka halaman Options untuk mengaturnya.');
      return;
    }

    const merchants = await StorageHelper.getMerchants();

    if (!merchants.length) {
      alert('Tidak ada data untuk dikirim.');
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Mengirim...';

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchants }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      alert('Data berhasil dikirim ke server!');
    } catch (err) {
      console.error('Submit error:', err);
      alert(`Gagal mengirim data: ${err.message}`);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Kirim ke Server';
    }
  }

  // ── Initialization ──────────────────────────────────────────

  async function init() {
    // Render platform checkboxes
    renderPlatforms();

    // Load provinces
    await loadProvinces();

    // Setup cascading dropdown listeners
    selectProvince.addEventListener('change', () => {
      loadRegencies(selectProvince.value);
      updateStartButton();
    });

    selectRegency.addEventListener('change', () => {
      loadDistricts(selectRegency.value);
      updateStartButton();
    });

    selectDistrict.addEventListener('change', updateStartButton);

    // Start button
    btnStart.addEventListener('click', startScraping);

    // Export buttons
    document.querySelectorAll('.btn--export').forEach((btn) => {
      btn.addEventListener('click', () => exportData(btn.dataset.format));
    });

    // Submit button
    btnSubmit.addEventListener('click', submitToApi);

    // Check if API URL is configured (show/hide submit button hint)
    const apiUrl = await StorageHelper.get(STORAGE_KEYS.apiUrl);
    if (!apiUrl) {
      btnSubmit.title = 'API URL belum dikonfigurasi — buka Options';
    }
  }

  // ── Boot ────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', init);
})();
