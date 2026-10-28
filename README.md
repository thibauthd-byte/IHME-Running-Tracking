# IHME — Suivi R&D Prototypes (Running Tracker)

Plateforme web de suivi kilométrique et d'évaluation de la durabilité de prototypes de chaussures de running pour ingénieurs R&D et testeurs terrain (contexte STAPS / sciences du sport).

---

## 1. Cadrage du besoin

### Utilisateur cible (Persona STAPS)
* **Ingénieur R&D / Biomécanicien en équipement sportif** : conçoit des prototypes de running, doit suivre l'usure mécanique des composants (amorti mousse, semelle externe, tige) et récupérer les modèles dès qu'ils atteignent un seuil critique d'endurance.
* **Athlète / Testeur terrain STAPS** : réalise des sorties de course à pied dans le cadre d'un protocole expérimental et doit renseigner simplement ses kilomètres sans friction technique.

### Problème résolu
Le recueil papier ou sur tableur génère des pertes de données, un manque de synchronisation en temps réel et un dépassement fréquent du seuil limite de kilométrage, ce qui fausse les tests de fatigue mécanique en laboratoire.

### Scénario d'usage principal
1. **Entrée** : L'ingénieur R&D enregistre un nouveau prototype (`PROTO-PULSAR-3`, pointure 42.5) et l'assigne à un testeur (`thibauthd`).
2. **Action terrain** : Le coureur réalise une sortie de $12.5\text{ km}$ et la valide sur son espace dédié.
3. **Résultat attendu** : Le kilométrage cumulé passe à $12.5\text{ km}$, l'état d'usure progresse vers la cible ($150\text{ km}$), et une alerte de "Retour laboratoire" se déclenche automatiquement dès franchissement du seuil critique.

---

## 2. Modèle de données & Persistance

La base de données relationnelle sous **PostgreSQL 15** modélise les entités, leurs relations et leurs unités de mesure.

### Schéma des tables

| Table | Colonne | Type | Rôle / Contrainte | Unité |
| :--- | :--- | :--- | :--- | :--- |
| **`testeurs`** | `id` | `SERIAL PRIMARY KEY` | Identifiant unique | - |
| | `nom` | `VARCHAR(100)` | Nom complet de l'athlète | - |
| | `username` | `VARCHAR(60) UNIQUE` | Login (index unique insensible à la casse) | - |
| | `password_hash` | `TEXT` | Hash cryptographique (`scrypt`) | - |
| **`prototypes`** | `id` | `SERIAL PRIMARY KEY` | Identifiant unique de la paire | - |
| | `reference` | `VARCHAR(50)` | Code usine du prototype | - |
| | `pointure` | `VARCHAR(10)` | Taille normalisée | EU |
| | `testeur_id` | `INTEGER REFERENCES testeurs(id)` | Clé étrangère vers l'assignataire | - |
| | `km_total` | `NUMERIC(6,1)` | Kilométrage cumulé recalculé | km |
| **`sorties`** | `id` | `SERIAL PRIMARY KEY` | Identifiant unique de la séance | - |
| | `prototype_id` | `INTEGER REFERENCES prototypes(id)` | Clé étrangère avec suppression en cascade | - |
| | `distance_km` | `NUMERIC(4,1)` | Distance parcourue lors de la séance | km |
| | `created_at` | `TIMESTAMP` | Horodatage de l'enregistrement | - |

### Requêtes SQL de référence

```sql
-- Création et assignation d'un prototype
INSERT INTO prototypes (reference, pointure, testeur_id, km_total)
VALUES ('PROTO-PULSAR-3', '42.5', 1, 0.0);

-- Enregistrement d'une séance terrain
INSERT INTO sorties (prototype_id, distance_km)
VALUES (1, 12.5);

-- Calcul d'agrégation et vérification du seuil d'usure R&D
SELECT 
    p.reference,
    p.pointure,
    COALESCE(SUM(s.distance_km), 0) AS total_km,
    CASE 
        WHEN COALESCE(SUM(s.distance_km), 0) >= 150.0 THEN 'RETOUR_LABORATOIRE'
        ELSE 'EN_TEST'
    END AS statut_usure
FROM prototypes p
LEFT JOIN sorties s ON s.prototype_id = p.id
GROUP BY p.id;
```

---

## 3. API & Règles métier

