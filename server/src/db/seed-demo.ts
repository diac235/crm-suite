import { eq } from 'drizzle-orm';
import { db } from './index';
import {
  activities,
  activityTypes,
  clients,
  contacts,
  opportunities,
  opportunityStageHistory,
  pipelineStages,
  products,
  prospectSources,
  prospects,
  quoteItems,
  quotes,
  saleItems,
  sales,
  sectors,
  taxRates,
  tasks,
  users,
} from './schema';
import { hashPassword } from '../modules/auth/auth.service';
import { SYSTEM_ROLES } from '../core/permissions';
import { computeLine, sumTotals } from '../core/money';
import { formatCode, formatYearlyCode, nextSequence } from '../core/sequence';
import { logger } from '../config/logger';

function daysFrom(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}

/**
 * Datos comerciales de ejemplo para validar el sistema de extremo a extremo.
 * Solo se ejecuta cuando SEED_DEMO_DATA=true y la base está vacía de clientes.
 */
export async function seedDemoData(adminId: string, roleMap: Map<string, string>): Promise<void> {
  const existing = await db.select({ id: clients.id }).from(clients).limit(1);
  if (existing.length > 0) {
    logger.info('Datos de ejemplo omitidos: ya existen clientes');
    return;
  }

  const now = new Date();
  const sectorRows = await db.select().from(sectors);
  const sourceRows = await db.select().from(prospectSources);
  const stageRows = await db.select().from(pipelineStages).orderBy(pipelineStages.order);
  const typeRows = await db.select().from(activityTypes);
  const [defaultTax] = await db.select().from(taxRates).where(eq(taxRates.isDefault, true)).limit(1);

  const stageByName = new Map(stageRows.map((s) => [s.name, s]));
  const typeByCode = new Map(typeRows.map((t) => [t.code, t]));

  // --- Usuarios comerciales -------------------------------------------------
  const password = await hashPassword('Comercial*2026');
  const demoUsers = [
    {
      email: 'gerencia@crm.local',
      firstName: 'María',
      lastName: 'Vélez',
      position: 'Gerente Comercial',
      roleId: roleMap.get(SYSTEM_ROLES.ADMIN)!,
    },
    {
      email: 'ejecutivo1@crm.local',
      firstName: 'Carlos',
      lastName: 'Andrade',
      position: 'Ejecutivo de Ventas',
      roleId: roleMap.get(SYSTEM_ROLES.USUARIO)!,
    },
    {
      email: 'ejecutivo2@crm.local',
      firstName: 'Lucía',
      lastName: 'Moreno',
      position: 'Ejecutiva de Ventas',
      roleId: roleMap.get(SYSTEM_ROLES.USUARIO)!,
    },
  ];

  const insertedUsers = await db
    .insert(users)
    .values(
      demoUsers.map((u) => ({
        ...u,
        passwordHash: password,
        isActive: true,
        mustChangePassword: false,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: users.id, email: users.email });

  const sellerIds = [adminId, ...insertedUsers.map((u) => u.id)];

  // --- Productos ------------------------------------------------------------
  const productSeed = [
    { sku: 'SRV-001', name: 'Consultoría de procesos', unit: 'HORA', price: '65.00', category: 'Servicios' },
    { sku: 'SRV-002', name: 'Implementación de software', unit: 'PROYECTO', price: '4500.00', category: 'Servicios' },
    { sku: 'SRV-003', name: 'Soporte técnico mensual', unit: 'MES', price: '320.00', category: 'Servicios' },
    { sku: 'LIC-001', name: 'Licencia anual plataforma', unit: 'LICENCIA', price: '1200.00', category: 'Licencias' },
    { sku: 'LIC-002', name: 'Licencia adicional usuario', unit: 'LICENCIA', price: '180.00', category: 'Licencias' },
    { sku: 'EQP-001', name: 'Servidor de aplicaciones', unit: 'UNIDAD', price: '2800.00', category: 'Equipos' },
    { sku: 'EQP-002', name: 'Estación de trabajo', unit: 'UNIDAD', price: '950.00', category: 'Equipos' },
    { sku: 'CAP-001', name: 'Capacitación presencial', unit: 'JORNADA', price: '450.00', category: 'Capacitación' },
  ];

  const insertedProducts = await db
    .insert(products)
    .values(productSeed.map((p) => ({ ...p, taxRateId: defaultTax?.id ?? null })))
    .returning();

  // --- Clientes y contactos -------------------------------------------------
  const clientSeed = [
    { legalName: 'Distribuidora Andina S.A.', tradeName: 'Andina', taxId: '0991234567001', city: 'Guayaquil', state: 'Guayas' },
    { legalName: 'Constructora del Litoral Cía. Ltda.', tradeName: 'Litoral', taxId: '0992345678001', city: 'Guayaquil', state: 'Guayas' },
    { legalName: 'Tecnología Global del Ecuador S.A.', tradeName: 'TecnoGlobal', taxId: '1791234567001', city: 'Quito', state: 'Pichincha' },
    { legalName: 'Agroindustrias del Pacífico S.A.', tradeName: 'AgroPacífico', taxId: '0993456789001', city: 'Machala', state: 'El Oro' },
    { legalName: 'Clínica Santa Lucía', tradeName: 'Santa Lucía', taxId: '0994567890001', city: 'Cuenca', state: 'Azuay' },
    { legalName: 'Transporte Rápido Nacional Cía. Ltda.', tradeName: 'TransRápido', taxId: '1792345678001', city: 'Quito', state: 'Pichincha' },
    { legalName: 'Comercial El Progreso', tradeName: 'El Progreso', taxId: '0925478963001', city: 'Manta', state: 'Manabí' },
    { legalName: 'Hotelera Costa Azul S.A.', tradeName: 'Costa Azul', taxId: '1793456789001', city: 'Salinas', state: 'Santa Elena' },
  ];

  const clientRows = [];
  for (let i = 0; i < clientSeed.length; i += 1) {
    const seq = await nextSequence(db, 'client');
    const base = clientSeed[i]!;
    clientRows.push({
      ...base,
      code: formatCode('CLI', seq),
      kind: 'EMPRESA' as const,
      country: 'Ecuador',
      phone: `+593 4 ${2000000 + i * 1111}`,
      email: `contacto${i + 1}@empresa${i + 1}.com`,
      website: `https://www.empresa${i + 1}.com`,
      sectorId: pick(sectorRows, i).id,
      status: (i === 7 ? 'INACTIVO' : 'ACTIVO') as 'ACTIVO' | 'INACTIVO',
      ownerId: pick(sellerIds, i),
      economicActivity: 'Actividades comerciales',
      createdAt: daysFrom(now, -120 + i * 12),
    });
  }
  const insertedClients = await db.insert(clients).values(clientRows).returning();

  const contactRows = insertedClients.flatMap((client, i) => [
    {
      clientId: client.id,
      firstName: pick(['Jorge', 'Ana', 'Pedro', 'Sofía', 'Diego', 'Valeria'], i),
      lastName: pick(['Salazar', 'Guerrero', 'Ríos', 'Cedeño', 'Paredes', 'Mora'], i),
      position: 'Gerente General',
      department: 'Gerencia',
      email: `gerencia@empresa${i + 1}.com`,
      phone: `+593 4 ${2500000 + i * 999}`,
      mobile: `+593 9${90000000 + i * 111111}`,
      whatsapp: `+593 9${90000000 + i * 111111}`,
      isPrimary: true,
    },
    {
      clientId: client.id,
      firstName: pick(['Karla', 'Luis', 'Miriam', 'Andrés'], i),
      lastName: pick(['Zambrano', 'Ortega', 'Barreiro', 'Loor'], i),
      position: 'Jefe de Compras',
      department: 'Compras',
      email: `compras@empresa${i + 1}.com`,
      mobile: `+593 9${80000000 + i * 121212}`,
      isPrimary: false,
    },
  ]);
  const insertedContacts = await db.insert(contacts).values(contactRows).returning();

  // --- Prospectos -----------------------------------------------------------
  const prospectSeed = [
    { firstName: 'Ricardo', lastName: 'Bermúdez', companyName: 'Importadora Sur S.A.', status: 'NUEVO' as const, temperature: 'TIBIO' as const },
    { firstName: 'Gabriela', lastName: 'Nieto', companyName: 'Farmacéutica Vital', status: 'CONTACTADO' as const, temperature: 'CALIENTE' as const },
    { firstName: 'Esteban', lastName: 'Cortez', companyName: 'Metalmecánica Cortez', status: 'CALIFICADO' as const, temperature: 'CALIENTE' as const },
    { firstName: 'Paulina', lastName: 'Alvarado', companyName: 'Editorial Palabra', status: 'EN_NEGOCIACION' as const, temperature: 'CALIENTE' as const },
    { firstName: 'Wilson', lastName: 'Ramírez', companyName: 'Servicios Portuarios WR', status: 'PERDIDO' as const, temperature: 'FRIO' as const },
    { firstName: 'Daniela', lastName: 'Cabrera', companyName: 'Boutique Aurora', status: 'NUEVO' as const, temperature: 'FRIO' as const },
  ];

  const prospectRows = [];
  for (let i = 0; i < prospectSeed.length; i += 1) {
    const seq = await nextSequence(db, 'prospect');
    const base = prospectSeed[i]!;
    prospectRows.push({
      ...base,
      code: formatCode('PRO', seq),
      email: `${base.firstName.toLowerCase()}@prospecto${i + 1}.com`,
      mobile: `+593 9${70000000 + i * 232323}`,
      sourceId: pick(sourceRows, i).id,
      sectorId: pick(sectorRows, i + 2).id,
      ownerId: pick(sellerIds, i),
      estimatedValue: String((i + 1) * 2500) + '.00',
      enteredAt: daysFrom(now, -60 + i * 7),
      lastContactAt: daysFrom(now, -10 + i),
      nextFollowUpAt: daysFrom(now, i - 2),
      lostReason: base.status === 'PERDIDO' ? 'Presupuesto insuficiente' : null,
      createdAt: daysFrom(now, -60 + i * 7),
    });
  }
  await db.insert(prospects).values(prospectRows).returning();

  // --- Oportunidades --------------------------------------------------------
  const stageCycle = ['Nuevo', 'Calificación', 'Contacto', 'Propuesta', 'Negociación', 'Ganada', 'Perdida'];
  const opportunityRows = [];
  for (let i = 0; i < 14; i += 1) {
    const seq = await nextSequence(db, 'opportunity');
    const stage = stageByName.get(pick(stageCycle, i))!;
    const client = pick(insertedClients, i);
    const status = stage.isWon ? 'GANADA' : stage.isLost ? 'PERDIDA' : 'ABIERTA';
    opportunityRows.push({
      code: formatCode('OPP', seq),
      name: `${pick(['Implementación', 'Renovación', 'Ampliación', 'Migración', 'Soporte'], i)} - ${client.tradeName}`,
      clientId: client.id,
      contactId: insertedContacts.find((c) => c.clientId === client.id && c.isPrimary)?.id ?? null,
      ownerId: pick(sellerIds, i),
      stageId: stage.id,
      sourceId: pick(sourceRows, i).id,
      amount: String(3000 + i * 1750) + '.00',
      probability: stage.probability,
      status: status as 'ABIERTA' | 'GANADA' | 'PERDIDA',
      openedAt: daysFrom(now, -90 + i * 5),
      expectedCloseAt: daysFrom(now, 15 + i * 3),
      closedAt: status === 'ABIERTA' ? null : daysFrom(now, -5 + i),
      lostReason: status === 'PERDIDA' ? 'El cliente eligió a un competidor' : null,
      competitor: i % 3 === 0 ? 'Competidor XYZ' : null,
      description: 'Oportunidad generada durante la prospección comercial.',
      createdAt: daysFrom(now, -90 + i * 5),
    });
  }
  const insertedOpportunities = await db.insert(opportunities).values(opportunityRows).returning();

  await db.insert(opportunityStageHistory).values(
    insertedOpportunities.map((o) => ({
      opportunityId: o.id,
      fromStageId: null,
      toStageId: o.stageId,
      changedById: o.ownerId,
      note: 'Creación de la oportunidad',
      createdAt: o.createdAt,
    })),
  );

  // --- Cotizaciones ---------------------------------------------------------
  const quoteStatuses = ['BORRADOR', 'ENVIADA', 'EN_NEGOCIACION', 'ACEPTADA', 'RECHAZADA'] as const;
  const year = now.getFullYear();

  for (let i = 0; i < 10; i += 1) {
    const opportunity = pick(insertedOpportunities, i);
    const client = insertedClients.find((c) => c.id === opportunity.clientId)!;
    const status = pick([...quoteStatuses], i);
    const seq = await nextSequence(db, `quote:${year}`);

    const chosen = [pick(insertedProducts, i), pick(insertedProducts, i + 3), pick(insertedProducts, i + 5)];
    const lines = chosen.map((product, idx) => {
      const quantity = idx + 1;
      const discountPct = idx === 1 ? 5 : 0;
      const taxPct = Number(defaultTax?.rate ?? 0);
      const totals = computeLine({
        quantity,
        unitPrice: product.price,
        discountPct,
        taxPct,
      });
      return { product, quantity, discountPct, taxPct, totals, position: idx };
    });
    const docTotals = sumTotals(lines.map((l) => l.totals));

    const [quote] = await db
      .insert(quotes)
      .values({
        number: formatYearlyCode('COT', seq, year),
        clientId: client.id,
        contactId: insertedContacts.find((c) => c.clientId === client.id && c.isPrimary)?.id ?? null,
        opportunityId: opportunity.id,
        ownerId: opportunity.ownerId,
        status,
        issueDate: daysFrom(now, -40 + i * 4),
        validUntil: daysFrom(now, i % 3 === 0 ? -2 + i : 12 + i),
        subtotal: docTotals.subtotal,
        discountTotal: docTotals.discountTotal,
        taxTotal: docTotals.taxTotal,
        total: docTotals.total,
        notes: 'Cotización generada desde la oportunidad comercial.',
        terms:
          'Precios en USD. Validez según fecha indicada. Forma de pago: 50% anticipo, 50% contra entrega.',
        sentAt: status === 'BORRADOR' ? null : daysFrom(now, -38 + i * 4),
        decisionAt: status === 'ACEPTADA' || status === 'RECHAZADA' ? daysFrom(now, -20 + i) : null,
        rejectionReason: status === 'RECHAZADA' ? 'Precio fuera de presupuesto' : null,
        createdAt: daysFrom(now, -40 + i * 4),
      })
      .returning();

    await db.insert(quoteItems).values(
      lines.map((l) => ({
        quoteId: quote!.id,
        productId: l.product.id,
        description: l.product.name,
        quantity: String(l.quantity),
        unitPrice: l.product.price,
        discountPct: String(l.discountPct),
        taxRateId: defaultTax?.id ?? null,
        taxPct: String(l.taxPct),
        ...l.totals,
        position: l.position,
      })),
    );

    // Las cotizaciones aceptadas generan una venta registrada.
    if (status === 'ACEPTADA') {
      const saleSeq = await nextSequence(db, `sale:${year}`);
      const [sale] = await db
        .insert(sales)
        .values({
          number: formatYearlyCode('VTA', saleSeq, year),
          clientId: client.id,
          opportunityId: opportunity.id,
          quoteId: quote!.id,
          ownerId: opportunity.ownerId,
          status: i % 2 === 0 ? 'FACTURADA' : 'PENDIENTE',
          saleDate: daysFrom(now, -18 + i),
          subtotal: docTotals.subtotal,
          taxTotal: docTotals.taxTotal,
          total: docTotals.total,
          createdAt: daysFrom(now, -18 + i),
        })
        .returning();

      await db.insert(saleItems).values(
        lines.map((l) => ({
          saleId: sale!.id,
          productId: l.product.id,
          description: l.product.name,
          quantity: String(l.quantity),
          unitPrice: l.product.price,
          lineTotal: l.totals.lineTotal,
        })),
      );
    }
  }

  // --- Actividades ----------------------------------------------------------
  const activityRows = [];
  for (let i = 0; i < 30; i += 1) {
    const opportunity = pick(insertedOpportunities, i);
    const type = pick([...typeRows], i);
    const scheduled = daysFrom(now, -20 + i);
    activityRows.push({
      typeId: type.id,
      subject: `${type.name} con ${pick(insertedClients, i).tradeName}`,
      description: 'Registro de la interacción comercial.',
      clientId: opportunity.clientId,
      contactId: insertedContacts.find((c) => c.clientId === opportunity.clientId)?.id ?? null,
      opportunityId: opportunity.id,
      ownerId: opportunity.ownerId,
      status: (scheduled < now ? 'COMPLETADA' : 'PENDIENTE') as 'COMPLETADA' | 'PENDIENTE',
      scheduledAt: scheduled,
      durationMin: 30 + (i % 4) * 15,
      completedAt: scheduled < now ? scheduled : null,
      outcome: scheduled < now ? 'Reunión efectiva, se acordaron próximos pasos.' : null,
      createdAt: daysFrom(now, -21 + i),
    });
  }
  // Reunión próxima para validar notificaciones y calendario.
  activityRows.push({
    typeId: typeByCode.get('REUNION')!.id,
    subject: 'Reunión de cierre trimestral',
    description: 'Revisión de resultados y próximos pasos.',
    clientId: insertedClients[0]!.id,
    contactId: insertedContacts[0]!.id,
    opportunityId: insertedOpportunities[0]!.id,
    ownerId: adminId,
    status: 'PENDIENTE' as const,
    scheduledAt: new Date(now.getTime() + 6 * 3_600_000),
    durationMin: 60,
    completedAt: null,
    outcome: null,
    createdAt: now,
  });
  await db.insert(activities).values(activityRows);

  // --- Tareas ---------------------------------------------------------------
  const taskRows = [];
  for (let i = 0; i < 16; i += 1) {
    const opportunity = pick(insertedOpportunities, i);
    const overdue = i % 4 === 0;
    taskRows.push({
      title: pick(
        [
          'Enviar propuesta actualizada',
          'Llamar para confirmar recepción',
          'Preparar demostración del producto',
          'Solicitar documentación tributaria',
          'Coordinar visita técnica',
        ],
        i,
      ),
      description: 'Tarea de seguimiento comercial.',
      priority: pick(['BAJA', 'MEDIA', 'ALTA', 'URGENTE'] as const, i),
      status: (i % 5 === 0 ? 'COMPLETADA' : 'PENDIENTE') as 'COMPLETADA' | 'PENDIENTE',
      dueAt: daysFrom(now, overdue ? -3 - i : 2 + i),
      completedAt: i % 5 === 0 ? daysFrom(now, -1) : null,
      assigneeId: pick(sellerIds, i),
      createdById: adminId,
      clientId: opportunity.clientId,
      opportunityId: opportunity.id,
      createdAt: daysFrom(now, -15 + i),
    });
  }
  await db.insert(tasks).values(taskRows);

  logger.info('Datos de ejemplo cargados correctamente');
}
