# Kinetic Lab — Suivi d'usure des prototypes running

Outil d'évaluation terrain et de gestion de cycle de vie pour les prototypes de chaussures de trail/running développé pour le pôle R&D Kinetic Lab (Salomon).

* **Auteur** : Thibaut Hernandez Delangle (M2 IHME STAPS)
* **Application déployée** : [https://node219697-ihme26.jcloud.ik-server.com/running-tracking/](https://node219697-ihme26.jcloud.ik-server.com/running-tracking/)
* **Conteneur GHCR** : `ghcr.io/thibauthd-byte/ihme-running-tracking:latest`
* **Port d’écoute** : 3000 (HTTP)

---

## 1. Cadrage du besoin et scénario d'usage

### Utilisateurs cibles (STAPS & R&D Matériel)
* **Ingénieur R&D Labo** : supervise la flotte d’essai, crée les références de chaussures, attribue les paires aux athlètes testeurs et surveille l'atteinte du seuil de fatigue mécanique.
* **Athlète / Testeur terrain** : consulte sa paire en dotation et déclare le kilométrage de chaque sortie d'entraînement pour alimenter la télémétrie d’usure.

### Problème résolu
Les mousses d'amorti (EVA / TPU supercritique) et les semelles extérieures subissent un affaissement progressif avec l'accumulation des impacts. Sans télémétrie rigoureuse, les coureurs testent des prototypes au-delà de leur domaine de validité mécanique, faussant les retours biomécaniques et augmentant le risque musculo-squelettique. L'application assure le rappel automatique au laboratoire dès **150,0 km** cumulés.

### Scénario utilisateur nominal
1. **Création** : l’ingénieur enregistre un nouveau prototype (`S-LAB-PULSAR-3`, pointure `42.5 EU`).
2. **Assignation** : l’ingénieur attribue la paire au testeur `Lucas`.
3. **Saisie terrain** : l'athlète bascule sur la « Vue Testeur », sélectionne sa paire et déclare une séance de `18.5 km`.
4. **Calcul & Alerte** : le compteur passe à `18.5 km` (12 % du cycle). Dès que le seuil de `150.0 km` est franchi, l'interface déclenche l'alerte `⚠️ RETOUR LABO REQUIS` pour retour immédiat en atelier mécanique.

---

## 2. Modèle de données (PostgreSQL)

### Schéma relationnel (SQL)

```sql
-- Table des prototypes suivis
CREATE TABLE IF NOT EXISTS prototypes (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(50) NOT NULL,
  pointure VARCHAR(10) NOT NULL,
  testeur_nom VARCHAR(100),
  km_total NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des sorties d'entraînement
CREATE TABLE IF NOT EXISTS sorties (
  id SERIAL PRIMARY KEY,
  prototype_id INTEGER REFERENCES prototypes(id) ON DELETE CASCADE,
  distance_km NUMERIC NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Justification des types, clés et unités
* `prototypes.id` / `sorties.id` : clés primaires auto-incrémentées (`SERIAL`).
* `sorties.prototype_id` : clé étrangère reliant chaque run à sa chaussure, avec cascade de suppression (`ON DELETE CASCADE`).
* `pointure` : taille normalisée Europe (EU), ex. `42.5`.
* `distance_km` et `km_total` : type `NUMERIC` assurant la précision décimale sur les distances en kilomètres (ex. `12.4 km`).

---

## 3. API et règles métier

### Endpoints REST (routes `/api` et `/running-tracking/api`)
* `GET /api/health` : sonde de disponibilité (renvoie `{ status: "ok" }`).
* `GET /api/prototypes` : liste toutes les paires avec leur kilométrage cumulé.
* `POST /api/prototypes` : enregistrement d'une paire (payload : `{ reference, pointure }`).
* `PATCH /api/prototypes/:id/assigner` : attribution d'un testeur (payload : `{ testeur_nom }`).
* `POST /api/sorties` : saisie d'un entraînement (payload : `{ prototype_id, distance_km }`).

### Algorithmes et règles de calcul
1. **Incrémentation atomique** :
   $$\text{km\_total}_{\text{nouveau}} = \text{km\_total}_{\text{actuel}} + \text{distance\_km}$$
2. **Pourcentage d'usure protocole** :
   $$\text{Progression (\%)} = \min\left(\frac{\text{km\_total}}{150} \times 100,\; 100\right)$$
3. **Seuils d'état matériel** :
   * **Nominal** ($< 100\text{ km}$) : statut `✓ EN COURSE`, jauge bleue.
   * **Vigilance** ($100\text{ km} \le \text{km} < 150\text{ km}$) : statut `✓ EN COURSE`, jauge orange.
   * **Alerte critique** ($\ge 150\text{ km}$) : statut `⚠️ RETOUR LABO REQUIS`, jauge rouge.

---

## 4. Cahier d'essais et validation (3 cas)

| Cas de test | Entrées fournies | Résultat attendu | Résultat obtenu | Statut |
| :--- | :--- | :--- | :--- | :--- |
| **1. Cas normal** | Création de `PROTO-AERO`, 43 EU. Sortie : `14.2 km`. | Paire initialisée à 0 km. Après ajout : 14,2 km (9 %), statut `✓ EN COURSE`. | Kilométrage calculé à 14,2 km, affichage mis à jour en direct. | **Validé** |
| **2. Cas vide / Erreur** | Validation d'une sortie sans renseigner de distance ou valeur $\le 0$. | Contrôle d'intégrité HTML5/API bloquant l'envoi, affichage d'un avertissement. | Champ requis bloqué, aucune requête corrompue envoyée. | **Validé** |
| **3. Cas limite (Seuil 150 km)** | Prototype à 145,0 km. Saisie d'une séance de `10,0 km`. | Cumul passe à 155,0 km ($> 150$). Bascule immédiate du statut. | Badge `⚠️ RETOUR LABO REQUIS` activé et bloc d'alerte affiché. | **Validé** |

---

## 5. Déploiement et architecture technique

### Stack technique
* **Backend** : Node.js 24, Express 5, pilote `pg` (PostgreSQL) avec pool limité à 4 connexions simultanées.
* **Frontend** : React 19, Vite, interface CSS pure responsive (thème Salomon Lab).
* **Conteneur** : image Docker multi-stage `linux/amd64` hébergée sur GitHub Packages (GHCR).
* **Hébergement** : infrastructure Jelastic / Infomaniak sous le préfixe `/running-tracking/`.

### Limites et perspectives d'évolution
* **Limite actuelle** : sélection libre du profil coureur sans authentification par mot de passe.
* **Amélioration R&D** : export automatisé des rapports d'essais en format CSV/PDF pour les ingénieurs matériaux.