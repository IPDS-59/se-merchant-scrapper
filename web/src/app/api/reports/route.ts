import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

type ReportTemplate = 'rekap-wilayah' | 'rekap-platform' | 'detail-merchant';

interface RegionMerchantCount {
  code: string;
  name: string;
  level: string;
  count: bigint;
}

interface PlatformStat {
  platform: string;
  count: bigint;
  avg_rating: number | null;
  avg_products: number | null;
  avg_monthly_sales: number | null;
}

interface MerchantWithRegion {
  id: number;
  name: string;
  platform: string;
  address: string | null;
  category: string | null;
  phone: string | null;
  rating: number | null;
  productCount: number | null;
  monthlySales: number | null;
  totalTransactions: number | null;
  ownerName: string | null;
  region: { id: number; code: string; name: string; level: string } | null;
}

function buildRegionWhere(
  provinceCode: string | null,
  regencyCode: string | null,
  districtCode: string | null,
): Prisma.MerchantWhereInput {
  const where: Prisma.MerchantWhereInput = {};
  if (districtCode) {
    where.region = { code: districtCode };
  } else if (regencyCode) {
    where.region = { code: regencyCode };
  } else if (provinceCode) {
    where.region = { code: provinceCode };
  }
  return where;
}

async function getRekapWilayah(
  provinceCode: string | null,
  platform: string | null,
) {
  const platformFilter = platform && platform !== 'all'
    ? Prisma.sql`AND m.platform = ${platform}`
    : Prisma.empty;

  if (provinceCode) {
    // Show regency breakdown for a specific province
    const rows = await prisma.$queryRaw<RegionMerchantCount[]>`
      SELECT r2.code, r2.name, r2.level, COUNT(m.id) as count
      FROM Region r
      JOIN Region r2 ON r2.parentId = r.id
      LEFT JOIN Merchant m ON m.regionId = r2.id ${platformFilter}
      WHERE r.code = ${provinceCode} AND r.level = 'province'
      GROUP BY r2.id, r2.code, r2.name, r2.level
      ORDER BY count DESC
    `;

    return rows.map((r: RegionMerchantCount) => ({
      code: r.code,
      name: r.name,
      level: r.level,
      count: Number(r.count),
    }));
  }

  // Show province breakdown
  const rows = await prisma.$queryRaw<RegionMerchantCount[]>`
    SELECT r.code, r.name, r.level, COUNT(m.id) as count
    FROM Region r
    LEFT JOIN Merchant m ON m.regionId = r.id ${platformFilter}
    WHERE r.level = 'province'
    GROUP BY r.id, r.code, r.name, r.level
    ORDER BY count DESC
  `;

  return rows.map((r: RegionMerchantCount) => ({
    code: r.code,
    name: r.name,
    level: r.level,
    count: Number(r.count),
  }));
}

async function getRekapPlatform(
  provinceCode: string | null,
  regencyCode: string | null,
  districtCode: string | null,
) {
  const regionConditions: Prisma.Sql[] = [];

  if (districtCode) {
    regionConditions.push(Prisma.sql`r.code = ${districtCode}`);
  } else if (regencyCode) {
    regionConditions.push(Prisma.sql`r.code = ${regencyCode}`);
  } else if (provinceCode) {
    regionConditions.push(Prisma.sql`r.code = ${provinceCode}`);
  }

  const whereClause = regionConditions.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(regionConditions, ' AND ')}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<PlatformStat[]>`
    SELECT
      m.platform,
      COUNT(m.id) as count,
      AVG(m.rating) as avg_rating,
      AVG(m.productCount) as avg_products,
      AVG(m.monthlySales) as avg_monthly_sales
    FROM Merchant m
    LEFT JOIN Region r ON m.regionId = r.id
    ${whereClause}
    GROUP BY m.platform
    ORDER BY count DESC
  `;

  return rows.map((r: PlatformStat) => ({
    platform: r.platform,
    count: Number(r.count),
    avgRating: r.avg_rating ? Number(Number(r.avg_rating).toFixed(2)) : null,
    avgProducts: r.avg_products ? Math.round(Number(r.avg_products)) : null,
    avgMonthlySales: r.avg_monthly_sales
      ? Math.round(Number(r.avg_monthly_sales))
      : null,
  }));
}

