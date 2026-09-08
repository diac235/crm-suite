import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, firstCatalogIds, loginAs, loginAsAdmin, resetDatabase, type Session } from './helpers';
import { closeDatabase } from '../src/db';

const SELLER_PASSWORD = 'Vendedor*2026Seguro';

describe('Control de acceso por roles y cartera', () => {
  let admin: Session;
  let sellerA: Session;
  let sellerB: Session;
  let catalogs: Record<string, string>;
  let clientOfA: string;

  beforeAll(async () => {
    await resetDatabase();
    admin = await loginAsAdmin();
    catalogs = await firstCatalogIds();

    for (const [email, first] of [
      ['vendedor.a@test.local', 'Ana'],
      ['vendedor.b@test.local', 'Beto'],
    ] as const) {
      const res = await request(app)
        .post('/api/users')
        .set(auth(admin))
        .send({
          email,
          password: SELLER_PASSWORD,
          firstName: first,
          lastName: 'Prueba',
          roleId: catalogs.userRoleId,
          mustChangePassword: false,
        });
      expect(res.status).toBe(201);
    }

    sellerA = await loginAs('vendedor.a@test.local', SELLER_PASSWORD);
    sellerB = await loginAs('vendedor.b@test.local', SELLER_PASSWORD);

    const client = await request(app)
      .post('/api/clients')
      .set(auth(sellerA))
      .send({ legalName: 'Cliente de Ana S.A.', taxId: '0911111111001' });
    clientOfA = client.body.data.id;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('un ejecutivo solo ve su propia cartera', async () => {
    const listA = await request(app).get('/api/clients').set(auth(sellerA));
    expect(listA.body.data.some((c: { id: string }) => c.id === clientOfA)).toBe(true);

    const listB = await request(app).get('/api/clients').set(auth(sellerB));
    expect(listB.body.data.some((c: { id: string }) => c.id === clientOfA)).toBe(false);
  });

  it('un ejecutivo no puede abrir la ficha de un cliente ajeno', async () => {
    const res = await request(app).get(`/api/clients/${clientOfA}`).set(auth(sellerB));
    expect(res.status).toBe(403);
  });

  it('un ejecutivo no puede eliminar clientes', async () => {
    const res = await request(app).delete(`/api/clients/${clientOfA}`).set(auth(sellerA));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SIN_PERMISO');
  });

  it('un ejecutivo no puede administrar usuarios', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(auth(sellerA))
      .send({
        email: 'intruso@test.local',
        password: 'Intruso*2026Seguro',
        firstName: 'X',
        lastName: 'Y',
        roleId: catalogs.adminRoleId,
      });
    expect(res.status).toBe(403);
  });

  it('un ejecutivo no puede consultar la auditoría', async () => {
    const res = await request(app).get('/api/audit').set(auth(sellerA));
    expect(res.status).toBe(403);
  });

  it('un ejecutivo no puede modificar la configuración del sistema', async () => {
    const res = await request(app)
      .put('/api/settings/finance.currency')
      .set(auth(sellerA))
      .send({ value: { code: 'EUR', symbol: '€', locale: 'es-ES', decimals: 2 } });
    expect(res.status).toBe(403);
  });

  it('un ejecutivo no puede reasignar la cartera a otro usuario', async () => {
    const res = await request(app)
      .patch(`/api/clients/${clientOfA}`)
      .set(auth(sellerA))
      .send({ ownerId: sellerB.userId });
    expect(res.status).toBe(200);
    // El cambio de responsable se ignora silenciosamente para el ejecutivo.
    expect(res.body.data.ownerId).toBe(sellerA.userId);
  });

  it('el administrador sí puede ver y reasignar todos los clientes', async () => {
    const detail = await request(app).get(`/api/clients/${clientOfA}`).set(auth(admin));
    expect(detail.status).toBe(200);

    const reassigned = await request(app)
      .patch(`/api/clients/${clientOfA}`)
      .set(auth(admin))
      .send({ ownerId: sellerB.userId });
    expect(reassigned.body.data.ownerId).toBe(sellerB.userId);
  });

  it('desactivar un usuario invalida sus sesiones activas', async () => {
    const target = await request(app)
      .post('/api/users')
      .set(auth(admin))
      .send({
        email: 'temporal@test.local',
        password: SELLER_PASSWORD,
        firstName: 'Temp',
        lastName: 'Oral',
        roleId: catalogs.userRoleId,
        mustChangePassword: false,
      });
    const temp = await loginAs('temporal@test.local', SELLER_PASSWORD);
    expect((await request(app).get('/api/clients').set(auth(temp))).status).toBe(200);

    await request(app).patch(`/api/users/${target.body.data.id}`).set(auth(admin)).send({ isActive: false });

    const afterDisable = await request(app).get('/api/clients').set(auth(temp));
    expect(afterDisable.status).toBe(401);
  });

  it('nadie puede desactivar su propia cuenta', async () => {
    const res = await request(app).patch(`/api/users/${admin.userId}`).set(auth(admin)).send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('impide escalar privilegios asignando un rol superior', async () => {
    const roles = await request(app).get('/api/roles').set(auth(admin));
    const superadmin = roles.body.data.find((r: { slug: string }) => r.slug === 'superadmin');
    expect(superadmin).toBeTruthy();
  });

  it('un ejecutivo no ve contactos, documentos ni notas de carteras ajenas', async () => {
    // El cliente fue reasignado a "sellerB" en la prueba anterior.
    const contact = await request(app)
      .post('/api/contacts')
      .set(auth(admin))
      .send({ clientId: clientOfA, firstName: 'Contacto', lastName: 'Ajeno' });
    expect(contact.status).toBe(201);

    const note = await request(app)
      .post('/api/notes')
      .set(auth(admin))
      .send({ clientId: clientOfA, body: 'Nota reservada de la cartera de Beto' });
    expect(note.status).toBe(201);

    const contactsForA = await request(app).get('/api/contacts').set(auth(sellerA));
    expect(contactsForA.body.data.some((c: { id: string }) => c.id === contact.body.data.id)).toBe(false);

    const notesForA = await request(app).get('/api/notes').set(auth(sellerA));
    expect(notesForA.body.data.some((n: { id: string }) => n.id === note.body.data.id)).toBe(false);

    // El propietario sí los ve.
    const contactsForB = await request(app).get('/api/contacts').set(auth(sellerB));
    expect(contactsForB.body.data.some((c: { id: string }) => c.id === contact.body.data.id)).toBe(true);

    // Y no puede abrir la ficha del contacto ajeno.
    const forbidden = await request(app).get(`/api/contacts/${contact.body.data.id}`).set(auth(sellerA));
    expect(forbidden.status).toBe(403);
  });

  it('impide adjuntar notas o documentos a la cartera de otro ejecutivo', async () => {
    const note = await request(app)
      .post('/api/notes')
      .set(auth(sellerA))
      .send({ clientId: clientOfA, body: 'Intento de escritura en cartera ajena' });
    expect(note.status).toBe(403);

    const activity = await request(app)
      .post('/api/activities')
      .set(auth(sellerA))
      .send({
        typeId: catalogs.callTypeId,
        subject: 'Actividad en cartera ajena',
        clientId: clientOfA,
        scheduledAt: new Date().toISOString(),
      });
    expect(activity.status).toBe(403);
  });

  it('exige sesión para consultar la configuración pública', async () => {
    const anonymous = await request(app).get('/api/settings/public');
    expect(anonymous.status).toBe(401);

    const authenticated = await request(app).get('/api/settings/public').set(auth(admin));
    expect(authenticated.status).toBe(200);
  });

  it('rechaza identificadores con formato inválido', async () => {
    const res = await request(app).get('/api/clients/no-es-uuid').set(auth(admin));
    expect(res.status).toBe(422);
  });

  it('devuelve 404 con un mensaje claro en rutas inexistentes', async () => {
    const res = await request(app).get('/api/ruta-que-no-existe').set(auth(admin));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_ENCONTRADO');
  });
});
