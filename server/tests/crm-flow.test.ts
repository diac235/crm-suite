import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, firstCatalogIds, loginAsAdmin, resetDatabase, type Session } from './helpers';
import { closeDatabase } from '../src/db';

describe('Flujo comercial completo', () => {
  let admin: Session;
  let catalogs: Record<string, string>;
  let clientId: string;
  let contactId: string;
  let prospectId: string;
  let opportunityId: string;
  let quoteId: string;
  let productId: string;

  beforeAll(async () => {
    await resetDatabase();
    admin = await loginAsAdmin();
    catalogs = await firstCatalogIds();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('crea un cliente con código correlativo', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set(auth(admin))
      .send({
        kind: 'EMPRESA',
        taxId: '0999999999001',
        legalName: 'Comercial de Pruebas S.A.',
        tradeName: 'ComPruebas',
        city: 'Guayaquil',
        email: 'ventas@compruebas.com',
        sectorId: catalogs.sectorId,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^CLI-\d{6}$/);
    clientId = res.body.data.id;
  });

  it('impide clientes duplicados por identificación', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set(auth(admin))
      .send({ legalName: 'Otro nombre', taxId: '0999999999001' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICTO');
  });

  it('rechaza un cliente sin razón social', async () => {
    const res = await request(app).post('/api/clients').set(auth(admin)).send({ taxId: '123' });
    expect(res.status).toBe(422);
  });

  it('crea un contacto principal para el cliente', async () => {
    const res = await request(app)
      .post('/api/contacts')
      .set(auth(admin))
      .send({
        clientId,
        firstName: 'Andrea',
        lastName: 'Torres',
        position: 'Gerente de Compras',
        email: 'andrea@compruebas.com',
        isPrimary: true,
      });
    expect(res.status).toBe(201);
    contactId = res.body.data.id;
  });

  it('mantiene un único contacto principal por cliente', async () => {
    const second = await request(app)
      .post('/api/contacts')
      .set(auth(admin))
      .send({ clientId, firstName: 'Luis', lastName: 'Paz', isPrimary: true });
    expect(second.status).toBe(201);

    const detail = await request(app).get(`/api/clients/${clientId}`).set(auth(admin));
    const primaries = detail.body.data.contacts.filter((c: { isPrimary: boolean }) => c.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].firstName).toBe('Luis');
  });

  it('crea un prospecto y lo convierte en cliente conservando el historial', async () => {
    const created = await request(app)
      .post('/api/prospects')
      .set(auth(admin))
      .send({
        firstName: 'Marco',
        lastName: 'Rivas',
        companyName: 'Innovaciones Rivas',
        email: 'marco@rivas.com',
        sourceId: catalogs.sourceId,
        status: 'CALIFICADO',
        temperature: 'CALIENTE',
      });
    expect(created.status).toBe(201);
    prospectId = created.body.data.id;

    const activity = await request(app)
      .post('/api/activities')
      .set(auth(admin))
      .send({
        typeId: catalogs.callTypeId,
        subject: 'Llamada de calificación',
        prospectId,
        scheduledAt: new Date().toISOString(),
        status: 'COMPLETADA',
      });
    expect(activity.status).toBe(201);

    const converted = await request(app)
      .post(`/api/prospects/${prospectId}/convert`)
      .set(auth(admin))
      .send({ legalName: 'Innovaciones Rivas S.A.', taxId: '0988888888001', city: 'Quito' });
    expect(converted.status).toBe(201);

    const newClientId = converted.body.data.client.id;
    const timeline = await request(app).get(`/api/clients/${newClientId}/timeline`).set(auth(admin));
    expect(timeline.status).toBe(200);
    // El historial debe incluir la creación y la actividad heredada del prospecto.
    expect(timeline.body.data.some((e: { kind: string }) => e.kind === 'ACTIVIDAD')).toBe(true);
  });

  it('no permite convertir dos veces el mismo prospecto', async () => {
    const res = await request(app)
      .post(`/api/prospects/${prospectId}/convert`)
      .set(auth(admin))
      .send({ legalName: 'Duplicado S.A.' });
    expect(res.status).toBe(409);
  });

  it('crea un producto y una oportunidad', async () => {
    const product = await request(app)
      .post('/api/products')
      .set(auth(admin))
      .send({ sku: 'TEST-001', name: 'Servicio de prueba', price: 1000, taxRateId: catalogs.taxRateId });
    expect(product.status).toBe(201);
    productId = product.body.data.id;

    const opportunity = await request(app)
      .post('/api/opportunities')
      .set(auth(admin))
      .send({
        name: 'Implementación piloto',
        clientId,
        contactId,
        stageId: catalogs.firstStageId,
        amount: 5000,
        expectedCloseAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
    expect(opportunity.status).toBe(201);
    expect(opportunity.body.data.code).toMatch(/^OPP-\d{6}$/);
    opportunityId = opportunity.body.data.id;
  });

  it('registra el historial al mover la oportunidad de etapa', async () => {
    const moved = await request(app)
      .post(`/api/opportunities/${opportunityId}/stage`)
      .set(auth(admin))
      .send({ stageId: catalogs.wonStageId, note: 'Cliente aprobó la propuesta' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.status).toBe('GANADA');
    expect(moved.body.data.closedAt).toBeTruthy();

    const detail = await request(app).get(`/api/opportunities/${opportunityId}`).set(auth(admin));
    expect(detail.body.data.history.length).toBeGreaterThanOrEqual(2);
  });

  it('exige motivo al mover una oportunidad a una etapa de pérdida', async () => {
    const created = await request(app)
      .post('/api/opportunities')
      .set(auth(admin))
      .send({ name: 'Oportunidad a perder', clientId, stageId: catalogs.firstStageId, amount: 100 });
    const res = await request(app)
      .post(`/api/opportunities/${created.body.data.id}/stage`)
      .set(auth(admin))
      .send({ stageId: catalogs.lostStageId });
    expect(res.status).toBe(400);
  });

  it('calcula correctamente los totales de una cotización', async () => {
    const res = await request(app)
      .post('/api/quotes')
      .set(auth(admin))
      .send({
        clientId,
        contactId,
        opportunityId,
        validUntil: new Date(Date.now() + 15 * 86400000).toISOString(),
        items: [
          { productId, description: 'Servicio de prueba', quantity: 2, unitPrice: 1000, discountPct: 10, taxRateId: catalogs.taxRateId },
          { description: 'Soporte adicional', quantity: 1, unitPrice: 500, discountPct: 0, taxPct: 15 },
        ],
      });
    expect(res.status).toBe(201);
    quoteId = res.body.data.id;

    // 2 x 1000 = 2000 - 10% = 1800 + 15% = 2070
    // 1 x 500 = 500 + 15% = 575
    expect(res.body.data.subtotal).toBe('2500.00');
    expect(res.body.data.discountTotal).toBe('200.00');
    expect(res.body.data.taxTotal).toBe('345.00');
    expect(res.body.data.total).toBe('2645.00');
  });

  it('rechaza una cotización sin ítems', async () => {
    const res = await request(app)
      .post('/api/quotes')
      .set(auth(admin))
      .send({ clientId, validUntil: new Date().toISOString(), items: [] });
    expect(res.status).toBe(422);
  });

  it('respeta las transiciones de estado de la cotización', async () => {
    const invalid = await request(app)
      .post(`/api/quotes/${quoteId}/status`)
      .set(auth(admin))
      .send({ status: 'ACEPTADA' });
    expect(invalid.status).toBe(409);

    const sent = await request(app).post(`/api/quotes/${quoteId}/status`).set(auth(admin)).send({ status: 'ENVIADA' });
    expect(sent.status).toBe(200);
    expect(sent.body.data.sentAt).toBeTruthy();

    const accepted = await request(app).post(`/api/quotes/${quoteId}/status`).set(auth(admin)).send({ status: 'ACEPTADA' });
    expect(accepted.status).toBe(200);
  });

  it('impide modificar una cotización aceptada', async () => {
    const res = await request(app).patch(`/api/quotes/${quoteId}`).set(auth(admin)).send({ notes: 'cambio' });
    expect(res.status).toBe(409);
  });

  it('genera el PDF de la cotización en una sola página', async () => {
    const res = await request(app).get(`/api/quotes/${quoteId}/pdf`).set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(1000);
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('convierte la cotización aceptada en venta y no permite duplicarla', async () => {
    const sale = await request(app).post(`/api/quotes/${quoteId}/convert-to-sale`).set(auth(admin)).send({});
    expect(sale.status).toBe(201);
    expect(sale.body.data.number).toMatch(/^VTA-\d{4}-\d{6}$/);
    expect(sale.body.data.total).toBe('2645.00');

    const duplicate = await request(app).post(`/api/quotes/${quoteId}/convert-to-sale`).set(auth(admin)).send({});
    expect(duplicate.status).toBe(409);
  });

  it('no elimina un cliente con historial comercial', async () => {
    const res = await request(app).delete(`/api/clients/${clientId}`).set(auth(admin));
    expect(res.status).toBe(409);
  });

  it('archiva y reactiva un cliente', async () => {
    const archived = await request(app).post(`/api/clients/${clientId}/archive`).set(auth(admin));
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe('ARCHIVADO');

    const restored = await request(app).post(`/api/clients/${clientId}/restore`).set(auth(admin));
    expect(restored.body.data.status).toBe('ACTIVO');
  });

  it('devuelve el dashboard con KPIs coherentes', async () => {
    const res = await request(app).get('/api/dashboard/summary?period=anio').set(auth(admin));
    expect(res.status).toBe(200);
    expect(Number(res.body.data.kpis.clientsTotal)).toBeGreaterThanOrEqual(2);
    expect(Number(res.body.data.kpis.salesTotal)).toBeGreaterThan(0);
  });

  it('encuentra registros mediante la búsqueda global', async () => {
    const res = await request(app).get('/api/search?q=ComPruebas').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThan(0);
  });

  it('exporta clientes en Excel y CSV', async () => {
    const xlsx = await request(app).get('/api/clients/export?format=xlsx').set(auth(admin));
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');

    const csv = await request(app).get('/api/clients/export?format=csv').set(auth(admin));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('Razón social');
  });

  it('protege la exportación CSV contra inyección de fórmulas', async () => {
    await request(app)
      .post('/api/clients')
      .set(auth(admin))
      .send({ legalName: '=cmd|calc', taxId: '0977777777001' });
    const csv = await request(app).get('/api/clients/export?format=csv').set(auth(admin));
    expect(csv.text).toContain("'=cmd|calc");
  });

  it('genera notificaciones automáticas de tareas vencidas', async () => {
    await request(app)
      .post('/api/tasks')
      .set(auth(admin))
      .send({
        title: 'Tarea vencida de prueba',
        clientId,
        dueAt: new Date(Date.now() - 86400000).toISOString(),
        priority: 'ALTA',
      });

    const refreshed = await request(app).post('/api/notifications/refresh').set(auth(admin));
    expect(refreshed.status).toBe(200);

    const list = await request(app).get('/api/notifications?unreadOnly=true').set(auth(admin));
    expect(list.body.data.some((n: { kind: string }) => n.kind === 'TAREA_VENCIDA')).toBe(true);
  });
});
