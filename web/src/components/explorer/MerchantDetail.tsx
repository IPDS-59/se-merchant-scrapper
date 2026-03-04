'use client';

import { useEffect, useRef } from 'react';

interface MerchantDetailData {
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

interface MerchantDetailProps {
  merchant: MerchantDetailData | null;
  onClose: () => void;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-gray-100 py-2.5">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-900">{value || '-'}</dd>
    </div>
  );
}

export default function MerchantDetail({
  merchant,
  onClose,
}: MerchantDetailProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    if (merchant) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [merchant, onClose]);

  if (!merchant) return null;

  const socialLinks = merchant.socialMediaLinks;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Merchant detail"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {merchant.name}
            </h2>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium capitalize text-blue-700">
              {merchant.platform}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <dl>
            <DetailRow label="Name" value={merchant.name} />
            <DetailRow
              label="Platform"
              value={
                <span className="capitalize">{merchant.platform}</span>
              }
            />
            <DetailRow label="Region" value={merchant.region?.name} />
            <DetailRow label="Address" value={merchant.address} />
            <DetailRow label="Category" value={merchant.category} />
            <DetailRow label="Phone" value={merchant.phone} />
            <DetailRow
              label="Rating"
              value={
                merchant.rating != null
                  ? merchant.rating.toFixed(1)
                  : null
              }
            />
            <DetailRow
              label="Product Count"
              value={
                merchant.productCount != null
                  ? merchant.productCount.toLocaleString()
                  : null
              }
            />
            <DetailRow
              label="Join Date"
              value={
                merchant.joinDate
                  ? new Date(merchant.joinDate).toLocaleDateString('id-ID', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : null
              }
            />
            <DetailRow
              label="Monthly Sales"
              value={
                merchant.monthlySales != null
                  ? merchant.monthlySales.toLocaleString()
                  : null
              }
            />
            <DetailRow
              label="Total Transactions"
              value={
                merchant.totalTransactions != null
                  ? merchant.totalTransactions.toLocaleString()
                  : null
              }
            />
            <DetailRow
              label="Operating Hours"
              value={merchant.operatingHours}
            />
            <DetailRow label="Owner Name" value={merchant.ownerName} />
            <DetailRow
              label="Source URL"
              value={
                merchant.sourceUrl ? (
                  <a
                    href={merchant.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {merchant.sourceUrl.length > 50
                      ? `${merchant.sourceUrl.slice(0, 50)}...`
                      : merchant.sourceUrl}
                  </a>
                ) : null
              }
            />
            <DetailRow
              label="Social Media"
              value={
                socialLinks && Object.keys(socialLinks).length > 0 ? (
                  <ul className="space-y-1">
                    {Object.entries(socialLinks).map(([key, url]) => (
                      <li key={key}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          <span className="capitalize">{key}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null
              }
            />
            <DetailRow
              label="Scraped At"
              value={new Date(merchant.createdAt).toLocaleString('id-ID')}
            />
            <DetailRow
              label="Updated At"
              value={new Date(merchant.updatedAt).toLocaleString('id-ID')}
            />
          </dl>
        </div>
      </div>
    </div>
  );
}
