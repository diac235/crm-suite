import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { clients, documents, opportunities, prospects, quotes, users } from '../../db/schema';
import { BadRequestError, NotFoundError } from '../../core/errors';
import { noContent, ok, paginated } from '../../core/http';
import { buildMeta, offsetOf, resolveSort } from '../../core/pagination';
import { combine, searchAcross } from '../../core/query';
import { recordAudit } from '../../services/audit.service';
import {
  computeChecksum,
  deleteFileQuietly,
  resolveStoragePath,
  safeDownloadName,
  toStorageKey,
  verifyMagicNumber,
} from '../../services/storage.service';
import { assertRelatedOwnership, relatedOwnershipScope } from '../../core/scope';
import { ForbiddenError } from '../../core/errors';
import { canSeeAllRecords } from '../../middlewares/auth';
import type { ListDocumentsQuery } from './documents.schema';

const SORTABLE = {
  name: documents.name,
  category: documents.category,
  sizeBytes: documents.sizeBytes,
  createdAt: documents.createdAt,
} as const;

const selection = {
  id: documents.id,
  name: documents.name,
  originalName: documents.originalName,
  mimeType: documents.mimeType,
  sizeBytes: documents.sizeBytes,
  category: documents.category,
  createdAt: documents.createdAt,
  clientId: documents.clientId,
  clientName: clients.legalName,
  prospectId: documents.prospectId,
  prospectName: sql<string | null>`NULLIF(TRIM(CONCAT(${prospects.firstName}, ' ', ${prospects.lastName})), '')`,
  opportunityId: documents.opportunityId,
  opportunityName: opportunities.name,
  quoteId: documents.quoteId,
  quoteNumber: quotes.number,
  uploadedById: documents.uploadedById,
  uploadedByName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
};

function baseQuery() {
  return db
    .select(selection)
    .from(documents)
    .leftJoin(clients, eq(documents.clientId, clients.id))
    .leftJoin(prospects, eq(documents.prospectId, prospects.id))
    .leftJoin(opportunities, eq(documents.opportunityId, opportunities.id))
    .leftJoin(quotes, eq(documents.quoteId, quotes.id))
    .leftJoin(users, eq(documents.uploadedById, users.id));
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListDocumentsQuery;
  const conditions = [isNull(documents.deletedAt)];
  if (query.category) conditions.push(eq(documents.category, query.category));
  if (query.clientId) conditions.push(eq(documents.clientId, query.clientId));
  if (query.prospectId) conditions.push(eq(documents.prospectId, query.prospectId));
  if (query.opportunityId) conditions.push(eq(documents.opportunityId, query.opportunityId));
  if (query.quoteId) conditions.push(eq(documents.quoteId, query.quoteId));

  // Un ejecutivo solo ve documentos de registros de su cartera.
  const scope = relatedOwnershipScope(req, 'documents', {
    clientId: documents.clientId,
    prospectId: documents.prospectId,
    opportunityId: documents.opportunityId,
  });
  if (scope) conditions.push(scope);

  const where = combine(...conditions, searchAcross([documents.name, documents.originalName], query.search));
  const column = resolveSort(SORTABLE, query.sortBy, 'createdAt');
  const orderBy = query.sortDir === 'asc' ? asc(column) : desc(column);

  const [rows, [total]] = await Promise.all([
    baseQuery().where(where).orderBy(orderBy).limit(query.pageSize).offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(documents).where(where),
  ]);

  paginated(res, rows, buildMeta(query.page, query.pageSize, total?.value ?? 0));
}

async function assertOwnerEntityExists(input: {
  clientId?: string | null;
  prospectId?: string | null;
  opportunityId?: string | null;
  quoteId?: string | null;
}): Promise<void> {
  if (input.clientId) {
    const [row] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, input.clientId), isNull(clients.deletedAt))).limit(1);
    if (!row) throw new BadRequestError('El cliente indicado no existe');
  }
  if (input.prospectId) {
    const [row] = await db.select({ id: prospects.id }).from(prospects).where(and(eq(prospects.id, input.prospectId), isNull(prospects.deletedAt))).limit(1);
    if (!row) throw new BadRequestError('El prospecto indicado no existe');
  }
  if (input.opportunityId) {
    const [row] = await db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.id, input.opportunityId), isNull(opportunities.deletedAt))).limit(1);
    if (!row) throw new BadRequestError('La oportunidad indicada no existe');
  }
  if (input.quoteId) {
    const [row] = await db.select({ id: quotes.id }).from(quotes).where(and(eq(quotes.id, input.quoteId), isNull(quotes.deletedAt))).limit(1);
    if (!row) throw new BadRequestError('La cotización indicada no existe');
  }
}

