import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

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

export async function GET() {
  try {
    // Get all provinces
    const provinces = await prisma.region.findMany({
      where: { level: 'province' },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    });

    // Get merchant counts grouped by platform and province
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

    // Build platform totals
    const platforms = [
      'tokopedia',
      'shopee',
      'grabfood',
      'gofood',
      'lazada',
      'blibli',
      'zalora',
    ];

    // Build comparison data: for each province, merchant count per platform
    const comparisonData = provinces.map((province: ProvinceSelect) => {
      const entry: Record<string, string | number> = {
        regionCode: province.code,
        regionName: province.name,
      };

      for (const platform of platforms) {
        const row = platformRegionCounts.find(
          (r) =>
            r.platform === platform && Number(r.regionId) === province.id,
        );
        entry[platform] = row ? Number(row.count) : 0;
      }

      return entry;
    });

    // Build coverage matrix: true/false if platform has data in province
    const coverageMatrix = provinces.map((province: ProvinceSelect) => {
      const entry: Record<string, string | boolean> = {
        regionCode: province.code,
        regionName: province.name,
      };

      for (const platform of platforms) {
        const row = platformRegionCounts.find(
          (r) =>
            r.platform === platform && Number(r.regionId) === province.id,
        );
        entry[platform] = row ? Number(row.count) > 0 : false;
      }

      return entry;
    });

    // Calculate coverage percentage per platform
    const totalProvinces = provinces.length;
    const coverageSummary: Record<string, number> = {};
    for (const platform of platforms) {
      const coveredCount = coverageMatrix.filter(
        (row: Record<string, string | boolean>) => row[platform] === true,
      ).length;
      coverageSummary[platform] =
        totalProvinces > 0
          ? Math.round((coveredCount / totalProvinces) * 100)
          : 0;
    }

    return NextResponse.json({
      platforms,
      provinces: provinces.map((p: ProvinceSelect) => ({
        code: p.code,
        name: p.name,
      })),
      comparisonData,
      coverageMatrix,
      coverageSummary,
    });
  } catch (error) {
    console.error('Error fetching comparison stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comparison statistics' },
      { status: 500 },
    );
  }
}
