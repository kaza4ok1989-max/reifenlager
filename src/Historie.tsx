import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

type Event = {
  id: number; schein_id: string | null; zeitpunkt: string; aktion: string;
  kennzeichen: string; belegnummer: string | null;
  von_lager: string | null; von_lagerplatz: string | null;
  nach_lager: string | null; nach_lagerplatz: string | null;
};
const norm = (value: string) => value.toLocaleUpperCase('de-DE').replace(/[^A-Z0-9]/g, '');
const formatPlace = (area: string | null, place: string | null) => place ? `${area || ''} / ${place}` : '—';
const buttonStyle = { padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#12365a', cursor: 'pointer' };

export default function Historie() {
  const [events, setEvents] = useState<Event[]>([]);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('Alle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true); setError('');
    // Paginate rather than silently hiding events beyond Supabase's default 1000-row limit.
    const all: Event[] = [];
    for (let from = 0; from < 10000; from += 1000) {
      const { data, error: e } = await supabase.from('reifenlager_historie')
        .select('id,schein_id,zeitpunkt,aktion,kennzeichen,belegnummer,von_lager,von_lagerplatz,nach_lager,nach_lagerplatz')
        .order('id', { ascending: false }).range(from, from + 999);
      if (e) { setError(e.message); break; }
      const page = (data || []) as Event[];
      all.push(...page);
      if (page.length < 1000) break;
    }
    setEvents(all); setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);
  const filtered = useMemo(() => events.filter(event => {
    if (action !== 'Alle' && event.aktion !== action) return false;
    const haystack = [event.kennzeichen, event.belegnummer, event.aktion,
      event.von_lager, event.von_lagerplatz, event.nach_lager, event.nach_lagerplatz].join(' ');
    const needle = norm(query);
    return !needle || norm(haystack).includes(needle);
  }), [events, query, action]);

  return <section style={{ maxWidth: 1300 }}>
    <h1>Historie</h1>
    <p style={{ color: '#64748b' }}>Alle neuen Einlagerungen, Umlagerungen, Auslagerungen und Löschungen werden automatisch gespeichert.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
      <input aria-label="Historie durchsuchen" value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Kennzeichen, Belegnummer oder Lagerplatz suchen..."
        style={{ flex: '1 1 260px', padding: 12, border: '1px solid #cbd5e1', borderRadius: 8 }} />
      <select aria-label="Aktion filtern" value={action} onChange={e => setAction(e.target.value)}
        style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }}>
        {['Alle', 'Neuer Radsatz', 'Einlagerung', 'Umlagerung', 'Auslagerung', 'Löschen'].map(a => <option key={a}>{a}</option>)}
      </select>
      <button type="button" style={buttonStyle} disabled={loading} onClick={() => void refresh()}>Aktualisieren</button>
    </div>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>Fehler: {error}. Bitte zuerst historie.sql in Supabase ausführen.</p>}
    <p><strong>{filtered.length}</strong> Ereignisse {loading ? '· Laden...' : ''}</p>
    <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
        <thead><tr style={{ background: '#e9f0f7' }}>
          {['Datum / Uhrzeit', 'Aktion', 'Kennzeichen', 'Belegnummer', 'Von', 'Nach', 'Schein / QR'].map(h =>
            <th key={h} style={{ padding: 12, borderBottom: '1px solid #cbd5e1', whiteSpace: 'nowrap' }}>{h}</th>)}
        </tr></thead>
        <tbody>{filtered.map(event => <tr key={event.id}>
          <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{new Date(event.zeitpunkt).toLocaleString('de-DE')}</td>
          <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>{event.aktion}</td>
          <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>{event.kennzeichen}</td>
          <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>{event.belegnummer || '—'}</td>
          <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>{formatPlace(event.von_lager, event.von_lagerplatz)}</td>
          <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>{formatPlace(event.nach_lager, event.nach_lagerplatz)}</td>
          <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>{event.schein_id && event.aktion !== 'Löschen' ?
            <a href={`${window.location.origin}${import.meta.env.BASE_URL}?qr=${encodeURIComponent(event.schein_id)}`}>Öffnen</a> : '—'}</td>
        </tr>)}</tbody>
      </table>
      {!loading && filtered.length === 0 && <p style={{ padding: 16 }}>Keine Einträge gefunden. Neue Aktionen erscheinen hier automatisch.</p>}
    </div>
  </section>;
}