export async function upload(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) throw new BadRequestError('No se recibió ningún archivo');

  const input = req.body as {
    name?: string | null;
    category: (typeof documents.category.enumValues)[number];
    clientId?: string | null;
    prospectId?: string | null;
    opportunityId?: string | null;
    quoteId?: string | null;
  };

  try {
    // Verificación del contenido real del archivo frente al MIME declarado.
    if (!verifyMagicNumber(file.path, file.mimetype)) {
      throw new BadRequestError('El contenido del archivo no corresponde con su tipo declarado');
    }
    await assertOwnerEntityExists(input);
    await assertRelatedOwnership(req, 'documents', input);

    const storageKey = toStorageKey(file.path);
    const [created] = await db
      .insert(documents)
      .values({
        name: input.name?.trim() || path.parse(file.originalname).name.slice(0, 200),
        originalName: file.originalname.slice(0, 255),
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        category: input.category,
        checksum: computeChecksum(file.path),
        clientId: input.clientId ?? null,
        prospectId: input.prospectId ?? null,
        opportunityId: input.opportunityId ?? null,
        quoteId: input.quoteId ?? null,
        uploadedById: req.user!.id,
      })
      .returning();

    await recordAudit({
      req, action: 'CREATE', entityType: 'DOCUMENT', entityId: created!.id,
      entityLabel: created!.name, module: 'documents',
      after: { nombre: created!.name, tamano: created!.sizeBytes, tipo: created!.mimeType },
    });

    ok(res, created, 201);
  } catch (error) {
    // Si algo falla tras guardar el archivo, se elimina para no dejar basura.
    fs.promises.unlink(file.path).catch(() => undefined);
    throw error;
  }
}

async function findOrFail(id: string) {
  const [row] = await db.select().from(documents).where(and(eq(documents.id, id), isNull(documents.deletedAt))).limit(1);
  if (!row) throw new NotFoundError('Documento no encontrado');
  return row;
}

/** Comprueba que el documento pertenezca a un registro de la cartera del usuario. */
async function assertCanAccess(req: Request, document: { clientId: string | null; prospectId: string | null; opportunityId: string | null }): Promise<void> {
  if (canSeeAllRecords(req, 'documents')) return;
  const userId = req.user!.id;

  if (document.clientId) {
    const [row] = await db.select({ ownerId: clients.ownerId }).from(clients).where(eq(clients.id, document.clientId)).limit(1);
    if (row?.ownerId && row.ownerId !== userId) throw new ForbiddenError('El documento pertenece a otro ejecutivo');
    return;
  }
  if (document.prospectId) {
    const [row] = await db.select({ ownerId: prospects.ownerId }).from(prospects).where(eq(prospects.id, document.prospectId)).limit(1);
    if (row?.ownerId && row.ownerId !== userId) throw new ForbiddenError('El documento pertenece a otro ejecutivo');
    return;
  }
  if (document.opportunityId) {
    const [row] = await db.select({ ownerId: opportunities.ownerId }).from(opportunities).where(eq(opportunities.id, document.opportunityId)).limit(1);
    if (row?.ownerId && row.ownerId !== userId) throw new ForbiddenError('El documento pertenece a otro ejecutivo');
  }
}

export async function download(req: Request, res: Response): Promise<void> {
  const document = await findOrFail(req.params.id!);
  await assertCanAccess(req, document);
  const filePath = resolveStoragePath(document.storageKey);

  if (!fs.existsSync(filePath)) {
    throw new NotFoundError('El archivo ya no está disponible en el almacenamiento');
  }

  await recordAudit({
    req, action: 'DOWNLOAD', entityType: 'DOCUMENT', entityId: document.id,
    entityLabel: document.name, module: 'documents',
  });

  const inline = req.query.inline === 'true' && /^(image\/|application\/pdf)/.test(document.mimeType);
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${safeDownloadName(document.originalName)}"`,
  );
  fs.createReadStream(filePath).pipe(res);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const document = await findOrFail(req.params.id!);
  await assertCanAccess(req, document);
  await db.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, document.id));
  deleteFileQuietly(document.storageKey);

  await recordAudit({
    req, action: 'DELETE', entityType: 'DOCUMENT', entityId: document.id,
    entityLabel: document.name, module: 'documents', before: { nombre: document.name },
  });

  noContent(res);
}
