import { useState } from "react";
import type { DisplayPhoto } from "../lib";
import { Icon } from "./Icon";

export function ListingImage({
  photo,
  fallback = "Photo unavailable",
}: {
  photo: DisplayPhoto | null;
  fallback?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!photo || failed === photo.src)
    return (
      <div className="photo-placeholder">
        <Icon name="home" size={40} />
        <span>
          {photo ? "Photo unavailable · open the source listing" : fallback}
        </span>
      </div>
    );
  return (
    <img
      src={photo.src}
      alt={photo.alt}
      loading="lazy"
      width="640"
      height="460"
      referrerPolicy="no-referrer"
      onError={() => setFailed(photo.src)}
    />
  );
}
