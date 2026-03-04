'use client';

import { useCallback, useRef, useState } from 'react';

import type { MerchantRow } from './MerchantTable';

interface ExportButtonProps {
  fetchAllData: () => Promise<MerchantRow[]>;
}

export default function ExportButton({ fetchAllData }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setIsOpen(false), []);

  // Close on outside click
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.relatedTarget as Node)
      ) {
        closeDropdown();
      }
    },
    [closeDropdown],
  );

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleExportJSON() {
    setIsExporting(true);
    closeDropdown();
    try {
      const data = await fetchAllData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      downloadBlob(blob, `merchants-${Date.now()}.json`);
    } catch (err) {
      console.error('Export JSON failed:', err);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportCSV() {
    setIsExporting(true);
    closeDropdown();
    try {
      const data = await fetchAllData();
      if (data.length === 0) {
        setIsExporting(false);
        return;
      }

      const headers = [
        'ID',
        'Name',
        'Platform',
        'Region',
        'Category',
        'Rating',
        'Products',
        'Monthly Sales',
        'Scraped At',
      ];

      const rows = data.map((m) => [
        m.id,
        `"${(m.name ?? '').replace(/"/g, '""')}"`,
        m.platform,
        `"${(m.region?.name ?? '').replace(/"/g, '""')}"`,
        `"${(m.category ?? '').replace(/"/g, '""')}"`,
        m.rating ?? '',
        m.productCount ?? '',
        m.monthlySales ?? '',
        m.createdAt,
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join(
        '\n',
      );
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, `merchants-${Date.now()}.csv`);
    } catch (err) {
      console.error('Export CSV failed:', err);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportExcel() {
    setIsExporting(true);
    closeDropdown();
    try {
      const data = await fetchAllData();
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Merchants');

      sheet.columns = [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Platform', key: 'platform', width: 12 },
        { header: 'Region', key: 'region', width: 20 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Rating', key: 'rating', width: 8 },
        { header: 'Products', key: 'productCount', width: 10 },
        { header: 'Monthly Sales', key: 'monthlySales', width: 14 },
        { header: 'Scraped At', key: 'createdAt', width: 18 },
      ];

      // Style header row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

      data.forEach((m) => {
        sheet.addRow({
          id: m.id,
          name: m.name,
          platform: m.platform,
          region: m.region?.name ?? '',
          category: m.category ?? '',
          rating: m.rating,
          productCount: m.productCount,
          monthlySales: m.monthlySales,
          createdAt: m.createdAt,
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadBlob(blob, `merchants-${Date.now()}.xlsx`);
    } catch (err) {
      console.error('Export Excel failed:', err);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="relative" ref={dropdownRef} onBlur={handleBlur}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isExporting ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
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
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Exporting...
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export
            <svg
              className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
            CSV (.csv)
          </button>
          <button
            type="button"
            onClick={handleExportJSON}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            JSON (.json)
          </button>
        </div>
      )}
    </div>
  );
}
