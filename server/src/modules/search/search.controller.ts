import type { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  activities,
  clients,
  contacts,
  opportunities,
  prospects,
  quotes,
} from '../../db/schema';
import { ok } from '../../core/http';
import { searchAcross } from '../../core/query';
import { canSeeAllRecords, hasPermission } from '../../middlewares/auth';

export const globalSearchSchema = z.object({
  q: z.string().trim().min(2, 'Ingrese al menos 2 caracteres').max(120),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  link: string;
}

/**
 * Búsqueda global categorizada.
 * Cada bloque respeta los permisos y el alcance de cartera del usuario.
 */
export async function globalSearch(req: Request, res: Response): Promise<void> {
  const { q, limit } = req.query as unknown as z.infer<typeof globalSearchSchema>;
  const userId = req.user!.id;
  const groups: Array<{ type: string; label: string; items: SearchResult[] }> = [];

  if (hasPermission(req, 'clients.read')) {
    const scope = canSeeAllRecords(req, 'clients') ? undefined : or(eq(clients.ownerId, userId), isNull(clients.ownerId));
    const rows = await db
      .select({
        id: clients.id,
        code: clients.code,
        legalName: clients.legalName,
        tradeName: clients.tradeName,
        taxId: clients.taxId,
        status: clients.status,
      })
      .from(clients)
      .where(and(isNull(clients.deletedAt), searchAcross([clients.legalName, clients.tradeName, clients.taxId, clients.code, clients.email], q), scope))
      .limit(limit);

    groups.push({
      type: 'CLIENTE',
      label: 'Clientes',
      items: rows.map((r) => ({
        id: r.id,
        type: 'CLIENTE',
        title: r.legalName,
        subtitle: [r.tradeName, r.taxId].filter(Boolean).join(' · ') || null,
        badge: r.status,
        link: `/clientes/${r.id}`,
      })),
    });
  }

  if (hasPermission(req, 'prospects.read')) {
    const scope = canSeeAllRecords(req, 'prospects') ? undefined : or(eq(prospects.ownerId, userId), isNull(prospects.ownerId));
    const rows = await db
      .select({
        id: prospects.id,
        code: prospects.code,
        firstName: prospects.firstName,
        lastName: prospects.lastName,
        companyName: prospects.companyName,
        status: prospects.status,
      })
      .from(prospects)
      .where(and(isNull(prospects.deletedAt), searchAcross([prospects.firstName, prospects.lastName, prospects.companyName, prospects.email, prospects.code], q), scope))
      .limit(limit);

    groups.push({
      type: 'PROSPECTO',
      label: 'Prospectos',
      items: rows.map((r) => ({
        id: r.id,
        type: 'PROSPECTO',
        title: `${r.firstName} ${r.lastName ?? ''}`.trim(),
        subtitle: r.companyName,
        badge: r.status,
        link: `/prospectos/${r.id}`,
      })),
    });
  }

  if (hasPermission(req, 'contacts.read')) {
    const rows = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        position: contacts.position,
        clientId: contacts.clientId,
        clientName: clients.legalName,
      })
      .from(contacts)
      .innerJoin(clients, eq(contacts.clientId, clients.id))
      .where(and(isNull(contacts.deletedAt), isNull(clients.deletedAt), searchAcross([contacts.firstName, contacts.lastName, contacts.email, contacts.mobile], q)))
      .limit(limit);

    groups.push({
      type: 'CONTACTO',
      label: 'Contactos',
      items: rows.map((r) => ({
        id: r.id,
        type: 'CONTACTO',
        title: `${r.firstName} ${r.lastName}`,
        subtitle: [r.position, r.clientName].filter(Boolean).join(' · ') || null,
        badge: null,
        link: `/clientes/${r.clientId}`,
      })),
    });
  }

  if (hasPermission(req, 'opportunities.read')) {
    const scope = canSeeAllRecords(req, 'opportunities') ? undefined : or(eq(opportunities.ownerId, userId), isNull(opportunities.ownerId));
    const rows = await db
      .select({
        id: opportunities.id,
        code: opportunities.code,
        name: opportunities.name,
        amount: opportunities.amount,
        status: opportunities.status,
        clientName: clients.legalName,
      })
      .from(opportunities)
      .leftJoin(clients, eq(opportunities.clientId, clients.id))
      .where(and(isNull(opportunities.deletedAt), searchAcross([opportunities.name, opportunities.code], q), scope))
      .limit(limit);

    groups.push({
      type: 'OPORTUNIDAD',
      label: 'Oportunidades',
      items: rows.map((r) => ({
        id: r.id,
        type: 'OPORTUNIDAD',
        title: r.name,
        subtitle: [r.clientName, `$${r.amount}`].filter(Boolean).join(' · '),
        badge: r.status,
        link: `/oportunidades/${r.id}`,
      })),
    });
  }

  if (hasPermission(req, 'quotes.read')) {
    const scope = canSeeAllRecords(req, 'quotes') ? undefined : or(eq(quotes.ownerId, userId), isNull(quotes.ownerId));
    const rows = await db
      .select({
        id: quotes.id,
        number: quotes.number,
        total: quotes.total,
        status: quotes.status,
        clientName: clients.legalName,
      })
      .from(quotes)
      .innerJoin(clients, eq(quotes.clientId, clients.id))
      .where(and(isNull(quotes.deletedAt), searchAcross([quotes.number, clients.legalName], q), scope))
      .limit(limit);

    groups.push({
      type: 'COTIZACION',
      label: 'Cotizaciones',
      items: rows.map((r) => ({
        id: r.id,
        type: 'COTIZACION',
        title: r.number,
        subtitle: `${r.clientName} · $${r.total}`,
        badge: r.status,
        link: `/cotizaciones/${r.id}`,
      })),
    });
  }

  if (hasPermission(req, 'activities.read')) {
    const scope = canSeeAllRecords(req, 'activities') ? undefined : or(eq(activities.ownerId, userId), isNull(activities.ownerId));
    const rows = await db
      .select({
        id: activities.id,
        subject: activities.subject,
        status: activities.status,
        scheduledAt: activities.scheduledAt,
      })
      .from(activities)
      .where(and(isNull(activities.deletedAt), searchAcross([activities.subject, activities.description], q), scope))
      .limit(limit);

    groups.push({
      type: 'ACTIVIDAD',
      label: 'Actividades',
      items: rows.map((r) => ({
        id: r.id,
        type: 'ACTIVIDAD',
        title: r.subject,
        subtitle: r.scheduledAt.toLocaleString('es-EC'),
        badge: r.status,
        link: `/actividades/${r.id}`,
      })),
    });
  }

  const total = groups.reduce((acc, g) => acc + g.items.length, 0);
  ok(res, { query: q, total, groups: groups.filter((g) => g.items.length > 0) });
}

