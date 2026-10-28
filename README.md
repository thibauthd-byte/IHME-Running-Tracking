# IHME — Suivi R&D Prototypes (Running Tracker)

Plateforme web de suivi kilométrique et d'évaluation d'usure pour prototypes de running en conditions réelles et en laboratoire.

---

## 🛠️ Stack technique

- **Frontend** : React 18, Vite, Lucide Icons, CSS moderne
- **Backend** : Node.js, Express, sessions HTTP-only, hachage sécurisé `scrypt`
- **Base de données** : PostgreSQL 15 via Docker

---

## 🚀 Démarrage rapide

### 1. Prérequis
- Docker Desktop installé et en cours d'exécution
- Node.js (v18 ou supérieur) et npm

### 2. Base de données
Démarrer le conteneur PostgreSQL :
```bash
docker compose up -d
```

### 3. Configuration de l'environnement
Dans le sous-dossier `backend`, assurez-vous d'avoir un fichier `.env` configuré ainsi :
```env
PORT=3000
DATABASE_URL=postgres://shoesdurability:durability@localhost:5432/running_tracker
SESSION_SECRET=cle-secrete-ihme-running-tracking-2026-tres-longue
ENGINEER_USERNAME=admin
ENGINEER_PASSWORD=IhmeRunning
```

### 4. Démarrage du backend (Terminal 1)
```bash
cd backend
npm install
PORT=3000 node server.js
```
> Le serveur API écoute sur le port 3000 (`http://localhost:3000`).

### 5. Démarrage du frontend (Terminal 2)
```bash
cd frontend
npm install
npm run dev
```
> L'interface web est accessible sur `http://localhost:5173`.

---

## 🔑 Identifiants d'accès

- **Espace Ingénieur R&D** :
  - **Identifiant** : `admin`
  - **Mot de passe** : `IhmeRunning`
- **Espace Testeur** :
  - Les accès sont créés et gérés directement depuis le tableau de bord ingénieur (ex. `thibauthd`).

---

## ✨ Fonctionnalités clés

- **Tableau de bord Ingénieur** :
  - Création de prototypes (référence, pointure).
  - Gestion des comptes testeurs et attribution des paires.
  - Surveillance du kilométrage cumulé avec seuil d'usure (alerte retour laboratoire à 150 km).
- **Espace Testeur** :
  - Consultation des paires assignées.
  - Saisie des sorties d'entraînement (distance en km).
  - Mise à jour en temps réel de l'usure de chaque modèle.