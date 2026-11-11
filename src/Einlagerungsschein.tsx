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
const blank: Data = {
  belegnummer: '', kennzeichen: '', fahrzeug: '', kundenname: '', strasse: '',
  plz: '', wohnort: '', telefon: '', radtyp: 'Aluräder', saison: 'Winter',
  tpms: false, muttern: false, radsicherung: false, radzierblenden: false,
  reifenmarke: '', reifengroesse: '', profiltiefe: ['', '', '', ''],
  dot: ['', '', '', ''], zustand: '', bemerkung: '',
  datum: new Date().toISOString().slice(0, 10), mitarbeiter: '',
  lager: 'Zelt', reihe: '', lagerplatz: ''
};
const positions = ['VL', 'VR', 'HL', 'HR'];
const base = `${window.location.origin}${import.meta.env.BASE_URL}`;

export default function Einlagerungsschein() {
  const [data, setData] = useState<Data>({ ...blank });
  const [recordId, setRecordId] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [printMode, setPrintMode] = useState<'form' | 'labels'>('form');
  const [lookup, setLookup] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
    setLookup(true);
    supabase.from('reifenlager_scheine').select('id, daten').eq('id', id).single()
      .then(({ data: result, error }) => {
        if (error || !result) setNotice('QR-Code: Eintrag nicht gefunden oder kein Zugriff.');
        else {
          setData(result.daten as Data); setRecordId(result.id);
          setLoaded(true);
        }
      });
  }, []);

  useEffect(() => {
    if (!recordId) return;
    let active = true;
    Promise.all(['SET', ...positions].map(pos =>
      QRCode.toDataURL(`${base}?qr=${encodeURIComponent(recordId)}&rad=${pos}`, {
        width: pos === 'SET' ? 320 : 180, margin: 2, errorCorrectionLevel: 'H'
      })
    )).then(images => { if (active) setCodes(images); })
      .catch(() => setNotice('QR-Code konnte nicht erzeugt werden.'));
    return () => { active = false; };
  }, [recordId]);

  async function save(e: FormEvent) {
    e.preventDefault(); setNotice(''); setSaving(true);
    const payload = {
      kennzeichen: data.kennzeichen.trim().toUpperCase(),
      belegnummer: data.belegnummer.trim(),
      lager: data.lager, lagerplatz: data.lagerplatz.trim(), daten: data
    };
    const { data: result, error } = await supabase
      .from('reifenlager_scheine').insert(payload).select('id').single();
    if (error || !result) setNotice('Fehler beim Speichern: ' + (error?.message || 'Unbekannt'));
    else { setRecordId(result.id); setNotice('Gespeichert. QR-Etiketten können gedruckt werden.'); }
    setSaving(false);
  }

  function print(mode: 'form' | 'labels') {
    setPrintMode(mode);
    // React renders the chosen print layout before the print dialog opens.
    window.setTimeout(() => window.print(), 120);
  }
  const field = (key: keyof Data, label: string, required = false) => (
    <label className="schein-field" key={key}>
      <span>{label}</span>
      <input value={String(data[key])} required={required} disabled={loaded}
        onChange={e => change(key, e.target.value as never)} />
    </label>
  );

  return <section className={`schein-root print-${printMode}`}>
    <div className="schein-toolbar no-print">
      <h1>Einlagerungsschein</h1>
      <p>Kompletträder · Formular ausfüllen, speichern und drucken</p>
      {lookup && <p>QR-Aufruf: {loaded ? 'Eintrag gefunden' : 'Eintrag wird geprüft'}</p>}
      {notice && <p role="status" className="schein-notice">{notice}</p>}
      <div className="schein-buttons">
        {!loaded && <button type="submit" form="schein-form" disabled={saving || !!recordId}>
          {saving ? 'Speichern...' : recordId ? 'Gespeichert' : 'Speichern + QR erzeugen'}
        </button>}
        <button type="button" onClick={() => print('form')}>Einlagerungsschein drucken</button>
        <button type="button" disabled={!recordId || codes.length !== 5}
          onClick={() => print('labels')}>5 QR-Etiketten drucken</button>
        <button type="button" onClick={() => { setData({ ...blank }); setRecordId(''); setCodes([]); setLoaded(false); setNotice(''); window.history.replaceState({}, '', base); }}>
          Neues Formular
        </button>
      </div>
    </div>

    <form id="schein-form" onSubmit={save} className="schein-paper">
      <div className="schein-top">
        <div><strong>EINLAGERUNGSSCHEIN FÜR KOMPLETTRÄDER</strong><small>EMPFANGSBESTÄTIGUNG</small></div>
        <div className="schein-ford">Ford</div>
      </div>
      <div className="schein-two">
        {field('belegnummer', 'Beleg-Nr.')}
        {field('kennzeichen', 'Amtl. Kennzeichen *', true)}
      </div>
      <div className="schein-two">
        <fieldset><legend>Räder</legend>
          {['Stahlräder', 'Aluräder'].map(x => <label key={x}><input type="radio" name="radtyp" checked={data.radtyp === x} disabled={loaded} onChange={() => change('radtyp', x)} /> {x}</label>)}
        </fieldset>
        <fieldset><legend>Reifen</legend>
          {['Sommer', 'Winter', 'Ganzjahr'].map(x => <label key={x}><input type="radio" name="saison" checked={data.saison === x} disabled={loaded} onChange={() => change('saison', x)} /> {x}reifen</label>)}
        </fieldset>
      </div>
      <div className="schein-checks">
        {([['tpms', 'TPMS'], ['muttern', 'Muttern'], ['radsicherung', 'Radsicherung'], ['radzierblenden', 'Radzierblenden']] as const).map(([key, text]) =>
          <label key={key}><input type="checkbox" checked={data[key]} disabled={loaded} onChange={e => change(key, e.target.checked)} /> {text}</label>
        )}
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
      <div className="schein-grid">
        {field('zustand', 'Zustand / Beschädigungen')}{field('bemerkung', 'Bemerkungen')}
      </div>
      <div className="schein-storage">
        <strong>Lagerplatz (BESICO)</strong>
        <label>Lager <select value={data.lager} disabled={loaded} onChange={e => change('lager', e.target.value)}>
          <option>Zelt</option><option>Lager</option></select></label>
        {data.lager === 'Lager' && <label>Reihe <select value={data.reihe} disabled={loaded} onChange={e => change('reihe', e.target.value)}><option value="">Wählen</option>{[1,2,3,4,5,6].map(n => <option key={n} value={String(n)}>Reihe {n}</option>)}</select></label>}
        {field('lagerplatz', 'Regal / Platz')}
      </div>
      <div className="schein-grid">
        {field('datum', 'Datum')}{field('mitarbeiter', 'Ford Service Partner / Mitarbeiter')}
      </div>
      <div className="schein-signatures"><div>Unterschrift Kunde</div><div>Unterschrift Service Partner</div></div>
      <p className="schein-footnote">Hinweis: Profiltiefe und Zustand der Räder bei Annahme prüfen. Dieses Formular dokumentiert die Einlagerung.</p>
      {recordId && <small className="schein-id">Vorgangs-ID: {recordId}</small>}
    </form>

    {recordId && codes.length === 5 && <div className="schein-label-sheet">
      <h2>BESICO REIFENLAGER · QR-ETIKETTEN</h2>
      <div className="schein-big-label"><img src={codes[0]} alt="QR-Code Radsatz" /><div><strong>RADSATZ</strong><b>{data.kennzeichen}</b><span>{data.saison} · {data.reifengroesse}</span><span>{data.lager} {data.reihe && `Reihe ${data.reihe}`} · {data.lagerplatz}</span><small>{data.belegnummer}</small></div></div>
      <div className="schein-small-labels">{positions.map((p, i) => <div key={p}><img src={codes[i + 1]} alt={`QR-Code ${p}`} /><strong>{p}</strong><span>{data.kennzeichen}</span></div>)}</div>
      <p>VL = vorne links · VR = vorne rechts · HL = hinten links · HR = hinten rechts</p>
    </div>}
  </section>;
}
