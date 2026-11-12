import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import QRCode from 'qrcode';
import { supabase } from './supabase';
import './einlagerungsschein.css';

type Data = {
  belegnummer: string; kennzeichen: string; fahrzeug: string; kundenname: string;
  strasse: string; plz: string; wohnort: string; telefon: string;
  radtyp: string; saison: string; tpms: boolean; muttern: boolean;
  radsicherung: boolean; radzierblenden: boolean; reifenmarke: string;
  reifengroesse: string; profiltiefe: string[]; dot: string[];
  zustand: string; bemerkung: string; datum: string; mitarbeiter: string;
  lager: string; reihe: string; lagerplatz: string;
};
type Raw = Record<string, unknown>;
const today = () => new Date().toISOString().slice(0, 10);
const empty = (): Data => ({
  belegnummer: '', kennzeichen: '', fahrzeug: '', kundenname: '', strasse: '',
  plz: '', wohnort: '', telefon: '', radtyp: 'Aluräder', saison: 'Winter',
  tpms: false, muttern: false, radsicherung: false, radzierblenden: false,
  reifenmarke: '', reifengroesse: '', profiltiefe: ['', '', '', ''],
  dot: ['', '', '', ''], zustand: '', bemerkung: '', datum: today(),
  mitarbeiter: '', lager: 'Zelt', reihe: '', lagerplatz: ''
});
const positions = ['VL', 'VR', 'HL', 'HR'];
const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
const stringValue = (v: unknown) => v == null ? '' : String(v);
const first = (raw: Raw, ...names: string[]) => {
  for (const name of names) {
    const value = raw[name];
    if (value != null && String(value).trim()) return String(value);
  }
  return '';
};
const wheelArray = (v: unknown): string[] => Array.from({ length: 4 }, (_, i) =>
  Array.isArray(v) ? stringValue(v[i]) : '');
const normalize = (raw: Raw, row: Raw): Data => {
  const defaults = empty();
  const merged = { ...defaults, ...raw } as Data;
  for (const key of Object.keys(defaults) as (keyof Data)[]) {
    if (merged[key] === null || merged[key] === undefined) {
      (merged as unknown as Raw)[key] = defaults[key];
    }
  }
  merged.profiltiefe = wheelArray(raw.profiltiefe);
  merged.dot = wheelArray(raw.dot);
  merged.belegnummer = first(row, 'belegnummer') || first(raw, 'belegnummer');
  merged.kennzeichen = first(row, 'kennzeichen') || first(raw, 'kennzeichen');
  merged.lager = first(row, 'lager') || first(raw, 'lager');
  merged.lagerplatz = first(row, 'lagerplatz') || first(raw, 'lagerplatz');
  merged.fahrzeug = first(raw, 'fahrzeug', 'auto', 'fahrgestellnummer_auto');
  merged.reifengroesse = first(raw, 'reifengroesse', 'reifengröße', 'reifengrosse');
  merged.reifenmarke = first(raw, 'reifenmarke', 'reifenbezeichnung', 'reifenhersteller');
  merged.saison = first(raw, 'saison', 'radart') || defaults.saison;
  merged.bemerkung = first(raw, 'bemerkung', 'bemerkungen');
  merged.datum = first(raw, 'datum') || first(row, 'erstellt_am').slice(0, 10);
  return merged;
};
const isImported = (raw: Raw, row: Raw): boolean => {
  const receipt = first(row, 'belegnummer');
  return receipt.startsWith('ALT-') ||
    ('quelldatei' in raw) || ('fahrzeugstandort' in raw) ||
    (!Array.isArray(raw.profiltiefe) && !Array.isArray(raw.dot));
};

