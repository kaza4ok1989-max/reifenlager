
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  Search, ScanLine, Plus, CarFront, CircleDot,
  Warehouse, FileText, History, FileSpreadsheet,
  LayoutDashboard, LogOut, ArrowLeft, RefreshCw
} from 'lucide-react';

const ADMIN_UID = '103ca84c-cb46-440f-a1df-b95c8b1b8e52';

type Fahrzeug = {
  id: string;
  kennzeichen: string | null;
  vin: string | null;
  marke: string | null;
  modell: string | null;
  kunde_name: string | null;
  kunde_telefon: string | null;
  bemerkung: string | null;
};

const emptyForm = {
  kennzeichen: '',
  vin: '',
  marke: '',
  modell: '',
  kunde_name: '',
  kunde_telefon: '',
  bemerkung: ''
};

const menu = [
  { title: 'Dashboard', icon: LayoutDashboard },
  { title: 'Fahrzeuge', icon: CarFront },
  { title: 'Radsätze', icon: CircleDot },
  { title: 'Lagerplan', icon: Warehouse },
  { title: 'Einlagerungsscheine', icon: FileText },
  { title: 'Historie', icon: History },
  { title: 'Excel Import / Export', icon: FileSpreadsheet }
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const [page, setPage] = useState('Dashboard');
  const [search, setSearch] = useState('');
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [form, setForm] = useState({ ...emptyForm });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const isAdmin = session?.user.id === ADMIN_UID;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadFahrzeuge();
    } else {
      setFahrzeuge([]);
    }
  }, [isAdmin]);

  async function loadFahrzeuge() {
    setDataLoading(true);
    setDataError('');

    const { data, error } = await supabase
      .from('fahrzeuge')
      .select('*')
      .order('erstellt_am', { ascending: false });

    if (error) {
      setDataError('Fehler beim Laden: ' + error.message);
    } else {
      setFahrzeuge((data || []) as Fahrzeug[]);
    }

    setDataLoading(false);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError('');
    setSigningIn(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      setLoginError(
        'Anmeldung fehlgeschlagen. E-Mail und Passwort prüfen.'
      );
    }

    setSigningIn(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setPassword('');
    setPage('Dashboard');
  }

  async function saveFahrzeug(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSaving(true);

    const payload = {
      kennzeichen: form.kennzeichen.trim().toUpperCase(),
      vin: form.vin.trim().toUpperCase() || null,
      marke: form.marke.trim() || null,
      modell: form.modell.trim() || null,
      kunde_name: form.kunde_name.trim() || null,
      kunde_telefon: form.kunde_telefon.trim() || null,
      bemerkung: form.bemerkung.trim() || null
    };

    const { error } = await supabase
      .from('fahrzeuge')
      .insert(payload);

    if (error) {
      setMessage('Fehler beim Speichern: ' + error.message);
    } else {
      setForm({ ...emptyForm });
      setShowForm(false);
      setMessage('Fahrzeug erfolgreich gespeichert.');
      await loadFahrzeuge();
    }

    setSaving(false);
  }

  function changeField(
    field: keyof typeof emptyForm,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value
    }));
  }

  const filteredFahrzeuge = fahrzeuge.filter((f) => {
    const text = [
      f.kennzeichen,
      f.vin,
      f.marke,
      f.modell,
      f.kunde_name
    ].join(' ').toLowerCase();

    return text.includes(search.toLowerCase().trim());
  });

  const inputStyle = {
    width: '100%',
    padding: 12,
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    boxSizing: 'border-box' as const,
    fontSize: 14
  };

  const buttonStyle = {
    padding: '11px 18px',
    background: '#12365a',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 700 as const
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        BESICO Reifenlager wird geladen...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="app">
        <header className="header">
          <div className="brand">
            <span className="brand-symbol">B</span>
            <div>
              <strong>BESICO</strong>
              <small>REIFENLAGER</small>
            </div>
          </div>
          <span className="header-label">Lagerverwaltung</span>
        </header>

        <main style={{
          minHeight: '75vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>
          <form onSubmit={handleLogin} style={{
            width: '100%',
            maxWidth: 400,
            padding: 30,
            background: 'white',
            borderRadius: 16,
            boxShadow: '0 8px 30px rgba(0,0,0,0.08)'
          }}>
            <h1>Anmeldung</h1>
            <p>Bitte mit Ihrem Administratorkonto anmelden.</p>

            {session && (
              <p style={{ color: '#b91c1c' }}>
                Dieses Konto hat keinen Administratorzugang.
              </p>
            )}

            <label htmlFor="email">E-Mail</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              style={{ ...inputStyle, margin: '8px 0 18px' }}
            />

            <label htmlFor="password">Passwort</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ ...inputStyle, margin: '8px 0 18px' }}
            />

            {loginError && (
              <p role="alert" style={{ color: '#b91c1c' }}>
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={signingIn || !!session}
              style={buttonStyle}
            >
              {signingIn ? 'Bitte warten...' : 'Anmelden'}
            </button>

            {session && (
              <button
                type="button"
                onClick={handleLogout}
                style={{ marginLeft: 12 }}
              >
                Anderes Konto
              </button>
            )}
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-symbol">B</span>
          <div>
            <strong>BESICO</strong>
            <small>REIFENLAGER</small>
          </div>
        </div>

        <span className="header-label">Lagerverwaltung</span>

        <button onClick={handleLogout} style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 14px',
          borderRadius: 8,
          border: '1px solid #94a3b8',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer'
        }}>
          <LogOut size={18} />
          Abmelden
        </button>
      </header>

      <div className="layout">
        <aside className="sidebar">
          {menu.map(({ title, icon: Icon }) => (
            <div
              className={
                'nav-item' +
                (page === title ? ' active' : '')
              }
              key={title}
              onClick={() => {
                setPage(title);
                setSearch('');
                setMessage('');
                setShowForm(false);
              }}
              style={{ cursor: 'pointer' }}
            >
              <Icon size={20} />
              <span>{title}</span>
            </div>
          ))}
        </aside>

        <main className="content">
          {page === 'Dashboard' && (
            <>
              <div className="welcome">
                <h1>Reifenlager</h1>
                <p>
                  Fahrzeuge, Radsätze und Lagerplätze verwalten
                </p>
              </div>

              <div className="search-box">
                <Search size={24} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Kennzeichen, FIN oder Kunde suchen..."
                />
              </div>

              <div className="quick-actions">
                <div className="action-card">
                  <ScanLine size={28} />
                  <strong>QR scannen</strong>
                </div>
                <div
                  className="action-card"
                  onClick={() => setPage('Radsätze')}
                  style={{ cursor: 'pointer' }}
                >
                  <Plus size={28} />
                  <strong>Neuer Radsatz</strong>
                </div>
                <div
                  className="action-card"
                  onClick={() => setPage('Fahrzeuge')}
                  style={{ cursor: 'pointer' }}
                >
                  <CarFront size={28} />
                  <strong>Fahrzeuge</strong>
                </div>
                <div
                  className="action-card"
                  onClick={() => setPage('Lagerplan')}
                  style={{ cursor: 'pointer' }}
                >
                  <Warehouse size={28} />
                  <strong>Lagerplan</strong>
                </div>
              </div>

              <h2>Übersicht</h2>

              <div className="stats">
                {[
                  ['Fahrzeuge', dataLoading ? '...' : String(fahrzeuge.length)],
                  ['Radsätze', '—'],
                  ['Im Lager', '—'],
                  ['Am Fahrzeug', '—'],
                  ['Ohne Fahrzeug', '—'],
                  ['Standort unbekannt', '—']
                ].map(([name, value]) => (
                  <div className="stat-card" key={name}>
                    <span>{name}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              {dataError && (
                <p style={{ color: '#b91c1c' }}>{dataError}</p>
              )}

              {search && (
                <div style={{ marginTop: 24 }}>
                  <h2>Suchergebnisse Fahrzeuge</h2>
                  {filteredFahrzeuge.map((f) => (
                    <div key={f.id} style={{
                      padding: 14,
                      background: 'white',
                      borderRadius: 8,
                      marginBottom: 8
                    }}>
                      <strong>{f.kennzeichen || 'Ohne Kennzeichen'}</strong>
                      {' — '}
                      {f.marke} {f.modell}
                      {' — '}
                      {f.kunde_name}
                    </div>
                  ))}
                  {filteredFahrzeuge.length === 0 && (
                    <p>Keine Fahrzeuge gefunden.</p>
                  )}
                </div>
              )}

              <div className="notice">
                <strong>Datenbank verbunden</strong>
                <p>
                  Fahrzeugdaten werden aus Supabase geladen.
                  Weitere Funktionen folgen.
                </p>
              </div>
            </>
          )}

          {page === 'Fahrzeuge' && (
            <>
              <div className="welcome">
                <h1>Fahrzeuge</h1>
                <p>Fahrzeuge und Kundendaten verwalten</p>
              </div>

              <div style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 20
              }}>
                <button
                  style={buttonStyle}
                  onClick={() => {
                    setShowForm(!showForm);
                    setMessage('');
                  }}
                >
                  {showForm ? 'Abbrechen' : '+ Neues Fahrzeug'}
                </button>

                <button
                  style={{
                    ...buttonStyle,
                    background: '#e2e8f0',
                    color: '#12365a'
                  }}
                  onClick={() => void loadFahrzeuge()}
                >
                  <RefreshCw size={16} />
                  {' '}Aktualisieren
                </button>
              </div>

              {showForm && (
                <form onSubmit={saveFahrzeug} style={{
                  padding: 24,
                  background: 'white',
                  borderRadius: 14,
                  marginBottom: 24,
                  border: '1px solid #e2e8f0'
                }}>
                  <h2>Neues Fahrzeug</h2>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 16
                  }}>
                    {([
                      ['kennzeichen', 'Kennzeichen *'],
                      ['vin', 'FIN / VIN'],
                      ['marke', 'Marke'],
                      ['modell', 'Modell'],
                      ['kunde_name', 'Kundenname'],
                      ['kunde_telefon', 'Telefon']
                    ] as const).map(([field, label]) => (
                      <label key={field}>
                        <span style={{
                          display: 'block',
                          marginBottom: 7
                        }}>
                          {label}
                        </span>
                        <input
                          required={field === 'kennzeichen'}
                          value={form[field]}
                          onChange={(e) =>
                            changeField(field, e.target.value)
                          }
                          style={inputStyle}
                        />
                      </label>
                    ))}
                  </div>

                  <label style={{
                    display: 'block',
                    marginTop: 16
                  }}>
                    Bemerkung
                    <textarea
                      value={form.bemerkung}
                      onChange={(e) =>
                        changeField('bemerkung', e.target.value)
                      }
                      rows={3}
                      style={{
                        ...inputStyle,
                        display: 'block',
                        marginTop: 8
                      }}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      ...buttonStyle,
                      marginTop: 18
                    }}
                  >
                    {saving ? 'Speichern...' : 'Fahrzeug speichern'}
                  </button>
                </form>
              )}

              {message && (
                <p role="status" style={{
                  padding: 14,
                  background: 'white',
                  borderRadius: 8
                }}>
                  {message}
                </p>
              )}

              <div className="search-box">
                <Search size={22} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Kennzeichen, FIN, Marke oder Kunde suchen..."
                />
              </div>

              {dataError && (
                <p style={{ color: '#b91c1c' }}>
                  {dataError}
                </p>
              )}

              <h2>
                Fahrzeugliste ({filteredFahrzeuge.length})
              </h2>

              {dataLoading ? (
                <p>Fahrzeuge werden geladen...</p>
              ) : filteredFahrzeuge.length === 0 ? (
                <div className="notice">
                  <strong>Keine Fahrzeuge gefunden</strong>
                  <p>
                    Klicken Sie auf „Neues Fahrzeug“,
                    um das erste Fahrzeug anzulegen.
                  </p>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gap: 12
                }}>
                  {filteredFahrzeuge.map((f) => (
                    <div key={f.id} style={{
                      padding: 20,
                      background: 'white',
                      borderRadius: 12,
                      border: '1px solid #e2e8f0'
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10
                      }}>
                        <strong style={{ fontSize: 20 }}>
                          {f.kennzeichen || 'Ohne Kennzeichen'}
                        </strong>
                        <span>{f.marke} {f.modell}</span>
                      </div>

                      <p style={{ marginBottom: 5 }}>
                        <strong>FIN:</strong> {f.vin || '—'}
                      </p>
                      <p style={{ marginBottom: 5 }}>
                        <strong>Kunde:</strong> {f.kunde_name || '—'}
                      </p>
                      <p style={{ marginBottom: 5 }}>
                        <strong>Telefon:</strong> {f.kunde_telefon || '—'}
                      </p>
                      {f.bemerkung && (
                        <p>
                          <strong>Bemerkung:</strong> {f.bemerkung}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {page !== 'Dashboard' && page !== 'Fahrzeuge' && (
            <>
              <button
                onClick={() => setPage('Dashboard')}
                style={{
                  ...buttonStyle,
                  background: '#e2e8f0',
                  color: '#12365a'
                }}
              >
                <ArrowLeft size={16} />
                {' '}Dashboard
              </button>

              <div className="welcome" style={{ marginTop: 24 }}>
                <h1>{page}</h1>
                <p>
                  Dieser Bereich wird im nächsten Schritt eingerichtet.
                </p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
