# Suivi et Durabilité des Prototypes de Chaussures Running

Application en français pour l'équipe R&D Footwear (ingénieurs matériaux/produit et panel de coureurs testeurs). Après chaque séance terrain, elle permet de collecter les données d'utilisation, de consolider le kilométrage cumulé et d'automatiser le rapatriement obligatoire des prototypes au laboratoire dès le franchissement du seuil critique des 150 km.

L'application s'appuie sur le protocole d'essai d'endurance mécanique : évaluation de l'affaissement des mousses (EVA, Pebax), contrôle de l'abrasion des semelles d'usure en caoutchouc et intégrité structurelle des plaques composites sous contrainte cyclique.

---

## Fonctionnalités

* **Cloisonnement des accès en deux vues métier** :
  * **Espace Ingénieur (Laboratoire)** : vision d'ensemble du parc de prototypes, indicateurs clés de roulage global, formulaires de création de références (`reference`, `pointure`), attribution/réassignation des coureurs et tableau de bord de supervision des alertes.
  * **Espace Testeur (Terrain)** : accès restreint et confidentiel à la paire attribuée, consultation de l'odomètre kilométrique, jauge d'usure en direct, calcul du solde kilométrique avant inspection et saisie rapide d'une sortie en quelques secondes.
* **Règle métier des 150 km** : bascule automatique et en temps réel de l'état du prototype en statut critique `RETOUR LABO REQUIS` dès que le compteur atteint ou dépasse 150,0 km, avec alerte rouge côté coureur et ligne surlignée côté laboratoire.
* **Contrôle d'intégrité transactionnel** : chaque enregistrement de séance de course recalcule et incrémente de manière atomique le kilométrage global (`km_total`) de la chaussure concernée.
* **Design system technique Salomon** : interface claire à fort contraste (fond blanc pur/gris arctique, typographie noire technique `SALOMONSans-200`, accents bleu glacier `#0284c7` et indicateurs d'urgence rouge vif).

---

## Architecture

Le diagramme ci-dessous illustre le flux de données entre les différents composants applicatifs :

```text
Navigateur (React 18, bundling Vite)
                  │ HTTP / REST (JSON)
                  ▼
      API Back-end : Node.js / Express (:5000)
                  │ SQL paramétré avec pg (Pool)
                  ▼
      Base de données : PostgreSQL 16 (Docker :5432) + volume persistant (pgdata)
                  │
                  ▼
      Inspection externe : Client SQL DBeaver
```

* **Frontend** : Application monopage (SPA) développée avec React et Vite, servant l'interface ingénieur et l'interface coureur.
* **Backend** : Serveur HTTP Node.js avec Express, sans ORM lourd : requêtes SQL paramétrées explicites utilisant la bibliothèque `pg` pour se prémunir des injections SQL.
* **Base de données** : PostgreSQL 16 isolé dans un conteneur Docker, avec persistance assurée par un volume nommé (`pgdata`). Le schéma est initialisé automatiquement au premier lancement via `init.sql`.

---

## Modèle de Données (PostgreSQL)

La base `running_tracker` est régie par deux tables liées par une contrainte de clé étrangère avec suppression en cascade :

```sql
-- Table de l'état physique du parc de prototypes
CREATE TABLE prototypes (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(50) NOT NULL,
    pointure NUMERIC(3,1) NOT NULL,
    testeur_nom VARCHAR(100),
    km_total NUMERIC(6,1) DEFAULT 0
);

-- Journal d'audit des sorties terrain
CREATE TABLE sorties (
    id SERIAL PRIMARY KEY,
    prototype_id INT REFERENCES prototypes(id) ON DELETE CASCADE,
    distance_km NUMERIC(4,1) NOT NULL,
    date_sortie TIMESTAMP DEFAULT NOW()
);
```

---

## Lancement Rapide avec Docker et Node.js

### Prérequis
* Docker Desktop ou Docker Engine avec Docker Compose v2.
* Node.js (v18 ou supérieur) et `npm`.

### 1. Démarrer la base de données
À la racine du projet `running-tracking/` :
```bash
docker compose up -d
docker compose ps
```
> Le conteneur `running_postgres` démarre sur le port `5432` et exécute automatiquement les scripts d'initialisation SQL.

### 2. Démarrer l'API Express
Dans un premier terminal :
```bash
cd backend
npm install
node server.js
```
> Le serveur d'API écoute sur `http://localhost:5000`.

### 3. Démarrer le client React
Dans un second terminal :
```bash
cd frontend
npm install
npm run dev
```
> L'interface web de test est accessible à l'adresse : **`http://localhost:5173`**.

---

## Arrêt et Maintenance des Conteneurs

Pour consulter les journaux d'exécution du conteneur de données :
```bash
docker compose logs postgres
```

Pour stopper le service :
```bash
docker compose down
```
> `docker compose down` arrête le conteneur tout en conservant le volume `pgdata`. **Ne pas ajouter `-v`**, sous peine d'effacer définitivement les paires enregistrées et l'historique des sorties.

---

## Variables de Configuration

Le backend exploite les variables définies dans `backend/.env`.

| Variable | Usage | Exemple / Valeur par défaut |
| :--- | :--- | :--- |
| `PORT` | Port d'écoute de l'API Node.js/Express | `5000` |
| `DATABASE_URL` | Chaîne de connexion complète PostgreSQL | `postgres://shoesdurability:durability@localhost:5432/running_tracker` |

### Configuration PostgreSQL dans `docker-compose.yml`
| Variable | Usage | Valeur |
| :--- | :--- | :--- |
| `POSTGRES_USER` | Compte administrateur applicatif | `shoesdurability` |
| `POSTGRES_PASSWORD` | Mot de passe de la base | `durability` |
| `POSTGRES_DB` | Nom de la base de données de suivi | `running_tracker` |

---

## Connexion et Inspection avec DBeaver

1. Ouvrir **DBeaver** et cliquer sur **Nouvelle connexion** → **PostgreSQL**.
2. Renseigner les paramètres :
   * **Hôte (Host)** : `localhost`
   * **Port** : `5432`
   * **Base de données (Database)** : `running_tracker`
   * **Nom d'utilisateur (Username)** : `shoesdurability`
   * **Mot de passe (Password)** : `durability`
3. Cliquer sur **Tester la connexion**, valider l'installation du pilote JDBC si nécessaire, puis cliquer sur **Terminer**.
4. Dérouler l'arborescence : `running_tracker` → `Schémas` → `public` → `Tables` → `prototypes` → onglet **Données** pour observer les compteurs en temps réel (touche `F5` pour rafraîchir).

---

## Scénario de Démonstration en Direct (Évaluation)

1. **Constat initial côté laboratoire** :
   * Ouvrir `http://localhost:5173` en **Vue Ingénieur**.
   * Constater la présence du prototype `PROTO-PEGASUS-V1` attribué à **Lucas** avec un cumul de **135,0 km** et le badge `EN COURSE`.
2. **Saisie d'une séance terrain** :
   * Basculer sur la **Vue Testeur** via le sélecteur d'en-tête.
   * Sélectionner **Lucas** dans la liste déroulante (seule sa paire s'affiche).
   * Saisir une sortie de **`20.0` km** dans le champ dédié et cliquer sur **Enregistrer la sortie**.
3. **Contrôle du déclenchement du seuil** :
   * L'odomètre du coureur passe instantanément à **155,0 km** et un bandeau d'alerte rouge lui intime l'ordre de cesser l'utilisation et de restituer le matériel.
   * Rebasculer en **Vue Ingénieur** : la ligne du tableau s'illumine en alerte rouge, la jauge se remplit et le statut passe automatiquement à `RETOUR LABO REQUIS`.
   * Sous DBeaver, actualiser la table `prototypes` pour constater la mise à jour transactionnelle dans PostgreSQL.

---

## Endpoints de l'API REST

Toutes les routes manipulent des charges utiles au format JSON sous le préfixe `/api` :

| Méthode | Route | Description | Corps de requête (JSON) |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/prototypes` | Liste exhaustive des prototypes et compteurs | *Aucun* |
| `POST` | `/api/prototypes` | Ajout d'une nouvelle paire au parc | `{"reference": "PROTO-SLAB-02", "pointure": 42.5}` |
| `PATCH` | `/api/prototypes/:id/assigner` | Attribution d'un coureur testeur | `{"testeur_nom": "Lucas"}` |
| `POST` | `/api/sorties` | Enregistrement d'un run et cumul SQL | `{"prototype_id": 1, "distance_km": 15.5}` |

---

## Sauvegarde et Restauration

Pour exporter l'état courant de la base de données :
```bash
docker exec -t running_postgres pg_dump -U shoesdurability running_tracker > sauvegarde_terrain.sql
```

Pour restaurer une base à partir d'un fichier de sauvegarde :
```bash
cat sauvegarde_terrain.sql | docker exec -i running_postgres psql -U shoesdurability -d running_tracker
```

---

## Sécurité et Robustesse

* **Prévention des injections SQL** : aucune concaténation directe de chaînes dans les requêtes back-end ; usage systématique des paramètres de substitution (`$1`, `$2`, etc.) via la bibliothèque Node-Postgres.
* **Isolation du réseau de données** : le conteneur PostgreSQL ne lie son port d'écoute que sur la boucle locale de l'hôte (`127.0.0.1:5432`), empêchant toute exposition non maîtrisée sur le réseau externe.
* **Persistance découplée** : la suppression ou mise à jour du code du serveur Node.js ou du conteneur applicatif n'altère pas les données enregistrées dans le volume Docker persistant.
