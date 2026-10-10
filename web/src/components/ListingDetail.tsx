import type { Listing } from "@ai-re-agent/contracts";
import {
  area,
  featureInfo,
  money,
  score,
  statusLabel,
  englishListing,
} from "../lib";
import { ListingGallery } from "./ListingGallery";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { WildfireDetails } from "./WildfireDetails";

const yesNo = (value: boolean | null) =>
  value === true ? "Reported" : value === false ? "Not available" : "Unknown";
export function ListingDetail({
  listing: p,
  saved,
  onSave,
  onClose,
}: {
  listing: Listing;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const original = p;
  p = englishListing(p);
  return (
    <Modal title="A closer look" className="detail-modal" onClose={onClose}>
      <ListingGallery key={p.id} listing={p} />
      <div className="detail-content">
        <div className="detail-topline">
          <span className={"status-tag " + p.status}>{statusLabel(p)}</span>
          <button
            className={"text-button save-detail" + (saved ? " saved" : "")}
            onClick={onSave}
            aria-pressed={saved}
          >
            <Icon name="heart" size={18} />
            {saved ? "Saved" : "Save place"}
          </button>
        </div>
        <h3>{p.title}</h3>
        <p className="muted">
          {p.neighborhood}, {p.region} · {p.city}
        </p>
        <p className="detail-price">{money(p.priceEur)}</p>
        <div className="detail-facts">
          <div>
            <Icon name="home" />
            <strong>{area(p.areaSqm)}</strong>
            <span>built area</span>
          </div>
          <div>
            <Icon name="land" />
            <strong>{area(p.landSqm)}</strong>
            <span>land</span>
          </div>
          <div>
            <Icon name="clock" />
            <strong>
              {p.townMinutes === null ? "Unknown" : p.townMinutes + " min"}
            </strong>
            <span>to town, reported</span>
          </div>
        </div>
        {!!p.sourceDetails?.length && (
          <section className="detail-section">
            <h4>Property details</h4>
            <p className="small-note">As reported by the listing.</p>
            <dl className="evidence-list">
              {p.sourceDetails.map((d) => (
                <div key={d.label}>
                  <dt>{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <p className="description">{p.description}</p>
        {original.english && (
          <details className="translation-original">
            <summary>Machine translated to English · show original</summary>
            <h4>{original.title}</h4>
            <p>{original.description}</p>
          </details>
        )}
        {p.discovery &&
          !original.english &&
          /[α-ωΑ-Ω]/u.test(p.description) && (
            <p className="small-note">
              English translation is unavailable. Run the local data setup and
              enrichment command.
            </p>
          )}
        {p.areaLocation && p.latitude === null && (
          <div className="area-location">
            <strong>Area location: {p.areaLocation.label}</strong>
            <p>{p.areaLocation.explanation}</p>
            <a href={p.areaLocation.sourceUrl} target="_blank" rel="noreferrer">
              Place data: GeoNames (CC BY 4.0)
            </a>
          </div>
        )}
        {(p.filterReasons.length > 0 || p.missingDetails.length > 0) && (
          <div className="checking-note">
            <Icon name="info" />
            <div>
              <strong>
                {p.status === "excluded"
                  ? "Why it is outside your brief"
                  : "Before this can be a match"}
              </strong>
              <ul>
                {[...p.filterReasons, ...p.missingDetails].map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <section className="detail-section">
          <h4>The practical things</h4>
          <dl className="evidence-list">
            <div>
              <dt>Access road</dt>
              <dd>
                {p.road === "paved"
                  ? "Paved · reported"
                  : p.road === "unpaved"
                    ? "Unpaved · reported"
                    : "Unknown"}
              </dd>
            </div>
            <div>
              <dt>Building permits</dt>
              <dd>
                {p.permits === "documents-listed"
                  ? "Documents listed, not reviewed"
                  : p.permits === "reported"
                    ? "Reported, documents needed"
                    : p.permits === "issues-reported"
                      ? "Issue reported"
                      : "Unknown"}
              </dd>
            </div>
            <div>
              <dt>Electricity / mains water</dt>
              <dd>
                {yesNo(p.electricity)} / {yesNo(p.mainsWater)}
              </dd>
            </div>
            <div>
              <dt>Internet connection</dt>
              <dd>{yesNo(p.internet)}</dd>
            </div>
          </dl>
          <p className="small-note">
            Listing claims need checking. Tree cover does not establish fire
            safety, and a map pin does not confirm road surface, permits or
            buildability.
          </p>
        </section>
        <WildfireDetails key={p.id} listing={p} />
        <section className="detail-section">
          <h4>The little (and big) extras</h4>
          <div className="extras-grid">
            {featureInfo.map((f) => (
              <div
                key={f.key}
                className={p.features[f.key] === true ? "present" : ""}
              >
                <Icon name={f.icon} />
                <span>
                  {f.label}
                  <small>
                    {p.features[f.key] === true
                      ? "Reported"
                      : p.features[f.key] === false
                        ? "Not listed"
                        : "Unknown"}
                  </small>
                </span>
                {p.features[f.key] === true && <Icon name="check" size={15} />}
              </div>
            ))}
          </div>
        </section>
        {p.score !== null && (
          <section className="detail-section score-section">
            <div className="section-title">
              <div>
                <h4>Fit on known facts</h4>
                <p>
                  How the reported details fit your priorities. Unknown details
                  are left out of the calculation.
                </p>
              </div>
              <div className="detail-fit">
                <strong>
                  {score(p.score)}
                  <small>/100</small>
                </strong>
                <span>{p.scoreCoverage}% assessed</span>
              </div>
            </div>
            <div className="score-coverage">
              <span>
                <strong>{p.scoreCoverage}%</strong> of weighted priorities have
                reported facts
              </span>
              <span className="coverage-track" aria-hidden="true">
                <span style={{ width: p.scoreCoverage + "%" }} />
              </span>
              <p>
                Fit can change as more details are found. Coverage measures the
                information available, not its independent verification.
              </p>
            </div>
            {p.status === "needs-checking" && (
              <p className="small-note">
                This property still needs checking before it can be a match. A
                high fit score does not confirm missing essentials.
              </p>
            )}
            {p.reasons.map((r) => (
              <details className="score-reason" key={r.criterion}>
                <summary>
                  <span>
                    {r.label}
                    {r.assessedPoints > 0 && (
                      <span className="score-track">
                        <span
                          style={{
                            width: (r.points / r.assessedPoints) * 100 + "%",
                          }}
                        />
                      </span>
                    )}
                  </span>
                  {r.assessedPoints > 0 ? (
                    <b>
                      {r.points.toFixed(2)}{" "}
                      <small>/ {r.assessedPoints.toFixed(2)} assessed</small>
                    </b>
                  ) : (
                    <b className="unassessed-reason">Not assessed</b>
                  )}
                  <Icon name="down" size={16} />
                </summary>
                <p>{r.reason}</p>
              </details>
            ))}
            <p className="small-note">
              100 m² built is an ideal, not a minimum. The plot requirement is
              checked before scoring. Unknown information is not scored as a
              negative. Style and wildfire exposure are not included in this fit
              score.
            </p>
          </section>
        )}
        <section className="detail-section">
          <h4>Where it came from</h4>
          <p className="small-note">
            {p.discovery
              ? p.discovery.message
              : "Demo sources use reserved .example addresses. These are not live advertisements. The newest observation supplies the displayed details."}
          </p>
          {p.discovery && (
            <div className="discovery-detail">
              <p>
                Details observed{" "}
                {new Date(p.discovery.observedAt).toLocaleString("en-GB")}. Last
                seen{" "}
                {new Date(p.discovery.lastSeenAt).toLocaleDateString("en-GB")}.{" "}
                Page check{" "}
                {p.discovery.lastAttemptAt
                  ? new Date(p.discovery.lastAttemptAt).toLocaleString("en-GB")
                  : "not attempted"}
                : {p.discovery.pageStatus.replace("-", " ")}.
              </p>
              {Date.now() - Date.parse(p.discovery.observedAt) >
                7 * 86400000 && (
                <p className="card-caution">
                  These details are over a week old. Reconfirm the price and
                  availability.
                </p>
              )}
              {p.latitude === null && !p.areaLocation && (
                <p>
                  No source coordinates are available, so this property has no
                  map pin.
                </p>
              )}
              <details className="extraction-evidence">
                <summary>
                  Evidence behind the extracted details (
                  {p.discovery.evidence.length})
                </summary>
                {p.discovery.evidence.length === 0 && (
                  <p>
                    The search result did not expose any of the scored facts.
                  </p>
                )}
                {p.discovery.evidence.map((item, index) => (
                  <div key={item.field + index}>
                    <strong>
                      {item.field.replace(/([A-Z])/g, " $1")} · {item.value}
                    </strong>
                    <p>{item.excerpt}</p>
                  </div>
                ))}
              </details>
            </div>
          )}
          <div className="source-list">
            {p.sources.map((s) => (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                key={s.sourceId + s.externalId}
              >
                <div>
                  <strong>{s.sourceName}</strong>
                  <span>{s.url}</span>
                  <small>
                    Observed{" "}
                    {new Date(s.observedAt).toLocaleDateString("en-GB")}
                  </small>
                </div>
                <Icon name="external" size={18} />
              </a>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
