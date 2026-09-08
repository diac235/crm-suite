import type { Response } from 'express';
import ExcelJS from 'exceljs';

export interface ExportColumn<T> {
  header: string;
  key: string;
  width?: number;
  value?: (row: T) => unknown;
}

function cellValue<T>(row: T, column: ExportColumn<T>): unknown {
  const raw = column.value ? column.value(row) : (row as Record<string, unknown>)[column.key];
  if (raw === null || raw === undefined) return '';
  if (raw instanceof Date) return raw;
  return raw;
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').slice(0, 80);
}

/** Genera y envía un archivo Excel con formato de tabla profesional. */
export async function sendExcel<T>(
  res: Response,
  fileName: string,
  sheetName: string,
  columns: ExportColumn<T>[],
  rows: T[],
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CRM Suite';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? Math.max(14, c.header.length + 4),
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 22;

  for (const row of rows) {
    const record: Record<string, unknown> = {};
    for (const column of columns) record[column.key] = cellValue(row, column);
    sheet.addRow(record);
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(fileName)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  // Neutraliza fórmulas para evitar inyección CSV al abrir en Excel.
  const guarded = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Genera y envía un CSV con BOM UTF-8 (compatible con Excel en español). */
export function sendCsv<T>(
  res: Response,
  fileName: string,
  columns: ExportColumn<T>[],
  rows: T[],
): void {
  const lines: string[] = [];
  lines.push(columns.map((c) => escapeCsv(c.header)).join(';'));
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsv(cellValue(row, c))).join(';'));
  }
  const body = `﻿${lines.join('\r\n')}`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(fileName)}.csv"`);
  res.send(body);
}

export type ExportFormat = 'xlsx' | 'csv';

export async function sendExport<T>(
  res: Response,
  format: ExportFormat,
  fileName: string,
  sheetName: string,
  columns: ExportColumn<T>[],
  rows: T[],
): Promise<void> {
  if (format === 'csv') {
    sendCsv(res, fileName, columns, rows);
    return;
  }
  await sendExcel(res, fileName, sheetName, columns, rows);
}