### Calculs et transformations
* **Agrégation kilométrique** : à chaque validation d'une séance de distance $d$, la distance est stockée et le kilométrage global du prototype est mis à jour :
  $$KM_{total} = \sum_{i=1}^{n} d_i$$
* **Seuil d'usure critique (150 km)** : règle métier R&D fixée pour rapatrier l'échantillon avant délaminage de la semelle.
* **Indicateur de progression** :
  $$\text{Usure (\%)} = \min\left(100, \frac{KM_{total}}{150} \times 100\right)$$

### Contrôle et validation des entrées
* Distance $d$ : doit vérifier $0 < d \le 100\text{ km}$ (rejet des valeurs nulles, négatives ou physiologiquement aberrantes pour une séance).
* Nom d'utilisateur : conversion automatique en minuscules pour garantir l'unicité stricte.
* Mots de passe : validation d'une longueur minimale ($\ge 8$ caractères) avant dérivation par sel cryptographique.

---

## 4. Interface React

* **Visualisation claire** : Tableau de bord ingénieur avec compteurs globaux (paires actives, km cumulés, alertes retour labo) et fiches prototypes.
* **Formulaires contextualisés** : Saisie rapide de la distance par les coureurs avec rappel de la pointure et des km déjà enregistrés.
* **Gestion des erreurs lisible** :
  * Bandeau d'alerte explicite en cas de problème réseau ou serveur.
  * Validation visuelle des champs obligatoires (référence, pointure).

---

## 5. Intégration et tests de validation

Tableau récapitulatif des essais de bout en bout :

| Essai | Entrée testée | Résultat attendu | Résultat obtenu | Statut |
| :--- | :--- | :--- | :--- | :--- |
| **1. Cas normal** | Distance : `14.5` km sur prototype à `0.0` km | Le compteur passe à `14.5 km`, barre d'usure à $9.6\%$, enregistrement persistant en base | Compteur actualisé à $14.5\text{ km}$, persistance validée après rechargement | Conforme |
| **2. Cas vide / invalide** | Clic sur "Ajouter" avec champ distance vide ou `0` | Refus de validation par l'API, message de saisie invalide, aucune ligne créée dans `sorties` | Message d'erreur visible, aucune modification de la base SQL | Conforme |
| **3. Cas limite (seuil)** | Ajout de `35.5` km sur une paire ayant déjà `120.0` km (Total = $155.5\text{ km}$) | Le total dépasse $150\text{ km}$, l'état bascule immédiatement sur le badge "Retour laboratoire" | Badge d'alerte rouge affiché sur le prototype et incrémentation du compteur laboratoire | Conforme |

---

## 6. Déploiement et documentation technique

### Procédure de reproduction locale

1. **Lancement de la base PostgreSQL** :
   ```bash
   docker compose up -d
   ```
2. **Configuration (`backend/.env`)** :
   ```env
   PORT=3000
   DATABASE_URL=postgres://shoesdurability:durability@localhost:5432/running_tracker
   SESSION_SECRET=cle-secrete-ihme-running-tracking-2026-tres-longue
   ENGINEER_USERNAME=admin
   ENGINEER_PASSWORD=IhmeRunning
   ```
3. **Lancement du backend** :
   ```bash
   cd backend && PORT=3000 node server.js
   ```
4. **Lancement du frontend** :
   ```bash
   cd frontend && npm run dev
   ```
   *Accès sur `http://localhost:5173`.*

### Circulation des données (Dataflow)
1. **Saisie** : Le composant React émet une requête HTTP `POST /api/sorties` avec un cookie de session chiffré.
2. **Backend Express** : Authentifie la session, vérifie que le testeur est bien le propriétaire de la paire, et ouvre une transaction SQL.
3. **PostgreSQL** : Insère l'enregistrement dans la table `sorties` et recalcule la somme dans `prototypes`.
4. **Retour UI** : L'API répond avec le prototype actualisé ; l'état local React se met à jour sans rechargement de page.

### Limites actuelles & Perspectives d'amélioration
* **Limite identifiée** : L'application comptabilise uniquement la distance brute en kilomètres, sans différencier le type de surface (piste synthétique, route asphaltée, sentier rocheux) ni la météo (sol sec vs humide), qui influencent fortement l'abrasion des gommes.
* **Amélioration future** : Ajout d'un facteur d'abrasion par type de terrain et intégration d'un capteur de cadence Bluetooth Low Energy (BLE) pour corréler la force d'impact au vieillissement mécanique de la mousse amortissante.