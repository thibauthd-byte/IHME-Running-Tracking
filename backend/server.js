require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const sessionSecret = process.env.SESSION_SECRET || 'kinetic-lab-secret-session-key-32chars';
const sessionCookie = 'rt_session';
const sessionDuration = 12 * 60 * 60;
const scrypt = promisify(crypto.scrypt);
const defaultEngineerUser = process.env.ENGINEER_USERNAME || "admin";
const defaultEngineerPass = process.env.ENGINEER_PASSWORD || "IhmeRunning";

const engineerUsername = process.env.ENGINEER_USERNAME || 'admin';
const engineerPassword = process.env.ENGINEER_PASSWORD || 'LaboSalomon2026!';

app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes("sslmode=require") || process.env.DATABASE_URL.includes("ssl=true"))
    ? { rejectUnauthorized: false }
    : false
});

function safeEqual(left, right) {
  const leftHash = crypto.createHash('sha256').update(String(left)).digest();
  const rightHash = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function readSession(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim().split(/=(.*)/s).slice(0, 2))
      .filter(([name, value]) => name && value !== undefined)
  );
  const [encoded, signature, extra] = (cookies[sessionCookie] || '').split('.');
  if (!encoded || !signature || extra) return null;

  const expected = crypto.createHmac('sha256', sessionSecret).update(encoded).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const session = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (!session.sub || !session.role || session.exp <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function setSessionCookie(res, session) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${sessionCookie}=${signSession(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionDuration}${secure}`
  );
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function requireRole(...roles) {
  return (req, res, next) => {
    req.session = readSession(req);
    if (!req.session) return res.status(401).json({ error: 'Authentification requise' });
    if (!roles.includes(req.session.role)) return res.status(403).json({ error: 'Accès interdit' });
    return next();
  };
}

function validText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 200;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [salt, hashHex] = storedHash.split(':');
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

async function initializeSchema() {
  if (!process.env.DATABASE_URL) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prototypes (
      id SERIAL PRIMARY KEY,
      reference VARCHAR(50) NOT NULL,
      pointure VARCHAR(10) NOT NULL,
      testeur_nom VARCHAR(100),
      km_total NUMERIC DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sorties (
      id SERIAL PRIMARY KEY,
      prototype_id INTEGER REFERENCES prototypes(id) ON DELETE CASCADE,
      distance_km NUMERIC NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS testeurs (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      username VARCHAR(60) NOT NULL,
      password_hash TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS testeurs_username_lower_unique
      ON testeurs (LOWER(username));
    ALTER TABLE prototypes ADD COLUMN IF NOT EXISTS testeur_id INTEGER
      REFERENCES testeurs(id) ON DELETE SET NULL;
    INSERT INTO testeurs (nom, username)
      SELECT DISTINCT trim(testeur_nom), LOWER(trim(testeur_nom))
      FROM prototypes
      WHERE testeur_nom IS NOT NULL AND trim(testeur_nom) <> ''
      ON CONFLICT DO NOTHING;
    UPDATE prototypes p
      SET testeur_id = t.id
      FROM testeurs t
      WHERE p.testeur_id IS NULL AND LOWER(trim(p.testeur_nom)) = LOWER(t.username);

    -- Compte testeur de démonstration par défaut (Lucas Martin / Testeur2026!)
    INSERT INTO testeurs (nom, username, password_hash)
    VALUES ('Lucas Martin', 'lucas.m', '5558e8b28f8705c11082103f6f3284aa:170564e9a3eaeb05d5cb5282e4e1a0b5f54078174f88e1cf06eb553bb8bc05bf8c6c97a47ebfcfa9f8e02d6b38c2049e6231be8e663a89e900c14b53fa65239a')
    ON CONFLICT (LOWER(username)) DO NOTHING;
  `);
}

const healthHandler = async (req, res) => {
  try {
    if (process.env.DATABASE_URL) {
      await pool.query('SELECT 1');
    }
    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Erreur healthcheck DB :', err.message);
    return res.status(503).json({ status: 'unavailable' });
  }
};

