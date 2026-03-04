'use client';

import { useCallback, useEffect, useState } from 'react';

interface Region {
  id: number;
  code: string;
  name: string;
  level: string;
  parentId: number | null;
}

type ReportTemplate = 'rekap-wilayah' | 'rekap-platform' | 'detail-merchant';

const TEMPLATES: { value: ReportTemplate; label: string; description: string }[] = [
  {
    value: 'rekap-wilayah',
    label: 'Rekap per Wilayah',
    description: 'Ringkasan jumlah merchant per wilayah (provinsi/kabupaten)',
  },
  {
    value: 'rekap-platform',
    label: 'Rekap per Platform',
    description: 'Ringkasan merchant per platform e-commerce beserta statistik',
  },
  {
    value: 'detail-merchant',
    label: 'Detail Merchant',
    description: 'Daftar lengkap merchant untuk wilayah yang dipilih',
  },
];

const PLATFORMS = [
  { value: 'all', label: 'Semua Platform' },
  { value: 'tokopedia', label: 'Tokopedia' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'grabfood', label: 'GrabFood' },
  { value: 'gofood', label: 'GoFood' },
  { value: 'lazada', label: 'Lazada' },
  { value: 'blibli', label: 'Blibli' },
  { value: 'zalora', label: 'Zalora' },
];

interface ReportPreview {
  template: string;
  title: string;
  data: Record<string, unknown>[];
  total: number;
  generatedAt: string;
}

