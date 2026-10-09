import type { Listing } from "@ai-re-agent/contracts";
import { area, featureInfo, money, photoFor, score } from "../lib";
import { Icon } from "./Icon";

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
          {photo ? (
            <img
              src={photo.src}
              alt={photo.alt}
              loading="lazy"
              width="640"
              height="460"
            />
          ) : (
            <div className="photo-placeholder">
              <Icon name="home" size={40} />
              <span>No photograph yet</span>
            </div>
          )}
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
        <span className="sample-photo-label">Illustrative photo</span>
      </div>
      <div className="card-body">
        <div className="card-price-row">
          <strong>{money(listing.priceEur)}</strong>
          {listing.score !== null && (
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
          )}
        </div>
        <button className="card-title" onClick={onOpen}>
          {listing.title}
        </button>
        <p className="card-location">
          {listing.neighborhood}, {listing.region}
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
        <div className="card-footer">
          <span>
            {listing.sources.length}{" "}
            {listing.sources.length === 1 ? "source" : "sources"} · demo
          </span>
          <button
            onClick={onMap}
            disabled={listing.latitude === null || listing.longitude === null}
          >
            <Icon name="pin" size={14} />
            On map
          </button>
        </div>
      </div>
    </article>
  );
}
