import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { CompanyProfile, CurrencyConfig } from './settings.service';

export interface QuotePdfItem {
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxPct: string;
  lineTotal: string;
}

export interface QuotePdfData {
  number: string;
  issueDate: Date;
  validUntil: Date;
  status: string;
  currency: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  terms: string | null;
  ownerName: string | null;
  client: {
    legalName: string;
    tradeName: string | null;
    taxId: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
  };
  contact: { name: string; email: string | null; phone: string | null } | null;
  items: QuotePdfItem[];
}

const COLORS = {
  primary: '#1e293b',
  accent: '#4f46e5',
  muted: '#64748b',
  line: '#e2e8f0',
  zebra: '#f8fafc',
};

function formatMoney(value: string | number, currency: CurrencyConfig): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return `${currency.symbol}${n.toLocaleString(currency.locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** Resuelve la ruta del logo si fue cargado en el almacenamiento local. */
function resolveLogoPath(logoUrl: string): string | null {
  if (!logoUrl) return null;
  const key = logoUrl.replace(/^\/?api\/documents\/raw\//, '').replace(/^\/+/, '');
  const candidate = path.resolve(env.storageDir, key);
  if (!candidate.startsWith(path.resolve(env.storageDir))) return null;
  return fs.existsSync(candidate) ? candidate : null;
}

/** Genera el PDF profesional de una cotización y lo escribe en la respuesta. */
export function streamQuotePdf(
  res: Response,
  data: QuotePdfData,
  company: CompanyProfile,
  currency: CurrencyConfig,
): void {
  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${data.number}.pdf"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentWidth = right - left;

  // --- Encabezado -----------------------------------------------------------
  const logoPath = resolveLogoPath(company.logoUrl);
  let headerTextX = left;
  if (logoPath) {
    try {
      doc.image(logoPath, left, 40, { fit: [110, 55] });
      headerTextX = left + 125;
    } catch (err) {
      logger.warn({ err }, 'No se pudo incrustar el logo en el PDF');
    }
  }

  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(16).text(company.name, headerTextX, 42);
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(COLORS.muted)
    .text(company.legalName, headerTextX)
    .text(`RUC: ${company.taxId}`, headerTextX)
    .text(`${company.address}${company.city ? ` · ${company.city}` : ''}`, headerTextX)
    .text(`${company.phone} · ${company.email}`, headerTextX)
    .text(company.website, headerTextX);

  // Bloque del número de cotización
  const boxWidth = 175;
  const boxX = right - boxWidth;
  doc.roundedRect(boxX, 42, boxWidth, 74, 6).fill(COLORS.accent);
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('COTIZACIÓN', boxX, 52, { width: boxWidth, align: 'center' });
  doc.fontSize(14).text(data.number, boxX, 70, { width: boxWidth, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(8)
    .text(`Emisión: ${formatDate(data.issueDate)}`, boxX, 90, { width: boxWidth, align: 'center' })
    .text(`Válida hasta: ${formatDate(data.validUntil)}`, boxX, 101, {
      width: boxWidth,
      align: 'center',
    });

  doc.moveTo(left, 132).lineTo(right, 132).strokeColor(COLORS.line).lineWidth(1).stroke();

  // --- Datos del cliente ----------------------------------------------------
  let y = 146;
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(10).text('CLIENTE', left, y);
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.primary);
  y += 15;
  doc.text(data.client.legalName, left, y, { width: contentWidth / 2 - 10 });
  y += 12;
  const clientLines = [
    data.client.tradeName ? `Nombre comercial: ${data.client.tradeName}` : null,
    data.client.taxId ? `Identificación: ${data.client.taxId}` : null,
    data.client.address,
    data.client.city,
    data.client.phone,
    data.client.email,
  ].filter((v): v is string => Boolean(v));

  doc.fillColor(COLORS.muted).fontSize(8.5);
  for (const line of clientLines) {
    doc.text(line, left, y, { width: contentWidth / 2 - 10 });
    y += 11;
  }

  // Contacto y responsable a la derecha
  let ry = 161;
  const rightX = left + contentWidth / 2 + 10;
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(10).text('CONTACTO', rightX, 146);
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
  const contactLines = [
    data.contact?.name ?? 'No especificado',
    data.contact?.email ?? null,
    data.contact?.phone ?? null,
    data.ownerName ? `Ejecutivo: ${data.ownerName}` : null,
  ].filter((v): v is string => Boolean(v));
  for (const line of contactLines) {
    doc.text(line, rightX, ry, { width: contentWidth / 2 - 10 });
    ry += 11;
  }

  y = Math.max(y, ry) + 14;

  // --- Tabla de ítems -------------------------------------------------------
  const columns = [
    { key: 'description', label: 'Descripción', width: contentWidth - 290, align: 'left' as const },
    { key: 'quantity', label: 'Cant.', width: 45, align: 'right' as const },
    { key: 'unitPrice', label: 'P. unit.', width: 70, align: 'right' as const },
    { key: 'discountPct', label: 'Desc.%', width: 50, align: 'right' as const },
    { key: 'taxPct', label: 'Imp.%', width: 45, align: 'right' as const },
    { key: 'lineTotal', label: 'Total', width: 80, align: 'right' as const },
  ];

  const drawTableHeader = (top: number): number => {
    doc.rect(left, top, contentWidth, 22).fill(COLORS.primary);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
    let x = left + 6;
    for (const column of columns) {
      doc.text(column.label, x, top + 7, { width: column.width - 12, align: column.align });
      x += column.width;
    }
    return top + 22;
  };

  y = drawTableHeader(y);

  doc.font('Helvetica').fontSize(8.5);
  let zebra = false;
  for (const item of data.items) {
    const descHeight = doc.heightOfString(item.description, { width: columns[0]!.width - 12 });
    const rowHeight = Math.max(20, descHeight + 10);

    if (y + rowHeight > doc.page.height - 150) {
      doc.addPage();
      y = drawTableHeader(doc.page.margins.top);
      doc.font('Helvetica').fontSize(8.5);
    }

    if (zebra) doc.rect(left, y, contentWidth, rowHeight).fill(COLORS.zebra);
    zebra = !zebra;

    doc.fillColor(COLORS.primary);
    const values: Record<string, string> = {
      description: item.description,
      quantity: Number(item.quantity).toLocaleString(currency.locale, { maximumFractionDigits: 2 }),
      unitPrice: formatMoney(item.unitPrice, currency),
      discountPct: `${Number(item.discountPct).toFixed(2)}%`,
      taxPct: `${Number(item.taxPct).toFixed(2)}%`,
      lineTotal: formatMoney(item.lineTotal, currency),
    };

    let x = left + 6;
    for (const column of columns) {
      doc.text(values[column.key] ?? '', x, y + 6, {
        width: column.width - 12,
        align: column.align,
      });
      x += column.width;
    }
    y += rowHeight;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(COLORS.line).lineWidth(0.5).stroke();
  }

  // --- Totales --------------------------------------------------------------
  y += 12;
  if (y > doc.page.height - 190) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  const totalsWidth = 230;
  const totalsX = right - totalsWidth;
  const totalRows: Array<[string, string, boolean]> = [
    ['Subtotal', formatMoney(data.subtotal, currency), false],
    ['Descuentos', `- ${formatMoney(data.discountTotal, currency)}`, false],
    ['Impuestos', formatMoney(data.taxTotal, currency), false],
    ['TOTAL', formatMoney(data.total, currency), true],
  ];

  for (const [label, value, strong] of totalRows) {
    if (strong) {
      doc.rect(totalsX, y - 3, totalsWidth, 24).fill(COLORS.accent);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11);
    } else {
      doc.fillColor(COLORS.primary).font('Helvetica').fontSize(9);
    }
    doc.text(label, totalsX + 10, y + (strong ? 3 : 0), { width: 110, align: 'left' });
    doc.text(value, totalsX + 120, y + (strong ? 3 : 0), { width: totalsWidth - 130, align: 'right' });
    y += strong ? 28 : 16;
  }

  // --- Condiciones y notas --------------------------------------------------
  y += 6;
  if (data.notes) {
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9).text('Observaciones', left, y);
    y += 13;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(data.notes, left, y, { width: contentWidth - totalsWidth - 20 });
    y = doc.y + 8;
  }
  if (data.terms) {
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9).text('Condiciones comerciales', left, y);
    y += 13;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(data.terms, left, y, { width: contentWidth });
  }

  // --- Pie de página con numeración ----------------------------------------
  // Se calcula tras generar todo el contenido para conocer el total de páginas.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Se anula temporalmente el margen inferior: escribir en la zona de pie
    // no debe provocar el salto automático a una página nueva.
    const previousBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - 46;
    doc.moveTo(left, footerY - 8).lineTo(right, footerY - 8).strokeColor(COLORS.line).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted);
    // lineBreak:false evita que el pie desborde y genere páginas adicionales.
    doc.text(`${company.legalName} · ${company.email} · ${company.phone}`, left, footerY, {
      width: contentWidth * 0.7,
      align: 'left',
      lineBreak: false,
      ellipsis: true,
    });
    doc.text(`Página ${i - range.start + 1} de ${range.count}`, left + contentWidth * 0.7, footerY, {
      width: contentWidth * 0.3,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = previousBottom;
  }

  doc.flushPages();

  doc.end();
}