async function getDetailMerchant(
  provinceCode: string | null,
  regencyCode: string | null,
  districtCode: string | null,
  platform: string | null,
) {
  const where: Prisma.MerchantWhereInput = buildRegionWhere(
    provinceCode,
    regencyCode,
    districtCode,
  );

  if (platform && platform !== 'all') {
    where.platform = platform as Prisma.EnumPlatformFilter['equals'];
  }

  const merchants = await prisma.merchant.findMany({
    where,
    include: {
      region: {
        select: { id: true, code: true, name: true, level: true },
      },
    },
    orderBy: { name: 'asc' },
    take: 5000,
  });

  return (merchants as MerchantWithRegion[]).map((m: MerchantWithRegion) => ({
    id: m.id,
    name: m.name,
    platform: m.platform,
    address: m.address,
    category: m.category,
    phone: m.phone,
    rating: m.rating,
    productCount: m.productCount,
    monthlySales: m.monthlySales,
    totalTransactions: m.totalTransactions,
    ownerName: m.ownerName,
    region: m.region?.name ?? '-',
    regionCode: m.region?.code ?? '-',
  }));
}

function applyBpsHeaderStyle(row: ExcelJS.Row, colCount: number) {
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, size: 11, name: 'Arial' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    cell.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  }
  row.height = 30;
}

function applyBpsDataStyle(row: ExcelJS.Row, colCount: number) {
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font = { size: 10, name: 'Arial' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    };
    cell.alignment = { vertical: 'middle' };
  }
}

