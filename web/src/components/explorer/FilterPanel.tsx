'use client';

import { useCallback, useEffect, useState } from 'react';

interface Region {
  id: number;
  code: string;
  name: string;
  level: string;
  parentId: number | null;
}

const PLATFORMS = [
  'tokopedia',
  'shopee',
  'grabfood',
  'gofood',
  'lazada',
  'blibli',
  'zalora',
] as const;

export interface FilterValues {
  provinceCode: string;
  regencyCode: string;
  districtCode: string;
  platforms: string[];
  category: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

const DEFAULT_FILTERS: FilterValues = {
  provinceCode: '',
  regencyCode: '',
  districtCode: '',
  platforms: [],
  category: '',
  dateFrom: '',
  dateTo: '',
  search: '',
};

interface FilterPanelProps {
  onApply: (filters: FilterValues) => void;
}

export default function FilterPanel({ onApply }: FilterPanelProps) {
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  const [provinces, setProvinces] = useState<Region[]>([]);
  const [regencies, setRegencies] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<Region[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch('/api/regions?level=province')
      .then((res) => res.json())
      .then((data) => setProvinces(data.regions ?? []))
      .catch(() => setProvinces([]));
  }, []);

  const loadRegencies = useCallback((provinceId: number) => {
    setRegencies([]);
    setDistricts([]);
    fetch(`/api/regions?parentId=${provinceId}`)
      .then((res) => res.json())
      .then((data) => setRegencies(data.regions ?? []))
      .catch(() => setRegencies([]));
  }, []);

  const loadDistricts = useCallback((regencyId: number) => {
    setDistricts([]);
    fetch(`/api/regions?parentId=${regencyId}`)
      .then((res) => res.json())
      .then((data) => setDistricts(data.regions ?? []))
      .catch(() => setDistricts([]));
  }, []);

  function handleProvinceChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value;
    const province = provinces.find((p) => p.code === code);
    setFilters((prev) => ({
      ...prev,
      provinceCode: code,
      regencyCode: '',
      districtCode: '',
    }));
    setRegencies([]);
    setDistricts([]);
    if (province) {
      loadRegencies(province.id);
    }
  }

  function handleRegencyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value;
    const regency = regencies.find((r) => r.code === code);
    setFilters((prev) => ({
      ...prev,
      regencyCode: code,
      districtCode: '',
    }));
    setDistricts([]);
    if (regency) {
      loadDistricts(regency.id);
    }
  }

  function handleDistrictChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setFilters((prev) => ({ ...prev, districtCode: e.target.value }));
  }

  function handlePlatformToggle(platform: string) {
    setFilters((prev) => {
      const platforms = prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform];
      return { ...prev, platforms };
    });
  }

  function handleReset() {
    setFilters(DEFAULT_FILTERS);
    setRegencies([]);
    setDistricts([]);
    onApply(DEFAULT_FILTERS);
  }

  function handleApply() {
    onApply(filters);
  }

  const selectClass =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400';
  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="mb-4 flex w-full items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm lg:hidden"
      >
        <span>Filters</span>
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <aside
        className={`${
          isOpen ? 'block' : 'hidden'
        } w-full shrink-0 rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:block lg:w-72`}
      >
        <h2 className="mb-4 text-base font-semibold text-gray-900">Filters</h2>

        <div className="space-y-4">
          {/* Search */}
          <div>
            <label htmlFor="filter-search" className={labelClass}>
              Search Merchant
            </label>
            <input
              id="filter-search"
              type="text"
              placeholder="Merchant name..."
              className={inputClass}
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
            />
          </div>

          {/* Province */}
          <div>
            <label htmlFor="filter-province" className={labelClass}>
              Province
            </label>
            <select
              id="filter-province"
              className={selectClass}
              value={filters.provinceCode}
              onChange={handleProvinceChange}
            >
              <option value="">All Provinces</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Regency */}
          <div>
            <label htmlFor="filter-regency" className={labelClass}>
              Regency
            </label>
            <select
              id="filter-regency"
              className={selectClass}
              value={filters.regencyCode}
              onChange={handleRegencyChange}
              disabled={!filters.provinceCode}
            >
              <option value="">All Regencies</option>
              {regencies.map((r) => (
                <option key={r.id} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* District */}
          <div>
            <label htmlFor="filter-district" className={labelClass}>
              District
            </label>
            <select
              id="filter-district"
              className={selectClass}
              value={filters.districtCode}
              onChange={handleDistrictChange}
              disabled={!filters.regencyCode}
            >
              <option value="">All Districts</option>
              {districts.map((d) => (
                <option key={d.id} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Platforms */}
          <div>
            <span className={labelClass}>Platform</span>
            <div className="mt-1 space-y-1">
              {PLATFORMS.map((platform) => (
                <label
                  key={platform}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={filters.platforms.includes(platform)}
                    onChange={() => handlePlatformToggle(platform)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="capitalize">{platform}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <label htmlFor="filter-category" className={labelClass}>
              Category
            </label>
            <input
              id="filter-category"
              type="text"
              placeholder="e.g. Electronics"
              className={inputClass}
              value={filters.category}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, category: e.target.value }))
              }
            />
          </div>

          {/* Date Range */}
          <div>
            <span className={labelClass}>Date Range</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="filter-date-from" className="sr-only">
                  From
                </label>
                <input
                  id="filter-date-from"
                  type="date"
                  className={inputClass}
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                  }
                />
              </div>
              <div>
                <label htmlFor="filter-date-to" className="sr-only">
                  To
                </label>
                <input
                  id="filter-date-to"
                  type="date"
                  className={inputClass}
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Reset
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
