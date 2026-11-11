import { useEffect, useState } from 'react';
import type { FormEvent, CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import Einlagerungsschein from './Einlagerungsschein';
import LagerUebersicht from './LagerUebersicht';
import ExcelImportExport from './ExcelImportExport';
import { Search, Warehouse, FileText, History, FileSpreadsheet, LayoutDashboard, LogOut, ArrowLeft, RefreshCw, Plus } from 'lucide-react';

const ADMIN_UID = '103ca84c-cb46-440f-a1df-b95c8b1b8e52';
type RecordData = Record<string, unknown>;
type Radsatz = { id: string; kennzeichen: string | null; belegnummer: string | null; lager: string | null; lagerplatz: string | null; daten: RecordData | null; erstellt_am: string | null };
const menu = [
  { title: 'Dashboard', icon: LayoutDashboard },
  { title: 'Lagerplan', icon: Warehouse },
  { title: 'Einlagerungsscheine', icon: FileText },
  { title: 'Historie', icon: History },
  { title: 'Excel Import / Export', icon: FileSpreadsheet },
];
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const card: CSSProperties = { background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: 16 };
const button: CSSProperties = { border: 0, background: '#12365a', color: '#fff', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', fontWeight: 700 };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [page, setPage] = useState(new URLSearchParams(window.location.search).has('qr') ? 'Einlagerungsscheine' : 'Dashboard');
  const [search, setSearch] = useState('');
  const [radsatzList, setRadsatzList] = useState<Radsatz[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const isAdmin = session?.user.id === ADMIN_UID;

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => { setSession(newSession); setLoading(false); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) { setRadsatzList([]); return; }
    void loadRadsaetze();
  }, [isAdmin]);

  async function loadRadsaetze() {
    setDataLoading(true); setDataError('');
    try {
      const all: Radsatz[] = [];
      // Supabase may limit a single response; fetch all pages for correct dashboard totals.
      for (let start = 0; ; start += 1000) {
        const { data, error } = await supabase.from('reifenlager_scheine')
          .select('id,kennzeichen,belegnummer,lager,lagerplatz,daten,erstellt_am')
          .order('erstellt_am', { ascending: false }).range(start, start + 999);
        if (error) throw error;
        const batch = (data || []) as Radsatz[];
        all.push(...batch);
        if (batch.length < 1000) break;
      }
      setRadsatzList(all);
    } catch (error) { setDataError('Fehler beim Laden: ' + (error instanceof Error ? error.message : String(error))); }
    finally { setDataLoading(false); }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSigningIn(true); setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setLoginError('Anmeldung fehlgeschlagen. E-Mail und Passwort prüfen.');
    setSigningIn(false);
  }
  async function handleLogout() {
    await supabase.auth.signOut(); setSession(null); setPassword(''); setPage('Dashboard');
  }
  function navigate(target: string) {
    setPage(target); setSearch('');
    if (window.location.search) window.history.replaceState({}, '', `${window.location.origin}${window.location.pathname}`);
    if (target === 'Dashboard') void loadRadsaetze();
  }
  function openSchein(id: string) {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}?qr=${encodeURIComponent(id)}`;
    window.location.assign(url);
  }

  const query = search.trim().toLocaleLowerCase();
  const filtered = query ? radsatzList.filter(r => {
    const d = r.daten || {};
    return [r.kennzeichen, r.belegnummer, r.lager, r.lagerplatz,
      d.fahrzeug, d.vin, d.fin, d.fahrgestellnummer, d.kundenname,
      d.reifengroesse, d.reifenmarke, d.reifenbezeichnung, d.saison,
      d.bemerkung, d.fahrzeugstandort, d.auto, d.marke, d.modell,
      ...Object.values(d).filter(v => typeof v === 'string' || typeof v === 'number')]
      .map(text).join(' ').toLocaleLowerCase().includes(query);
  }) : [];
  const assigned = radsatzList.filter(r => (r.lager === 'Zelt' || r.lager === 'Lager') && !!text(r.lagerplatz));
  const zelt = assigned.filter(r => r.lager === 'Zelt').length;
  const lager = assigned.filter(r => r.lager === 'Lager').length;
  const stats = [
    ['Radsätze gesamt', radsatzList.length],
    ['Im Lager', assigned.length],
    ['Zelt', zelt],
    ['Lager', lager],
    ['Nicht zugeordnet', radsatzList.length - assigned.length],
  ] as const;

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>BESICO Reifenlager wird geladen...</div>;
  if (!isAdmin) return <div className="app">
    <header className="header"><div className="brand"><span className="brand-symbol">B</span><div><strong>BESICO</strong><small>REIFENLAGER</small></div></div><span className="header-label">Lagerverwaltung</span></header>
    <main style={{ minHeight: '75vh', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <form onSubmit={handleLogin} style={{ ...card, width: '100%', maxWidth: 400, padding: 30 }}>
        <h1>Anmeldung</h1><p>Bitte mit Ihrem Administratorkonto anmelden.</p>
        {session && <p style={{ color: '#b91c1c' }}>Dieses Konto hat keinen Administratorzugang.</p>}
        <label htmlFor="email">E-Mail</label><input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" style={{ width: '100%', boxSizing: 'border-box', padding: 12, margin: '8px 0 18px' }} />
        <label htmlFor="password">Passwort</label><input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" style={{ width: '100%', boxSizing: 'border-box', padding: 12, margin: '8px 0 18px' }} />
        {loginError && <p role="alert" style={{ color: '#b91c1c' }}>{loginError}</p>}
        <button type="submit" disabled={signingIn || !!session} style={button}>{signingIn ? 'Bitte warten...' : 'Anmelden'}</button>
        {session && <button type="button" onClick={() => void handleLogout()} style={{ marginLeft: 12 }}>Anderes Konto</button>}
      </form>
    </main>
  </div>;

  return <div className="app">
    <header className="header"><div className="brand"><span className="brand-symbol">B</span><div><strong>BESICO</strong><small>REIFENLAGER</small></div></div><span className="header-label">Lagerverwaltung</span>
      <button onClick={() => void handleLogout()} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, border: '1px solid #94a3b8', background: 'transparent', color: 'inherit', cursor: 'pointer' }}><LogOut size={18} /> Abmelden</button>
    </header>
    <div className="layout">
      <aside className="sidebar">{menu.map(({ title, icon: Icon }) => <div key={title} className={'nav-item' + (page === title ? ' active' : '')} onClick={() => navigate(title)} style={{ cursor: 'pointer' }}><Icon size={20} /><span>{title}</span></div>)}</aside>
      <main className="content">
        {page === 'Dashboard' && <>
          <div className="welcome"><h1>Reifenlager</h1><p>Radsätze und Lagerplätze verwalten</p></div>
          <div className="search-box"><Search size={24} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Kennzeichen, FIN, Fahrzeug, Reifen oder Lagerplatz suchen..." /></div>
          <div className="quick-actions">
            <div className="action-card" onClick={() => navigate('Einlagerungsscheine')} style={{ cursor: 'pointer' }}><Plus size={28} /><strong>Neuer Radsatz</strong></div>
            <div className="action-card" onClick={() => navigate('Lagerplan')} style={{ cursor: 'pointer' }}><Warehouse size={28} /><strong>Lagerplan</strong></div>
            <div className="action-card" onClick={() => void loadRadsaetze()} style={{ cursor: 'pointer' }}><RefreshCw size={28} /><strong>Aktualisieren</strong></div>
          </div>
          <h2>Übersicht</h2>
          <div className="stats">{stats.map(([name, count]) => <div className="stat-card" key={name}><span>{name}</span><strong>{dataLoading ? '...' : count}</strong></div>)}</div>
          {dataError && <p role="alert" style={{ color: '#b91c1c' }}>{dataError}</p>}
          {!!query && <section style={{ marginTop: 24 }}><h2>Suchergebnisse Radsätze ({filtered.length})</h2>
            {dataLoading && <p>Radsätze werden geladen...</p>}
            {!dataLoading && filtered.length === 0 && <p>Keine Radsätze gefunden.</p>}
            <div style={{ display: 'grid', gap: 10 }}>{filtered.map(r => {
              const d = r.daten || {};
              const location = r.lager && r.lagerplatz ? `${r.lager} · ${r.lagerplatz}` : 'Nicht zugeordnet';
              return <div key={r.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong>{r.kennzeichen || 'Ohne Kennzeichen'}</strong><span style={{ color: '#9a3412' }}>{location}</span></div>
                <p style={{ margin: '8px 0', color: '#475569' }}>{[text(d.fahrzeug), text(d.saison), text(d.reifengroesse), text(d.reifenmarke)].filter(Boolean).join(' · ') || text(r.belegnummer)}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" style={button} onClick={() => openSchein(r.id)}>Schein / QR öffnen</button>
                  <button type="button" style={{ ...button, background: '#e2e8f0', color: '#12365a' }} onClick={() => navigate('Lagerplan')}>Lagerplan öffnen</button>
                </div>
              </div>;
            })}</div>
          </section>}
          <div className="notice" style={{ marginTop: 20 }}><strong>Datenbank verbunden</strong><p>Radsätze werden aus Supabase geladen. Die Zahlen beziehen sich auf gespeicherte Radsätze.</p></div>
        </>}
        {page === 'Lagerplan' && <LagerUebersicht view="Lagerplan" />}
        {page === 'Einlagerungsscheine' && <Einlagerungsschein />}
        {page === 'Excel Import / Export' && <ExcelImportExport />}
        {page === 'Historie' && <><button type="button" style={{ ...button, background: '#e2e8f0', color: '#12365a' }} onClick={() => navigate('Dashboard')}><ArrowLeft size={16} /> Dashboard</button><div className="welcome" style={{ marginTop: 24 }}><h1>Historie</h1><p>Dieser Bereich wird im nächsten Schritt eingerichtet.</p></div></>}
      </main>
    </div>
  </div>;
}
