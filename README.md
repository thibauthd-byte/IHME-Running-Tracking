# IHME — Suivi R&D Prototypes (Running Tracker)

Plateforme web de suivi kilométrique et d'évaluation de la durabilité de prototypes de chaussures de running pour ingénieurs R&D et testeurs terrain (contexte STAPS / sciences du sport).

---

## 🔑 Guide de connexion & Accès aux tests

L'application comporte deux espaces distincts accessibles depuis la page d'accueil :

### 1. Espace Ingénieur R&D (Supervision & Gestion)
* **URL** : https://node219697-ihme26.jcloud.ik-server.com/running-tracking/
* **Onglet / Mode** : Sélectionner **"Connexion ingénieur"**
* **Identifiant** : `admin`
* **Mot de passe** : `LaboSalomon2026!`
* **Rôle** : Créer des prototypes, créer des comptes pour les coureurs, leur assigner des chaussures et suivre l'alerte des 150 km.

### 2. Espace Testeur / Athlète (Saisie terrain)
* **URL** : https://node219697-ihme26.jcloud.ik-server.com/running-tracking/
* **Onglet / Mode** : Sélectionner **"Connexion testeur"**
* **Option A (Compte créé par l'ingénieur)** :
  1. Se connecter d'abord en ingénieur (`admin` / `LaboSalomon2026!`).
  2. Dans la section *Accès à la plateforme*, créer un testeur (ex. Nom: `Lucas`, Identifiant: `lucas.m`, Mot de passe: `Testeur2026!`).
  3. Déconnecter l'ingénieur, basculer sur l'onglet testeur et se connecter avec ces identifiants.
* **Option B (Identifiants préconfigurés)** :
  * **Identifiant** : `lucas.m`
  * **Mot de passe** : `Testeur2026!`
* **Rôle** : Consulter ses paires assignées et enregistrer des séances en kilomètres.

---

## 1. Cadrage du besoin

### Utilisateur cible (Persona STAPS)
- **Ingénieur R&D / Biomécanicien en équipement sportif** : conçoit des prototypes de running, doit suivre l'usure mécanique des composants (amorti mousse EVA/PEBA, semelle externe, tige) et récupérer les modèles dès qu'ils atteignent un seuil critique d'endurance.
- **Athlète / Testeur terrain STAPS** : réalise des séances de course à pied dans le cadre d'un protocole expérimental et doit renseigner simplement ses kilomètres sans friction technique.

### Problème résolu
Le recueil papier ou sur tableur partagé engendre des retards de synchronisation, des oublis de saisie et des dépassements involontaires de durée de vie des mousses de prototypes. La plateforme automatise le calcul d'usure en direct et prévient du moment exact où la chaussure doit retourner au laboratoire pour analyse mécanique destructive.

### Scénario d'usage complet
1. **Entrée Ingénieur** : L'ingénieur enregistre un prototype (`PROTO-AERO-01`, pointure `42.5`) et l'attribue à un testeur (`lucas.m`).
2. **Entrée Testeur** : L'athlète se connecte après son entraînement et déclare une sortie de `12.5` km sur la paire attribuée.
3. **Résultat attendu** : Le kilométrage cumulé passe à `12.5 km`. Si le cumul dépasse `150.0 km`, l'interface applique l'état visuel *« Retour laboratoire »* et l'ingénieur est averti qu'il doit récupérer l'équipement pour test de compression.

---

## 2. Modèle de données

Le schéma repose sur 3 tables relationnelles sous PostgreSQL :

```sql
-- 1. Table des testeurs (comptes utilisateurs)
CREATE TABLE IF NOT EXISTS testeurs (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  username VARCHAR(60) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS testeurs_username_lower_unique ON testeurs (LOWER(username));

-- 2. Table des prototypes de chaussures
CREATE TABLE IF NOT EXISTS prototypes (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(50) NOT NULL,
  pointure VARCHAR(10) NOT NULL,
  testeur_nom VARCHAR(100),
  testeur_id INTEGER REFERENCES testeurs(id) ON DELETE SET NULL,
  km_total NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table des sorties / entraînements
CREATE TABLE IF NOT EXISTS sorties (
  id SERIAL PRIMARY KEY,
  prototype_id INTEGER REFERENCES prototypes(id) ON DELETE CASCADE,
  distance_km NUMERIC NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Explications des clés et des unités
- **Clés primaires (`PRIMARY KEY`)** : Identifiant auto-incrémenté unique (`id`) pour garantir l'intégrité de chaque enregistrement.
- **Clés étrangères (`REFERENCES`)** :
  - `prototypes.testeur_id` pointe vers `testeurs.id` (`ON DELETE SET NULL`) pour désassigner proprement une paire si un compte testeur est archivé.
  - `sorties.prototype_id` pointe vers `prototypes.id` (`ON DELETE CASCADE`) pour supprimer l'historique kilométrique associé si un prototype est détruit.
- **Unités** : 
  - `pointure` : taille normalisée EU (ex: `42.5`).
  - `distance_km` et `km_total` : distance en kilomètres (`NUMERIC`), avec précision au dixième (ex: `12.5`).

---

## 3. API et règles métier

### Règle d'usure et seuil critique (150 km)
Le backend calcule et met à jour l'usure de façon incrémentale à chaque insertion de séance :

```sql
UPDATE prototypes 
SET km_total = km_total + $1 
WHERE id = $2;
```


### Contrôle des entrées (Backend & Validation)
- Rejet des distances négatives ou nulles ($\le 0$).
- Rejet des distances aberrantes pour une séance de course ($> 150\text{ km}$).
- Rejet des mots de passe trop courts ($< 8\text{ caractères}$).
- Échappement des paramètres SQL via requêtes préparées (`$1, $2`) pour prévenir toute injection SQL.

---

## 4. Interface React

L'interface développée avec **React 18** et **Vite** fournit une expérience réactive et contextualisée :
- **Double espace dédié** : Bascule claire entre interface ingénieur et interface testeur.
- **Formulaires validés** : Messages d'erreur explicites lors d'une saisie invalide (distance non numérique, champs obligatoires vides).
- **Affichage des unités** : Toutes les valeurs métriques sont typées (ex: `km`, `EU`).
- **Jauge d'usure visuelle** : Barre de progression dynamique indiquant l'avancement vers le seuil critique des 150 km.

---

## 5. Intégration et plan de tests

| Type d'essai | Entrée utilisateur | Comportement attendu | Résultat obtenu | Validation |
| :--- | :--- | :--- | :--- | :---: |
| **Cas Normal** | Saisie d'une sortie de `12.5` km sur un prototype à `0.0` km | Incrémentation du total à `12.5 km`, persistance en base PostgreSQL | `km_total = 12.5`, affichage immédiat dans l'espace testeur et ingénieur | ✅ Validé |
| **Cas Vide / Invalide** | Soumission du formulaire sans distance ou avec `0` | Blocage côté client et rejet API (statut 400), aucun ajout en base | Message d'erreur affiché, aucune modification du compteur | ✅ Validé |
| **Cas Limite** | Ajout de `150.0` km sur un prototype neuf | Passage immédiat du prototype au statut critique "Retour laboratoire" | Le compteur passe à `150.0 km`, badge d'alerte rouge activé sur le dashboard | ✅ Validé |

---

## 6. Procédure de lancement reproductible

### 1. Lancer la base PostgreSQL (Docker)
```bash
docker compose up -d
```

### 2. Démarrer le Backend
```bash
cd backend
PORT=3000 node server.js
```
*Le serveur écoute sur le port `3000`.*

### 3. Démarrer le Frontend
```bash
cd frontend
npm run dev
```
*Vite affiche dans le terminal l'adresse à laquelle l'application est accessible.*

---

## 7. Analyse critique, limites et perspectives

- **Limite actuelle** : Le calcul de l'usure est purement quantitatif (distance kilométrique cumulée). Il ne prend pas encore en compte l'intensité de la séance (allure / fréquence cardiaque) ni la masse du coureur, facteurs influençant la dégradation du polymère d'amorti.
- **Amélioration future** : Intégrer un coefficient de contrainte mécanique basé sur le poids du testeur et la vitesse moyenne pour calculer une "distance équivalente d'usure", ainsi qu'un export direct des données en format CSV pour les logiciels de biomécanique.
