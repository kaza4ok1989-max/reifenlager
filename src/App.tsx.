
import { useState } from 'react';
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
  LayoutDashboard
} from 'lucide-react';

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
  const [search, setSearch] = useState('');

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
            <strong>Einrichtung läuft</strong>
            <p>
              Die Datenbank und die Mitarbeiteranmeldung werden
              im nächsten Schritt eingerichtet.
              Es werden noch keine echten Lagerdaten angezeigt.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