export default function ReportGenerator() {
  const [template, setTemplate] = useState<ReportTemplate>('rekap-wilayah');
  const [provinceCode, setProvinceCode] = useState('');
  const [regencyCode, setRegencyCode] = useState('');
  const [districtCode, setDistrictCode] = useState('');
  const [platform, setPlatform] = useState('all');

  const [provinces, setProvinces] = useState<Region[]>([]);
  const [regencies, setRegencies] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<Region[]>([]);

  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load provinces on mount
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
    setProvinceCode(code);
    setRegencyCode('');
    setDistrictCode('');
    setRegencies([]);
    setDistricts([]);
    if (province) {
      loadRegencies(province.id);
    }
  }

  function handleRegencyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value;
    const regency = regencies.find((r) => r.code === code);
    setRegencyCode(code);
    setDistrictCode('');
    setDistricts([]);
    if (regency) {
      loadDistricts(regency.id);
    }
  }

  function handleDistrictChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setDistrictCode(e.target.value);
  }

  function buildQueryString(format?: string): string {
    const params = new URLSearchParams();
    params.set('template', template);
    if (provinceCode) params.set('provinceCode', provinceCode);
    if (regencyCode) params.set('regencyCode', regencyCode);
    if (districtCode) params.set('districtCode', districtCode);
    if (platform && platform !== 'all') params.set('platform', platform);
    if (format) params.set('format', format);
    return params.toString();
  }

  async function handleGenerate() {
    setIsLoading(true);
    setError(null);
    setPreview(null);
    try {
      const qs = buildQueryString();
      const res = await fetch(`/api/reports?${qs}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Gagal menghasilkan laporan');
      }
      const data: ReportPreview = await res.json();
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDownload(format: 'xlsx' | 'csv') {
    setIsDownloading(true);
    try {
      const qs = buildQueryString(format);
      const res = await fetch(`/api/reports?${qs}`);
      if (!res.ok) throw new Error('Download gagal');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template}_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download gagal');
    } finally {
      setIsDownloading(false);
    }
  }

  const selectClass =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400';
  const labelClass =
    'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';

  const selectedTemplate = TEMPLATES.find((t) => t.value === template);

  return (
    <div className="space-y-6">
      {/* Form Controls */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Parameter Laporan
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Template Selector */}
          <div className="md:col-span-2 lg:col-span-3">
            <label htmlFor="report-template" className={labelClass}>
              Template Laporan
            </label>
            <select
              id="report-template"
              className={selectClass}
              value={template}
              onChange={(e) => setTemplate(e.target.value as ReportTemplate)}
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <p className="mt-1 text-xs text-gray-500">
                {selectedTemplate.description}
              </p>
            )}
          </div>

          {/* Province */}
          <div>
            <label htmlFor="report-province" className={labelClass}>
              Provinsi
            </label>
            <select
              id="report-province"
              className={selectClass}
              value={provinceCode}
              onChange={handleProvinceChange}
            >
              <option value="">Semua Provinsi</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Regency */}
          <div>
            <label htmlFor="report-regency" className={labelClass}>
              Kabupaten/Kota
            </label>
            <select
              id="report-regency"
              className={selectClass}
              value={regencyCode}
              onChange={handleRegencyChange}
              disabled={!provinceCode}
            >
              <option value="">Semua Kabupaten/Kota</option>
              {regencies.map((r) => (
                <option key={r.id} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* District */}
          <div>
            <label htmlFor="report-district" className={labelClass}>
              Kecamatan
            </label>
            <select
              id="report-district"
              className={selectClass}
              value={districtCode}
              onChange={handleDistrictChange}
              disabled={!regencyCode}
            >
              <option value="">Semua Kecamatan</option>
              {districts.map((d) => (
                <option key={d.id} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Platform */}
          <div>
            <label htmlFor="report-platform" className={labelClass}>
              Platform
            </label>
            <select
              id="report-platform"
              className={selectClass}
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Generate Button */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Menghasilkan...
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
                Buat Laporan
              </>
            )}
          </button>

          {preview && (
            <>
              <button
                type="button"
                onClick={() => handleDownload('xlsx')}
                disabled={isDownloading}
                className="inline-flex items-center gap-2 rounded-md border border-green-600 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Unduh Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => handleDownload('csv')}
                disabled={isDownloading}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Unduh CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {preview.title}
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {preview.total} baris data | Dibuat:{' '}
                  {new Date(preview.generatedAt).toLocaleString('id-ID')}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {TEMPLATES.find((t) => t.value === preview.template)?.label}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            {preview.template === 'rekap-wilayah' && (
              <RekapWilayahTable data={preview.data} />
            )}
            {preview.template === 'rekap-platform' && (
              <RekapPlatformTable data={preview.data} />
            )}
            {preview.template === 'detail-merchant' && (
              <DetailMerchantTable data={preview.data} />
            )}
          </div>

          {preview.total === 0 && (
            <div className="px-6 py-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
              <p className="mt-2 text-sm text-gray-500">
                Tidak ada data untuk parameter yang dipilih
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Preview Table Components ---------- */

function RekapWilayahTable({ data }: { data: Record<string, unknown>[] }) {
  if (data.length === 0) return null;

  const total = data.reduce((sum, item) => sum + ((item.count as number) || 0), 0);

  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            No
          </th>
          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            Kode
          </th>
          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            Nama Wilayah
          </th>
          <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
            Jumlah Merchant
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 bg-white">
        {data.map((item, idx) => (
          <tr key={String(item.code)} className="hover:bg-gray-50">
            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500">
              {idx + 1}
            </td>
            <td className="whitespace-nowrap px-6 py-3 text-sm font-mono text-gray-600">
              {String(item.code)}
            </td>
            <td className="whitespace-nowrap px-6 py-3 text-sm font-medium text-gray-900">
              {String(item.name)}
            </td>
            <td className="whitespace-nowrap px-6 py-3 text-right text-sm text-gray-900">
              {(item.count as number).toLocaleString('id-ID')}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="bg-gray-50">
        <tr>
          <td
            colSpan={3}
            className="px-6 py-3 text-right text-sm font-bold text-gray-900"
          >
            TOTAL
          </td>
          <td className="px-6 py-3 text-right text-sm font-bold text-gray-900">
            {total.toLocaleString('id-ID')}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function RekapPlatformTable({ data }: { data: Record<string, unknown>[] }) {
  if (data.length === 0) return null;

  const total = data.reduce((sum, item) => sum + ((item.count as number) || 0), 0);

  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            No
          </th>
          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            Platform
          </th>
          <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
            Jumlah
          </th>
          <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
            Rata-rata Rating
          </th>
          <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
            Rata-rata Produk
          </th>
          <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
            Rata-rata Penjualan/Bln
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 bg-white">
        {data.map((item, idx) => (
          <tr key={String(item.platform)} className="hover:bg-gray-50">
            <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500">
              {idx + 1}
            </td>
            <td className="whitespace-nowrap px-6 py-3 text-sm font-medium capitalize text-gray-900">
              {String(item.platform)}
            </td>
            <td className="whitespace-nowrap px-6 py-3 text-right text-sm text-gray-900">
              {(item.count as number).toLocaleString('id-ID')}
            </td>
            <td className="whitespace-nowrap px-6 py-3 text-right text-sm text-gray-600">
              {item.avgRating != null ? String(item.avgRating) : '-'}
            </td>
            <td className="whitespace-nowrap px-6 py-3 text-right text-sm text-gray-600">
              {item.avgProducts != null
                ? (item.avgProducts as number).toLocaleString('id-ID')
                : '-'}
            </td>
            <td className="whitespace-nowrap px-6 py-3 text-right text-sm text-gray-600">
              {item.avgMonthlySales != null
                ? (item.avgMonthlySales as number).toLocaleString('id-ID')
                : '-'}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="bg-gray-50">
        <tr>
          <td
            colSpan={2}
            className="px-6 py-3 text-right text-sm font-bold text-gray-900"
          >
            TOTAL
          </td>
          <td className="px-6 py-3 text-right text-sm font-bold text-gray-900">
            {total.toLocaleString('id-ID')}
          </td>
          <td colSpan={3} />
        </tr>
      </tfoot>
    </table>
  );
}

function DetailMerchantTable({ data }: { data: Record<string, unknown>[] }) {
  if (data.length === 0) return null;

  // Show max 50 rows in preview
  const previewData = data.slice(0, 50);
  const hasMore = data.length > 50;

  return (
    <>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              No
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Nama Merchant
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Platform
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Wilayah
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Kategori
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
              Rating
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
              Produk
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
              Penjualan/Bln
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {previewData.map((item, idx) => (
            <tr key={item.id as number} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-500">
                {idx + 1}
              </td>
              <td className="max-w-[200px] truncate px-4 py-2.5 text-sm font-medium text-gray-900">
                {String(item.name)}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-sm capitalize text-gray-600">
                {String(item.platform)}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                {String(item.region)}
              </td>
              <td className="max-w-[150px] truncate px-4 py-2.5 text-sm text-gray-600">
                {item.category ? String(item.category) : '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm text-gray-600">
                {item.rating != null ? String(item.rating) : '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm text-gray-600">
                {item.productCount != null
                  ? (item.productCount as number).toLocaleString('id-ID')
                  : '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm text-gray-600">
                {item.monthlySales != null
                  ? (item.monthlySales as number).toLocaleString('id-ID')
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-3 text-center text-sm text-gray-500">
          Menampilkan 50 dari {data.length} baris. Unduh file untuk melihat
          seluruh data.
        </div>
      )}
    </>
  );
}
