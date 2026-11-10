
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  Search,
  ScanLine,
  Plus,
  CarFront,
  CircleDot,
  Warehouse,
  FileText,
  History,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut
} from 'lucide-react';

const ADMIN_UID = '103ca84c-cb46-440f-a1df-b95c8b1b8e52';

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
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [search, setSearch] = useState('');

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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSigningIn(true);

    const { error: loginError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

    if (loginError) {
      setError('Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.');
    }

    setSigningIn(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setPassword('');
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        BESICO Reifenlager wird geladen...
      </div>
    );
  }

  if (!session || session.user.id !== ADMIN_UID) {
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

        <main
          style={{
            minHeight: '75vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <form
            onSubmit={handleLogin}
            style={{
              width: '100%',
              maxWidth: 400,
              padding: 30,
              background: 'white',
              borderRadius: 16,
              boxShadow: '0 8px 30px rgba(0,0,0,0.08)'
            }}
          >
            <h1 style={{ marginTop: 0 }}>Anmeldung</h1>
            <p>Bitte mit Ihrem Mitarbeiterkonto anmelden.</p>

            {session && session.user.id !== ADMIN_UID && (
              <p style={{ color: '#b91c1c' }}>
                Dieses Konto hat keinen Administratorzugang.
              </p>
            )}

            <label htmlFor="login-email">E-Mail</label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: 12,
                margin: '8px 0 18px',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                boxSizing: 'border-box'
              }}
            />

            <label htmlFor="login-password">Passwort</label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: 12,
                margin: '8px 0 18px',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                boxSizing: 'border-box'
              }}
            />

            {error && (
              <p role="alert" style={{ color: '#b91c1c' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={signingIn}
              style={{
                width: '100%',
                padding: 14,
                background: '#12365a',
                color: 'white',
                border: 0,
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              {signingIn ? 'Anmeldung läuft...' : 'Anmelden'}
            </button>

            {session && session.user.id !== ADMIN_UID && (
              <button
                type="button"
                onClick={handleLogout}
                style={{ marginTop: 16 }}
              >
                Anderes Konto verwenden
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

        <button
          onClick={handleLogout}
          style={{
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
          }}
        >
          <LogOut size={18} />
          Abmelden
        </button>
      </header>

      <div className="layout">
        <aside className="sidebar">
          {menu.map(({ title, icon: Icon }) => (
            <div className="nav-item" key={title}>
              <Icon size={20} />
              <span>{title}</span>
            </div>
          ))}
        </aside>

        <main className="content">
          <div className="welcome">
            <h1>Reifenlager</h1>
            <p>Fahrzeuge, Radsätze und Lagerplätze verwalten</p>
          </div>

          <div className="search-box">
            <Search size={24} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kennzeichen, FIN, Radsatznummer oder Lagerplatz suchen..."
            />
          </div>

          <div className="quick-actions">
            <div className="action-card">
              <ScanLine size={28} />
              <strong>QR scannen</strong>
            </div>
            <div className="action-card">
              <Plus size={28} />
              <strong>Neuer Radsatz</strong>
            </div>
            <div className="action-card">
              <CarFront size={28} />
              <strong>Fahrzeuge</strong>
            </div>
            <div className="action-card">
              <Warehouse size={28} />
              <strong>Lagerplan</strong>
            </div>
          </div>

          <h2>Übersicht</h2>

          <div className="stats">
            {[
              'Fahrzeuge',
              'Radsätze',
              'Im Lager',
              'Am Fahrzeug',
              'Ohne Fahrzeug',
              'Standort unbekannt'
            ].map((name) => (
              <div className="stat-card" key={name}>
                <span>{name}</span>
                <strong>—</strong>
              </div>
            ))}
          </div>

          <div className="notice">
            <strong>Anmeldung erfolgreich</strong>
            <p>
              Sie sind als Administrator angemeldet.
              Die Datenbank ist verbunden.
              Fahrzeug- und Radsatzverwaltung werden
              im nächsten Schritt eingerichtet.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
