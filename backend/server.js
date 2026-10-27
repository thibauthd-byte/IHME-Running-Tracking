require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuration PostgreSQL conforme au contrat
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=disable')
    ? false
    : { rejectUnauthorized: false }
});

// Route de santé conforme aux spécifications exactes
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

app.get('/api/health', healthHandler);
app.get('/running-tracking/api/health', healthHandler);

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

// Redirection SPA pour React
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Écoute sur 0.0.0.0
app.listen(port, '0.0.0.0', () => {
  console.log(`Serveur API lancé sur http://0.0.0.0:${port}`);
});
