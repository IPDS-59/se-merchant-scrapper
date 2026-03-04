import { prisma } from '@/lib/prisma';
import PlatformComparison from '@/components/comparison/PlatformComparison';
import CoverageGap from '@/components/comparison/CoverageGap';

interface PlatformRegionRow {
  platform: string;
  regionId: number;
  regionCode: string;
  regionName: string;
  count: bigint;
}

interface ProvinceSelect {
  id: number;
  code: string;
  name: string;
}

const PLATFORMS = [
  'tokopedia',
  'shopee',
  'grabfood',
  'gofood',
  'lazada',
  'blibli',
  'zalora',
];

async function getComparisonData() {
  try {
    const provinces = await prisma.region.findMany({
      where: { level: 'province' },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    });

    const platformRegionCounts: PlatformRegionRow[] = await prisma
      .$queryRaw<PlatformRegionRow[]>`
        SELECT
          m.platform,
          r.id as regionId,
          r.code as regionCode,
          r.name as regionName,
          COUNT(m.id) as count
        FROM Merchant m
        JOIN Region r ON m.regionId = r.id AND r.level = 'province'
        GROUP BY m.platform, r.id, r.code, r.name
        ORDER BY m.platform, r.name
      `
      .catch(() => [] as PlatformRegionRow[]);

    const comparisonData = provinces.map((province: ProvinceSelect) => {
      const entry: Record<string, string | number> = {
        regionCode: province.code,
        regionName: province.name,
      };

      for (const platform of PLATFORMS) {
        const row = platformRegionCounts.find(
          (r) =>
            r.platform === platform && Number(r.regionId) === province.id,
        );
        entry[platform] = row ? Number(row.count) : 0;
      }

      return entry;
    });

    const coverageMatrix = provinces.map((province: ProvinceSelect) => {
      const entry: Record<string, string | boolean> = {
        regionCode: province.code,
        regionName: province.name,
      };

      for (const platform of PLATFORMS) {
        const row = platformRegionCounts.find(
          (r) =>
            r.platform === platform && Number(r.regionId) === province.id,
        );
        entry[platform] = row ? Number(row.count) > 0 : false;
      }

      return entry;
    });

    const totalProvinces = provinces.length;
    const coverageSummary: Record<string, number> = {};
    for (const platform of PLATFORMS) {
      const coveredCount = coverageMatrix.filter(
        (row: Record<string, string | boolean>) => row[platform] === true,
      ).length;
      coverageSummary[platform] =
        totalProvinces > 0
          ? Math.round((coveredCount / totalProvinces) * 100)
          : 0;
    }

    return {
      platforms: PLATFORMS,
      provinces: provinces.map((p: ProvinceSelect) => ({ code: p.code, name: p.name })),
      comparisonData,
      coverageMatrix,
      coverageSummary,
    };
  } catch (error) {
    console.error('Failed to fetch comparison data:', error);
    return {
      platforms: PLATFORMS,
      provinces: [],
      comparisonData: [],
      coverageMatrix: [],
      coverageSummary: {},
    };
  }
}

export default async function ComparisonPage() {
  const data = await getComparisonData();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Perbandingan Platform
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Analisis perbandingan data merchant lintas platform e-commerce di
          Indonesia
        </p>
      </div>

      {/* Platform comparison chart */}
      <PlatformComparison
        platforms={data.platforms}
        provinces={data.provinces}
        comparisonData={data.comparisonData}
      />

      {/* Coverage gap matrix */}
      <CoverageGap
        platforms={data.platforms}
        coverageMatrix={data.coverageMatrix}
        coverageSummary={data.coverageSummary}
      />
    </div>
  );
}
