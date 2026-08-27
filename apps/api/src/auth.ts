import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { compare, hashSync } from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { db, nowIso } from './db.js';

type AdminToken = { sub: string; email: string; csrf: string };

export function bootstrapAdmin(app: FastifyInstance) {
  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(config.adminEmail);
  if (existing) return;
  db.prepare(`
    INSERT INTO admins (id, email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), config.adminEmail, hashSync(config.adminPassword, 12), nowIso(), nowIso());
  if (!config.isProduction) app.log.warn({ email: config.adminEmail }, 'Local development admin created');
}

function readToken(app: FastifyInstance, request: FastifyRequest): AdminToken | null {
  const token = request.cookies.uq_session;
  if (!token) return null;
  try { return app.jwt.verify<AdminToken>(token); }
  catch { return null; }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const admin = readToken(request.server, request);
  if (!admin) return reply.code(401).send({ error: 'authentication_required' });
}

export async function requireAdminMutation(request: FastifyRequest, reply: FastifyReply) {
  const admin = readToken(request.server, request);
  if (!admin) return reply.code(401).send({ error: 'authentication_required' });
  if (request.headers['x-csrf-token'] !== admin.csrf) {
    return reply.code(403).send({ error: 'invalid_csrf_token' });
  }
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', {
    config: { rateLimit: { max: 8, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1).max(256) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_credentials' });
    const admin = db.prepare(`
      SELECT id, email, password_hash FROM admins WHERE email = ? AND is_active = 1
    `).get(body.data.email.toLowerCase()) as { id: string; email: string; password_hash: string } | undefined;
    if (!admin || !(await compare(body.data.password, admin.password_hash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const csrf = randomBytes(24).toString('base64url');
    const token = app.jwt.sign({ sub: admin.id, email: admin.email, csrf }, { expiresIn: '8h' });
    reply.setCookie('uq_session', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return { ok: true, admin: { id: admin.id, email: admin.email }, csrf };
  });

  app.get('/api/auth/session', async (request, reply) => {
    const admin = readToken(app, request);
    if (!admin) return reply.code(401).send({ authenticated: false });
    return { authenticated: true, admin: { id: admin.sub, email: admin.email }, csrf: admin.csrf };
  });

  app.post('/api/auth/logout', { preHandler: requireAdminMutation }, async (_request, reply) => {
    reply.clearCookie('uq_session', { path: '/' });
    return { ok: true };
  });
}
