import { useCallback, useEffect, useState } from 'react';
import './App.css';

const apiUrl = (path) => `${import.meta.env.BASE_URL}api${path}`;
const homePath = import.meta.env.BASE_URL;

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Reponse inattendue (${response.status})`);
  }
  if (!response.ok) throw new Error(data?.error || `Erreur serveur (${response.status})`);
  return data;
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authRole, setAuthRole] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [prototypes, setPrototypes] = useState([]);
  const [testers, setTesters] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [newReference, setNewReference] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newTester, setNewTester] = useState({ nom: '', username: '', password: '' });
  const [distance, setDistance] = useState('');
  const [selectedPrototype, setSelectedPrototype] = useState('');
  const [pathname, setPathname] = useState(window.location.pathname);
  const normalizedPath = pathname.replace(/\/+$/, '');
  const pageRole = normalizedPath.endsWith('/ingenieur') ? 'engineer'
    : normalizedPath.endsWith('/testeur') ? 'tester'
      : null;

  const loadWorkspace = useCallback(async (role) => {
    const shoes = await api('/prototypes');
    setPrototypes(shoes);
    if (role === 'engineer') setTesters(await api('/testeurs'));
  }, []);

  useEffect(() => {
    const updatePath = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', updatePath);
    return () => window.removeEventListener('popstate', updatePath);
  }, []);

  useEffect(() => {
    api('/auth/me')
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        if (currentUser) {
          const path = `${import.meta.env.BASE_URL}${currentUser.role === 'engineer' ? 'ingenieur' : 'testeur'}`;
          window.history.replaceState({}, '', path);
          setPathname(path);
          return loadWorkspace(currentUser.role);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadWorkspace]);

  async function refresh() {
    if (user) await loadWorkspace(user.role);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    try {
      const { user: loggedIn } = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ role: authRole, username, password }),
      });
      setUser(loggedIn);
      const path = `${import.meta.env.BASE_URL}${loggedIn.role === 'engineer' ? 'ingenieur' : 'testeur'}`;
      window.history.pushState({}, '', path);
      setPathname(path);
      setUsername('');
      setPassword('');
      await loadWorkspace(loggedIn.role);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLogout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
      setPrototypes([]);
      setTesters([]);
      setAuthRole(null);
      window.history.pushState({}, '', homePath);
      setPathname(homePath);
    } catch (err) {
      setError(err.message);
    }
  }

  function returnToHome() {
    setAuthRole(null);
    setError('');
    window.history.pushState({}, '', homePath);
    setPathname(homePath);
  }

  async function handleCreatePrototype(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/prototypes', {
        method: 'POST',
        body: JSON.stringify({ reference: newReference, pointure: Number(newSize) }),
      });
      setNewReference('');
      setNewSize('');
      setNotice('Prototype ajouté au parc.');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAssign(prototypeId, testerId) {
    setError('');
    try {
      await api(`/prototypes/${prototypeId}/assigner`, {
        method: 'PATCH',
        body: JSON.stringify({ testeur_id: testerId || null }),
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateTester(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/testeurs', { method: 'POST', body: JSON.stringify(newTester) });
      setNewTester({ nom: '', username: '', password: '' });
      setNotice('Compte testeur créé.');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdateTester(event, tester) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = { nom: form.get('nom') };
    if (form.get('password')) payload.password = form.get('password');
    try {
      await api(`/testeurs/${tester.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setNotice(`Compte de ${payload.nom} mis à jour.`);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteTester(tester) {
    if (!window.confirm(`Supprimer le compte de ${tester.nom} ? Ses paires seront désattribuées.`)) return;
    setError('');
    try {
      await api(`/testeurs/${tester.id}`, { method: 'DELETE' });
      setNotice(`Compte de ${tester.nom} supprimé.`);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeletePrototype(prototype) {
    if (!window.confirm(`Supprimer ${prototype.reference} et son historique de sorties ?`)) return;
    setError('');
    try {
      await api(`/prototypes/${prototype.id}`, { method: 'DELETE' });
      setNotice(`${prototype.reference} supprimé.`);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddRun(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/sorties', {
        method: 'POST',
        body: JSON.stringify({ prototype_id: Number(effectivePrototypeId), distance_km: Number(distance) }),
      });
      setDistance('');
      setNotice('Sortie enregistrée, kilométrage synchronisé.');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  if (loading || (user && !pageRole)) {
    return <main className="loading-screen"><span className="brand-mark">K</span><p>Chargement de votre espace…</p></main>;
  }

  if (!user || !pageRole) {
    const chosenRole = authRole || pageRole;
    return (
      <div className="login-page">
        <header className="site-header">
          <a className="brand" href={homePath}><span className="brand-mark">K</span><span>KINETIC <b>LAB</b></span></a>
          <span className="header-note">SUIVI DES PROTOTYPES RUNNING</span>
        </header>
        <main className="login-main">
          <div className="login-intro">
            <p className="eyebrow">PLATEFORME D’ESSAIS TERRAIN</p>
            <h1>Chaque kilomètre<br />fait avancer le projet.</h1>
            <p>Un espace dédié pour piloter les prototypes et suivre vos essais en toute simplicité.</p>
          </div>
          {!chosenRole ? (
            <div className="role-cards">
              <button className="role-card" onClick={() => setAuthRole('engineer')}>
                <span className="role-icon">↗</span>
                <span className="eyebrow">ESPACE LABORATOIRE</span>
                <strong>Ingénieur</strong>
                <span>Gérez vos testeurs, vos prototypes et les attributions.</span>
                <span className="role-link">Connexion ingénieur <b>→</b></span>
              </button>
              <button className="role-card" onClick={() => setAuthRole('tester')}>
                <span className="role-icon">⌁</span>
                <span className="eyebrow">ESPACE TERRAIN</span>
                <strong>Testeur</strong>
                <span>Consultez uniquement vos paires et déclarez vos sorties.</span>
                <span className="role-link">Connexion testeur <b>→</b></span>
              </button>
            </div>
          ) : (
            <form className="login-card" onSubmit={handleLogin}>
              <button className="back-link" type="button" onClick={returnToHome}>← Choisir un espace</button>
              <p className="eyebrow">{chosenRole === 'engineer' ? 'ESPACE LABORATOIRE' : 'ESPACE TERRAIN'}</p>
              <h2>Connexion {chosenRole === 'engineer' ? 'ingénieur' : 'testeur'}</h2>
              <label className="field-label" htmlFor="login-username">Identifiant</label>
              <input id="login-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
              <label className="field-label" htmlFor="login-password">Mot de passe</label>
              <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              {error && <p className="feedback error" role="alert">{error}</p>}
              <button className="button button-dark full-width" type="submit">Se connecter <span>→</span></button>
            </form>
          )}
          {!chosenRole && error && <p className="feedback error" role="alert">{error}</p>}
        </main>
        <footer className="login-footer"><span>KINETIC LAB · R&D RUNNING</span><span>Suivi de durabilité des prototypes</span></footer>
      </div>
    );
  }

  const isEngineer = user.role === 'engineer';
  const totalKm = prototypes.reduce((total, prototype) => total + Number(prototype.km_total || 0), 0);
  const alerts = prototypes.filter((prototype) => Number(prototype.km_total) >= 150).length;
  const effectivePrototypeId = prototypes.some((prototype) => String(prototype.id) === selectedPrototype)
    ? selectedPrototype
    : String(prototypes[0]?.id || '');
  const progressFor = (km) => Math.min((Number(km) / 150) * 100, 100);

  return (
    <div className="workspace">
      <header className="workspace-header">
        <a className="brand" href={homePath}><span className="brand-mark">K</span><span>KINETIC <b>LAB</b></span></a>
        <div className="workspace-user">
          <span className="role-badge">{isEngineer ? 'LABORATOIRE' : 'ESPACE TESTEUR'}</span>
          <span className="user-name">{user.name}</span>
          <button className="sign-out" onClick={handleLogout}>Déconnexion <span>↗</span></button>
        </div>
      </header>

      <main className="workspace-main">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{isEngineer ? 'PILOTAGE R&D' : 'SUIVI TERRAIN'}</p>
            <h1>{isEngineer ? 'Parc d’essais' : 'Mon espace de test'}</h1>
            <p>{isEngineer ? 'Vue d’ensemble des prototypes et des testeurs.' : 'Vos paires attribuées et votre progression.'}</p>
          </div>
          <span className="heading-date">KINETIC LAB <span>•</span> RUNNING</span>
        </div>

        {(error || notice) && (
          <div className={`feedback-banner ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>
            {error || notice}
            <button onClick={() => { setError(''); setNotice(''); }} aria-label="Fermer">×</button>
          </div>
        )}

        {isEngineer ? (
          <>
            <section className="metric-grid" aria-label="Indicateurs">
              <article className="metric-card"><span className="metric-icon blue">◈</span><span className="metric-label">Paires suivies</span><strong>{prototypes.length.toString().padStart(2, '0')}</strong><span className="metric-foot">{testers.length} testeurs dans le panel</span></article>
              <article className="metric-card"><span className="metric-icon">⌁</span><span className="metric-label">Kilométrage cumulé</span><strong>{totalKm.toFixed(1)}<small> km</small></strong><span className="metric-foot">sur l’ensemble du parc</span></article>
              <article className={`metric-card ${alerts ? 'metric-alert' : ''}`}><span className="metric-icon">!</span><span className="metric-label">Retour laboratoire</span><strong>{alerts.toString().padStart(2, '0')}</strong><span className="metric-foot">paires au seuil de 150 km</span></article>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div><p className="eyebrow">GESTION DU PARC</p><h2>Prototypes</h2></div>
                <span className="section-count">{prototypes.length} paire{prototypes.length > 1 ? 's' : ''}</span>
              </div>
              <form className="inline-form prototype-form" onSubmit={handleCreatePrototype}>
                <label>Référence<input placeholder="Ex. PROTO-PULSAR-3" value={newReference} onChange={(event) => setNewReference(event.target.value)} maxLength="50" required /></label>
                <label>Pointure EU<input type="number" step="0.5" min="20" max="55" placeholder="42.5" value={newSize} onChange={(event) => setNewSize(event.target.value)} required /></label>
                <button className="button button-dark" type="submit">+ Ajouter un prototype</button>
              </form>
              <div className="table-scroll">
                <table className="prototype-table">
                  <thead><tr><th>MODÈLE</th><th>TESTEUR ATTRIBUÉ</th><th>USURE / 150 KM</th><th>ÉTAT</th><th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {prototypes.map((prototype) => {
                      const km = Number(prototype.km_total || 0);
                      const percent = progressFor(km);
                      return (
                        <tr key={prototype.id}>
                          <td><strong className="model-name">{prototype.reference}</strong><span className="model-meta">Paire #{prototype.id} · {prototype.pointure} EU</span></td>
                          <td><select className="assignment-select" aria-label={`Attribuer ${prototype.reference}`} value={prototype.testeur_id || ''} onChange={(event) => handleAssign(prototype.id, event.target.value)}><option value="">Non attribué</option>{testers.map((tester) => <option key={tester.id} value={tester.id}>{tester.nom}</option>)}</select></td>
                          <td className="progress-cell"><div className="progress-caption"><strong>{km.toFixed(1)} km</strong><span>{percent.toFixed(0)}%</span></div><div className="progress-track"><span className={km >= 150 ? 'danger' : km >= 100 ? 'warning' : ''} style={{ width: `${percent}%` }} /></div></td>
                          <td><span className={`status ${km >= 150 ? 'status-danger' : 'status-ok'}`}>{km >= 150 ? 'À rapatrier' : 'En course'}</span></td>
                          <td><button className="icon-button danger-text" aria-label={`Supprimer ${prototype.reference}`} onClick={() => handleDeletePrototype(prototype)}>×</button></td>
                        </tr>
                      );
                    })}
                    {!prototypes.length && <tr><td className="empty-table" colSpan="5">Aucun prototype pour le moment. Ajoutez une paire pour démarrer le suivi.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel tester-management">
              <div className="section-heading">
                <div><p className="eyebrow">ACCÈS À LA PLATEFORME</p><h2>Testeurs</h2></div>
                <span className="section-count">{testers.length} compte{testers.length > 1 ? 's' : ''}</span>
              </div>
              <form className="inline-form tester-create-form" onSubmit={handleCreateTester}>
                <label>Nom du testeur<input placeholder="Ex. Lucas Martin" value={newTester.nom} onChange={(event) => setNewTester({ ...newTester, nom: event.target.value })} maxLength="100" required /></label>
                <label>Identifiant<input placeholder="Ex. lucas.m" value={newTester.username} onChange={(event) => setNewTester({ ...newTester, username: event.target.value })} maxLength="60" required /></label>
                <label>Mot de passe initial<input type="password" autoComplete="new-password" placeholder="10 caractères minimum" value={newTester.password} onChange={(event) => setNewTester({ ...newTester, password: event.target.value })} minLength="10" required /></label>
                <button className="button button-outline" type="submit">+ Créer un compte</button>
              </form>
              <div className="tester-list">
                {testers.map((tester) => (
                  <form className="tester-row" key={tester.id} onSubmit={(event) => handleUpdateTester(event, tester)}>
                    <span className="tester-avatar">{tester.nom.slice(0, 1).toUpperCase()}</span>
                    <label className="tester-name-field">Nom<input name="nom" defaultValue={tester.nom} maxLength="100" required /></label>
                    <span className="tester-username">{tester.username}{!tester.actif && <em> · accès à activer</em>}</span>
                    <span className="tester-pairs">{tester.paires} paire{tester.paires !== 1 ? 's' : ''}</span>
                    <label className="password-reset">Mot de passe<input name="password" type="password" autoComplete="new-password" placeholder={tester.actif ? 'Laisser vide pour conserver' : '10 caractères minimum'} minLength="10" /></label>
                    <button className="button button-outline small-button" type="submit">Enregistrer</button>
                    <button className="icon-button danger-text" aria-label={`Supprimer le compte de ${tester.nom}`} type="button" onClick={() => handleDeleteTester(tester)}>×</button>
                  </form>
                ))}
                {!testers.length && <p className="empty-copy">Créez un compte pour donner à un testeur accès à son espace personnel.</p>}
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="tester-welcome">
              <span className="welcome-mark">⌁</span>
              <div><span className="eyebrow">BIENVENUE, {user.name.toUpperCase()}</span><p>Voici le suivi de vos chaussures de test.</p></div>
              <span className="private-badge"><span /> Espace personnel</span>
            </div>
            {!prototypes.length ? (
              <section className="panel tester-empty">
                <span className="empty-shoe">◒</span><h2>Aucune paire attribuée</h2>
                <p>Votre ingénieur vous attribuera une paire dès qu’elle sera prête.</p>
              </section>
            ) : (
              <>
                <section className="shoe-grid">
                  {prototypes.map((prototype, index) => {
                    const km = Number(prototype.km_total || 0);
                    const percent = progressFor(km);
                    return (
                      <article className={`shoe-card ${km >= 150 ? 'shoe-card-alert' : ''}`} key={prototype.id}>
                        <div className="shoe-card-top"><span className="shoe-index">PAIRE 0{index + 1}</span><span className="badge-size">{prototype.pointure} EU</span></div>
                        <h2>{prototype.reference}</h2>
                        <div className="shoe-km"><strong>{km.toFixed(1)}</strong><span>KM<br />PARCOURUS</span></div>
                        <div className="progress-caption"><span>Progression du protocole</span><strong>{percent.toFixed(0)}%</strong></div>
                        <div className="progress-track large-track"><span className={km >= 150 ? 'danger' : km >= 100 ? 'warning' : ''} style={{ width: `${percent}%` }} /></div>
                        {km >= 150 ? <p className="shoe-warning">Seuil atteint : merci de rapporter cette paire au laboratoire.</p>
                          : <p className="shoe-note">{(150 - km).toFixed(1)} km avant le prochain contrôle laboratoire.</p>}
                      </article>
                    );
                  })}
                </section>
                <section className="panel run-panel">
                  <div className="section-heading">
                    <div><p className="eyebrow">CARNET D’ENTRAÎNEMENT</p><h2>Déclarer une sortie</h2></div>
                    <span className="run-symbol">↗</span>
                  </div>
                  <form className="run-form" onSubmit={handleAddRun}>
                    <label>Paire utilisée<select value={effectivePrototypeId} onChange={(event) => setSelectedPrototype(event.target.value)} required>{prototypes.map((prototype) => <option key={prototype.id} value={prototype.id}>{prototype.reference} · {Number(prototype.km_total).toFixed(1)} km</option>)}</select></label>
                    <label>Distance parcourue<div className="distance-input"><input type="number" step="0.1" min="0.1" max="300" placeholder="Ex. 12.5" value={distance} onChange={(event) => setDistance(event.target.value)} required /><span>KM</span></div></label>
                    <button className="button button-dark" type="submit">Enregistrer la sortie <span>→</span></button>
                  </form>
                </section>
              </>
            )}
          </>
        )}
      </main>
      <footer className="workspace-footer"><span>KINETIC LAB · R&D RUNNING</span><span>Seuil de contrôle mécanique : 150 km</span></footer>
    </div>
  );
}

export default App;
