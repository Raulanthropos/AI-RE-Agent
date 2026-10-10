import type { Listing } from "@ai-re-agent/contracts";
import {
  area,
  featureInfo,
  money,
  photoFor,
  score,
  englishListing,
  mapPosition,
} from "../lib";
import { Icon } from "./Icon";
import { ListingImage } from "./ListingImage";

export function ListingCard({
  listing,
  selected,
  saved,
  onSave,
  onOpen,
  onMap,
}: {
  listing: Listing;
  selected: boolean;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  onMap: () => void;
}) {
  listing = englishListing(listing);
  const photo = photoFor(listing);
  const features = featureInfo
    .filter((f) => listing.features[f.key])
    .slice(0, 2);
  return (
    <article
      className={"listing-card" + (selected ? " is-selected" : "")}
      data-listing-id={listing.id}
      aria-label={listing.title}
    >
      <div className="card-photo">
        <button
          className="photo-button"
          onClick={onOpen}
          aria-label={"View " + listing.title}
        >
          <ListingImage
            photo={photo}
            fallback={
              listing.discovery
                ? "Photos on the source website"
                : "No photograph yet"
            }
          />
        </button>
        <span className={"photo-label " + listing.status}>
          {listing.status === "needs-checking"
            ? "Needs checking"
            : listing.status === "excluded"
              ? "Outside your brief"
              : listing.type === "land"
                ? "Land & possibilities"
                : listing.score! >= 80
                  ? "Worth a closer look"
                  : "Meets essentials"}
        </span>
        <button
          className={"save-button" + (saved ? " saved" : "")}
          aria-label={(saved ? "Unsave " : "Save ") + listing.title}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Icon name="heart" />
        </button>
        {photo && (
          <span className="sample-photo-label">
            {photo.kind === "source" ? "Source photo" : "Illustrative photo"}
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="card-price-row">
          <strong>{money(listing.priceEur)}</strong>
          {listing.status === "needs-checking" ? (
            <button
              className="score-badge unconfirmed-badge"
              onClick={onOpen}
              aria-label="Unconfirmed: see missing essentials"
            >
              Unconfirmed
            </button>
          ) : (
            listing.score !== null && (
              <button
                className="score-badge"
                onClick={onOpen}
                aria-label={
                  "Why this score: " + score(listing.score) + " out of 100"
                }
              >
                <span className="score-dot" />
                {score(listing.score)}
                <span className="score-denominator">/100</span>
              </button>
            )
          )}
        </div>
        <button className="card-title" onClick={onOpen}>
          {listing.title}
        </button>
        <p className="card-location">
          {[listing.neighborhood, listing.region].filter(Boolean).join(", ")}
        </p>
        <div className="card-facts">
          <span>
            <Icon name="home" size={15} />
            {listing.areaSqm === 0
              ? "No building"
              : area(listing.areaSqm) + " built"}
          </span>
          <span>
            <Icon name="land" size={15} />
            {listing.landSqm === null
              ? "Plot unknown"
              : area(listing.landSqm) + " land"}
          </span>
        </div>
        {listing.status === "excluded" ? (
          <p className="card-caution">{listing.filterReasons[0]}</p>
        ) : listing.status === "needs-checking" ? (
          <p className="card-caution">{listing.missingDetails[0]}</p>
        ) : (
          <div className="feature-tags">
            {features.map((f) => (
              <span key={f.key}>
                <Icon name={f.icon} size={13} />
                {f.label}
              </span>
            ))}
          </div>
        )}
        {listing.discovery && (
          <p className="discovery-caption">
            {listing.discovery.acquisition === "saved-page"
              ? "Saved page · reported details"
              : listing.discovery.basis === "search"
                ? "Search snippet · unconfirmed"
                : listing.discovery.basis === "catalog"
                  ? "Portal results · unconfirmed"
                  : "Source page · reported details"}
            {Date.now() - Date.parse(listing.discovery.observedAt) >
              7 * 86400000 && " · older than 7 days"}
          </p>
        )}
        <div className="card-footer">
          <span>
            {listing.discovery ? (
              <a
                href={listing.sources[0]?.url}
                target="_blank"
                rel="noreferrer"
              >
                {listing.sources[0]?.sourceName} ↗
              </a>
            ) : (
              <>
                {listing.sources.length}{" "}
                {listing.sources.length === 1 ? "source" : "sources"} · demo
              </>
            )}
          </span>
          <button onClick={onMap} disabled={!mapPosition(listing)}>
            <Icon name="pin" size={14} />
            On map
          </button>
        </div>
      </div>
    </article>
  );
}
