import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Listing } from "@ai-re-agent/contracts";
import { money, photoFor, score } from "../lib";
import { Icon } from "./Icon";

interface Props {
  listings: Listing[];
  selected: Listing | null;
  onSelect: (id: string) => void;
  onOpen: () => void;
}
const greece: L.LatLngBoundsExpression = [
  [34.7, 19.2],
  [41.6, 28.4],
];
const labels: [number, number, string, string][] = [
  [39.75, 22.5, "G R E E C E", "country"],
  [38.05, 23.73, "Athens", "city"],
  [40.65, 22.94, "Thessaloniki", "city"],
  [35.17, 24.95, "C R E T E", "island"],
  [37.9, 25.15, "Aegean Sea", "sea"],
  [37.8, 19.85, "Ionian Sea", "sea"],
  [40.75, 19.7, "ALBANIA", "neighbor"],
  [41.5, 26.9, "TÜRKİYE", "neighbor"],
];
export function PropertyMap({ listings, selected, onSelect, onOpen }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const [tileState, setTileState] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );

  useEffect(() => {
    const host = container.current!;
    const instance = L.map(host, {
      zoomControl: false,
      minZoom: 5,
      maxZoom: 18,
      zoomSnap: 0.25,
      scrollWheelZoom: false,
    }).fitBounds(greece, { padding: [24, 24] });
    map.current = instance;
    instance.attributionControl.setPrefix(
      '<a href="https://leafletjs.com">Leaflet</a>',
    );
    instance.createPane("overview");
    instance.getPane("overview")!.style.zIndex = "180";
    instance.getPane("overview")!.style.pointerEvents = "none";
    const overview = L.layerGroup().addTo(instance);
    const controller = new AbortController();
    let disposed = false,
      loadedTiles = 0;
    const outlineCredit =
      'Overview: <a href="https://www.naturalearthdata.com/">Natural Earth</a>';
    instance.attributionControl.addAttribution(outlineCredit);
    fetch("/map/region.geojson", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Overview unavailable");
        return r.json();
      })
      .then((data) => {
        if (disposed) return;
        L.geoJSON(data, {
          pane: "overview",
          interactive: false,
          style: {
            color: "#bcc4b4",
            weight: 1,
            fillColor: "#f4f3e9",
            fillOpacity: 1,
          },
        }).addTo(overview);
      })
      .catch(() => {
        /* Listing pins remain available even if the optional outline fails. */
      });
    labels.forEach(([lat, lng, label, kind]) => {
      const element = document.createElement("span");
      element.textContent = label;
      L.marker([lat, lng], {
        pane: "overview",
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          html: element,
          className: "overview-label " + kind,
          iconSize: [120, 20],
          iconAnchor: [60, 10],
        }),
      }).addTo(overview);
    });
    const customUrl = import.meta.env.VITE_MAP_TILE_URL;
    const customAttribution = import.meta.env.VITE_MAP_ATTRIBUTION;
    const useCustom = Boolean(customUrl && customAttribution);
    const tiles = L.tileLayer(
      useCustom ? customUrl : "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: useCustom
          ? customAttribution
          : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    );
    tiles.on("tileload", () => {
      loadedTiles++;
      if (!disposed) setTileState("ready");
    });
    tiles.on("tileerror", () => {
      if (!disposed) setTileState("fallback");
    });
    tiles.addTo(instance);
    const timeout = window.setTimeout(() => {
      if (!disposed && loadedTiles === 0) setTileState("fallback");
    }, 8000);
    markerLayer.current = L.layerGroup().addTo(instance);
    L.control.zoom({ position: "bottomright" }).addTo(instance);
    const observer = new ResizeObserver(() => {
      if (host.clientWidth > 0 && host.clientHeight > 0)
        instance.invalidateSize({ pan: true, animate: false });
    });
    observer.observe(host);
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timeout);
      observer.disconnect();
      instance.remove();
      map.current = null;
      markerLayer.current = null;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    const layer = markerLayer.current;
    if (!layer) return;
    layer.clearLayers();
    markers.current.clear();
    for (const p of listings) {
      if (
        p.latitude === null ||
        p.longitude === null ||
        p.locationAccuracy === "unknown"
      )
        continue;
      const label = document.createElement("span");
      label.textContent =
        p.priceEur === null ? "€ ?" : "€" + Math.round(p.priceEur / 1000) + "k";
      const marker = L.marker([p.latitude, p.longitude], {
        icon: L.divIcon({
          html: label,
          className:
            "price-pin" + (p.status === "needs-checking" ? " pending-pin" : ""),
          iconSize: [68, 36],
          iconAnchor: [34, 18],
        }),
        title: p.title,
        keyboard: true,
      }).addTo(layer);
      marker.on("click", () => selectRef.current(p.id));
      const element = marker.getElement()!;
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", "Show " + p.title + " on map");
      element.setAttribute("data-marker-id", p.id);
      element.addEventListener("keydown", (event) => {
        if (event.key === " ") {
          event.preventDefault();
          selectRef.current(p.id);
        }
      });
      markers.current.set(p.id, marker);
    }
  }, [listings]);

  useEffect(() => {
    for (const [id, marker] of markers.current) {
      const isSelected = id === selected?.id;
      marker.getElement()?.classList.toggle("selected-pin", isSelected);
      marker.getElement()?.setAttribute("aria-pressed", String(isSelected));
      marker.setZIndexOffset(isSelected ? 1000 : 0);
    }
    if (
      selected?.latitude !== null &&
      selected?.longitude !== null &&
      selected
    ) {
      const instance = map.current!;
      const position = L.latLng(selected.latitude, selected.longitude);
      if (!instance.getBounds().pad(-0.2).contains(position))
        instance.panTo(position, { animate: false });
    }
  }, [selected, listings]);

  const photo = selected ? photoFor(selected) : null;
  return (
    <section className="map-panel" aria-label="Property map">
      <div
        className="leaflet-host"
        ref={container}
        aria-label="Interactive map of Greece"
      />
      <div className="map-note">
        <Icon name="pin" size={14} />
        <span>Approximate demo locations</span>
      </div>
      <button
        className="map-reset"
        onClick={() =>
          map.current?.fitBounds(greece, { padding: [24, 24], animate: false })
        }
      >
        <Icon name="target" size={17} />
        <span>All Greece</span>
      </button>
      {tileState === "fallback" && (
        <div className="map-fallback" role="status">
          Overview map · street tiles unavailable
        </div>
      )}
      {selected && (
        <button
          className="map-preview"
          onClick={onOpen}
          aria-label={"Open details for " + selected.title}
        >
          {photo && <img src={photo.src} alt="" />}
          <span>
            <small>
              {selected.neighborhood}, {selected.region}
            </small>
            <strong>
              {money(selected.priceEur)} <em>{score(selected.score)} /100</em>
            </strong>
            <span>{selected.title}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      )}
    </section>
  );
}
