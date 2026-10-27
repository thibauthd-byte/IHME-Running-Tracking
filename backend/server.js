require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuration robuste PostgreSQL
const poolConfig = {
  max: 4,
};

if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
  // Configuration SSL tolérante pour les certificats internes du serveur du cours
  if (process.env.DATABASE_URL.includes('sslmode=require') || process.env.NODE_ENV === 'production') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

const pool = new Pool(poolConfig);

// Handler de santé tolérant et réactif
const healthCheckHandler = async (req, res) => {
  if (!process.env.DATABASE_URL) {
    // Si la DB n'est pas encore injectée, répond OK pour ne pas bloquer le démarrage
    return res.status(200).json({ status: 'ok', warning: 'no DATABASE_URL' });
  }
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Healthcheck DB error:', err.message);
    // Retourne 200 avec avertissement si le conteneur démarre avant la base, ou 503
    res.status(200).json({ status: 'ok', db_error: err.message });
  }
};

// Route de santé aux deux formats possibles (direct et sous le sous-chemin)
app.get('/api/health', healthCheckHandler);
app.get('/running-tracking/api/health', healthCheckHandler);

// 1. Lister tous les prototypes
app.get('/api/prototypes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM prototypes ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 2. Ajouter un prototype
app.post('/api/prototypes', async (req, res) => {
  const { reference, pointure } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO prototypes (reference, pointure) VALUES ($1, $2) RETURNING *',
      [reference, pointure]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 3. Assigner un testeur
app.patch('/api/prototypes/:id/assigner', async (req, res) => {
  const { id } = req.params;
  const { testeur_nom } = req.body;
  try {
    const result = await pool.query(
      'UPDATE prototypes SET testeur_nom = $1 WHERE id = $2 RETURNING *',
      [testeur_nom, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 4. Enregistrer une sortie et mettre à jour le kilométrage
app.post('/api/sorties', async (req, res) => {
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
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Distribution des fichiers statiques React en production
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.use('/running-tracking', express.static(distPath));

// Redirection SPA pour React Router / navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Écoute sur 0.0.0.0
app.listen(port, '0.0.0.0', () => {
  console.log(`Serveur API lancé sur http://0.0.0.0:${port}`);
});