app.get(['/api/health', '/running-tracking/api/health'], healthHandler);

app.post(['/api/auth/login', '/running-tracking/api/auth/login'], async (req, res) => {
  const { role, username, password } = req.body || {};
  if (!validText(username, 100) || typeof password !== 'string') {
    return res.status(400).json({ error: 'Identifiants invalides' });
  }

  try {
    let session;
    if (
      role === 'engineer'
      && safeEqual(username.trim(), engineerUsername)
      && safeEqual(password, engineerPassword)
    ) {
      session = {
        sub: 'engineer',
        role: 'engineer',
        name: 'Ingénieur labo',
        exp: Date.now() + sessionDuration * 1000
      };
    } else if (role === 'tester') {
      const result = await pool.query(
        'SELECT id, nom, username, password_hash FROM testeurs WHERE LOWER(username) = LOWER($1)',
        [username.trim()]
      );
      const tester = result.rows[0];
      if (tester && await verifyPassword(password, tester.password_hash)) {
        session = {
          sub: String(tester.id),
          role: 'tester',
          name: tester.nom,
          exp: Date.now() + sessionDuration * 1000
        };
      }
    }

    if (!session) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    setSessionCookie(res, session);
    return res.json({ user: { role: session.role, name: session.name } });
  } catch (err) {
    console.error('Erreur connexion :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get(['/api/auth/me', '/running-tracking/api/auth/me'], (req, res) => {
  const session = readSession(req);
  if (!session) return res.json({ user: null });
  return res.json({ user: { role: session.role, name: session.name } });
});

app.post(['/api/auth/logout', '/running-tracking/api/auth/logout'], (req, res) => {
  clearSessionCookie(res);
  return res.status(204).end();
});

app.get(['/api/prototypes', '/running-tracking/api/prototypes'], requireRole('engineer', 'tester'), async (req, res) => {
  try {
    const testerOnly = req.session.role === 'tester';
    const result = await pool.query(
      `SELECT p.id, p.reference, p.pointure, p.km_total, p.testeur_id,
              COALESCE(t.nom, p.testeur_nom) AS testeur_nom
       FROM prototypes p
       LEFT JOIN testeurs t ON t.id = p.testeur_id
       ${testerOnly ? 'WHERE p.testeur_id = $1' : ''}
       ORDER BY p.id ASC`,
      testerOnly ? [Number(req.session.sub)] : []
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Erreur lecture prototypes :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post(['/api/prototypes', '/running-tracking/api/prototypes'], requireRole('engineer'), async (req, res) => {
  const { reference, pointure } = req.body || {};
  if (!validText(reference, 50) || !Number.isFinite(Number(pointure)) || Number(pointure) < 20 || Number(pointure) > 55) {
    return res.status(400).json({ error: 'Référence ou pointure invalide' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO prototypes (reference, pointure) VALUES ($1, $2) RETURNING *',
      [reference.trim().toUpperCase(), Number(pointure)]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur création prototype :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.patch(['/api/prototypes/:id/assigner', '/running-tracking/api/prototypes/:id/assigner'], requireRole('engineer'), async (req, res) => {
  const { testeur_id } = req.body || {};
  const testerId = testeur_id === null || testeur_id === '' ? null : Number(testeur_id);
  if (testerId !== null && (!Number.isInteger(testerId) || testerId < 1)) {
    return res.status(400).json({ error: 'Testeur invalide' });
  }
  try {
    const result = await pool.query(
      `UPDATE prototypes
       SET testeur_id = $1, testeur_nom = (SELECT nom FROM testeurs WHERE id = $1)
       WHERE id = $2 AND ($1::integer IS NULL OR EXISTS (SELECT 1 FROM testeurs WHERE id = $1))
       RETURNING id, reference, pointure, km_total, testeur_id, testeur_nom`,
      [testerId, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Prototype introuvable' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur attribution prototype :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete(['/api/prototypes/:id', '/running-tracking/api/prototypes/:id'], requireRole('engineer'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM prototypes WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Prototype introuvable' });
    return res.status(204).end();
  } catch (err) {
    console.error('Erreur suppression prototype :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get(['/api/testeurs', '/running-tracking/api/testeurs'], requireRole('engineer'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.nom, t.username, (t.password_hash IS NOT NULL) AS actif,
              COUNT(p.id)::integer AS paires
       FROM testeurs t LEFT JOIN prototypes p ON p.testeur_id = t.id
       GROUP BY t.id ORDER BY LOWER(t.nom)`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Erreur lecture testeurs :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post(['/api/testeurs', '/running-tracking/api/testeurs'], requireRole('engineer'), async (req, res) => {
  const { nom, username, password } = req.body || {};
  if (!validText(nom, 100) || !validText(username, 60) || !/^[a-zA-Z0-9._-]+$/.test(username.trim())) {
    return res.status(400).json({ error: 'Nom ou identifiant invalide' });
  }
  if (!validPassword(password)) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 10 caractères' });
  }
  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO testeurs (nom, username, password_hash) VALUES ($1, LOWER($2), $3)
       RETURNING id, nom, username, TRUE AS actif`,
      [nom.trim(), username.trim(), passwordHash]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Cet identifiant existe déjà' });
    console.error('Erreur création testeur :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.patch(['/api/testeurs/:id', '/running-tracking/api/testeurs/:id'], requireRole('engineer'), async (req, res) => {
  const { nom, password } = req.body || {};
  if (!validText(nom, 100)) return res.status(400).json({ error: 'Nom invalide' });
  if (password !== undefined && !validPassword(password)) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 10 caractères' });
  }
  try {
    const result = await pool.query(
      `UPDATE testeurs SET nom = $1, password_hash = COALESCE($2, password_hash)
       WHERE id = $3 RETURNING id, nom, username, (password_hash IS NOT NULL) AS actif`,
      [nom.trim(), password === undefined ? null : await hashPassword(password), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Testeur introuvable' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur modification testeur :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete(['/api/testeurs/:id', '/running-tracking/api/testeurs/:id'], requireRole('engineer'), async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(
      'UPDATE prototypes SET testeur_id = NULL, testeur_nom = NULL WHERE testeur_id = $1',
      [req.params.id]
    );
    const result = await client.query('DELETE FROM testeurs WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Testeur introuvable' });
    }
    await client.query('COMMIT');
    return res.status(204).end();
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Erreur suppression testeur :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client?.release();
  }
});

app.post(['/api/sorties', '/running-tracking/api/sorties'], requireRole('tester'), async (req, res) => {
  const { prototype_id, distance_km } = req.body || {};
  const prototypeId = Number(prototype_id);
  const distance = Number(distance_km);
  if (!Number.isInteger(prototypeId) || prototypeId < 1 || !Number.isFinite(distance) || distance <= 0 || distance > 300) {
    return res.status(400).json({ error: 'Paire ou distance invalide' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE prototypes SET km_total = km_total + $1
       WHERE id = $2 AND testeur_id = $3
       RETURNING id, reference, pointure, km_total`,
      [distance, prototypeId, Number(req.session.sub)]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Paire introuvable dans votre espace' });
    }
    await client.query(
      'INSERT INTO sorties (prototype_id, distance_km) VALUES ($1, $2)',
      [prototypeId, distance]
    );
    await client.query('COMMIT');
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Erreur enregistrement sortie :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client?.release();
  }
});

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.use('/running-tracking', express.static(distPath));

// Route SPA compatible Express 5
app.get('{*splat}', (req, res) => res.sendFile(path.join(distPath, 'index.html')));

async function start() {
  await initializeSchema();
  app.listen(port, '0.0.0.0', () => {
    console.log(`Serveur API prêt sur le port ${port}`);
  });
}

start().catch((err) => {
  console.error('Impossible de démarrer le serveur :', err);
  process.exitCode = 1;
});
