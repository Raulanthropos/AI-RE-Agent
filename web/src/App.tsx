import { useEffect, useMemo, useState } from 'react';
import type { Listing, ListingsResponse } from '@ai-re-agent/contracts';

const money = (value: number | null) => value === null ? 'Price unavailable' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
const textKey = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el-GR');
type View = 'eligible' | 'excluded' | 'all';

function HomeMark() {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3 10 9-7 9 7v10H3V10Z" stroke="currentColor" strokeWidth="1.5" /><path d="M9 20v-8h6v8" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

function ListingCard({ listing, rank }: { listing: Listing; rank: number }) {
  return <article className={`listing-card ${listing.eligible ? '' : 'excluded-card'}`}>
    <div className="card-top">
      <div className="property-heading">
        <div className="eyebrow"><span className="rank">#{String(rank).padStart(2, '0')}</span><span lang="el">{listing.neighborhood}</span><span className="dot">/</span><span lang="el">{listing.city}</span></div>
        <h3>{listing.title}</h3>
        <p className="address" lang="el">{listing.address ?? 'Address not provided'}{listing.floor !== null ? ` · Floor ${listing.floor}` : ''}</p>
      </div>
      <div className={`score ${listing.eligible ? '' : 'score-excluded'}`} aria-label={listing.eligible ? `Score ${listing.score} out of 100` : 'Excluded from scoring'}>
        <strong>{listing.score?.toFixed(1) ?? '—'}</strong><span>{listing.eligible ? 'OUT OF 100' : 'EXCLUDED'}</span>
      </div>
    </div>
    <div className="property-facts">
      <div className="price">{money(listing.priceEur)}{listing.transaction === 'rent' && <small> / month</small>}<span>{listing.pricePerSqm === null ? 'Price per m² unavailable' : `${money(listing.pricePerSqm)} / m²`}</span></div>
      <div><strong>{listing.areaSqm ?? '—'} <small>m²</small></strong><span>Floor area</span></div>
      <div><strong>{listing.bedrooms ?? '—'}</strong><span>Bedrooms</span></div>
      <div className="condition"><strong>{listing.condition.replace('-', ' ')}</strong><span>{listing.metroDistanceM === null ? 'Metro distance unknown' : `${listing.metroDistanceM} m to metro`}</span></div>
    </div>
    {!listing.eligible && <div className="filter-failures"><strong>Outside this search</strong><ul>{listing.filterReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
    {listing.eligible && <details className="score-details">
      <summary><span><span className="detail-symbol" aria-hidden="true">＋</span> Why this score</span><span className="muted">5 fixed factors</span></summary>
      <div className="score-reasons">
        {listing.reasons.map(reason => <div className="reason" key={reason.criterion}>
          <div className="reason-label"><strong>{reason.label}</strong><span>{reason.points.toFixed(2)} <span className="muted">/ {reason.maxPoints}</span></span></div>
          <div className="bar" aria-hidden="true"><span style={{ width: `${100 * reason.points / reason.maxPoints}%` }} /></div>
          <p>{reason.reason}</p>
        </div>)}
      </div>
    </details>}
    <div className="sources"><span>{listing.sources.length > 1 ? `${listing.sources.length} sources · duplicates merged` : '1 source'}</span>
      <div>{listing.sources.map(source => <a key={`${source.sourceId}/${source.externalId}`} href={source.url} target="_blank" rel="noreferrer" title={source.url}>{source.sourceName}<span aria-hidden="true"> ↗</span><span className="source-url">{source.url}</span></a>)}</div>
    </div>
  </article>;
}

export function App() {
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<View>('eligible');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('score');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    setLoading(true);
    setError(null);
    async function load() {
      try {
        const response = await fetch('/api/listings?status=all', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const result = await response.json() as ListingsResponse;
        if (active) setData(result);
      } catch {
        if (active) setError('We couldn’t load the shortlist. Check that the local server is running, then try again.');
      } finally {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [revision]);

  const listings = useMemo(() => {
    const search = textKey(query.trim());
    return (data?.listings ?? [])
      .filter(listing => view === 'all' || (view === 'eligible' ? listing.eligible : !listing.eligible))
      .filter(listing => textKey(`${listing.title} ${listing.neighborhood} ${listing.city} ${listing.address ?? ''}`).includes(search))
      .sort((a, b) => sort === 'price' ? (a.priceEur ?? Infinity) - (b.priceEur ?? Infinity) : (b.score ?? -1) - (a.score ?? -1));
  }, [data, view, query, sort]);

  return <>
    <header className="topbar"><a className="brand" href="/" aria-label="Estía home"><span className="brand-icon"><HomeMark /></span>estía<span className="brand-caption">PROPERTY INTELLIGENCE</span></a><span className="local-status"><i />Local workspace</span></header>
    <main>
      <section className="hero"><div><p className="eyebrow hero-kicker">ATHENS, GREECE <span> / </span> YOUR NEXT CHAPTER</p><h1>A place worth<br /><em>looking into.</em></h1><p className="intro">A considered shortlist of Athens homes.<br />Every match filtered. Every score explained.</p></div>
        <div className="hero-note"><span className="note-number">01</span><div className="line-art" aria-hidden="true"><HomeMark /></div><span>THE ATHENS EDIT</span><p>A clearer view.<br />A place to begin.</p><small>37.9838° N &nbsp; 23.7275° E</small></div>
      </section>
      <div className="sample-banner"><span className="sample-tag">SAMPLE DATA</span><span>Fictional homes, real workflow. Source links are demonstration URLs.</span></div>
      <section className="stats" aria-label="Import summary">
        <div><span>Source records</span><strong>{data?.summary.observations ?? '—'}</strong><small>Across two sample adapters</small></div>
        <div><span>Unique properties</span><strong>{data?.summary.properties ?? '—'}</strong><small>{data ? `${data.summary.duplicates} duplicate records merged` : 'Deduplicated before scoring'}</small></div>
        <div className="stat-match"><span>Within your criteria</span><strong>{data?.summary.eligible ?? '—'}<i>↗</i></strong><small>Ranked by a fixed 100-point score</small></div>
        <div><span>Filtered out</span><strong>{data?.summary.excluded ?? '—'}</strong><small>With a reason for every exclusion</small></div>
      </section>
      <div className="workspace">
        <aside>
          <div className="sidebar-section"><p className="eyebrow">THE SEARCH BRIEF</p><h2>Athens apartments</h2><p className="muted brief-copy">A focused first search, with a fixed set of must-haves.</p><ul className="filter-list">{(data?.policy.filters ?? ['Athens only', 'Active apartments for sale', 'Up to €250,000', 'At least 50 m²', 'At least 1 bedroom']).map(filter => <li key={filter}><span aria-hidden="true">✓</span>{filter}</li>)}</ul><span className="fixed-label">FIXED CRITERIA · V1</span></div>
          <div className="sidebar-section weights"><p className="eyebrow">HOW WE RANK</p><h2>Nothing behind the curtain.</h2><p className="muted brief-copy">Five fixed factors. A maximum of 100 points. Open any match to see the math.</p>{data?.policy.weights.map(weight => <div className="weight" key={weight.label}><span>{weight.label}</span><strong>{weight.points}<small> pts</small></strong></div>)}<p className="scoring-footnote">Unknown condition or metro distance earns zero points for that factor.</p></div>
          <div className="import-note"><span className="status-dot" />{data?.summary.lastImportedAt ? <>Last import<br /><strong>{new Date(data.summary.lastImportedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</strong></> : 'No import yet'}</div>
        </aside>
        <section className="results" aria-busy={loading}>
          <div className="results-heading"><div><p className="eyebrow">YOUR SHORTLIST</p><h2>{view === 'excluded' ? 'Outside the brief' : view === 'all' ? 'The full picture' : 'Find your starting point'}</h2></div><button className="refresh" onClick={() => setRevision(value => value + 1)} disabled={loading}><span aria-hidden="true">↻</span> {loading ? 'Loading…' : 'Refresh'}</button></div>
          <div className="tabs" role="group" aria-label="Listing status">{([['eligible', 'Matches', data?.summary.eligible], ['excluded', 'Excluded', data?.summary.excluded], ['all', 'All properties', data?.summary.properties]] as const).map(([value, label, count]) => <button key={value} aria-pressed={view === value} className={view === value ? 'active' : ''} onClick={() => setView(value)}>{label}<span>{count ?? '—'}</span></button>)}</div>
          <div className="toolbar"><label className="search"><span aria-hidden="true">⌕</span><input aria-label="Search properties" placeholder="Search a neighborhood or property" value={query} onChange={event => setQuery(event.target.value)} /></label><label className="sort">Sort by<select aria-label="Sort listings" value={sort} onChange={event => setSort(event.target.value)}><option value="score">Highest score</option><option value="price">Lowest price</option></select></label></div>
          {error && <div className="error" role="alert"><p>{error}</p><button onClick={() => setRevision(value => value + 1)}>Try again</button>{data && <small>Showing the last successfully loaded results below.</small>}</div>}
          <p className="result-count" aria-live="polite">{loading ? 'Loading properties…' : `${listings.length} ${listings.length === 1 ? 'property' : 'properties'}`}{!loading && view === 'eligible' && <span> · All must-haves met</span>}</p>
          {!loading && !error && listings.length === 0 && <div className="empty"><HomeMark /><h3>{data?.summary.properties === 0 ? 'Your shortlist starts here.' : 'No properties in this view.'}</h3><p>{data?.summary.properties === 0 ? 'Run the sample import with npm run db:seed, then refresh.' : 'Try another search or choose a different tab.'}</p></div>}
          <div className="listing-stack">{listings.map((listing, index) => <ListingCard key={listing.id} listing={listing} rank={index + 1} />)}</div>
        </section>
      </div>
    </main>
    <footer><span className="footer-brand">estía</span><span>A little clarity, closer to home.</span><span>LOCAL DEMO · {data?.policy.version ?? 'athens-sale-v1'}</span></footer>
  </>;
}
