import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { ClipboardCheck, RefreshCw, Download, Search } from 'lucide-react';

type SetRow = { id: string; kennzeichen: string | null; belegnummer: string | null; lager: string | null; lagerplatz: string | null; daten: Record<string, unknown> | null };
type CheckRow = { schein_id: string; kennzeichen: string | null; lager: string | null; lagerplatz: string | null; geprueft_am: string };
type Round = { id: string; name: string; gestartet_am: string; abgeschlossen_am: string | null };
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
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundId, setRoundId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

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
      const { data: roundData, error: roundError } = await supabase.from('reifenlager_inventur_runden')
        .select('id,name,gestartet_am,abgeschlossen_am').order('gestartet_am', { ascending: false });
      if (roundError) throw roundError;
      const available = (roundData || []) as Round[];
      setRounds(available);
      const selected = available.find(r => r.id === roundId) || available.find(r => !r.abgeschlossen_am) || available[0];
      if (selected && selected.id !== roundId) setRoundId(selected.id);
      for (let start = 0; selected; start += 1000) {
        const { data, error: e } = await supabase.from('reifenlager_inventur')
          .select('schein_id,kennzeichen,lager,lagerplatz,geprueft_am')
          .eq('runde_id', selected.id)
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
  useEffect(() => { void refresh(); }, [roundId]);
  const selectedRound = rounds.find(r => r.id === roundId);
  async function startRound() {
    if (!window.confirm('Neue Inventur starten? Die bisherige Runde wird abgeschlossen und bleibt gespeichert.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { data, error: e } = await supabase.rpc('besico_inventur_start');
      if (e) throw e;
      setRoundId(String(data)); setMessage('Neue Inventur gestartet.');
      // Der Wechsel der Runde lädt die Daten automatisch neu.
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function finishRound() {
    if (!selectedRound || selectedRound.abgeschlossen_am) return;
    if (!window.confirm('Inventur abschließen? Danach sind keine weiteren QR-Prüfungen für diese Runde möglich.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: e } = await supabase.rpc('besico_inventur_finish', { p_id: selectedRound.id });
      if (e) throw e;
      setMessage('Inventur abgeschlossen und gespeichert.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

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
    const a = document.createElement('a'); a.href = url; a.download = `BESICO_Inventur_${selectedRound?.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "Export"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  const openQr = (id: string) => window.location.assign(`${window.location.origin}${import.meta.env.BASE_URL}?qr=${encodeURIComponent(id)}`);
  return <section style={{ display: 'grid', gap: 18 }}>
    <div><h1 style={{ marginBottom: 4 }}>Inventur</h1><p style={{ marginTop: 0, color: '#64748b' }}>Bestandskontrolle · Inventur-Runden mit gespeicherter Historie</p></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <label>Inventur-Runde <select value={roundId} onChange={e => setRoundId(e.target.value)} style={{ marginLeft: 8, padding: 9, borderRadius: 8 }}>
        {rounds.map(r => <option key={r.id} value={r.id}>{r.name} · {r.abgeschlossen_am ? 'Abgeschlossen' : 'Aktiv'}</option>)}
      </select></label>
      <button type="button" onClick={() => void startRound()} disabled={busy || loading} style={btn}>Neue Inventur starten</button>
      <button type="button" onClick={() => void finishRound()} disabled={busy || loading || !selectedRound || !!selectedRound.abgeschlossen_am} style={btn}>Inventur abschließen</button>
      <button type="button" onClick={() => void refresh()} style={btn}><RefreshCw size={15} style={{ verticalAlign: 'middle' }} /> Aktualisieren</button>
      <button type="button" onClick={exportCsv} disabled={loading || !!error} style={btn}><Download size={15} style={{ verticalAlign: 'middle' }} /> Excel / CSV exportieren</button>
    </div>
    {message && <p role="status" style={{ color: '#15803d' }}>{message}</p>}
    {selectedRound && <p style={{ margin: 0, color: '#64748b' }}>Status: <strong>{selectedRound.abgeschlossen_am ? 'Abgeschlossen' : 'Aktiv'}</strong> · {selectedRound.name}</p>}
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
