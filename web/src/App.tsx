import { useCallback, useEffect, useMemo, useState } from "react";
import { MIN_LAND_SQM } from "@ai-re-agent/contracts";
import type {
  Feature,
  Listing,
  ListingsResponse,
} from "@ai-re-agent/contracts";
import { featureInfo, searchable, englishListing } from "./lib";
import { Icon } from "./components/Icon";
import { ListingCard } from "./components/ListingCard";
import { ListingDetail } from "./components/ListingDetail";
import { Modal } from "./components/Modal";
import { PropertyMap } from "./components/PropertyMap";
import { SearchActivity } from "./components/SearchActivity";
import "./requirements.css";

type Page = "explore" | "saved";
type Status = "eligible" | "needs-checking" | "excluded";
type MobileView = "split" | "list" | "map";
const savedKey = "estia:saved:v1";
function initialSaved(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(savedKey) || "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}
export function App() {
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<Page>("explore");
  const [collection, setCollection] = useState<"live" | "demo">(() => {
    try {
      return localStorage.getItem("estia:collection") === "demo"
        ? "demo"
        : "live";
    } catch {
      return "live";
    }
  });
  const [status, setStatus] = useState<Status>("eligible");
  const refreshListings = useCallback(
    () => setRevision((current) => current + 1),
    [],
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("score");
  const [features, setFeatures] = useState<Feature[]>([]);
  const [saved, setSaved] = useState(initialSaved);
  const [storageError, setStorageError] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"filters" | "brief" | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("split");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setLoading(true);
    setError("");
    fetch("/api/listings?status=all&collection=" + collection, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load");
        const result = (await response.json()) as ListingsResponse;
        if (
          !Array.isArray(result.listings) ||
          result.policy?.version !== "greece-land-v3"
        )
          throw new Error("Server response did not match the current app.");
        const listings = result.listings.filter(
          (listing) =>
            typeof listing.landSqm === "number" &&
            Number.isFinite(listing.landSqm) &&
            listing.landSqm >= MIN_LAND_SQM,
        );
        if (!cancelled)
          setData({
            ...result,
            listings,
            summary: {
              ...result.summary,
              properties: listings.length,
              eligible: listings.filter((p) => p.status === "eligible").length,
              needsChecking: listings.filter(
                (p) => p.status === "needs-checking",
              ).length,
              excluded: listings.filter((p) => p.status === "excluded").length,
            },
          });
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "We couldn’t load your places. Check that the local server is running, then try again.",
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [revision, collection]);

  useEffect(() => {
    try {
      localStorage.setItem(savedKey, JSON.stringify(saved));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [saved]);

  const toggleSave = (listing: Listing) => {
    const exists = saved.includes(listing.id);
    setSaved((current) =>
      exists
        ? current.filter((id) => id !== listing.id)
        : [...current, listing.id],
    );
    setAnnouncement(
      exists
        ? "Removed from your saved places."
        : "Added to your saved places.",
    );
  };
  const filtered = useMemo(() => {
    const needle = searchable(query.trim());
    return (data?.listings ?? [])
      .filter(
        (p) =>
          (page === "saved" ? saved.includes(p.id) : p.status === status) &&
          (!needle ||
            searchable(
              [
                p.title,
                p.city,
                p.neighborhood,
                p.region,
                englishListing(p).title,
                englishListing(p).city,
                englishListing(p).neighborhood,
                englishListing(p).region,
              ].join(" "),
            ).includes(needle)) &&
          features.every((key) => p.features[key] === true),
      )
      .sort((a, b) =>
        sort === "price"
          ? (a.priceEur ?? Infinity) - (b.priceEur ?? Infinity)
          : sort === "land"
            ? (b.landSqm ?? -1) - (a.landSqm ?? -1)
            : (b.score ?? -1) - (a.score ?? -1) ||
              (a.priceEur ?? Infinity) - (b.priceEur ?? Infinity),
      );
  }, [data, query, page, status, features, saved, sort]);
  const selected = filtered.find((p) => p.id === selectedId) ?? null;
  const detail = data?.listings.find((p) => p.id === detailId) ?? null;
  const savedCount =
    data?.listings.filter((p) => saved.includes(p.id)).length ?? 0;
  const selectOnMap = useCallback((id: string) => setSelectedId(id), []);
  const openListing = (listing: Listing) => {
    setSelectedId(listing.id);
    setDetailId(listing.id);
  };
  const clearFilters = () => {
    setQuery("");
    setFeatures([]);
  };
  const tabs: { value: Status; label: string; count: number }[] = [
    { value: "eligible", label: "Matches", count: data?.summary.eligible ?? 0 },
    {
      value: "needs-checking",
      label: "Needs checking",
      count: data?.summary.needsChecking ?? 0,
    },
    {
      value: "excluded",
      label: "Outside brief",
      count: data?.summary.excluded ?? 0,
    },
  ];
  const navigation = (
    <>
      <button
        className={page === "explore" ? "nav-active" : ""}
        onClick={() => setPage("explore")}
        aria-current={page === "explore" ? "page" : undefined}
      >
        <Icon name="compass" size={23} />
        <span>Explore</span>
      </button>
      <button
        className={page === "saved" ? "nav-active" : ""}
        onClick={() => setPage("saved")}
        aria-current={page === "saved" ? "page" : undefined}
      >
        <span className="nav-icon">
          <Icon name="heart" size={23} />
          {savedCount > 0 && <b>{savedCount}</b>}
        </span>
        <span>Saved</span>
      </button>
      <button onClick={() => setPanel("brief")}>
        <Icon name="brief" size={23} />
        <span>Your brief</span>
      </button>
    </>
  );

  return (
    <div className={"app-shell view-" + mobileView}>
      <aside className="rail">
        <a className="brand-mark" href="/" aria-label="Estía home">
          <Icon name="home" size={29} />
        </a>
        <nav aria-label="Main navigation">{navigation}</nav>
        <span className="rail-bottom">
          Made for
          <br />a new chapter.
        </span>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div className="mobile-brand">
            <Icon name="home" size={22} />
            <span>
              estía<span className="brand-period">.</span>
            </span>
          </div>
          <div className="header-context">
            <span className="wordmark">
              estía<span className="brand-period">.</span>
            </span>
            <span className="header-divider" />
            <span>A little space. A new beginning.</span>
          </div>
          <label className="demo-pill collection-picker">
            <span />
            <select
              aria-label="Listing collection"
              value={collection}
              onChange={(event) => {
                const next = event.target.value as "live" | "demo";
                setCollection(next);
                setData(null);
                setStatus("eligible");
                setDetailId(null);
                setSelectedId(null);
                clearFilters();
                try {
                  localStorage.setItem("estia:collection", next);
                } catch {
                  /* Selection still works for this visit. */
                }
              }}
            >
              <option value="live">Internet listings</option>
              <option value="demo">Sample collection</option>
            </select>
          </label>
          <div className="search-row">
            <label className="search-box">
              <Icon name="search" size={20} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Anywhere in Greece"
                aria-label="Search places"
              />
              {query ? (
                <button onClick={() => setQuery("")} aria-label="Clear search">
                  <Icon name="close" size={17} />
                </button>
              ) : (
                <span className="search-scope">Greece</span>
              )}
            </label>
            <button
              className={
                "filter-button" + (features.length ? " has-filters" : "")
              }
              onClick={() => setPanel("filters")}
              aria-label="Filter by extras"
            >
              <Icon name="filter" />
              <span>
                Filters{features.length ? " · " + features.length : ""}
              </span>
            </button>
          </div>
        </header>

        <main className="explore-workspace">
          <div className="results-panel">
            <button
              className="sheet-handle"
              aria-label={
                mobileView === "list"
                  ? "Show map and list"
                  : "Expand listing sheet"
              }
              onClick={() =>
                setMobileView((current) =>
                  current === "list" ? "split" : "list",
                )
              }
            >
              <span />
            </button>
            <div className="results-heading">
              <div>
                <div className="eyebrow">
                  {page === "saved"
                    ? "YOUR PERSONAL SHORTLIST"
                    : "A PLACE TO PUT DOWN ROOTS"}
                </div>
                <h1>
                  {page === "saved"
                    ? "Keep the possibilities."
                    : "Find your somewhere."}
                </h1>
                <p>
                  {page === "saved"
                    ? "The places you’d like to come back to."
                    : "Good bones, open space, a little Greek sunshine."}
                </p>
              </div>
              <button
                className="icon-button refresh-button"
                aria-label="Refresh listings"
                title="Refresh listings"
                disabled={loading}
                onClick={() => setRevision((n) => n + 1)}
              >
                <Icon
                  name="refresh"
                  size={18}
                  className={loading ? "spinning" : ""}
                />
              </button>
            </div>
            {collection === "live" && (
              <SearchActivity onUpdated={refreshListings} />
            )}
            <div className="brief-chips">
              <span className="brief-chips-label">Your essentials</span>
              <button onClick={() => setPanel("brief")}>Up to €300k</button>
              <button onClick={() => setPanel("brief")}>800+ m² land</button>
              <button onClick={() => setPanel("brief")}>Paved access</button>
            </div>
            {page === "explore" && (
              <div className="status-tabs" aria-label="Listing status">
                {tabs.map((tab) => (
                  <button
                    key={tab.value}
                    className={status === tab.value ? "active" : ""}
                    aria-pressed={status === tab.value}
                    onClick={() => setStatus(tab.value)}
                  >
                    {tab.label}
                    <span>{tab.count}</span>
                  </button>
                ))}
              </div>
            )}
            {features.length > 0 && (
              <div className="active-filters">
                {features.map((key) => (
                  <button
                    key={key}
                    onClick={() =>
                      setFeatures((current) => current.filter((f) => f !== key))
                    }
                  >
                    {featureInfo.find((f) => f.key === key)?.label}
                    <Icon name="close" size={12} />
                  </button>
                ))}
                <button onClick={() => setFeatures([])}>Clear</button>
              </div>
            )}
            <div className="results-toolbar">
              <span aria-live="polite">
                <b>{filtered.length}</b>{" "}
                {page === "saved"
                  ? "saved places"
                  : status === "needs-checking"
                    ? "unconfirmed leads"
                    : status === "excluded"
                      ? "outside your brief"
                      : "matching places"}
              </span>
              <label>
                Sort by{" "}
                <select
                  aria-label="Sort listings"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="score">
                    {page === "explore" && status === "needs-checking"
                      ? "Provisional fit"
                      : "Best fit"}
                  </option>
                  <option value="price">Lowest price</option>
                  <option value="land">Most land</option>
                </select>
              </label>
            </div>
            <div className="results-scroll">
              {!loading &&
                !error &&
                page === "explore" &&
                status === "needs-checking" && (
                  <p className="unconfirmed-note">
                    <Icon name="info" size={17} />
                    <span>
                      Every lead reports at least 800 m² of land. Other missing
                      essentials, such as price or paved access, still need
                      checking before it becomes a match.
                    </span>
                  </p>
                )}
              {error && (
                <div className="empty-state" role="alert">
                  <Icon name="info" size={28} />
                  <h2>A small detour.</h2>
                  <p>{error}</p>
                  <button
                    className="primary-button"
                    onClick={() => setRevision((n) => n + 1)}
                  >
                    Try again
                  </button>
                </div>
              )}
              {loading && !data && (
                <div className="skeleton-grid" aria-label="Loading listings">
                  {[1, 2, 3, 4].map((i) => (
                    <div className="skeleton-card" key={i}>
                      <div />
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              )}
              {!loading && !error && filtered.length === 0 && (
                <div className="empty-state">
                  <Icon
                    name={page === "saved" ? "heart" : "search"}
                    size={32}
                  />
                  <h2>
                    {page === "saved" && !savedCount
                      ? "A place for your favourites."
                      : collection === "live" &&
                          status === "eligible" &&
                          !query &&
                          !features.length
                        ? "No matches confirmed yet."
                        : "Nothing here just yet."}
                  </h2>
                  <p>
                    {page === "saved" && !savedCount
                      ? "Tap the heart on any place to keep it in your shortlist."
                      : collection === "live" && !data?.summary.properties
                        ? "No listings with a stated plot of at least 800 m² are available yet. Open the search status above to see progress."
                        : collection === "live" &&
                            status === "eligible" &&
                            !query &&
                            !features.length
                          ? "Matches need a reported price up to €300,000, at least 800 m² of land and paved access. Listings without a stated plot size, or with less than 800 m², are excluded."
                          : "Try another location or fewer extras."}
                  </p>
                  {query || features.length ? (
                    <button className="primary-button" onClick={clearFilters}>
                      Clear search and extras
                    </button>
                  ) : page === "saved" ? (
                    <button
                      className="primary-button"
                      onClick={() => setPage("explore")}
                    >
                      Explore places
                    </button>
                  ) : collection === "live" &&
                    status === "eligible" &&
                    !!data?.summary.needsChecking ? (
                    <button
                      className="primary-button"
                      onClick={() => setStatus("needs-checking")}
                    >
                      Review {data.summary.needsChecking} unconfirmed leads
                    </button>
                  ) : null}
                </div>
              )}
              {!error && (
                <div className="listing-grid">
                  {filtered.map((p) => (
                    <ListingCard
                      key={p.id}
                      listing={p}
                      selected={selected?.id === p.id}
                      saved={saved.includes(p.id)}
                      onSave={() => toggleSave(p)}
                      onOpen={() => openListing(p)}
                      onMap={() => {
                        setSelectedId(p.id);
                        setMobileView("map");
                      }}
                    />
                  ))}
                </div>
              )}
              {data && !error && filtered.length > 0 && (
                <footer className="collection-note">
                  <Icon name="info" size={15} />
                  <p>
                    {collection === "demo"
                      ? "Fictional listings, illustrative photos."
                      : "Real search leads. Source claims and availability need checking."}
                    <br />
                    {data.summary.observations} observations ·{" "}
                    {data.summary.duplicates} duplicates combined.
                    <br />
                    <span>Open a listing for wildfire area context.</span>
                  </p>
                </footer>
              )}
              {storageError && (
                <p className="storage-note" role="status">
                  Your browser cannot store saved places. They will last for
                  this visit only.
                </p>
              )}
            </div>
          </div>
          <PropertyMap
            listings={filtered}
            selected={selected}
            onSelect={selectOnMap}
            onOpen={() => {
              if (selected) setDetailId(selected.id);
            }}
          />
          <div className="mobile-view-switch" aria-label="Layout">
            <button
              className={mobileView !== "map" ? "active" : ""}
              onClick={() => setMobileView("list")}
              aria-label="Show listing view"
            >
              <Icon name="list" size={17} />
              List
            </button>
            <button
              className={mobileView === "map" ? "active" : ""}
              onClick={() => setMobileView("map")}
              aria-label="Show map view"
            >
              <Icon name="map" size={17} />
              Map
            </button>
          </div>
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navigation}
        </nav>
      </div>
      <span className="sr-only" role="status">
        {announcement}
      </span>
      {detail && (
        <ListingDetail
          listing={detail}
          saved={saved.includes(detail.id)}
          onSave={() => toggleSave(detail)}
          onClose={() => setDetailId(null)}
        />
      )}
      {panel === "filters" && (
        <Modal title="A few lovely extras" onClose={() => setPanel(null)}>
          <div className="panel-content">
            <p className="muted">
              Narrow the view to places that report these features. Select more
              than one to require all of them.
            </p>
            <div className="filter-options">
              {featureInfo.map((f) => (
                <label key={f.key}>
                  <Icon name={f.icon} />
                  <span>{f.label}</span>
                  <input
                    type="checkbox"
                    checked={features.includes(f.key)}
                    onChange={() =>
                      setFeatures((current) =>
                        current.includes(f.key)
                          ? current.filter((key) => key !== f.key)
                          : [...current, f.key],
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <p className="small-note">
              These filters only narrow the view. Your fixed scoring priorities
              stay the same.
            </p>
          </div>
          <footer className="modal-actions">
            <button className="text-button" onClick={() => setFeatures([])}>
              Clear extras
            </button>
            <button className="primary-button" onClick={() => setPanel(null)}>
              Show {filtered.length} places
              <Icon name="arrow" size={17} />
            </button>
          </footer>
        </Modal>
      )}
      {panel === "brief" && (
        <Modal title="Your kind of place" onClose={() => setPanel(null)}>
          <div className="panel-content brief-content">
            <div className="brief-intro">
              <Icon name="leaf" size={32} />
              <p>
                Somewhere in Greece.
                <br />
                <strong>Room to live, and room to grow.</strong>
              </p>
            </div>
            <h3>The essentials</h3>
            <ul className="brief-list">
              {(
                data?.policy.filters ?? [
                  "For sale in Greece",
                  "Up to €300,000",
                  "A stated plot of at least 800 m²",
                  "Paved access to the property",
                ]
              ).map((f) => (
                <li key={f}>
                  <Icon name="check" size={17} />
                  {f}
                </li>
              ))}
            </ul>
            <p className="small-note">
              A stated plot of at least 800 m² is required. Missing or smaller
              plots are excluded. An unknown price or access road goes into
              “Needs checking”. Listing claims are not independent verification.
            </p>
            <h3>What matters most</h3>
            <p>
              Good infrastructure and building permits come first. Around{" "}
              <strong>100 m² built is ideal</strong>, with town roughly a
              10-minute drive away. Smaller homes, renovation projects and land
              can still be considered.
            </p>
            <h3>Things to fall for</h3>
            <p>
              A barn or stable, established trees, a working well and solar
              panels. A second unit, sea view or pool would be lovely too.
              Mainland or island — both are welcome.
            </p>
            <h3>What needs a closer look</h3>
            <p>
              Simple, understated style is a personal judgement. Listing details
              include EFFIS wildfire area context where a location is available.
              Its regional model cannot establish the safety of an individual
              plot and is shown separately from the fit score. A high fit score
              does not establish safety or legal suitability.
            </p>
            <h3>How the fit score works</h3>
            <div className="weight-list">
              {data?.policy.weights.map((w) => (
                <div key={w.label}>
                  <span>{w.label}</span>
                  <b>{w.points} pts</b>
                </div>
              ))}
            </div>
            <p className="small-note">
              Fixed priorities, visible reasons. Open any place to see exactly
              where its points come from. Fit is calculated only from reported
              facts. The assessed percentage shows how much of the weighted
              priorities is known; unknown information is not treated as a
              failure. Hard requirements still decide whether a place can be a
              match.
            </p>
            <p className="small-note">
              Saved places stay in this browser. Internet listings come from
              public search results and accessible source pages. The sample
              collection contains fictional listings and illustrative photos.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
