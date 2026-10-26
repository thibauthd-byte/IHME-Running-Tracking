import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [prototypes, setPrototypes] = useState([]);
  const [activeTab, setActiveTab] = useState('ingenieur');
  const [currentTester, setCurrentTester] = useState('Lucas');
  const [selectedProto, setSelectedProto] = useState('');
  const [distance, setDistance] = useState('');
  const [newRef, setNewRef] = useState('');
  const [newPointure, setNewPointure] = useState('');
  const [message, setMessage] = useState('');

  const fetchPrototypes = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/prototypes');
      const data = await res.json();
      setPrototypes(data);
    } catch (err) {
      console.error('Erreur chargement:', err);
    }
  };

  useEffect(() => {
    fetchPrototypes();
  }, []);

  const assignedTesters = Array.from(
    new Set(prototypes.map((p) => p.testeur_nom).filter(Boolean))
  );

  const myPrototypes = prototypes.filter((p) => p.testeur_nom === currentTester);

  useEffect(() => {
    if (myPrototypes.length > 0) {
      setSelectedProto(myPrototypes[0].id);
    } else {
      setSelectedProto('');
    }
  }, [currentTester, prototypes]);

  const handleAddRun = async (e) => {
    e.preventDefault();
    if (!selectedProto || !distance) return;

    try {
      const res = await fetch('http://localhost:5000/api/sorties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prototype_id: parseInt(selectedProto),
          distance_km: parseFloat(distance),
        }),
      });

      if (res.ok) {
        setMessage(`+${distance} km bien ajoutés au compteur !`);
        setDistance('');
        fetchPrototypes();
        setTimeout(() => setMessage(''), 4000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateProto = async (e) => {
    e.preventDefault();
    if (!newRef || !newPointure) return;

    try {
      const res = await fetch('http://localhost:5000/api/prototypes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: newRef.toUpperCase(),
          pointure: parseFloat(newPointure),
        }),
      });

      if (res.ok) {
        setNewRef('');
        setNewPointure('');
        fetchPrototypes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssigner = async (id) => {
    const nom = prompt('Nom du coureur testeur :');
    if (nom === null) return;

    try {
      await fetch(`http://localhost:5000/api/prototypes/${id}/assigner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testeur_nom: nom.trim() || null }),
      });
      fetchPrototypes();
    } catch (err) {
      console.error(err);
    }
  };

  // KPIs
  const totalKmGlobaux = prototypes.reduce((acc, p) => acc + parseFloat(p.km_total || 0), 0);
  const nbAlertes = prototypes.filter((p) => parseFloat(p.km_total) >= 150).length;

  return (
    <div className="app-shell">
      {/* Barre de navigation supérieure */}
      <header className="topbar">
        <div className="topbar-brand">
          <span className="logo-icon">⚡</span>
          <span className="brand-name">KINETIC <strong>LAB</strong></span>
          <span className="brand-badge">Essais Terrain</span>
        </div>

        <nav className="mode-selector">
          <button
            className={`mode-btn ${activeTab === 'ingenieur' ? 'active' : ''}`}
            onClick={() => setActiveTab('ingenieur')}
          >
            Vue Ingénieur (Labo)
          </button>
          <button
            className={`mode-btn ${activeTab === 'testeur' ? 'active' : ''}`}
            onClick={() => setActiveTab('testeur')}
          >
            Vue Testeur (Terrain)
          </button>
        </nav>
      </header>

      <main className="main-content">
        {message && <div className="toast">✓ {message}</div>}

        {/* 1. ESPACE INGÉNIEUR */}
        {activeTab === 'ingenieur' && (
          <div className="dashboard-layout">
            {/* KPI Cards */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <span className="kpi-label">Paires suivies</span>
                <span className="kpi-value">{prototypes.length}</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Kilométrage total panel</span>
                <span className="kpi-value">{totalKmGlobaux.toFixed(1)} <small>km</small></span>
              </div>
              <div className={`kpi-card ${nbAlertes > 0 ? 'kpi-warning' : ''}`}>
                <span className="kpi-label">À rapatrier au labo (≥ 150 km)</span>
                <span className="kpi-value">{nbAlertes}</span>
              </div>
            </div>

            {/* Formulaire ajout prototype */}
            <div className="panel">
              <div className="panel-header">
                <h3>Enregistrer un nouveau prototype</h3>
              </div>
              <form onSubmit={handleCreateProto} className="create-form">
                <div className="form-group">
                  <label>Référence modèle</label>
                  <input
                    type="text"
                    placeholder="Ex: PROTO-VAPOR-3"
                    value={newRef}
                    onChange={(e) => setNewRef(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Pointure (EU)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="42.5"
                    value={newPointure}
                    onChange={(e) => setNewPointure(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-action">
                  + Créer le prototype
                </button>
              </form>
            </div>

            {/* Tableau principal avec jauges */}
            <div className="panel">
              <div className="panel-header">
                <h3>État du parc d'essais</h3>
                <span className="subtext">Seuil de contrôle mécanique : 150 km</span>
              </div>

              <div className="table-wrapper">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>RÉFÉRENCE</th>
                      <th>TAILLE</th>
                      <th>TESTEUR ASSIGNÉ</th>
                      <th>PROGRESSION DURABILITÉ</th>
                      <th>STATUT CONTRÔLE</th>
                      <th style={{ textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prototypes.map((p) => {
                      const km = parseFloat(p.km_total);
                      const percent = Math.min((km / 150) * 100, 100);
                      const alerte = km >= 150;
                      const jaugeColor =
                        km >= 150 ? 'danger' : km >= 100 ? 'warning' : 'normal';

                      return (
                        <tr key={p.id} className={alerte ? 'tr-alert' : ''}>
                          <td>
                            <div className="shoe-name">{p.reference}</div>
                            <span className="shoe-id">ID #{p.id}</span>
                          </td>
                          <td>
                            <span className="badge-size">{p.pointure} EU</span>
                          </td>
                          <td>
                            {p.testeur_nom ? (
                              <div className="tester-tag">
                                <span className="avatar">{p.testeur_nom.charAt(0)}</span>
                                {p.testeur_nom}
                              </div>
                            ) : (
                              <span className="unassigned">Non assigné</span>
                            )}
                          </td>
                          <td style={{ minWidth: '220px' }}>
                            <div className="gauge-header">
                              <span className="gauge-km"><strong>{km.toFixed(1)}</strong> / 150 km</span>
                              <span className="gauge-pct">{percent.toFixed(0)}%</span>
                            </div>
                            <div className="gauge-track">
                              <div
                                className={`gauge-fill gauge-${jaugeColor}`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </td>
                          <td>
                            {alerte ? (
                              <span className="status-pill status-danger">
                                ⚠️ RETOUR LABO REQUIS
                              </span>
                            ) : (
                              <span className="status-pill status-ok">
                                ✓ EN COURSE
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => handleAssigner(p.id)}
                              className="btn-assign"
                            >
                              {p.testeur_nom ? 'Changer' : 'Assigner'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 2. ESPACE TESTEUR */}
        {activeTab === 'testeur' && (
          <div className="tester-layout">
            <div className="panel tester-top-bar">
              <div>
                <h2>Espace Coureur Terrain</h2>
                <p className="subtext">Connecté à ta dotation matérielle</p>
              </div>
              <div className="user-switch-box">
                <label>Testeur actuel :</label>
                <select
                  value={currentTester}
                  onChange={(e) => setCurrentTester(e.target.value)}
                  className="tester-select"
                >
                  {assignedTesters.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {myPrototypes.length === 0 ? (
              <div className="panel empty-state">
                <div className="empty-icon">👟</div>
                <h3>Aucun prototype assigné à {currentTester}</h3>
                <p>Demande à l'ingénieur labo de t'attribuer une paire pour commencer à logger tes runs.</p>
              </div>
            ) : (
              <div className="tester-grid">
                {/* Carte de la chaussure en test */}
                {myPrototypes.map((proto) => {
                  const km = parseFloat(proto.km_total);
                  const percent = Math.min((km / 150) * 100, 100);
                  const alerte = km >= 150;

                  return (
                    <div key={proto.id} className={`panel shoe-hero-card ${alerte ? 'hero-alert' : ''}`}>
                      <div className="hero-header">
                        <span className="badge-pill">MA PAIRE ACTUELLE</span>
                        <span className="badge-size">{proto.pointure} EU</span>
                      </div>
                      
                      <h2 className="hero-title">{proto.reference}</h2>

                      <div className="odometer-box">
                        <div className="odometer-val">{km.toFixed(1)}</div>
                        <div className="odometer-unit">KM PARCOURUS</div>
                      </div>

                      <div className="hero-gauge">
                        <div className="gauge-header">
                          <span>Usure protocole</span>
                          <span>{percent.toFixed(0)}% (Objectif 150 km)</span>
                        </div>
                        <div className="gauge-track">
                          <div
                            className={`gauge-fill ${alerte ? 'gauge-danger' : km >= 100 ? 'gauge-warning' : 'gauge-normal'}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      {alerte ? (
                        <div className="alert-box">
                          <strong>⚠️ SEUIL D'ESSAI ATTEINT !</strong>
                          <p>Cette paire a dépassé 150 km. Merci de ne plus courir avec et de la ramener à l'ingénieur pour analyse de la semelle.</p>
                        </div>
                      ) : (
                        <div className="info-box">
                          Il te reste <strong>{(150 - km).toFixed(1)} km</strong> avant le prochain rappel en laboratoire.
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Formulaire de saisie d'un run */}
                <div className="panel run-form-panel">
                  <div className="panel-header">
                    <h3>⚡ Déclarer une nouvelle sortie</h3>
                    <p className="subtext">Saisie de ta séance du jour</p>
                  </div>

                  <form onSubmit={handleAddRun} className="run-form">
                    <div className="form-group">
                      <label>Paire utilisée</label>
                      <select
                        value={selectedProto}
                        onChange={(e) => setSelectedProto(e.target.value)}
                      >
                        {myPrototypes.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.reference} — {p.km_total} km au compteur
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Distance de la sortie (en km)</label>
                      <div className="input-with-unit">
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          placeholder="Ex: 15.5"
                          value={distance}
                          onChange={(e) => setDistance(e.target.value)}
                          required
                        />
                        <span className="unit-label">KM</span>
                      </div>
                    </div>

                    <button type="submit" className="btn-action-primary">
                      Valider et synchroniser la séance
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