export default function Einlagerungsschein() {
  const [data, setData] = useState<Data>(empty);
  const [raw, setRaw] = useState<Raw>({});
  const [imported, setImported] = useState(false);
  const [recordId, setRecordId] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [printMode, setPrintMode] = useState<'form' | 'labels'>('form');
  const [lookup, setLookup] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [shelves, setShelves] = useState<string[]>([]);
  const [targetArea, setTargetArea] = useState<'Zelt' | 'Lager'>('Zelt');
  const [targetPlace, setTargetPlace] = useState('');
  const [showMove, setShowMove] = useState(false);
  const [showCondition, setShowCondition] = useState(false);
  const [tread, setTread] = useState<string[]>(['', '', '', '']);
  const [dotValues, setDotValues] = useState<string[]>(['', '', '', '']);
  const [condition, setCondition] = useState('');
  const [inspectionStatus, setInspectionStatus] = useState('OK');

  const change = <K extends keyof Data>(key: K, value: Data[K]) => {
    setData(old => ({ ...old, [key]: value }));
    setRecordId(''); setCodes([]);
  };
  const changeWheel = (key: 'profiltiefe' | 'dot', index: number, value: string) => {
    const next = [...data[key]]; next[index] = value;
    change(key, next);
  };

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('qr');
    if (!id) return;
    let active = true;
    setLookup(true);
    void (async () => {
      const { data: result, error } = await supabase.from('reifenlager_scheine')
        .select('id,belegnummer,kennzeichen,lager,lagerplatz,daten,erstellt_am')
        .eq('id', id).single();
      if (!active) return;
      if (error || !result) {
        setNotice('QR-Code: Eintrag nicht gefunden oder kein Zugriff.');
        setLookup(false);
        return;
      }
      const source = result.daten && typeof result.daten === 'object' && !Array.isArray(result.daten)
        ? result.daten as Raw : {};
      const row = result as unknown as Raw;
      setRaw(source);
      setImported(isImported(source, row));
      const normalized = normalize(source, row);
      setData(normalized);
      setTread(normalized.profiltiefe);
      setDotValues(normalized.dot);
      setCondition(normalized.zustand);
      setTargetArea(normalized.lager === 'Lager' ? 'Lager' : 'Zelt');
      setRecordId(result.id);
      setLoaded(true);
      setLookup(false);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!recordId) return;
    let active = true;
    Promise.all(['SET', ...positions].map(pos =>
      QRCode.toDataURL(`${base}?qr=${encodeURIComponent(recordId)}&rad=${pos}`, {
        width: pos === 'SET' ? 320 : 180, margin: 2, errorCorrectionLevel: 'H'
      })
    )).then(images => { if (active) setCodes(images); })
      .catch(() => { if (active) setNotice('QR-Code konnte nicht erzeugt werden.'); });
    return () => { active = false; };
  }, [recordId]);

  async function save(e: FormEvent) {
    e.preventDefault(); setNotice(''); setSaving(true);
    const payload = {
      kennzeichen: data.kennzeichen.trim().toUpperCase(),
      belegnummer: data.belegnummer.trim(),
      lager: data.lager, lagerplatz: data.lagerplatz.trim(), daten: data
    };
    const { data: result, error } = await supabase.from('reifenlager_scheine')
      .insert(payload).select('id').single();
    if (error || !result) setNotice('Fehler beim Speichern: ' + (error?.message || 'Unbekannt'));
    else { setRecordId(result.id); setNotice('Gespeichert. QR-Etiketten können gedruckt werden.'); }
    setSaving(false);
  }
  // Read current data again before modifying a scanned set.
  async function reloadRecord() {
    if (!recordId) return;
    const { data: result, error } = await supabase.from('reifenlager_scheine')
      .select('id,belegnummer,kennzeichen,lager,lagerplatz,daten,erstellt_am').eq('id', recordId).single();
    if (error || !result) throw new Error(error?.message || 'Radsatz nicht gefunden.');
    const source = result.daten && typeof result.daten === 'object' && !Array.isArray(result.daten)
      ? result.daten as Raw : {};
    setRaw(source);
    setData(normalize(source, result as unknown as Raw));
  }

  useEffect(() => {
    if (!loaded) return;
    void supabase.from('reifenlager_regale').select('nummer').order('nummer')
      .then(({ data: result }) => setShelves((result || []).map(r => String(r.nummer))));
  }, [loaded]);

  async function releaseSet() {
    if (!recordId || actionBusy || !data.lagerplatz) return;
    if (!window.confirm(`Lagerplatz ${data.lagerplatz} freigeben? Der Radsatz bleibt gespeichert.`)) return;
    setActionBusy(true); setNotice('');
    try {
      const { data: changed, error } = await supabase.from('reifenlager_scheine')
        .update({ lagerplatz: '' }).eq('id', recordId).select('id');
      if (error) throw error;
      if (!changed?.length) throw new Error('Keine Berechtigung oder Radsatz nicht gefunden.');
      await reloadRecord();
      setNotice('Auslagerung gespeichert. Der Radsatz und der QR-Code bleiben erhalten.');
    } catch (e) { setNotice('Fehler: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setActionBusy(false); }
  }

  async function moveSet() {
    if (!recordId || actionBusy || !targetPlace) return;
    setActionBusy(true); setNotice('');
    try {
      const { error } = await supabase.rpc('reifenlager_platz_zuweisen', {
        p_schein_id: recordId, p_lager: targetArea, p_lagerplatz: targetPlace
      });
      if (error) throw error;
      await reloadRecord();
      setShowMove(false);
      setNotice(`Lagerplatz gespeichert: ${targetArea} / ${targetPlace}.`);
    } catch (e) { setNotice('Umlagerung fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setActionBusy(false); }
  }

  async function saveCondition() {
    if (!recordId || actionBusy) return;
    setActionBusy(true); setNotice('');
    try {
      const { data: current, error: readError } = await supabase.from('reifenlager_scheine')
        .select('daten').eq('id', recordId).single();
      if (readError || !current) throw readError || new Error('Radsatz nicht gefunden.');
      const original = current.daten && typeof current.daten === 'object' && !Array.isArray(current.daten)
        ? current.daten as Raw : {};
      const next = { ...original, profiltiefe: tread, dot: dotValues, zustand: condition,
        pruefstatus: inspectionStatus, letzte_pruefung: new Date().toISOString() };
      const { data: changed, error } = await supabase.from('reifenlager_scheine')
        .update({ daten: next }).eq('id', recordId).select('id');
      if (error) throw error;
      if (!changed?.length) throw new Error('Keine Berechtigung.');
      await reloadRecord();
      setShowCondition(false);
      setNotice('Reifenzustand gespeichert.');
    } catch (e) { setNotice('Fehler: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setActionBusy(false); }
  }

  async function markInventur() {
    if (!recordId || actionBusy) return;
    setActionBusy(true); setNotice('');
    try {
      const { data: round, error: roundError } = await supabase.from('reifenlager_inventur_runden')
        .select('id').is('abgeschlossen_am', null).order('gestartet_am', { ascending: false }).limit(1).maybeSingle();
      if (roundError) throw new Error(roundError.message);
      if (!round) throw new Error('Keine aktive Inventur. Bitte im Menü Inventur eine neue Runde starten.');
      const { error } = await supabase.from('reifenlager_inventur').insert({
        schein_id: recordId, kennzeichen: data.kennzeichen, lager: data.lager || null,
        lagerplatz: data.lagerplatz || null, runde_id: round.id
      });
      if (error) throw error;
      setNotice('Inventur: Radsatz als geprüft markiert.');
    } catch (e) { setNotice('Inventur fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setActionBusy(false); }
  }

  const targetPlaces = targetArea === 'Zelt'
    ? shelves.flatMap(n => [0, 1, 2].map(i => `${n}0${i}`))
    : Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, s) =>
        [`R${r + 1}-${s + 1}-Unten`, `R${r + 1}-${s + 1}-Oben`])).flat(2);

  function print(mode: 'form' | 'labels') {
    setPrintMode(mode);
    window.setTimeout(() => window.print(), 120);
  }
  function newForm() {
    setData(empty()); setRaw({}); setImported(false); setRecordId('');
    setCodes([]); setLoaded(false); setLookup(false); setNotice('');
    window.history.replaceState({}, '', base);
  }
  const field = (key: keyof Data, label: string, required = false) => (
    <label className="schein-field" key={key}>
      <span>{label}</span>
      <input value={String(data[key])} required={required} disabled={loaded}
        onChange={e => change(key, e.target.value as never)} />
    </label>
  );
  const details: [string, string][] = [
    ['Beleg-Nr.', data.belegnummer], ['Kennzeichen', data.kennzeichen],
    ['Fahrzeug / FIN', data.fahrzeug], ['Kundenname', data.kundenname],
    ['Reifengröße', data.reifengroesse], ['Radart', data.saison],
    ['Reifenbezeichnung', data.reifenmarke], ['Datum', data.datum],
    ['Bereich', data.lager || 'Nicht zugeordnet'],
    ['Lagerplatz', data.lagerplatz || 'Nicht zugeordnet'],
    ['Fahrzeugstandort', first(raw, 'fahrzeugstandort', 'fahrzeug_standort')],
    ['Bemerkung', data.bemerkung], ['Alter Lagerplatz (Excel)', first(raw, 'alter_lagerplatz', 'original_lagerplatz', 'lagerplatz_alt')],
    ['Quelldatei', first(raw, 'quelldatei')]
  ];

  return <section className={`schein-root print-${printMode}`}>
    <div className="schein-toolbar no-print">
      <h1>{imported ? 'BESICO · Radsatzdetails' : 'Einlagerungsschein'}</h1>
      <p>{imported ? 'Importierter Radsatz · Gespeicherte Informationen und QR-Code' : 'Kompletträder · Formular ausfüllen, speichern und drucken'}</p>
      {lookup && <p>QR-Aufruf: Eintrag wird geprüft...</p>}
      {notice && <p role="status" className="schein-notice">{notice}</p>}
      <div className="schein-buttons">
        {!loaded && <button type="submit" form="schein-form" disabled={saving || !!recordId}>
          {saving ? 'Speichern...' : recordId ? 'Gespeichert' : 'Speichern + QR erzeugen'}
        </button>}
        <button type="button" onClick={() => print('form')}>{imported ? 'Radsatzdetails drucken' : 'Einlagerungsschein drucken'}</button>
        <button type="button" disabled={!recordId || codes.length !== 5}
          onClick={() => print('labels')}>5 QR-Etiketten drucken</button>
        <button type="button" onClick={newForm}>Neues Formular</button>
        {loaded && <button type="button" onClick={() => { window.history.replaceState({}, '', base); window.location.reload(); }}>Zurück zum Dashboard</button>}
        {loaded && <button type="button" disabled={actionBusy} onClick={() => { setShowMove(v => !v); setShowCondition(false); }}>Umlagern</button>}
        {loaded && !!data.lagerplatz && <button type="button" disabled={actionBusy} onClick={() => void releaseSet()}>Auslagern</button>}
        {loaded && <button type="button" disabled={actionBusy} onClick={() => void markInventur()}>Inventur: geprüft</button>}
        {loaded && <button type="button" disabled={actionBusy} onClick={() => { setShowCondition(v => !v); setShowMove(false); }}>Reifenzustand prüfen</button>}
      </div>
    </div>

    {loaded && showMove && <div className="no-print" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 18, margin: '16px 0' }}>
      <h2>Radsatz umlagern</h2>
      <label>Bereich <select value={targetArea} onChange={e => { setTargetArea(e.target.value as 'Zelt' | 'Lager'); setTargetPlace(''); }}><option value="Zelt">Zelt</option><option value="Lager">Lager</option></select></label>
      <label style={{ marginLeft: 12 }}>Lagerplatz <select value={targetPlace} onChange={e => setTargetPlace(e.target.value)}><option value="">Platz wählen</option>{targetPlaces.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
      <p>Belegte Plätze werden von der Datenbank automatisch gesperrt.</p>
      <button type="button" disabled={actionBusy || !targetPlace} onClick={() => void moveSet()}>Neuen Platz speichern</button>
    </div>}
    {loaded && showCondition && <div className="no-print" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 18, margin: '16px 0' }}>
      <h2>Reifenzustand prüfen</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{positions.map((p, i) => <div key={p} style={{ display: 'grid', gap: 5 }}><strong>{p}</strong>
        <label>Profiltiefe (mm) <input style={{ width: 85 }} value={tread[i]} onChange={e => setTread(old => old.map((v, j) => j === i ? e.target.value : v))}/></label>
        <label>DOT <input style={{ width: 85 }} value={dotValues[i]} onChange={e => setDotValues(old => old.map((v, j) => j === i ? e.target.value : v))}/></label>
      </div>)}</div>
      <p><label>Status <select value={inspectionStatus} onChange={e => setInspectionStatus(e.target.value)}><option>OK</option><option>Prüfen</option><option>Ersetzen</option></select></label></p>
      <p><label>Zustand / Bemerkung <input style={{ width: '100%', maxWidth: 600 }} value={condition} onChange={e => setCondition(e.target.value)}/></label></p>
      <button type="button" disabled={actionBusy} onClick={() => void saveCondition()}>Prüfung speichern</button>
    </div>}

    {imported ? (
      <div className="schein-paper" style={{ padding: 24, background: '#fff', color: '#12365a' }}>
        <div className="schein-top"><div><strong>BESICO REIFENLAGER · RADSATZDETAILS</strong><small>ALT­BESTAND · AUS EXCEL IMPORTIERT</small></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 22 }}>
          {details.filter(([, value]) => value.trim()).map(([label, value]) =>
            <div key={label} style={{ borderBottom: '1px solid #cbd5e1', padding: '7px 2px', overflowWrap: 'anywhere' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
              <strong>{value}</strong>
            </div>
          )}
        </div>
        {recordId && codes[0] && <div style={{ marginTop: 20, textAlign: 'center' }}><img src={codes[0]} alt="QR-Code Radsatz" style={{ width: 170, maxWidth: '100%' }} /></div>}
        {recordId && <small className="schein-id">Vorgangs-ID: {recordId}</small>}
      </div>
    ) : (
      <form id="schein-form" onSubmit={save} className="schein-paper">
        <div className="schein-top">
          <div><strong>EINLAGERUNGSSCHEIN FÜR KOMPLETTRÄDER</strong><small>EMPFANGSBESTÄTIGUNG</small></div>
          <div className="schein-ford">Ford</div>
        </div>
        <div className="schein-two">{field('belegnummer', 'Beleg-Nr.')}{field('kennzeichen', 'Amtl. Kennzeichen *', true)}</div>
        <div className="schein-two">
          <fieldset><legend>Räder</legend>{['Stahlräder', 'Aluräder'].map(x =>
            <label key={x}><input type="radio" name="radtyp" checked={data.radtyp === x} disabled={loaded} onChange={() => change('radtyp', x)} /> {x}</label>)}</fieldset>
          <fieldset><legend>Reifen</legend>{['Sommer', 'Winter', 'Ganzjahr'].map(x =>
            <label key={x}><input type="radio" name="saison" checked={data.saison === x} disabled={loaded} onChange={() => change('saison', x)} /> {x}reifen</label>)}</fieldset>
        </div>
        <div className="schein-checks">
          {([['tpms', 'TPMS'], ['muttern', 'Muttern'], ['radsicherung', 'Radsicherung'], ['radzierblenden', 'Radzierblenden']] as const).map(([key, label]) =>
            <label key={key}><input type="checkbox" checked={data[key]} disabled={loaded} onChange={e => change(key, e.target.checked)} /> {label}</label>)}
        </div>
        <div className="schein-grid">
          {field('fahrzeug', 'Fahrzeug / Modell')}{field('kundenname', 'Kundenname')}
          {field('strasse', 'Straße')}{field('plz', 'PLZ')}
          {field('wohnort', 'Wohnort')}{field('telefon', 'Telefon')}
          {field('reifenmarke', 'Reifenhersteller')}{field('reifengroesse', 'Reifengröße')}
        </div>
        <table className="schein-wheels"><thead><tr><th>Reifen</th>{positions.map(p => <th key={p}>{p}</th>)}</tr></thead>
          <tbody><tr><th>Profiltiefe (mm)</th>{positions.map((p, i) => <td key={p}><input aria-label={`Profiltiefe ${p}`} value={data.profiltiefe[i]} disabled={loaded} onChange={e => changeWheel('profiltiefe', i, e.target.value)} /></td>)}</tr>
            <tr><th>DOT-Nr.</th>{positions.map((p, i) => <td key={p}><input aria-label={`DOT ${p}`} value={data.dot[i]} disabled={loaded} onChange={e => changeWheel('dot', i, e.target.value)} /></td>)}</tr></tbody></table>
        <div className="schein-grid">{field('zustand', 'Zustand / Beschädigungen')}{field('bemerkung', 'Bemerkungen')}</div>
        <div className="schein-storage">
          <strong>Lagerplatz (BESICO)</strong>
          <label>Lager <select value={data.lager} disabled={loaded} onChange={e => change('lager', e.target.value)}>
            <option>Zelt</option><option>Lager</option></select></label>
          {data.lager === 'Lager' && <label>Reihe <select value={data.reihe} disabled={loaded} onChange={e => change('reihe', e.target.value)}><option value="">Wählen</option>{[1,2,3,4,5,6].map(n => <option key={n} value={String(n)}>Reihe {n}</option>)}</select></label>}
          {field('lagerplatz', 'Regal / Platz')}
        </div>
        <div className="schein-grid">{field('datum', 'Datum')}{field('mitarbeiter', 'Ford Service Partner / Mitarbeiter')}</div>
        <div className="schein-signatures"><div>Unterschrift Kunde</div><div>Unterschrift Service Partner</div></div>
        <p className="schein-footnote">Hinweis: Profiltiefe und Zustand der Räder bei Annahme prüfen. Dieses Formular dokumentiert die Einlagerung.</p>
        {recordId && <small className="schein-id">Vorgangs-ID: {recordId}</small>}
      </form>
    )}

    {recordId && codes.length === 5 && <div className="schein-label-sheet">
      <h2>BESICO REIFENLAGER · QR-ETIKETTEN</h2>
      <div className="schein-big-label"><img src={codes[0]} alt="QR-Code Radsatz" /><div><strong>RADSATZ</strong><b>{data.kennzeichen}</b><span>{data.saison} · {data.reifengroesse}</span><span>{data.lager || 'Nicht zugeordnet'} · {data.lagerplatz}</span><small>{data.belegnummer}</small></div></div>
      <div className="schein-small-labels">{positions.map((p, i) => <div key={p}><img src={codes[i + 1]} alt={`QR-Code ${p}`} /><strong>{p}</strong><span>{data.kennzeichen}</span></div>)}</div>
      <p>VL = vorne links · VR = vorne rechts · HL = hinten links · HR = hinten rechts</p>
    </div>}
  </section>;
}