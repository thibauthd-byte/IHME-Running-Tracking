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
const dbUrl = process.env.DATABASE_URL || '';
const poolConfig = {
  max: 4,
};

if (dbUrl) {
  poolConfig.connectionString = dbUrl;
  // N'activer SSL que si l'URL l'impose explicitement (ex: sslmode=require)
  if (dbUrl.includes('sslmode=require') || dbUrl.includes('ssl=true')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  } else {
    poolConfig.ssl = false;
  }
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Erreur inattendue client PG idle :', err.message);
});

// Création des tables au démarrage
async function initDb() {
  if (!dbUrl) {
    console.warn('DATABASE_URL non configurée.');
    return;
  }
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

    const existing = await pool.query('SELECT count(*) FROM prototypes');
    if (parseInt(existing.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO prototypes (reference, pointure, testeur_nom, km_total)
        VALUES 
          ('S-LAB-PULSAR-3', '42.5', 'Lucas', 112.5),
          ('GENESIS-EXP-02', '43', 'Lucas', 154.0),
          ('GLIDE-MAX-TR', '41', NULL, 34.0);
      `);
      console.log('Données d’essai initialisées.');
    }
    console.log('Base PostgreSQL connectée avec succès.');
  } catch (err) {
    console.error('Erreur initialisation DB :', err.message);
  }
}
initDb();

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
    res.status(500).json({ 
      error: 'Erreur base de données',
      details: err.message 
    });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// Enregistrement des routes API
app.use('/api', apiRouter);
app.use('/running-tracking/api', apiRouter);

// Fichiers statiques du frontend Vite
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.use('/running-tracking', express.static(distPath));

// Fallback SPA
app.get('{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Serveur prêt sur port ${port}`);
});
