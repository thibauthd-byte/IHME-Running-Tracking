require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuration PostgreSQL
const poolConfig = { max: 4 };
if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
  if (!process.env.DATABASE_URL.includes('sslmode=disable')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}
const pool = new Pool(poolConfig);

// Création des tables au démarrage
async function initDb() {
  if (!process.env.DATABASE_URL) return;
  try {
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
    `);
    console.log('Base de données initialisée.');
  } catch (err) {
    console.error('Erreur initDb :', err.message);
  }
}
initDb();

// Définition d'un routeur dédié pour les endpoints API
const apiRouter = express.Router();

apiRouter.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

apiRouter.get('/prototypes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM prototypes ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur SELECT prototypes :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

apiRouter.post('/prototypes', async (req, res) => {
  const { reference, pointure } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO prototypes (reference, pointure) VALUES ($1, $2) RETURNING *',
      [reference, pointure]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur INSERT prototype :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

apiRouter.patch('/prototypes/:id/assigner', async (req, res) => {
  const { id } = req.params;
  const { testeur_nom } = req.body;
  try {
    const result = await pool.query(
      'UPDATE prototypes SET testeur_nom = $1 WHERE id = $2 RETURNING *',
      [testeur_nom, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur UPDATE assigner :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

apiRouter.post('/sorties', async (req, res) => {
  const { prototype_id, distance_km } = req.body;
  try {
    await pool.query(
      'INSERT INTO sorties (prototype_id, distance_km) VALUES ($1, $2)',
      [prototype_id, distance_km]
    );
    const result = await pool.query(
      'UPDATE prototypes SET km_total = km_total + $1 WHERE id = $2 RETURNING *',
      [distance_km, prototype_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur INSERT sortie :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Montage du routeur sur les deux préfixes possibles
app.use('/api', apiRouter);
app.use('/running-tracking/api', apiRouter);

// Fichiers statiques
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.use('/running-tracking', express.static(distPath));

// Redirection SPA Express 5
app.get('{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Serveur prêt sur port ${port}`);
});
