import { useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';

type CellRow = Record<string, unknown>;
type Kind = 'Fahrzeuge' | 'Radsaetze';
const columns: Record<Kind, string[]> = {
  Fahrzeuge: ['kennzeichen', 'vin', 'marke', 'modell', 'kunde_name', 'kunde_telefon', 'bemerkung'],
  Radsaetze: ['belegnummer', 'kennzeichen', 'kundenname', 'fahrzeug', 'saison', 'lager', 'lagerplatz', 'erstellt_am'],
};
const style: CSSProperties = { background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: 18, marginBottom: 16 };
const button: CSSProperties = { border: '1px solid #12365a', borderRadius: 8, padding: '10px 14px', background: '#12365a', color: '#fff', cursor: 'pointer', fontWeight: 700 };
const text = (v: unknown) => String(v ?? '').trim();
const normalize = (v: unknown) => text(v).toUpperCase().replace(/\s+/g, '');

export default function ExcelImportExport() {
  const [kind, setKind] = useState<Kind>('Fahrzeuge');
  const [preview, setPreview] = useState<CellRow[]>([]);
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [filename, setFilename] = useState('');

  async function exportExcel() {
    setWorking(true); setStatus(''); setErrors([]);
    try {
      const [vehicles, receipts] = await Promise.all([
        supabase.from('fahrzeuge').select('kennzeichen,vin,marke,modell,kunde_name,kunde_telefon,bemerkung').order('kennzeichen'),
        supabase.from('reifenlager_scheine').select('belegnummer,kennzeichen,lager,lagerplatz,daten,erstellt_am').order('erstellt_am', { ascending: false }),
      ]);
      if (vehicles.error || receipts.error) throw new Error(vehicles.error?.message || receipts.error?.message);
      const v = (vehicles.data || []).map(r => Object.fromEntries(columns.Fahrzeuge.map(k => [k, (r as CellRow)[k] ?? ''])));
      const r = (receipts.data || []).map(item => {
        const data = (item.daten && typeof item.daten === 'object' ? item.daten : {}) as CellRow;
        return Object.fromEntries(columns.Radsaetze.map(k => [k, ['kundenname', 'fahrzeug', 'saison'].includes(k) ? data[k] ?? '' : (item as unknown as CellRow)[k] ?? '']));
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(v, { header: columns.Fahrzeuge }), 'Fahrzeuge');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r, { header: columns.Radsaetze }), 'Radsaetze');
      XLSX.writeFile(wb, `BESICO_Reifenlager_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setStatus(`Excel exportiert: ${v.length} Fahrzeuge, ${r.length} Radsätze.`);
    } catch (e) { setErrors([e instanceof Error ? e.message : String(e)]); }
    finally { setWorking(false); }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview([]); setErrors([]); setStatus(''); setFilename(file?.name || '');
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const preferred = kind === 'Fahrzeuge' ? 'Fahrzeuge' : 'Radsaetze';
      const sheet = workbook.Sheets[workbook.SheetNames.includes(preferred) ? preferred : workbook.SheetNames[0]];
      if (!sheet) throw new Error('Keine Tabelle gefunden.');
      const rows = XLSX.utils.sheet_to_json<CellRow>(sheet, { defval: '', raw: false });
      if (!rows.length) throw new Error('Die Excel-Tabelle ist leer.');
      if (rows.length > 2000) throw new Error('Bitte maximal 2000 Zeilen auf einmal importieren.');
      const required = kind === 'Fahrzeuge' ? ['kennzeichen'] : ['belegnummer', 'kennzeichen'];
      const missing = required.filter(c => !Object.keys(rows[0]).includes(c));
      if (missing.length) throw new Error(`Fehlende Spalten: ${missing.join(', ')}. Bitte die Vorlage exportieren und verwenden.`);
      setPreview(rows);
      setStatus(`${rows.length} Zeilen eingelesen. Bitte Vorschau prüfen. Noch nichts gespeichert.`);
    } catch (e) { setErrors([e instanceof Error ? e.message : String(e)]); }
    event.target.value = '';
  }

  async function importExcel() {
    if (!preview.length || working) return;
    if (!window.confirm(`${preview.length} Zeilen aus ${filename} nach Supabase importieren? Vorhandene Datensätze werden NICHT überschrieben.`)) return;
    setWorking(true); setErrors([]); setStatus('Import läuft...');
    const issues: string[] = [];
    let added = 0, skipped = 0;
    try {
      if (kind === 'Fahrzeuge') {
        const existing = await supabase.from('fahrzeuge').select('kennzeichen');
        if (existing.error) throw new Error(existing.error.message);
        const seen = new Set((existing.data || []).map(r => normalize(r.kennzeichen)));
        for (let i = 0; i < preview.length; i++) {
          const row = preview[i], plate = normalize(row.kennzeichen);
          if (!plate) { issues.push(`Zeile ${i + 2}: Kennzeichen fehlt.`); continue; }
          if (seen.has(plate)) { skipped++; continue; }
          const payload = Object.fromEntries(columns.Fahrzeuge.map(k => [k, k === 'kennzeichen' ? plate : text(row[k]) || null]));
          const { error } = await supabase.from('fahrzeuge').insert(payload);
          if (error) issues.push(`Zeile ${i + 2}: ${error.message}`);
          else { added++; seen.add(plate); }
        }
      } else {
        const existing = await supabase.from('reifenlager_scheine').select('belegnummer');
        if (existing.error) throw new Error(existing.error.message);
        const seen = new Set((existing.data || []).map(r => normalize(r.belegnummer)).filter(Boolean));
        for (let i = 0; i < preview.length; i++) {
          const row = preview[i], number = text(row.belegnummer), plate = normalize(row.kennzeichen);
          if (!number || !plate) { issues.push(`Zeile ${i + 2}: Belegnummer oder Kennzeichen fehlt.`); continue; }
          if (seen.has(normalize(number))) { skipped++; continue; }
          // New records start unassigned: importing must never overwrite an occupied storage slot.
          const payload = { belegnummer: number, kennzeichen: plate, lager: '', lagerplatz: '', daten: { kundenname: text(row.kundenname), fahrzeug: text(row.fahrzeug), saison: text(row.saison) } };
          const { error } = await supabase.from('reifenlager_scheine').insert(payload);
          if (error) issues.push(`Zeile ${i + 2}: ${error.message}`);
          else { added++; seen.add(normalize(number)); }
        }
      }
      setStatus(`Fertig: ${added} importiert, ${skipped} Duplikate übersprungen, ${issues.length} Fehler.`);
      setErrors(issues);
      setPreview([]);
    } catch (e) { setErrors([e instanceof Error ? e.message : String(e)]); setStatus('Import abgebrochen.'); }
    finally { setWorking(false); }
  }

  return <section style={{ maxWidth: 1100 }}>
    <h1>Excel Import / Export</h1>
    <p style={{ color: '#64748b' }}>Fahrzeuge und Radsätze als Excel-Datei sichern oder neue Einträge importieren.</p>
    <div style={style}>
      <h2>Excel Export</h2>
      <p>Exportiert beide Tabellen in eine .xlsx-Datei mit zwei Arbeitsblättern. Bestehende Daten werden nicht verändert.</p>
      <button type="button" disabled={working} style={button} onClick={() => void exportExcel()}>{working ? 'Bitte warten...' : 'Excel herunterladen (.xlsx)'}</button>
    </div>
    <div style={style}>
      <h2>Excel Import</h2>
      <p>Importiere nur neue Datensätze. Bereits vorhandene Kennzeichen (Fahrzeuge) bzw. Belegnummern (Radsätze) werden übersprungen. Radsätze werden ohne Lagerplatz importiert.</p>
      <label style={{ display: 'block', marginBottom: 12 }}>Datenart: <select value={kind} disabled={working} onChange={e => { setKind(e.target.value as Kind); setPreview([]); setStatus(''); setErrors([]); }} style={{ padding: 8, marginLeft: 8 }}><option value="Fahrzeuge">Fahrzeuge</option><option value="Radsaetze">Radsätze</option></select></label>
      <input type="file" accept=".xlsx,.xls" disabled={working} onChange={e => void chooseFile(e)} aria-label="Excel-Datei auswählen" />
      {preview.length > 0 && <>
        <h3>Vorschau: {preview.length} Zeilen ({filename})</h3>
        <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto', marginBottom: 12 }}><table style={{ borderCollapse: 'collapse', fontSize: 13 }}><thead><tr>{columns[kind].map(k => <th key={k} style={{ padding: 8, border: '1px solid #cbd5e1', textAlign: 'left' }}>{k}</th>)}</tr></thead><tbody>{preview.slice(0, 20).map((r, i) => <tr key={i}>{columns[kind].map(k => <td key={k} style={{ padding: 8, border: '1px solid #e2e8f0' }}>{text(r[k])}</td>)}</tr>)}</tbody></table></div>
        {preview.length > 20 && <p>Vorschau zeigt die ersten 20 Zeilen.</p>}
        <button type="button" disabled={working} style={button} onClick={() => void importExcel()}>{working ? 'Import läuft...' : `${preview.length} Zeilen importieren`}</button>
      </>}
    </div>
    {status && <p role="status" style={{ color: '#166534', fontWeight: 600 }}>{status}</p>}
    {errors.length > 0 && <div role="alert" style={{ ...style, color: '#b91c1c' }}><strong>Fehler ({errors.length}):</strong><ul>{errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul>{errors.length > 30 && <p>Weitere {errors.length - 30} Fehler nicht angezeigt.</p>}</div>}
  </section>;
}
