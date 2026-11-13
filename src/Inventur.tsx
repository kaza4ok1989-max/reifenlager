import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { ClipboardCheck, RefreshCw, Download, Search, CheckCircle2, Circle, AlertTriangle, X } from 'lucide-react';

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

  async function markManual(r: SetRow) {
    if (busy || loading || !selectedRound || selectedRound.abgeschlossen_am) return;
    if (checks.some(c => c.schein_id === r.id)) {
      setMessage(`${r.kennzeichen || 'Radsatz'} ist in dieser Inventur bereits geprüft.`);
      return;
    }
    if (!window.confirm(`Radsatz ${r.kennzeichen || r.belegnummer || r.id} wirklich vor Ort geprüft?\n\nOhne QR als geprüft markieren?`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      // Recheck the selected round and existing result before writing.
      const { data: round, error: roundError } = await supabase.from('reifenlager_inventur_runden')
        .select('abgeschlossen_am').eq('id', selectedRound.id).single();
      if (roundError) throw roundError;
      if (round?.abgeschlossen_am) throw new Error('Diese Inventur ist bereits abgeschlossen.');
      const { data: existing, error: checkError } = await supabase.from('reifenlager_inventur')
        .select('schein_id').eq('runde_id', selectedRound.id).eq('schein_id', r.id).limit(1);
      if (checkError) throw checkError;
      if (existing?.length) { setMessage('Bereits geprüft — keine zweite Prüfung gespeichert.'); await refresh(); return; }
      const { error: insertError } = await supabase.from('reifenlager_inventur').insert({
        runde_id: selectedRound.id, schein_id: r.id, kennzeichen: r.kennzeichen,
        lager: r.lager, lagerplatz: r.lagerplatz, geprueft_am: new Date().toISOString()
      });
      if (insertError) {
        if (insertError.code === '23505') { setMessage('Bereits geprüft — keine zweite Prüfung gespeichert.'); await refresh(); return; }
        throw insertError;
      }
      setMessage(`${r.kennzeichen || 'Radsatz'} manuell geprüft.`);
      await refresh();
    } catch (e) { setError('Manuelle Prüfung: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setBusy(false); }
  }

  async function resetCheck(r: SetRow) {
    if (busy || loading || !selectedRound || selectedRound.abgeschlossen_am) return;
    if (!window.confirm(`Prüfung für ${r.kennzeichen || r.belegnummer || r.id} wirklich zurücksetzen?\n\nDer Radsatz und sein Einlagerungsschein bleiben erhalten.`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { data: round, error: roundError } = await supabase.from('reifenlager_inventur_runden')
        .select('abgeschlossen_am').eq('id', selectedRound.id).single();
      if (roundError) throw roundError;
      if (round?.abgeschlossen_am) throw new Error('Diese Inventur ist bereits abgeschlossen.');
      const { data, error: deleteError } = await supabase.from('reifenlager_inventur')
        .delete().eq('runde_id', selectedRound.id).eq('schein_id', r.id).select('schein_id');
      if (deleteError) throw deleteError;
      if (!data?.length) throw new Error('Keine Prüfung entfernt. Bitte DELETE-Berechtigung (RLS) in Supabase prüfen.');
      setMessage(`Prüfung für ${r.kennzeichen || 'Radsatz'} zurückgesetzt. Radsatz und Schein bleiben erhalten.`);
      await refresh();
    } catch (e) { setError('Prüfung zurücksetzen: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setBusy(false); }
  }

  const latest = useMemo(() => {
    const map = new Map<string, CheckRow>();
    for (const c of checks) if (!map.has(c.schein_id)) map.set(c.schein_id, c);
    return map;
  }, [checks]);
  const duplicateIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of checks) counts.set(c.schein_id, (counts.get(c.schein_id) ?? 0) + 1);
    return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
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
    const words = query.trim().split(/\s+/).filter(Boolean);
    const fields = [r.kennzeichen, r.belegnummer, r.lager, r.lagerplatz, d.fahrzeug, d.reifengroesse, d.vin, d.fin, d.reifen, d.kunde];
    const combined = norm(fields.map(val).join(' '));
    return words.every(word => combined.includes(norm(word)));
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
    {duplicateIds.size > 0 && <div role="alert" style={{ ...box, border: '2px solid #f59e0b', background: '#fffbeb', color: '#92400e' }}>
      <AlertTriangle size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
      <strong>Achtung: {duplicateIds.size} Radsatz/Radsätze mit mehrfachen Inventur-Einträgen in dieser Runde.</strong>
      <div style={{ fontSize: 13, marginTop: 5 }}>Der Fortschritt zählt jeden Radsatz nur einmal. Bitte den QR-Speichervorgang und den Datenbank-Schutz prüfen.</div>
    </div>}
    <div style={{ ...box, display: 'grid', gap: 12 }}>
      <strong>Radsatz suchen — schon gescannt?</strong>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' }}>
        <Search size={20} color="#64748b" />
        <input aria-label="Inventur durchsuchen" placeholder="Kennzeichen, Belegnummer, FIN, Lagerplatz..." value={query} onChange={e => setQuery(e.target.value)} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, fontSize: 15 }} />
        {query && <button type="button" aria-label="Suche löschen" title="Suche löschen" onClick={() => setQuery('')} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 4 }}><X size={18} /></button>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {([['all', 'Alle'], ['checked', 'Geprüft'], ['unchecked', 'Nicht geprüft'], ['different', 'Platz abweichend'], ['unassigned', 'Ohne Lagerplatz']] as const).map(([key, label]) =>
          <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
            style={{ ...btn, padding: '8px 11px', background: filter === key ? '#12365a' : '#f1f5f9', color: filter === key ? '#fff' : '#12365a', border: filter === key ? '1px solid #12365a' : '1px solid #cbd5e1' }}>{label}</button>)}
      </div>
      <div role="status" style={{ fontSize: 13, color: '#475569' }}>
        {loading ? 'Suche wird geladen...' : `${visible.length} von ${rows.length} Radsätzen angezeigt · ${visible.filter(r => !!r.check).length} geprüft · ${visible.filter(r => !r.check).length} nicht geprüft`}
        {query && <span> · Suche: <strong>{query}</strong></span>}
      </div>
    </div>
    <div style={{ display: 'grid', gap: 10 }}>
      {loading ? <p>Lade Inventur...</p> : visible.length === 0 ? <p>Keine Radsätze gefunden.</p> : visible.map(r =>
        <div key={r.id} style={{ ...box, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px' }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><strong>{r.kennzeichen || 'Ohne Kennzeichen'}</strong>{r.check ? <span style={{ color: '#166534', background: '#dcfce7', borderRadius: 20, padding: '4px 9px', fontSize: 12, fontWeight: 700 }}><CheckCircle2 size={14} style={{ verticalAlign: 'middle' }} /> Geprüft</span> : <span style={{ color: '#9a3412', background: '#ffedd5', borderRadius: 20, padding: '4px 9px', fontSize: 12, fontWeight: 700 }}><Circle size={14} style={{ verticalAlign: 'middle' }} /> Nicht geprüft</span>}{duplicateIds.has(r.id) && <span style={{ color: '#92400e', fontSize: 12, fontWeight: 700 }}>⚠ Mehrfach erfasst</span>}</div><div style={{ fontSize: 13, color: '#64748b', marginTop: 5 }}>Beleg: {r.belegnummer || '—'} · {location(r.lager, r.lagerplatz)} · {val(r.daten?.reifengroesse)}</div>
            <div style={{ fontSize: 13, marginTop: 5, color: r.different ? '#b45309' : r.check ? '#15803d' : '#64748b' }}>
              {r.different ? `Platz abweichend · Prüfung: ${location(r.check?.lager || null, r.check?.lagerplatz || null)} · ${new Date(r.check!.geprueft_am).toLocaleString('de-DE')}` : r.check ? `Gescannt: ${new Date(r.check.geprueft_am).toLocaleString('de-DE')}` : 'In dieser Inventur noch nicht gescannt'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!selectedRound?.abgeschlossen_am && selectedRound && (r.check
              ? <button type="button" disabled={busy || loading} onClick={() => void resetCheck(r)} style={{ ...btn, background: '#fff', color: '#9a3412', border: '1px solid #fdba74', opacity: busy ? 0.6 : 1 }}>Prüfung zurücksetzen</button>
              : <button type="button" disabled={busy || loading} onClick={() => void markManual(r)} style={{ ...btn, background: '#166534', opacity: busy ? 0.6 : 1 }}>Manuell geprüft</button>)}
            <button type="button" style={btn} onClick={() => openQr(r.id)}><ClipboardCheck size={15} style={{ verticalAlign: 'middle' }} /> QR / Details</button>
          </div>
        </div>)}
    </div>
  </section>;
}