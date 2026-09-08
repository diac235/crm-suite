import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, loginAsAdmin, resetDatabase, type Session } from './helpers';
import { isNotNull } from 'drizzle-orm';
import { closeDatabase, db } from '../src/db';
import { sessions } from '../src/db/schema';
import { env } from '../src/config/env';

describe('Autenticación y seguridad', () => {
  let admin: Session;

  beforeAll(async () => {
    await resetDatabase();
    admin = await loginAsAdmin();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('rechaza credenciales incorrectas sin revelar si el usuario existe', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: env.SEED_ADMIN_EMAIL, password: 'ClaveIncorrecta123!' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Credenciales incorrectas');
  });

  it('devuelve el mismo mensaje para un usuario inexistente', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@test.local', password: 'ClaveIncorrecta123!' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Credenciales incorrectas');
  });

  it('valida el formato del correo', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'no-es-correo', password: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDACION');
  });

  it('emite un token de acceso y una cookie de refresco httpOnly', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('crm_rt=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('nunca devuelve el hash de la contraseña', async () => {
    const res = await request(app).get('/api/auth/me').set(auth(admin));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('bloquea el acceso sin token', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(401);
  });

  it('bloquea el acceso con un token manipulado', async () => {
    const res = await request(app).get('/api/clients').set({ Authorization: 'Bearer token.falso.aqui' });
    expect(res.status).toBe(401);
  });

  it('rota el refresh token en cada renovación', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });
    const cookie = login.headers['set-cookie'];

    const first = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.headers['set-cookie']?.[0]).not.toBe(cookie?.[0]);
  });

  it('tolera una renovación simultánea dentro del período de gracia', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });
    const cookie = login.headers['set-cookie'];

    // Dos pestañas renovando a la vez no deben cerrar la sesión del usuario.
    const [first, second] = await Promise.all([
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('detecta la reutilización de un token rotado fuera del período de gracia', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });
    const cookie = login.headers['set-cookie'];

    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(rotated.status).toBe(200);

    // Se envejece artificialmente la revocación para simular un robo de token.
    await db
      .update(sessions)
      .set({ revokedAt: new Date(Date.now() - 60 * 60_000) })
      .where(isNotNull(sessions.revokedAt));

    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(replay.status).toBe(401);

    // La familia completa de sesiones queda revocada.
    const newCookie = rotated.headers['set-cookie'];
    const afterCompromise = await request(app).post('/api/auth/refresh').set('Cookie', newCookie);
    expect(afterCompromise.status).toBe(401);
  });

  it('exige una contraseña robusta al cambiarla', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set(auth(admin))
      .send({ currentPassword: env.SEED_ADMIN_PASSWORD, newPassword: 'corta', confirmPassword: 'corta' });
    expect(res.status).toBe(422);
  });

  it('registra el intento fallido en la auditoría', async () => {
    const res = await request(app).get('/api/audit?action=LOGIN_FAILED').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
