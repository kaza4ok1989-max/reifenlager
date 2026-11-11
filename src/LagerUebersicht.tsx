import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { supabase } from './supabase';
import { RefreshCw, Search, MapPin, FileText, Plus, Trash2 } from 'lucide-react';

type Schein = { id: string; belegnummer: string | null; kennzeichen: string; lager: string; lagerplatz: string; daten: Record<string, unknown> | null; erstellt_am: string };
type Regal = { nummer: string };
const btn: CSSProperties = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', color: '#12365a', fontWeight: 600 };
const field = (r: Schein, key: string) => String(r.daten?.[key] ?? '').trim();
const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase().replace(/\s+/g, '');
const qrUrl = (id: string) => `${window.location.origin}${import.meta.env.BASE_URL}?qr=${encodeURIComponent(id)}`;
const position = (r: Schein) => `${norm(r.lager)}::${norm(r.lagerplatz)}`;

export default function LagerUebersicht({ view }: { view: 'Radsätze' | 'Lagerplan' }) {
  const [rows, setRows] = useState<Schein[]>([]);
  const [regale, setRegale] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [lager, setLager] = useState<'Zelt' | 'Lager'>('Zelt');
  const [selected, setSelected] = useState<string | null>(null);
  const [newRegal, setNewRegal] = useState('');

  async function refresh() {
    setBusy(true); setError('');
    const [scheine, shelves] = await Promise.all([
      supabase.from('reifenlager_scheine').select('id,belegnummer,kennzeichen,lager,lagerplatz,daten,erstellt_am').order('erstellt_am', { ascending: false }),
      supabase.from('reifenlager_regale').select('nummer').order('nummer')
    ]);
    if (scheine.error) setError('Radsätze: ' + scheine.error.message);
    else setRows((scheine.data ?? []) as Schein[]);
    if (shelves.error) setError(previous => previous + ' Regale: ' + shelves.error!.message);
    else setRegale((shelves.data ?? [] as Regal[]).map(r => r.nummer));
    setBusy(false);
  }
  useEffect(() => { void refresh(); }, []);

  const occupied = useMemo(() => {
    const result = new Map<string, Schein[]>();
    for (const r of rows) {
      if (!r.lagerplatz?.trim()) continue;
      const key = position(r);
      result.set(key, [...(result.get(key) ?? []), r]);
    }
    return result;
  }, [rows]);
  const at = (place: string, area = lager) => occupied.get(`${norm(area)}::${norm(place)}`) ?? [];
  const filtered = rows.filter(r => [r.kennzeichen, r.belegnummer, r.lager, r.lagerplatz, field(r,'kundenname'), field(r,'fahrzeug')].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const selectedRows = selected ? at(selected) : [];
  const zeltPlaces = regale.flatMap(n => [2,1,0].map(i => `${n}0${i}`));
  const lagerPlaces = Array.from({length:6},(_,r) => Array.from({length:6},(_,s) => [1,2].map(level => `R${r+1}-${s+1}-${level === 1 ? 'Unten' : 'Oben'}`))).flat(2);
  const planned = lager === 'Zelt' ? zeltPlaces : lagerPlaces;
  const unplanned = [...new Set(rows.filter(r => norm(r.lager) === norm(lager) && r.lagerplatz?.trim()).map(r => r.lagerplatz.trim()))].filter(p => !planned.some(x => norm(x) === norm(p)));

  async function addRegal() {
    const nummer = newRegal.trim();
    if (!/^\d{4,6}$/.test(nummer)) { setError('Regalnummer: bitte 4–6 Ziffern eingeben.'); return; }
    if (regale.includes(nummer)) { setError('Dieses Regal existiert bereits.'); return; }
    setWorking(true); setError(''); setMessage('');
    const { error: insertError } = await supabase.from('reifenlager_regale').insert({ nummer });
    if (insertError) setError('Regal hinzufügen: ' + insertError.message);
    else { setNewRegal(''); setMessage(`Regal ${nummer} hinzugefügt.`); await refresh(); }
    setWorking(false);
  }
  async function deleteRegal(nummer: string) {
    const places = [0,1,2].map(i => `${nummer}0${i}`);
    if (rows.some(r => norm(r.lager) === 'ZELT' && places.some(p => norm(p) === norm(r.lagerplatz)))) {
      setError(`Regal ${nummer} enthält eingelagerte Radsätze und kann nicht gelöscht werden.`); return;
    }
    if (!window.confirm(`Regal ${nummer} mit drei Lagerplätzen wirklich löschen?`)) return;
    setWorking(true); setError(''); setMessage('');
    const { error: deleteError } = await supabase.from('reifenlager_regale').delete().eq('nummer', nummer);
    if (deleteError) setError('Regal löschen: ' + deleteError.message);
    else { setMessage(`Regal ${nummer} gelöscht.`); setSelected(null); await refresh(); }
    setWorking(false);
  }
  function slot(place: string, label?: string) {
    const count = at(place).length;
    const active = selected === place;
    return <button key={place} type="button" onClick={() => setSelected(place)} title={`${place}: ${count} gespeicherte Einträge`}
      style={{ width:'100%', border: active ? '3px solid #12365a' : '1px solid #cbd5e1', borderRadius: 8, padding:'8px 3px', background: count > 1 ? '#fed7aa' : count ? '#fecaca' : '#dcfce7', color:'#172b4d', cursor:'pointer', fontWeight:700, fontSize:12 }}>
      <span style={{display:'block'}}>{label ?? place}</span><small>{count > 1 ? `${count} Einträge!` : count ? 'Belegt' : 'Frei*'}</small>
    </button>;
  }
  function card(r: Schein) {
    return <article key={r.id} style={{ background:'#fff', border:'1px solid #dbe3ee', borderRadius:12, padding:16, marginBottom:10 }}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{r.kennzeichen || 'Ohne Kennzeichen'}</strong><strong><MapPin size={15} style={{verticalAlign:'middle'}}/> {r.lager} · {r.lagerplatz || 'Ohne Lagerplatz'}</strong></div>
      <p>Beleg: {r.belegnummer || '—'} · {field(r,'fahrzeug') || 'Fahrzeug unbekannt'} · {field(r,'saison') || '—'}</p>
      <p style={{color:'#475569'}}>Kunde: {field(r,'kundenname') || '—'}</p>
      <a href={qrUrl(r.id)} style={{...btn,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:6}}><FileText size={16}/> Schein / QR öffnen</a>
      <button type="button" style={{...btn,marginLeft:8}} onClick={() => {setLager(norm(r.lager)==='LAGER'?'Lager':'Zelt');setSelected(r.lagerplatz);document.getElementById('lager-map')?.scrollIntoView({behavior:'smooth'});}}>Platz anzeigen</button>
    </article>;
  }
  return <section style={{maxWidth:1200}}>
    <h1>{view}</h1><p style={{color:'#64748b'}}>Gespeicherte Radsätze und Lagerplätze</p>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16}}><label style={{display:'flex',gap:8,alignItems:'center',background:'#fff',padding:10,borderRadius:8,flex:'1 1 240px'}}><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Kennzeichen, Beleg, Lagerplatz..." style={{border:0,outline:0,flex:1,minWidth:0}}/></label><button style={btn} onClick={()=>void refresh()}><RefreshCw size={15}/> Aktualisieren</button></div>
    {error && <p role="alert" style={{color:'#b91c1c'}}>{error}</p>}{message && <p role="status" style={{color:'#166534'}}>{message}</p>}{busy && <p>Laden...</p>}
    {!busy && <p><strong>{rows.length}</strong> Radsätze gespeichert</p>}
    {view === 'Radsätze' && !busy && (filtered.length ? filtered.map(card) : <p>Keine Einträge gefunden.</p>)}
    <div id="lager-map" style={{marginTop:24}}><h2>Lagerplan</h2><div style={{display:'flex',gap:8,marginBottom:14}}>{(['Zelt','Lager'] as const).map(x=><button key={x} style={{...btn,background:lager===x?'#12365a':'#fff',color:lager===x?'#fff':'#12365a'}} onClick={()=>{setLager(x);setSelected(null);}}>{x}</button>)}</div>
    <p style={{fontSize:13,color:'#64748b'}}>Grün = kein gespeicherter Eintrag*, Rot = belegt, Orange = mehrfach belegt. *Freie Plätze sind noch nicht mit dem tatsächlichen Lagerbestand abgeglichen.</p>
    {lager === 'Zelt' ? <>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:16}}><input aria-label="Neue Regalnummer" placeholder="Neues Regal, z. B. 1009" value={newRegal} onChange={e=>setNewRegal(e.target.value)} style={{padding:10,border:'1px solid #cbd5e1',borderRadius:8}}/><button disabled={working} style={btn} onClick={()=>void addRegal()}><Plus size={15}/> Regal hinzufügen</button></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))',gap:12}}>{regale.map(n=><div key={n} style={{background:'#fff',border:'1px solid #dbe3ee',borderRadius:12,padding:12}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>Regal {n}</strong><button title={`Regal ${n} löschen`} disabled={working} onClick={()=>void deleteRegal(n)} style={{...btn,color:'#b91c1c',padding:5}}><Trash2 size={16}/></button></div><div style={{display:'grid',gap:8,marginTop:12}}>{[2,1,0].map(i=><div key={i}><small>{['Unten','Mitte','Oben'][i]}</small>{slot(`${n}0${i}`)}</div>)}</div></div>)}</div>
    </> : <div style={{overflowX:'auto',background:'#fff',borderRadius:12,padding:12}}><div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(116px,1fr))',gap:9,minWidth:740}}>{[1,2,3,4,5,6].map(r=><div key={r}><strong style={{display:'block',textAlign:'center',marginBottom:8}}>Reihe {r}</strong><div style={{display:'grid',gap:8}}>{[6,5,4,3,2,1].map(s=><div key={s} style={{border:'1px solid #e2e8f0',padding:4,borderRadius:8}}><strong style={{display:'block',textAlign:'center',fontSize:12}}>Stapel {s}</strong>{slot(`R${r}-${s}-Oben`,'Oben')}{slot(`R${r}-${s}-Unten`,'Unten')}</div>)}</div></div>)}</div><div style={{textAlign:'center',background:'#e2e8f0',marginTop:12,padding:10,borderRadius:8,fontWeight:700}}>EINGANG — unten · Stapel 1 unten, Stapel 6 oben</div></div>}
    {unplanned.length>0 && <div style={{marginTop:16}}><h3>Andere gespeicherte Platznummern</h3><p style={{fontSize:13}}>Diese Einträge wurden mit freien Platznummern gespeichert und sind nicht Teil der Standardskizze.</p><div style={{display:'flex',flexWrap:'wrap',gap:8}}>{unplanned.map(p=> <div key={p} style={{width:130}}>{slot(p)}</div>)}</div></div>}
    {selected && <div style={{marginTop:18,padding:16,background:'#fff',border:'2px solid #12365a',borderRadius:12}}><h3>{lager} · {selected}</h3>{selectedRows.length ? selectedRows.map(card) : <p>Kein gespeicherter Radsatz auf diesem Platz.</p>}</div>}
    </div>
  </section>;
}
