'use client';

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from 'recharts';

interface Province {
  code: string;
  name: string;
}

interface ComparisonRow {
  regionCode: string;
  regionName: string;
  [platform: string]: string | number;
}

interface PlatformComparisonProps {
  platforms: string[];
  provinces: Province[];
  comparisonData: ComparisonRow[];
}

const PLATFORM_COLORS: Record<string, string> = {
  tokopedia: '#22c55e',
  shopee: '#f97316',
  grabfood: '#10b981',
  gofood: '#ef4444',
  lazada: '#3b82f6',
  blibli: '#6366f1',
  zalora: '#ec4899',
};

const PLATFORM_LABELS: Record<string, string> = {
  tokopedia: 'Tokopedia',
  shopee: 'Shopee',
  grabfood: 'GrabFood',
  gofood: 'GoFood',
  lazada: 'Lazada',
  blibli: 'Blibli',
  zalora: 'Zalora',
};

const MOCK_PROVINCES: Province[] = [
  { code: '31', name: 'DKI Jakarta' },
  { code: '32', name: 'Jawa Barat' },
  { code: '33', name: 'Jawa Tengah' },
  { code: '34', name: 'DI Yogyakarta' },
  { code: '35', name: 'Jawa Timur' },
  { code: '36', name: 'Banten' },
  { code: '51', name: 'Bali' },
  { code: '12', name: 'Sumatera Utara' },
  { code: '73', name: 'Sulawesi Selatan' },
  { code: '64', name: 'Kalimantan Timur' },
];

const MOCK_PLATFORMS = [
  'tokopedia',
  'shopee',
  'grabfood',
  'gofood',
  'lazada',
  'blibli',
  'zalora',
];

function generateMockData(): ComparisonRow[] {
  return MOCK_PROVINCES.map((province) => {
    const row: ComparisonRow = {
      regionCode: province.code,
      regionName: province.name,
    };
    for (const platform of MOCK_PLATFORMS) {
      row[platform] = Math.floor(Math.random() * 500) + 50;
    }
    return row;
  });
}

export default function PlatformComparison({
  platforms,
  provinces,
  comparisonData,
}: PlatformComparisonProps) {
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);

  const useMock = comparisonData.length === 0;
  const actualPlatforms = useMock ? MOCK_PLATFORMS : platforms;
  const actualProvinces = useMock ? MOCK_PROVINCES : provinces;
  const actualData = useMemo(
    () => (useMock ? generateMockData() : comparisonData),
    [useMock, comparisonData],
  );

  const chartData = useMemo(() => {
    if (selectedRegions.length === 0) {
      // Show top 5 provinces by total merchant count
      return actualData
        .map((row) => {
          const total = actualPlatforms.reduce(
            (sum, p) => sum + (Number(row[p]) || 0),
            0,
          );
          return { ...row, _total: total };
        })
        .sort(
          (a, b) =>
            (b._total as number) - (a._total as number),
        )
        .slice(0, 5);
    }
    return actualData.filter((row) =>
      selectedRegions.includes(row.regionCode as string),
    );
  }, [actualData, selectedRegions, actualPlatforms]);

  function handleRegionToggle(code: string) {
    setSelectedRegions((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, code];
    });
  }

  function handleClearSelection() {
    setSelectedRegions([]);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Perbandingan Merchant per Platform
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Jumlah merchant di setiap platform untuk wilayah yang dipilih
          </p>
        </div>
        {selectedRegions.length > 0 && (
          <button
            onClick={handleClearSelection}
            className="shrink-0 rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            Reset Pilihan
          </button>
        )}
      </div>

      {/* Region selector */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Pilih Provinsi (maks. 5)
        </label>
        <div className="flex flex-wrap gap-2">
          {actualProvinces.map((province) => {
            const isSelected = selectedRegions.includes(province.code);
            return (
              <button
                key={province.code}
                onClick={() => handleRegionToggle(province.code)}
                disabled={!isSelected && selectedRegions.length >= 5}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50'
                }`}
              >
                {province.name}
              </button>
            );
          })}
        </div>
        {selectedRegions.length === 0 && (
          <p className="mt-2 text-xs text-gray-400">
            Menampilkan 5 provinsi teratas berdasarkan jumlah merchant.
            Klik provinsi untuk memilih manual.
          </p>
        )}
      </div>

      {/* Bar chart */}
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="regionName"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={60}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
              formatter={(value: number | undefined, name: string | undefined) => [
                (value ?? 0).toLocaleString(),
                PLATFORM_LABELS[name ?? ''] || name || '',
              ]}
            />
            <Legend
              formatter={(value: string) => (
                <span className="text-xs text-gray-600">
                  {PLATFORM_LABELS[value] || value}
                </span>
              )}
            />
            {actualPlatforms.map((platform) => (
              <Bar
                key={platform}
                dataKey={platform}
                fill={PLATFORM_COLORS[platform] || '#94a3b8'}
                radius={[2, 2, 0, 0]}
                maxBarSize={24}
              >
                <LabelList
                  dataKey={platform}
                  position="top"
                  style={{ fontSize: 9, fill: '#6b7280' }}
                  formatter={(value: unknown) => {
                    const num = Number(value);
                    return num > 0 ? num.toLocaleString() : '';
                  }}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {useMock && (
        <p className="mt-4 text-center text-xs text-amber-600">
          Data placeholder ditampilkan karena database kosong.
        </p>
      )}
    </div>
  );
}
