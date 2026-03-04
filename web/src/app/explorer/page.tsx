'use client';

import { useCallback, useEffect, useState } from 'react';

import ExportButton from '@/components/explorer/ExportButton';
import FilterPanel, {
  type FilterValues,
} from '@/components/explorer/FilterPanel';
import MerchantDetail from '@/components/explorer/MerchantDetail';
import MerchantTable, {
  type MerchantRow,
} from '@/components/explorer/MerchantTable';

interface MerchantFullData {
  id: number;
  name: string;
  platform: string;
  address: string | null;
  category: string | null;
  phone: string | null;
  rating: number | null;
  productCount: number | null;
  joinDate: string | null;
  monthlySales: number | null;
  totalTransactions: number | null;
  operatingHours: string | null;
  socialMediaLinks: Record<string, string> | null;
  ownerName: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  region: {
    id: number;
    code: string;
    name: string;
    level: string;
  } | null;
}

interface MerchantApiResponse {
  merchants: MerchantFullData[];
  total: number;
  page: number;
  limit: number;
}

function buildQueryString(
  filters: FilterValues,
  page: number,
  limit: number,
): string {
  const params = new URLSearchParams();

  // Use the most specific region code
  if (filters.districtCode) {
    params.set('districtCode', filters.districtCode);
  } else if (filters.regencyCode) {
    params.set('regencyCode', filters.regencyCode);
  } else if (filters.provinceCode) {
    params.set('provinceCode', filters.provinceCode);
  }

  // The API accepts a single platform; if multiple selected, use the first one
  // (API limitation - could be extended server-side)
  if (filters.platforms.length === 1) {
    params.set('platform', filters.platforms[0]);
  }

  if (filters.category) {
    params.set('category', filters.category);
  }

  if (filters.dateFrom) {
    params.set('dateFrom', filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set('dateTo', filters.dateTo);
  }

  if (filters.search) {
    params.set('search', filters.search);
  }

  params.set('page', String(page));
  params.set('limit', String(limit));

  return params.toString();
}

export default function ExplorerPage() {
  const [merchants, setMerchants] = useState<MerchantFullData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({
    provinceCode: '',
    regencyCode: '',
    districtCode: '',
    platforms: [],
    category: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantRow | null>(
    null,
  );
  const [detailData, setDetailData] = useState<MerchantFullData | null>(null);

  const fetchMerchants = useCallback(
    async (
      currentFilters: FilterValues,
      currentPage: number,
      currentLimit: number,
    ) => {
      setIsLoading(true);
      try {
        const qs = buildQueryString(currentFilters, currentPage, currentLimit);
        const res = await fetch(`/api/merchants?${qs}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data: MerchantApiResponse = await res.json();
        setMerchants(data.merchants);
        setTotal(data.total);
      } catch (err) {
        console.error('Error fetching merchants:', err);
        setMerchants([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchMerchants(filters, page, limit);
  }, [fetchMerchants, filters, page, limit]);

  function handleApplyFilters(newFilters: FilterValues) {
    setFilters(newFilters);
    setPage(1);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
  }

  function handleLimitChange(newLimit: number) {
    setLimit(newLimit);
  }

  function handleSortChange(_sortField: string, _sortOrder: 'asc' | 'desc') {
    // Server-side sorting could be implemented by extending the API
    // For now, the API sorts by createdAt desc
  }

  function handleRowClick(merchant: MerchantRow) {
    // Find the full data from merchants array
    const fullData = merchants.find((m) => m.id === merchant.id);
    if (fullData) {
      setSelectedMerchant(merchant);
      setDetailData(fullData);
    }
  }

  function handleCloseDetail() {
    setSelectedMerchant(null);
    setDetailData(null);
  }

  const fetchAllForExport = useCallback(async (): Promise<MerchantRow[]> => {
    const qs = buildQueryString(filters, 1, 10000);
    const res = await fetch(`/api/merchants?${qs}`);
    if (!res.ok) throw new Error('Failed to fetch for export');
    const data: MerchantApiResponse = await res.json();
    return data.merchants.map((m) => ({
      id: m.id,
      name: m.name,
      platform: m.platform,
      category: m.category,
      rating: m.rating,
      productCount: m.productCount,
      monthlySales: m.monthlySales,
      createdAt: m.createdAt,
      region: m.region,
    }));
  }, [filters]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Data Explorer
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Browse, filter, and export merchant data
            </p>
          </div>
          <ExportButton fetchAllData={fetchAllForExport} />
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Filter panel */}
          <FilterPanel onApply={handleApplyFilters} />

          {/* Table */}
          <div className="min-w-0 flex-1">
            <MerchantTable
              data={merchants}
              total={total}
              page={page}
              limit={limit}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              onSortChange={handleSortChange}
              onRowClick={handleRowClick}
              isLoading={isLoading}
            />
          </div>
        </div>
      </main>

      {/* Detail slide-over */}
      {selectedMerchant && detailData && (
        <MerchantDetail merchant={detailData} onClose={handleCloseDetail} />
      )}
    </div>
  );
}