async function generateExcel(
  template: ReportTemplate,
  data: Record<string, unknown>[],
  title: string,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BPS Sensus Ekonomi';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Laporan', {
    properties: { defaultColWidth: 18 },
  });

  // Title rows (BPS-style header block)
  const titleRow = sheet.addRow([title]);
  titleRow.font = { bold: true, size: 14, name: 'Arial' };
  const subtitleRow = sheet.addRow([
    `Tanggal cetak: ${new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`,
  ]);
  subtitleRow.font = { size: 10, name: 'Arial', italic: true };
  sheet.addRow([]); // Blank spacer

  if (template === 'rekap-wilayah') {
    const columns = ['No', 'Kode Wilayah', 'Nama Wilayah', 'Jumlah Merchant'];
    const headerRow = sheet.addRow(columns);
    applyBpsHeaderStyle(headerRow, columns.length);

    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 15;
    sheet.getColumn(3).width = 35;
    sheet.getColumn(4).width = 20;

    let total = 0;
    data.forEach((item, idx) => {
      const row = sheet.addRow([
        idx + 1,
        item.code,
        item.name,
        item.count,
      ]);
      applyBpsDataStyle(row, columns.length);
      row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
      total += (item.count as number) || 0;
    });

    // Total row
    const totalRow = sheet.addRow(['', '', 'TOTAL', total]);
    for (let i = 1; i <= columns.length; i++) {
      const cell = totalRow.getCell(i);
      cell.font = { bold: true, size: 11, name: 'Arial' };
      cell.border = {
        top: { style: 'double' },
        bottom: { style: 'double' },
      };
    }
    totalRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
  } else if (template === 'rekap-platform') {
    const columns = [
      'No',
      'Platform',
      'Jumlah Merchant',
      'Rata-rata Rating',
      'Rata-rata Produk',
      'Rata-rata Penjualan/Bulan',
    ];
    const headerRow = sheet.addRow(columns);
    applyBpsHeaderStyle(headerRow, columns.length);

    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 20;
    sheet.getColumn(3).width = 18;
    sheet.getColumn(4).width = 18;
    sheet.getColumn(5).width = 18;
    sheet.getColumn(6).width = 25;

    let totalCount = 0;
    data.forEach((item, idx) => {
      const row = sheet.addRow([
        idx + 1,
        String(item.platform).charAt(0).toUpperCase() +
          String(item.platform).slice(1),
        item.count,
        item.avgRating ?? '-',
        item.avgProducts ?? '-',
        item.avgMonthlySales ?? '-',
      ]);
      applyBpsDataStyle(row, columns.length);
      for (let c = 3; c <= 6; c++) {
        row.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' };
      }
      totalCount += (item.count as number) || 0;
    });

    const totalRow = sheet.addRow(['', 'TOTAL', totalCount, '', '', '']);
    for (let i = 1; i <= columns.length; i++) {
      const cell = totalRow.getCell(i);
      cell.font = { bold: true, size: 11, name: 'Arial' };
      cell.border = {
        top: { style: 'double' },
        bottom: { style: 'double' },
      };
    }
  } else if (template === 'detail-merchant') {
    const columns = [
      'No',
      'Nama Merchant',
      'Platform',
      'Wilayah',
      'Alamat',
      'Kategori',
      'Telepon',
      'Rating',
      'Jumlah Produk',
      'Penjualan/Bulan',
      'Total Transaksi',
      'Pemilik',
    ];
    const headerRow = sheet.addRow(columns);
    applyBpsHeaderStyle(headerRow, columns.length);

    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 30;
    sheet.getColumn(3).width = 14;
    sheet.getColumn(4).width = 25;
    sheet.getColumn(5).width = 40;
    sheet.getColumn(6).width = 20;
    sheet.getColumn(7).width = 16;
    sheet.getColumn(8).width = 10;
    sheet.getColumn(9).width = 14;
    sheet.getColumn(10).width = 18;
    sheet.getColumn(11).width = 16;
    sheet.getColumn(12).width = 20;

    data.forEach((item, idx) => {
      const row = sheet.addRow([
        idx + 1,
        item.name,
        String(item.platform).charAt(0).toUpperCase() +
          String(item.platform).slice(1),
        item.region,
        item.address ?? '-',
        item.category ?? '-',
        item.phone ?? '-',
        item.rating ?? '-',
        item.productCount ?? '-',
        item.monthlySales ?? '-',
        item.totalTransactions ?? '-',
        item.ownerName ?? '-',
      ]);
      applyBpsDataStyle(row, columns.length);
    });

    // Summary row
    const summaryRow = sheet.addRow([
      '',
      `Total: ${data.length} merchant`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    summaryRow.getCell(2).font = { bold: true, size: 10, name: 'Arial', italic: true };
  }

  // Footer
  sheet.addRow([]);
  const footerRow = sheet.addRow(['Sumber: Sensus Ekonomi - Merchant Scraper']);
  footerRow.font = { size: 9, name: 'Arial', italic: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

function generateCsv(
  template: ReportTemplate,
  data: Record<string, unknown>[],
): string {
  if (template === 'rekap-wilayah') {
    const header = 'No,Kode Wilayah,Nama Wilayah,Jumlah Merchant';
    const rows = data.map(
      (item, idx) =>
        `${idx + 1},"${item.code}","${item.name}",${item.count}`,
    );
    return [header, ...rows].join('\n');
  }

  if (template === 'rekap-platform') {
    const header =
      'No,Platform,Jumlah Merchant,Rata-rata Rating,Rata-rata Produk,Rata-rata Penjualan/Bulan';
    const rows = data.map(
      (item, idx) =>
        `${idx + 1},"${item.platform}",${item.count},${item.avgRating ?? ''},${item.avgProducts ?? ''},${item.avgMonthlySales ?? ''}`,
    );
    return [header, ...rows].join('\n');
  }

  // detail-merchant
  const header =
    'No,Nama Merchant,Platform,Wilayah,Alamat,Kategori,Telepon,Rating,Jumlah Produk,Penjualan/Bulan,Total Transaksi,Pemilik';
  const rows = data.map(
    (item, idx) =>
      `${idx + 1},"${item.name}","${item.platform}","${item.region}","${(item.address as string)?.replace(/"/g, '""') ?? ''}","${item.category ?? ''}","${item.phone ?? ''}",${item.rating ?? ''},${item.productCount ?? ''},${item.monthlySales ?? ''},${item.totalTransactions ?? ''},"${item.ownerName ?? ''}"`,
  );
  return [header, ...rows].join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const template = searchParams.get('template') as ReportTemplate | null;
    const provinceCode = searchParams.get('provinceCode');
    const regencyCode = searchParams.get('regencyCode');
    const districtCode = searchParams.get('districtCode');
    const platform = searchParams.get('platform');
    const format = searchParams.get('format'); // 'xlsx', 'csv', or null (JSON)

    if (!template) {
      return NextResponse.json(
        { error: 'template parameter is required (rekap-wilayah, rekap-platform, detail-merchant)' },
        { status: 400 },
      );
    }

    const validTemplates: ReportTemplate[] = [
      'rekap-wilayah',
      'rekap-platform',
      'detail-merchant',
    ];
    if (!validTemplates.includes(template)) {
      return NextResponse.json(
        { error: `Invalid template. Must be one of: ${validTemplates.join(', ')}` },
        { status: 400 },
      );
    }

    let data: Record<string, unknown>[];
    let title: string;

    switch (template) {
      case 'rekap-wilayah':
        data = await getRekapWilayah(provinceCode, platform);
        title = provinceCode
          ? 'Rekap Merchant per Kabupaten/Kota'
          : 'Rekap Merchant per Provinsi';
        break;
      case 'rekap-platform':
        data = await getRekapPlatform(provinceCode, regencyCode, districtCode);
        title = 'Rekap Merchant per Platform';
        break;
      case 'detail-merchant':
        data = await getDetailMerchant(
          provinceCode,
          regencyCode,
          districtCode,
          platform,
        );
        title = 'Detail Data Merchant';
        break;
      default:
        data = [];
        title = 'Laporan';
    }

    if (format === 'xlsx') {
      const buffer = await generateExcel(template, data, title);
      const filename = `${template}_${new Date().toISOString().slice(0, 10)}.xlsx`;

      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    if (format === 'csv') {
      const csv = generateCsv(template, data);
      const filename = `${template}_${new Date().toISOString().slice(0, 10)}.csv`;

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Default: return JSON for preview
    return NextResponse.json({
      template,
      title,
      data,
      total: data.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 },
    );
  }
}
