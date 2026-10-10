import { useState } from "react";
import type { Listing } from "@ai-re-agent/contracts";
import { photosFor } from "../lib";
import { ListingImage } from "./ListingImage";

export function ListingGallery({ listing }: { listing: Listing }) {
  const photos = photosFor(listing);
  const [index, setIndex] = useState(0);
  const photo = photos[index] ?? photos[0];
  if (!photo) return null;
  return (
    <figure className="detail-photo">
      <div className="gallery-frame">
        <ListingImage photo={photo} />
        {photos.length > 1 && (
          <div className="gallery-controls">
            <button
              aria-label="Previous photo"
              onClick={() =>
                setIndex((i) => (i - 1 + photos.length) % photos.length)
              }
            >
              ‹
            </button>
            <span aria-live="polite">
              {index + 1} / {photos.length}
            </span>
            <button
              aria-label="Next photo"
              onClick={() => setIndex((i) => (i + 1) % photos.length)}
            >
              ›
            </button>
          </div>
        )}
      </div>
      <figcaption>
        {photo.kind === "source"
          ? "Listing photograph · "
          : "Illustrative photo, not this property · "}
        <a href={photo.credit} target="_blank" rel="noreferrer">
          {photo.author}
          {photo.kind === "illustration" ? " / Pexels" : ""}
        </a>
      </figcaption>
    </figure>
  );
}
