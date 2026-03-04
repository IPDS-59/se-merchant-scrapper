import ReportGenerator from '@/components/reports/ReportGenerator';

export const metadata = {
  title: 'Laporan - SE Merchant Scraper',
  description: 'Generate and download BPS-compatible merchant reports',
};

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Laporan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Buat dan unduh laporan merchant sesuai format BPS Sensus Ekonomi
        </p>
      </div>

      {/* Report Generator */}
      <ReportGenerator />
    </div>
  );
}
