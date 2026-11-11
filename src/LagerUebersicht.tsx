import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { supabase } from './supabase';
import { RefreshCw, Search, MapPin, FileText, Plus, Trash2, GripVertical } from 'lucide-react';

type Schein = { id: string; belegnummer: string | null; kennzeichen: string; lager: string; lagerplatz: string; daten: Record<string, unknown> | null; erstellt_am: string };
type Area = 'Zelt' | 'Lager';
const btn: CSSProperties = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', color: '#12365a', fontWeight: 600 };
const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase().replace(/\s+/g, '');
const field = (r: Schein, key: string) => String(r.daten?.[key] ?? '').trim();
const qrUrl = (id: string) => `${window.location.origin}${import.meta.env.BASE_URL}?qr=${encodeURIComponent(id)}`;
const keyOf = (area: string, place: string) => `${norm(area)}::${norm(place)}`;

export default function LagerUebersicht({ view }: { view: 'Radsätze' | 'Lagerplan' }) {
  const [rows, setRows] = useState<Schein[]>([]);
  const [regale, setRegale] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [lager, setLager] = useState<Area>('Zelt');
  const [selected, setSelected] = useState<string | null>(null);
  const [newRegal, setNewRegal] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    const [scheine, shelves] = await Promise.all([
      supabase.from('reifenlager_scheine').select('id,belegnummer,kennzeichen,lager,lagerplatz,daten,erstellt_am').order('erstellt_am', { ascending: false }),
      supabase.from('reifenlager_regale').select('nummer').order('nummer'),
    ]);
    const problems = [scheine.error && `Radsätze: ${scheine.error.message}`, shelves.error && `Regale: ${shelves.error.message}`].filter(Boolean);
    setError(problems.join(' | '));
    if (!scheine.error) setRows((scheine.data ?? []) as Schein[]);
    if (!shelves.error) setRegale((shelves.data ?? []).map(r => String(r.nummer)));
    setBusy(false);
  }
  useEffect(() => { void refresh(); }, []);

  const occupied = useMemo(() => {
    const map = new Map<string, Schein[]>();
    for (const r of rows) {
      if (!r.lagerplatz?.trim()) continue;
      const key = keyOf(r.lager, r.lagerplatz);
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return map;
  }, [rows]);
  const at = (place: string, area: Area = lager) => occupied.get(keyOf(area, place)) ?? [];
  const filtered = rows.filter(r => [r.kennzeichen, r.belegnummer, r.lager, r.lagerplatz, field(r, 'kundenname'), field(r, 'fahrzeug')].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const selectedRows = selected ? at(selected) : [];
  const rackPlaces = regale.flatMap(n => [0, 1, 2].map(i => `${n}0${i}`));
  const warehousePlaces = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, s) => [`R${r + 1}-${s + 1}-Unten`, `R${r + 1}-${s + 1}-Oben`])).flat(2);
  const validPlaces = lager === 'Zelt' ? rackPlaces : warehousePlaces;
  const currentId = dragged;
  const activeDrag = rows.find(r => r.id === currentId);

  async function addRegal() {
    const nummer = newRegal.trim();
    if (!/^\d{4}$/.test(nummer)) { setError('Regalnummer: bitte genau 4 Ziffern eingeben (z. B. 1009).'); return; }
    if (regale.includes(nummer)) { setError('Dieses Regal existiert bereits.'); return; }
    setWorking(true); setError(''); setMessage('');
    const { error: e } = await supabase.from('reifenlager_regale').insert({ nummer });
    if (e) setError('Regal hinzufügen: ' + e.message);
    else { setNewRegal(''); setMessage(`Regal ${nummer} hinzugefügt.`); await refresh(); }
    setWorking(false);
  }

  async function deleteRegal(nummer: string) {
    const places = [0, 1, 2].map(i => `${nummer}0${i}`);
    if (rows.some(r => norm(r.lager) === 'ZELT' && places.some(p => norm(p) === norm(r.lagerplatz)))) {
      setError(`Regal ${nummer} ist belegt. Zuerst die Radsätze löschen oder auf freie Plätze verschieben.`); return;
    }
    if (!window.confirm(`Regal ${nummer} wirklich löschen?`)) return;
    setWorking(true); setError(''); setMessage('');
    const { error: e } = await supabase.from('reifenlager_regale').delete().eq('nummer', nummer);
    if (e) setError('Regal löschen: ' + e.message);
    else { setMessage(`Regal ${nummer} gelöscht.`); setSelected(null); await refresh(); }
    setWorking(false);
  }

  async function moveTo(id: string, place: string) {
    if (working) return;
    const source = rows.find(r => r.id === id);
    if (!source) { setError('Radsatz nicht gefunden. Bitte aktualisieren.'); return; }
    if (!validPlaces.some(p => norm(p) === norm(place))) { setError('Ungültiger Lagerplatz.'); return; }
    if (at(place).some(r => r.id !== id)) { setError('Dieser Lagerplatz ist bereits belegt! Zuerst den vorhandenen Radsatz löschen.'); return; }
    if (keyOf(source.lager, source.lagerplatz) === keyOf(lager, place)) return;
    setWorking(true); setError(''); setMessage('');
    // The database function atomically checks the destination and updates the receipt.
    // Its unique index prevents collisions even when two users move wheels simultaneously.
    const { error: e } = await supabase.rpc('reifenlager_platz_zuweisen', { p_schein_id: id, p_lager: lager, p_lagerplatz: place });
    if (e) setError('Platz nicht gespeichert: ' + e.message + ' (SQL-Update in Supabase prüfen)');
    else { setMessage(`${source.kennzeichen || 'Radsatz'} → ${lager} / ${place} gespeichert.`); setSelected(place); }
    await refresh();
    setWorking(false);
  }

  async function deleteSet(r: Schein) {
    if (working) return;
    if (!window.confirm(`Radsatz ${r.kennzeichen || r.belegnummer || r.id} und zugehörigen Einlagerungsschein endgültig löschen? Der Lagerplatz wird frei.`)) return;
    setWorking(true); setError(''); setMessage('');
    const { data, error: e } = await supabase.from('reifenlager_scheine').delete().eq('id', r.id).select('id');
    if (e) setError('Radsatz löschen: ' + e.message);
    else if (!data?.length) setError('Radsatz konnte nicht gelöscht werden. Bitte Berechtigungen in Supabase prüfen.');
    else { setMessage('Radsatz gelöscht. Lagerplatz ist wieder frei.'); setSelected(null); }
    await refresh();
    setWorking(false);
  }

  function onDragStart(event: DragEvent<HTMLElement>, r: Schein) {
    if (working) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', r.id);
    setDragged(r.id);
    setError('');
  }
  function onDragEnd() { setDragged(null); setHovered(null); }
  function onDragOver(event: DragEvent<HTMLButtonElement>, place: string) {
    if (!dragged || working || at(place).some(r => r.id !== dragged)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (hovered !== place) setHovered(place);
  }
  function onDrop(event: DragEvent<HTMLButtonElement>, place: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain') || dragged;
    setHovered(null); setDragged(null);
    if (!id) return;
    void moveTo(id, place);
  }

  function slot(place: string, label?: string) {
    const here = at(place);
    const count = here.length;
    const blocked = count > 0 && here.some(r => r.id !== dragged);
    const active = selected === place;
    return <button key={place} type="button" onClick={() => setSelected(place)}
      onDragOver={event => onDragOver(event, place)} onDragLeave={() => setHovered(old => old === place ? null : old)} onDrop={event => onDrop(event, place)}
      title={`${place}: ${count ? 'Belegt — zuerst löschen' : 'Frei — Radsatz hierher ziehen'}`}
      style={{ width: '100%', border: hovered === place ? '3px dashed #2563eb' : active ? '3px solid #12365a' : '1px solid #cbd5e1', borderRadius: 8, padding: '8px 3px', background: count > 1 ? '#fed7aa' : count ? '#fecaca' : hovered === place ? '#bfdbfe' : '#dcfce7', color: '#172b4d', cursor: blocked ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12, minHeight: 42 }}>
      <span style={{ display: 'block' }}>{label ?? place}</span>
      <small>{count > 1 ? `${count} Einträge!` : count ? (here[0].kennzeichen || 'Belegt') : 'Frei'}</small>
    </button>;
  }

  function card(r: Schein) {
    const isPlaced = r.lagerplatz?.trim() && (norm(r.lager) === 'ZELT' ? rackPlaces : warehousePlaces).some(p => norm(p) === norm(r.lagerplatz));
    return <article key={r.id} draggable={!working} onDragStart={e => onDragStart(e, r)} onDragEnd={onDragEnd}
      style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: 14, marginBottom: 10, cursor: working ? 'wait' : 'grab', opacity: dragged === r.id ? 0.5 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><GripVertical size={17} color="#64748b" />{r.kennzeichen || 'Ohne Kennzeichen'}</strong>
        <span style={{ fontSize: 12, color: isPlaced ? '#991b1b' : '#92400e' }}><MapPin size={13} style={{ verticalAlign: 'middle' }} /> {isPlaced ? `${r.lager} · ${r.lagerplatz}` : 'Nicht zugeordnet'}</span>
      </div>
      <p style={{ margin: '8px 0', fontSize: 13 }}>Beleg: {r.belegnummer || '—'} · {field(r, 'fahrzeug') || 'Fahrzeug unbekannt'} · {field(r, 'saison') || '—'}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href={qrUrl(r.id)} style={{ ...btn, padding: '7px 9px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}><FileText size={15} /> Schein / QR</a>
        <button type="button" style={{ ...btn, padding: '7px 9px', fontSize: 12 }} onClick={() => { setLager(norm(r.lager) === 'LAGER' ? 'Lager' : 'Zelt'); setSelected(r.lagerplatz); document.getElementById('lager-map')?.scrollIntoView({ behavior: 'smooth' }); }}>Platz anzeigen</button>
        <button type="button" disabled={working} style={{ ...btn, padding: '7px 9px', color: '#b91c1c', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => void deleteSet(r)}><Trash2 size={14} /> Löschen</button>
      </div>
    </article>;
  }

  return <section style={{ maxWidth: 1300 }}>
    <h1>{view === 'Lagerplan' ? 'Lagerplan' : 'Radsätze'}</h1>
    <p style={{ color: '#64748b' }}>Radsätze per Drag & Drop einlagern. Belegte Plätze sind gesperrt.</p>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', padding: 10, borderRadius: 8, flex: '1 1 240px' }}><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Kennzeichen, Beleg, Lagerplatz..." style={{ border: 0, outline: 0, flex: 1, minWidth: 0 }} /></label>
      <button type="button" style={btn} disabled={working} onClick={() => void refresh()}><RefreshCw size={15} /> Aktualisieren</button>
    </div>
    {error && <p role="alert" style={{ color: '#b91c1c', fontWeight: 600 }}>{error}</p>}
    {message && <p role="status" style={{ color: '#166534' }}>{message}</p>}
    {busy && <p>Laden...</p>}
    <div id="lager-map" style={{ marginTop: 18 }}>
      <h2>Lagerplan</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>{(['Zelt', 'Lager'] as const).map(x => <button key={x} type="button" style={{ ...btn, background: lager === x ? '#12365a' : '#fff', color: lager === x ? '#fff' : '#12365a' }} onClick={() => { setLager(x); setSelected(null); }}>{x}</button>)}</div>
      <p style={{ fontSize: 13, color: '#64748b' }}>Grün = frei · Rot = belegt (gesperrt) · Orange = bestehende Doppelbelegung. Ziehe einen Radsatz aus der Liste unten auf einen freien Platz.</p>
      {lager === 'Zelt' ? <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}><input aria-label="Neue Regalnummer" placeholder="Neues Regal, z. B. 1009" value={newRegal} onChange={e => setNewRegal(e.target.value)} style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }} /><button type="button" disabled={working} style={btn} onClick={() => void addRegal()}><Plus size={15} /> Regal hinzufügen</button></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>{regale.map(n => <div key={n} style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>Regal {n}</strong><button type="button" title={`Regal ${n} löschen`} disabled={working} onClick={() => void deleteRegal(n)} style={{ ...btn, color: '#b91c1c', padding: 5 }}><Trash2 size={16} /></button></div><div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{[2, 1, 0].map(i => <div key={i}><small>{['Unten', 'Mitte', 'Oben'][i]}</small>{slot(`${n}0${i}`)}</div>)}</div></div>)}</div>
      </> : <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, padding: 12 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(116px,1fr))', gap: 9, minWidth: 740 }}>{[1, 2, 3, 4, 5, 6].map(r => <div key={r}><strong style={{ display: 'block', textAlign: 'center', marginBottom: 8 }}>Reihe {r}</strong><div style={{ display: 'grid', gap: 8 }}>{[6, 5, 4, 3, 2, 1].map(s => <div key={s} style={{ border: '1px solid #e2e8f0', padding: 4, borderRadius: 8 }}><strong style={{ display: 'block', textAlign: 'center', fontSize: 12 }}>Stapel {s}</strong>{slot(`R${r}-${s}-Oben`, 'Oben')}{slot(`R${r}-${s}-Unten`, 'Unten')}</div>)}</div></div>)}</div><div style={{ textAlign: 'center', background: '#e2e8f0', marginTop: 12, padding: 10, borderRadius: 8, fontWeight: 700 }}>EINGANG — unten · Stapel 1 unten, Stapel 6 oben</div></div>}
      {selected && <div style={{ marginTop: 18, padding: 14, background: '#fff', border: '2px solid #12365a', borderRadius: 12 }}><strong>{lager} · {selected}</strong>{selectedRows.length ? selectedRows.map(r => <p key={r.id} style={{ margin: '8px 0' }}>{r.kennzeichen || 'Ohne Kennzeichen'} · {r.belegnummer || '—'} — Belegt. Zum Freimachen den Radsatz unten löschen.</p>) : <p>Frei — Radsatz aus der Liste unten hierher ziehen.</p>}</div>}
    </div>
    <div id="radsaetze-unten" style={{ marginTop: 28, paddingTop: 12, borderTop: '2px solid #cbd5e1' }}>
      <h2>Radsätze — unten</h2>
      <p style={{ color: '#64748b', fontSize: 13 }}>Alle gespeicherten Radsätze ({rows.length}). Mit der Maus ziehen und auf eine grüne Zelle legen. Ein belegter Platz kann nicht überschrieben werden; zuerst den vorhandenen Radsatz löschen.</p>
      {!busy && (filtered.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>{filtered.map(card)}</div> : <p>Keine Radsätze gefunden.</p>)}
      {activeDrag && <p style={{ color: '#1d4ed8' }}>Verschieben: {activeDrag.kennzeichen} → {lager}</p>}
    </div>
  </section>;
}
