import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { ClipboardCheck, RefreshCw, Download, Search } from 'lucide-react';

type SetRow = { id: string; kennzeichen: string | null; belegnummer: string | null; lager: string | null; lagerplatz: string | null; daten: Record<string, unknown> | null };
type CheckRow = { schein_id: string; kennzeichen: string | null; lager: string | null; lagerplatz: string | null; geprueft_am: string };
type Filter = 'all' | 'checked' | 'unchecked' | 'different' | 'unassigned';
const box: React.CSSProperties = { background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: 16 };
const btn: React.CSSProperties = { background: '#12365a', color: 'white', border: 0, borderRadius: 8, padding: '10px 14px', cursor: 'pointer', fontWeight: 700 };
const val = (v: unknown) => v == null ? '' : String(v).trim();
const norm = (v: unknown) => val(v).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const location = (lager: string | null, platz: string | null) => lager && platz ? `${lager} · ${platz}` : 'Nicht zugeordnet';

export default function Inventur() {
  const [sets, setSets] = useState<SetRow[]>([]);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [period, setPeriod] = useState(() => new Date().toLocaleDateString('en-CA').slice(0, 7));

  async function refresh() {
    setLoading(true); setError('');
    try {
      const allSets: SetRow[] = [], allChecks: CheckRow[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error: e } = await supabase.from('reifenlager_scheine').select('id,kennzeichen,belegnummer,lager,lagerplatz,daten').order('id').range(start, start + 999);
        if (e) throw e;
        const batch = (data || []) as SetRow[];
        allSets.push(...batch);
        if (batch.length < 1000) break;
      }
      const from = `${period}-01T00:00:00`;
      const [year, month] = period.split('-').map(Number);
      const to = new Date(Date.UTC(year, month, 1)).toISOString();
      for (let start = 0; ; start += 1000) {
        const { data, error: e } = await supabase.from('reifenlager_inventur')
          .select('schein_id,kennzeichen,lager,lagerplatz,geprueft_am')
          .gte('geprueft_am', from).lt('geprueft_am', to)
          .order('geprueft_am', { ascending: false }).range(start, start + 999);
        if (e) throw e;
        const batch = (data || []) as CheckRow[];
        allChecks.push(...batch);
        if (batch.length < 1000) break;
      }
      setSets(allSets); setChecks(allChecks);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [period]);

  const latest = useMemo(() => {
    const map = new Map<string, CheckRow>();
    for (const c of checks) if (!map.has(c.schein_id)) map.set(c.schein_id, c);
    return map;
  }, [checks]);
  const rows = useMemo(() => sets.map(s => {
    const c = latest.get(s.id);
    const assigned = !!(val(s.lagerplatz) && (s.lager === 'Zelt' || s.lager === 'Lager'));
    const different = !!c && (val(c.lager) !== val(s.lager) || val(c.lagerplatz) !== val(s.lagerplatz));
    return { ...s, check: c, assigned, different };
  }), [sets, latest]);
  const checked = rows.filter(r => !!r.check).length;
  const unassigned = rows.filter(r => !r.assigned).length;
  const different = rows.filter(r => r.different).length;
  const visible = rows.filter(r => {
    if (filter === 'checked' && !r.check) return false;
    if (filter === 'unchecked' && r.check) return false;
    if (filter === 'different' && !r.different) return false;
    if (filter === 'unassigned' && r.assigned) return false;
    const d = r.daten || {};
    return !query || [r.kennzeichen, r.belegnummer, r.lager, r.lagerplatz, d.fahrzeug, d.reifengroesse, d.vin, d.fin].some(v => norm(v).includes(norm(query)));
  });
  function exportCsv() {
    const esc = (v: unknown) => '"' + val(v).replace(/"/g, '""') + '"';
    const data = [['Kennzeichen','Belegnummer','Bereich','Lagerplatz','Inventurstatus','Geprueft am','Ort bei Pruefung'], ...visible.map(r => [
      r.kennzeichen, r.belegnummer, r.lager, r.lagerplatz,
      !r.check ? 'Nicht geprueft' : r.different ? 'Platz abweichend' : 'Geprueft',
      r.check?.geprueft_am || '', r.check ? location(r.check.lager, r.check.lagerplatz) : ''
    ])].map(line => line.map(esc).join(';')).join('\r\n');
    const blob = new Blob(['\ufeff' + data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `BESICO_Inventur_${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  const openQr = (id: string) => window.location.assign(`${window.location.origin}${import.meta.env.BASE_URL}?qr=${encodeURIComponent(id)}`);
  return <section style={{ display: 'grid', gap: 18 }}>
    <div><h1 style={{ marginBottom: 4 }}>Inventur</h1><p style={{ marginTop: 0, color: '#64748b' }}>Bestandskontrolle · QR-Prüfungen im gewählten Monat</p></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <label>Prüfmonat <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ marginLeft: 8, padding: 8 }} /></label>
      <button type="button" onClick={() => void refresh()} style={btn}><RefreshCw size={15} style={{ verticalAlign: 'middle' }} /> Aktualisieren</button>
      <button type="button" onClick={exportCsv} disabled={loading || !!error} style={btn}><Download size={15} style={{ verticalAlign: 'middle' }} /> Excel / CSV exportieren</button>
    </div>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>Fehler beim Laden: {error}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 10 }}>
      {([['Radsätze gesamt', rows.length], ['Geprüft', checked], ['Nicht geprüft', rows.length - checked], ['Ohne Lagerplatz', unassigned], ['Platz abweichend', different]] as const).map(([label, count]) =>
        <div key={label} style={box}><div style={{ fontSize: 13, color: '#64748b' }}>{label}</div><strong style={{ fontSize: 27 }}>{loading ? '…' : count}</strong></div>)}
    </div>
    <div style={{ ...box, padding: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>Fortschritt</strong><span>{checked} / {rows.length}</span></div>
      <div style={{ height: 12, background: '#e2e8f0', borderRadius: 10, marginTop: 9, overflow: 'hidden' }}><div style={{ width: `${rows.length ? checked / rows.length * 100 : 0}%`, background: '#16a34a', height: '100%' }} /></div>
      <small style={{ color: '#64748b' }}>Nicht geprüft bedeutet nicht automatisch fehlend. Radsätze ohne Lagerplatz werden separat ausgewiesen.</small>
    </div>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <div className="search-box" style={{ flex: '1 1 250px', margin: 0 }}><Search size={20} /><input placeholder="Kennzeichen, Reifen, Lagerplatz suchen..." value={query} onChange={e => setQuery(e.target.value)} /></div>
      <select aria-label="Inventurfilter" value={filter} onChange={e => setFilter(e.target.value as Filter)} style={{ padding: 12, borderRadius: 8, border: '1px solid #cbd5e1' }}>
        <option value="all">Alle</option><option value="checked">Geprüft</option><option value="unchecked">Nicht geprüft</option><option value="different">Platz abweichend</option><option value="unassigned">Ohne Lagerplatz</option>
      </select>
    </div>
    <div style={{ display: 'grid', gap: 10 }}>
      {loading ? <p>Lade Inventur...</p> : visible.length === 0 ? <p>Keine Radsätze gefunden.</p> : visible.map(r =>
        <div key={r.id} style={{ ...box, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div><strong>{r.kennzeichen || 'Ohne Kennzeichen'}</strong><div style={{ fontSize: 13, color: '#64748b' }}>{location(r.lager, r.lagerplatz)} · {val(r.daten?.reifengroesse)}</div>
            <div style={{ fontSize: 13, marginTop: 5, color: r.different ? '#b45309' : r.check ? '#15803d' : '#64748b' }}>
              {r.different ? `Platz abweichend · Prüfung: ${location(r.check?.lager || null, r.check?.lagerplatz || null)}` : r.check ? `Geprüft: ${new Date(r.check.geprueft_am).toLocaleString('de-DE')}` : 'Nicht geprüft'}
            </div>
          </div>
          <button type="button" style={btn} onClick={() => openQr(r.id)}><ClipboardCheck size={15} style={{ verticalAlign: 'middle' }} /> QR / Details</button>
        </div>)}
    </div>
  </section>;
}
