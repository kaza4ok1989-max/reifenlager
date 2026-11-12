import { useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
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
const normalize = (v: unknown) => text(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
const identity = (r: CellRow) => {
  const d = (r.daten && typeof r.daten === 'object' && !Array.isArray(r.daten) ? r.daten : r) as CellRow;
  const plate = normalize(r.kennzeichen);
  const vin = normalize(pick(d, 'vin', 'fin', 'fahrgestellnummer', 'fahrzeug'));
  const season = normalize(pick(d, 'saison', 'radart'));
  const size = normalize(pick(d, 'reifengroesse', 'reifengröße'));
  return { plate, vin, season, size };
};
const comparable = (a: ReturnType<typeof identity>, b: ReturnType<typeof identity>) => {
  if (!a.plate || !b.plate || a.plate !== b.plate) return 'none';
  if (a.vin && b.vin && a.vin !== b.vin) return 'none';
  if (a.season && b.season && a.season !== b.season) return 'none';
  if (a.size && b.size && a.size !== b.size) return 'none';
  // A matching plate alone is not sufficient: summer and winter sets can coexist.
  return a.vin && b.vin && a.season && b.season && a.size && b.size ? 'match' : 'possible';
};
type ImportCheck = { state: 'Neu' | 'Bereits vorhanden' | 'Prüfen'; reason: string };
const pick = (d: CellRow, ...keys: string[]) => { for (const key of keys) { const value = text(d[key]); if (value) return value; } return ''; };
const dateGerman = (value: unknown) => {
  const s = text(value);
  if (!s) return '';
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? s : new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};
const headers = ['Nr.', 'Bereich', 'Lagerplatz', 'Kennzeichen / Lagerschein', 'Fahrgestellnummer / Auto', 'Datum', 'Reifengröße', 'Radart', 'Reifenbezeichnung', 'Fahrzeugstandort'];

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExcelImportExport() {
  const [kind, setKind] = useState<Kind>('Fahrzeuge');
  const [preview, setPreview] = useState<CellRow[]>([]);
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [filename, setFilename] = useState('');
  const [legacyImport, setLegacyImport] = useState(false);
  const [checks, setChecks] = useState<ImportCheck[]>([]);
  const [checking, setChecking] = useState(false);

  async function fetchData() {
    const [vehicles, receipts] = await Promise.all([
      supabase.from('fahrzeuge').select('kennzeichen,vin,marke,modell,kunde_name,kunde_telefon,bemerkung').order('kennzeichen').limit(10000),
      supabase.from('reifenlager_scheine').select('belegnummer,kennzeichen,lager,lagerplatz,daten,erstellt_am').order('erstellt_am', { ascending: false }).limit(10000),
    ]);
    if (vehicles.error || receipts.error) throw new Error(vehicles.error?.message || receipts.error?.message);
    return { vehicles: (vehicles.data || []) as CellRow[], receipts: (receipts.data || []) as CellRow[] };
  }

  async function exportExcel() {
    setWorking(true); setStatus(''); setErrors([]);
    try {
      const { vehicles, receipts } = await fetchData();
      const v = vehicles.map(r => Object.fromEntries(columns.Fahrzeuge.map(k => [k, r[k] ?? ''])));
      const r = receipts.map(item => {
        const data = (item.daten && typeof item.daten === 'object' ? item.daten : {}) as CellRow;
        return Object.fromEntries(columns.Radsaetze.map(k => [k, ['kundenname', 'fahrzeug', 'saison'].includes(k) ? data[k] ?? '' : item[k] ?? '']));
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(v, { header: columns.Fahrzeuge }), 'Fahrzeuge');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r, { header: columns.Radsaetze }), 'Radsaetze');
      XLSX.writeFile(wb, `BESICO_Backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setStatus(`Vollständiger Export: ${v.length} Fahrzeuge, ${r.length} Radsätze.`);
    } catch (e) { setErrors([e instanceof Error ? e.message : String(e)]); }
    finally { setWorking(false); }
  }

  async function exportLagerliste() {
    setWorking(true); setStatus(''); setErrors([]);
    try {
      const { vehicles, receipts } = await fetchData();
      const byPlate = new Map(vehicles.map(v => [normalize(v.kennzeichen), v]));
      const wb = new ExcelJS.Workbook();
      wb.creator = 'BESICO Reifenlager';
      const sheet = wb.addWorksheet('Lagerliste', {
        views: [{ state: 'frozen', ySplit: 1 }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
        properties: { defaultRowHeight: 26 },
      });
      sheet.columns = [
        { width: 7 }, { width: 15 }, { width: 15 }, { width: 27 }, { width: 37 },
        { width: 15 }, { width: 26 }, { width: 14 }, { width: 33 }, { width: 35 },
      ];
      const heading = sheet.addRow(headers);
      heading.height = 37;
      heading.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17212B' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        cell.border = { top: { style: 'thin', color: { argb: 'FF333333' } }, bottom: { style: 'thin', color: { argb: 'FF333333' } }, left: { style: 'thin', color: { argb: 'FF333333' } }, right: { style: 'thin', color: { argb: 'FF333333' } } };
      });
      // Keep all records, including unassigned sets, so none disappear from the inventory.
      const sorted = [...receipts].sort((a, b) =>
        `${text(a.lager)} ${text(a.lagerplatz)} ${text(a.kennzeichen)}`.localeCompare(`${text(b.lager)} ${text(b.lagerplatz)} ${text(b.kennzeichen)}`, 'de', { numeric: true })
      );
      sorted.forEach((item, i) => {
        const data = (item.daten && typeof item.daten === 'object' ? item.daten : {}) as CellRow;
        const vehicle = byPlate.get(normalize(item.kennzeichen));
        const vin = pick(data, 'vin', 'fahrgestellnummer', 'fin') || text(vehicle?.vin);
        const auto = pick(data, 'fahrzeug', 'auto', 'fahrzeugmodell') || [text(vehicle?.marke), text(vehicle?.modell)].filter(Boolean).join(' ');
        const plate = text(item.kennzeichen);
        const receipt = text(item.belegnummer);
        const tyreSize = pick(data, 'reifengroesse', 'reifengröße', 'reifengroesse_vorne', 'reifengroesse_hinten', 'reifengroesse_va', 'reifengroesse_ha', 'reifen_groesse', 'groesse', 'dimension');
        const tyreName = pick(data, 'reifenbezeichnung', 'reifenmarke', 'reifenhersteller', 'reifenmodell', 'reifenprofil', 'hersteller', 'marke');
        const note = pick(data, 'fahrzeugstandort', 'standort', 'bemerkung', 'notiz', 'hinweis') || text(vehicle?.bemerkung);
        const row = sheet.addRow([
          i + 1, text(item.lager) || 'Nicht zugeordnet', text(item.lagerplatz),
          [plate, receipt && receipt !== plate ? `Beleg: ${receipt}` : ''].filter(Boolean).join(' / '),
          [vin, auto].filter(Boolean).join(' / '), dateGerman(item.erstellt_am), tyreSize,
          pick(data, 'saison', 'radart', 'reifenart'), tyreName, note,
        ]);
        row.height = 34;
        const highlight = /verkauft|reserviert|abgeholt|achtung|prüfen|pruefen|wechsel/i.test(note);
        row.eachCell({ includeEmpty: true }, cell => {
          cell.font = { size: 10, color: { argb: 'FF202020' } };
          cell.alignment = { vertical: 'middle', wrapText: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: highlight ? 'FFFFC36A' : i % 2 ? 'FFF1F5F9' : 'FFFFFFFF' } };
          cell.border = { top: { style: 'thin', color: { argb: 'FF555555' } }, bottom: { style: 'thin', color: { argb: 'FF555555' } }, left: { style: 'thin', color: { argb: 'FF555555' } }, right: { style: 'thin', color: { argb: 'FF555555' } } };
        });
      });
      sheet.autoFilter = { from: 'A1', to: 'J1' };
      sheet.pageSetup.printTitlesRow = '1:1';
      sheet.pageSetup.margins = { left: 0.2, right: 0.2, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 };
      const bytes = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `BESICO_Lagerliste_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setStatus(`Lagerliste erstellt: ${sorted.length} Radsätze. Leere Felder bedeuten, dass die Angaben nicht gespeichert sind.`);
    } catch (e) { setErrors([e instanceof Error ? e.message : String(e)]); }
    finally { setWorking(false); }
  }

  // Read legacy warehouse sheets with title lines above the actual table header.
  function readLegacyRows(sheet: XLSX.WorkSheet, fileName: string): CellRow[] | null {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
    const headerIndex = grid.findIndex(row => {
      const cells = row.map(v => text(v).toLowerCase());
      return cells.some(v => v === 'bereich') && cells.some(v => v === 'lagerplatz') && cells.some(v => v.includes('kennzeichen'));
    });
    if (headerIndex < 0) return null;
    const head = grid[headerIndex].map(v => text(v).toLowerCase());
    const get = (row: unknown[], name: string) => {
      const index = head.findIndex(h => h === name || h.startsWith(name + ' /'));
      return index < 0 ? '' : text(row[index]);
    };
    const result: CellRow[] = [];
    for (let i = headerIndex + 1; i < grid.length; i++) {
      const row = grid[i];
      const nr = get(row, 'nr.');
      const label = get(row, 'kennzeichen');
      const vehicle = get(row, 'fahrgestellnummer');
      const tyre = get(row, 'reifengröße');
      if (!nr && !label && !vehicle && !tyre) continue;
      if (!label && !vehicle && !tyre) continue;
      const source = get(row, 'quelldatei') || fileName;
      const sourceLine = get(row, 'quellzeile') || nr || String(i + 1);
      // Stable legacy receipt ID makes re-imports safe; do not treat Nr. as an actual receipt number.
      const number = `ALT-${source.replace(/[^a-zA-Z0-9]/g, '').slice(0, 35)}-${sourceLine.replace(/[^a-zA-Z0-9]/g, '')}`;
      result.push({
        belegnummer: number,
        kennzeichen: label || `OHNE-KZ-${sourceLine}`,
        kundenname: '', fahrzeug: vehicle, saison: get(row, 'radart'),
        reifengroesse: tyre, reifenbezeichnung: get(row, 'reifenbezeichnung'),
        fahrzeugstandort: get(row, 'fahrzeugstandort'),
        bemerkung: get(row, 'bemerkung'), datum_alt: get(row, 'datum'),
        bereich_alt: get(row, 'bereich'), lagerplatz_alt: get(row, 'lagerplatz'),
        quelle: source, quellzeile: sourceLine, nummer_alt: nr,
      });
    }
    return result;
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview([]); setChecks([]); setErrors([]); setStatus(''); setFilename(file?.name || ''); setLegacyImport(false);
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const preferred = kind === 'Fahrzeuge' ? 'Fahrzeuge' : 'Radsaetze';
      const sheet = workbook.Sheets[workbook.SheetNames.includes(preferred) ? preferred : workbook.SheetNames[0]];
      if (!sheet) throw new Error('Keine Tabelle gefunden.');
      const legacy = kind === 'Radsaetze' ? readLegacyRows(sheet, file.name) : null;
      const rows = legacy ?? XLSX.utils.sheet_to_json<CellRow>(sheet, { defval: '', raw: false });
      setLegacyImport(legacy !== null);
      if (!rows.length) throw new Error('Die Excel-Tabelle ist leer.');
      if (rows.length > 2000) throw new Error('Bitte maximal 2000 Zeilen auf einmal importieren.');
      const required = kind === 'Fahrzeuge' ? ['kennzeichen'] : ['belegnummer', 'kennzeichen'];
      const missing = required.filter(c => !Object.keys(rows[0]).includes(c));
      if (missing.length) throw new Error(`Fehlende Spalten: ${missing.join(', ')}. Bitte den vollständigen Backup-Export als Vorlage verwenden.`);
      setChecking(true);
      const evaluated = await classifyRows(rows, kind);
      setChecks(evaluated);
      setPreview(rows);
      setStatus(`${rows.length} Zeilen geprüft. Neu: ${evaluated.filter(x => x.state === 'Neu').length}; vorhanden: ${evaluated.filter(x => x.state === 'Bereits vorhanden').length}; manuell prüfen: ${evaluated.filter(x => x.state === 'Prüfen').length}. Noch nichts gespeichert.`);
    } catch (e) { setErrors([e instanceof Error ? e.message : String(e)]); }
    setChecking(false);
    event.target.value = '';
  }

  async function loadExisting(kindToLoad: Kind): Promise<CellRow[]> {
    const table = kindToLoad === 'Fahrzeuge' ? 'fahrzeuge' : 'reifenlager_scheine';
    const fields = kindToLoad === 'Fahrzeuge' ? 'kennzeichen,vin' : 'belegnummer,kennzeichen,daten';
    const all: CellRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from(table).select(fields).range(offset, offset + 999);
      if (error) throw new Error(error.message);
      const batch = (data || []) as unknown as CellRow[];
      all.push(...batch);
      if (batch.length < 1000) break;
    }
    return all;
  }

  function classify(row: CellRow, existing: CellRow[], alreadyInFile: CellRow[], kindToCheck: Kind): ImportCheck {
    if (kindToCheck === 'Fahrzeuge') {
      const plate = normalize(row.kennzeichen);
      if (!plate) return { state: 'Prüfen', reason: 'Kennzeichen fehlt' };
      if ([...existing, ...alreadyInFile].some(r => normalize(r.kennzeichen) === plate))
        return { state: 'Bereits vorhanden', reason: 'Kennzeichen bereits vorhanden' };
      return { state: 'Neu', reason: 'Neues Fahrzeug' };
    }
    const number = normalize(row.belegnummer);
    const plate = normalize(row.kennzeichen);
    if (!number || !plate) return { state: 'Prüfen', reason: 'Belegnummer oder Kennzeichen fehlt' };
    const candidates = [...existing, ...alreadyInFile];
    if (candidates.some(r => normalize(r.belegnummer) === number))
      return { state: 'Bereits vorhanden', reason: 'Belegnummer bereits vorhanden' };
    const id = identity(row);
    const matches = candidates.map(r => comparable(id, identity(r)));
    if (matches.includes('match'))
      return { state: 'Prüfen', reason: 'Gleiche Fahrzeug-/Reifendaten, andere Belegnummer: manuell prüfen' };
    if (matches.includes('possible'))
      return { state: 'Prüfen', reason: 'Mögliche Übereinstimmung: Angaben nicht eindeutig' };
    return { state: 'Neu', reason: 'Kein Treffer' };
  }

  async function classifyRows(rows: CellRow[], kindToCheck: Kind): Promise<ImportCheck[]> {
    const existing = await loadExisting(kindToCheck);
    const checked: CellRow[] = [];
    return rows.map(row => {
      const result = classify(row, existing, checked, kindToCheck);
      if (result.state === 'Neu') checked.push(row);
      return result;
    });
  }

  async function importExcel() {
    if (!preview.length || working || checking) return;
    setWorking(true); setErrors([]); setStatus('Datenbank wird erneut geprüft...');
    const issues: string[] = [];
    let added = 0, skipped = 0, review = 0;
    try {
      // Always recheck immediately before writing, not only when the file was selected.
      const existing = await loadExisting(kind);
      const seenInThisImport: CellRow[] = [];
      const current = preview.map(row => {
        const result = classify(row, existing, seenInThisImport, kind);
        if (result.state === 'Neu') seenInThisImport.push(row);
        return result;
      });
      setChecks(current);
      const newCount = current.filter(x => x.state === 'Neu').length;
      const skippedCount = current.filter(x => x.state === 'Bereits vorhanden').length;
      const reviewCount = current.filter(x => x.state === 'Prüfen').length;
      if (!newCount) {
        setStatus(`Keine sicheren neuen Einträge. ${skippedCount} bereits vorhanden, ${reviewCount} manuell prüfen. Nichts gespeichert.`);
        return;
      }
      if (!window.confirm(`${newCount} neue Einträge importieren?\n${skippedCount} Duplikate überspringen\n${reviewCount} unklare Einträge NICHT importieren\nLagerplätze werden nicht übernommen.`)) {
        setStatus('Import abgebrochen. Nichts gespeichert.');
        return;
      }
      const accepted: CellRow[] = [];
      for (let i = 0; i < preview.length; i++) {
        const row = preview[i];
        const check = classify(row, existing, accepted, kind);
        if (check.state === 'Bereits vorhanden') { skipped++; continue; }
        if (check.state === 'Prüfen') { review++; continue; }
        if (kind === 'Fahrzeuge') {
          const plate = normalize(row.kennzeichen);
          const payload = Object.fromEntries(columns.Fahrzeuge.map(k => [k, k === 'kennzeichen' ? plate : text(row[k]) || null]));
          const { error } = await supabase.from('fahrzeuge').insert(payload);
          if (error) issues.push(`Zeile ${i + 2}: ${error.message}`);
          else { added++; accepted.push(row); }
        } else {
          const number = text(row.belegnummer), plate = text(row.kennzeichen).toUpperCase();
          const payload = { belegnummer: number, kennzeichen: plate, lager: '', lagerplatz: '', daten: {
            kundenname: text(row.kundenname), fahrzeug: text(row.fahrzeug), saison: text(row.saison),
            reifengroesse: text(row.reifengroesse), reifenbezeichnung: text(row.reifenbezeichnung),
            fahrzeugstandort: text(row.fahrzeugstandort), bemerkung: text(row.bemerkung),
            datum_alt: text(row.datum_alt), bereich_alt: text(row.bereich_alt),
            lagerplatz_alt: text(row.lagerplatz_alt), quelle: text(row.quelle),
            quellzeile: text(row.quellzeile), nummer_alt: text(row.nummer_alt),
          } };
          const { error } = await supabase.from('reifenlager_scheine').insert(payload);
          if (error) issues.push(`Zeile ${i + 2}: ${error.message}`);
          else { added++; accepted.push(row); }
        }
      }
      setStatus(`Fertig: ${added} importiert, ${skipped} Duplikate übersprungen, ${review} zur manuellen Prüfung, ${issues.length} Fehler.`);
      setErrors(issues);
      setPreview([]); setChecks([]);
    } catch (e) { setErrors([e instanceof Error ? e.message : String(e)]); setStatus('Import abgebrochen.'); }
    finally { setWorking(false); }
  }

  return <section style={{ maxWidth: 1100 }}>
    <h1>Excel Import / Export</h1>
    <p style={{ color: '#64748b' }}>Lagerliste wie auf dem Foto ausgeben, vollständige Daten sichern oder neue Einträge importieren.</p>
    <div style={style}>
      <h2>Lagerliste (wie auf Foto)</h2>
      <p>Nr. · Bereich · Lagerplatz · Kennzeichen / Lagerschein · Fahrgestellnummer / Auto · Datum · Reifengröße · Radart · Reifenbezeichnung · Fahrzeugstandort. Dunkle Kopfzeile, Rahmen, Markierungen und A4-Querformat.</p>
      <button type="button" disabled={working} style={button} onClick={() => void exportLagerliste()}>{working ? 'Bitte warten...' : 'Lagerliste herunterladen (.xlsx)'}</button>
    </div>
    <div style={style}>
      <h2>Vollständiger Export (Backup)</h2>
      <p>Exportiert Fahrzeuge und Radsätze in eine Excel-Datei mit zwei Arbeitsblättern. Diese Datei kann ebenfalls wieder importiert werden.</p>
      <button type="button" disabled={working} style={button} onClick={() => void exportExcel()}>{working ? 'Bitte warten...' : 'Backup herunterladen (.xlsx)'}</button>
    </div>
    <div style={style}>
      <h2>Excel Import</h2>
      <p>Nur neue Datensätze. Bereits vorhandene Kennzeichen (Fahrzeuge) bzw. Belegnummern (Radsätze) werden übersprungen. Ähnliche Radsätze mit anderer Belegnummer werden zur manuellen Prüfung zurückgestellt. Radsätze werden ohne Lagerplatz importiert. Auch die alte Lagerliste mit Nr., Bereich, Lagerplatz usw. wird erkannt. Alte Lagerplätze werden nur als Information gespeichert und NICHT zugewiesen.</p>
      <label style={{ display: 'block', marginBottom: 12 }}>Datenart: <select value={kind} disabled={working} onChange={e => { setKind(e.target.value as Kind); setPreview([]); setStatus(''); setErrors([]); }} style={{ padding: 8, marginLeft: 8 }}><option value="Fahrzeuge">Fahrzeuge</option><option value="Radsaetze">Radsätze</option></select></label>
      <input type="file" accept=".xlsx,.xls" disabled={working} onChange={e => void chooseFile(e)} aria-label="Excel-Datei auswählen" />
      {legacyImport && preview.length > 0 && <p style={{ color: '#92400e', fontWeight: 600 }}>Alte Lagerliste erkannt. Alle neuen Radsätze werden ohne Lagerplatz angelegt. Fehlende Kennzeichen erhalten die Kennung OHNE-KZ-...; bitte später prüfen.</p>}
      {preview.length > 0 && <>
        <h3>Vorschau: {preview.length} Zeilen ({filename})</h3>
        <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto', marginBottom: 12 }}><table style={{ borderCollapse: 'collapse', fontSize: 13 }}><thead><tr><th style={{ padding: 8, border: '1px solid #cbd5e1' }}>Status</th>{(legacyImport ? [...columns[kind], 'reifengroesse', 'reifenbezeichnung', 'fahrzeugstandort', 'bemerkung', 'lagerplatz_alt'] : columns[kind]).map(k => <th key={k} style={{ padding: 8, border: '1px solid #cbd5e1', textAlign: 'left' }}>{k}</th>)}</tr></thead><tbody>{preview.slice(0, 20).map((r, i) => <tr key={i}><td style={{ padding: 8, border: '1px solid #e2e8f0', color: checks[i]?.state === 'Neu' ? '#166534' : '#92400e' }} title={checks[i]?.reason}>{checks[i]?.state}</td>{(legacyImport ? [...columns[kind], 'reifengroesse', 'reifenbezeichnung', 'fahrzeugstandort', 'bemerkung', 'lagerplatz_alt'] : columns[kind]).map(k => <td key={k} style={{ padding: 8, border: '1px solid #e2e8f0' }}>{text(r[k])}</td>)}</tr>)}</tbody></table></div>
        {preview.length > 20 && <p>Vorschau zeigt die ersten 20 Zeilen.</p>}
        <button type="button" disabled={working || checking || !checks.some(c => c.state === 'Neu')} style={button} onClick={() => void importExcel()}>{working ? 'Import läuft...' : `${checks.filter(c => c.state === 'Neu').length} neue Einträge importieren`}</button>
      </>}
    </div>
    {status && <p role="status" style={{ color: '#166534', fontWeight: 600 }}>{status}</p>}
    {errors.length > 0 && <div role="alert" style={{ ...style, color: '#b91c1c' }}><strong>Fehler ({errors.length}):</strong><ul>{errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul>{errors.length > 30 && <p>Weitere {errors.length - 30} Fehler nicht angezeigt.</p>}</div>}
  </section>;
}