import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { englishMapStyle } from "../map-style";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Listing } from "@ai-re-agent/contracts";
import { money, photoFor, score, englishListing, mapPosition } from "../lib";
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
  listings = useMemo(() => listings.map(englishListing), [listings]);
  selected = useMemo(
    () => (selected ? englishListing(selected) : null),
    [selected],
  );
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
    let vectorContainer: HTMLElement | undefined;
    const showOverview = () => {
      if (disposed || loadedTiles > 0) return;
      // A failed GL layer paints an opaque, empty canvas over the local outline.
      // Hide it and use the outline at the scale its data actually supports.
      if (vectorContainer) vectorContainer.style.visibility = "hidden";
      instance.setMaxZoom(7);
      instance.fitBounds(greece, { padding: [24, 24], animate: false });
      setTileState("fallback");
    };
    const showStreetMap = () => {
      if (disposed) return;
      loadedTiles++;
      if (vectorContainer) vectorContainer.style.visibility = "";
      instance.setMaxZoom(18);
      setTileState("ready");
    };
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
    if (useCustom) {
      const tiles = L.tileLayer(customUrl, {
        maxZoom: 19,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: customAttribution,
      });
      tiles.on("tileload", showStreetMap);
      tiles.addTo(instance);
    } else {
      instance.attributionControl.addAttribution(
        '<a href="https://openfreemap.org/">OpenFreeMap</a> · © <a href="https://openmaptiles.org/">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      );
      fetch(
        import.meta.env.VITE_MAP_STYLE_URL ||
          "https://tiles.openfreemap.org/styles/positron",
        { signal: controller.signal },
      )
        .then((r) => {
          if (!r.ok) throw Error("Map style unavailable");
          return r.json();
        })
        .then(async (style) => {
          const [{ maplibreGL }, { setWorkerUrl }] = await Promise.all([
            import("@maplibre/maplibre-gl-leaflet"),
            import("maplibre-gl"),
          ]);
          if (disposed) return;
          // Vite moves optimized dependencies. MapLibre's default relative URL
          // then points to a nonexistent .vite/deps worker in development.
          // Bundling it explicitly also supplies a real asset in production.
          setWorkerUrl(mapWorkerUrl);
          const layer = maplibreGL({
            style: englishMapStyle(style),
            attributionControl: false,
          }).addTo(instance);
          vectorContainer = layer.getContainer();
          layer.getMaplibreMap().on("load", showStreetMap);
          layer.getMaplibreMap().on("error", () => {
            // Missing individual glyphs or tiles need not discard a working map.
            // The initial-load timeout handles a completely unavailable source.
          });
        })
        .catch(showOverview);
    }
    instance.attributionControl.addAttribution(
      'Area locations: <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0)',
    );
    const timeout = window.setTimeout(() => {
      showOverview();
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
      const position = mapPosition(p);
      if (!position) continue;
      const label = document.createElement("span");
      label.textContent =
        p.priceEur === null ? "€ ?" : "€" + Math.round(p.priceEur / 1000) + "k";
      const marker = L.marker([position.latitude, position.longitude], {
        icon: L.divIcon({
          html: label,
          className:
            "price-pin" +
            (position.areaOnly ? " area-pin" : "") +
            (p.status === "needs-checking" ? " pending-pin" : ""),
          iconSize: [68, 36],
          iconAnchor: [34, 18],
        }),
        title: p.title,
        keyboard: true,
      }).addTo(layer);
      marker.on("click", () => selectRef.current(p.id));
      const element = marker.getElement()!;
      element.setAttribute("role", "button");
      element.setAttribute(
        "aria-label",
        "Show " +
          p.title +
          " on map" +
          (position.areaOnly ? " — area only" : ""),
      );
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
    const location = selected ? mapPosition(selected) : null;
    if (location && tileState !== "fallback") {
      const instance = map.current!;
      instance.setView(
        [location.latitude, location.longitude],
        location.areaOnly ? 12 : 13,
        { animate: false },
      );
    }
  }, [selected, listings, tileState]);

  const photo = selected ? photoFor(selected) : null;
  return (
    <section className="map-panel" aria-label="Property map">
      <div
        className="leaflet-host"
        ref={container}
        data-map-state={tileState}
        aria-label="Interactive map of Greece"
      />
      <div className="map-note">
        <Icon name="pin" size={14} />
        <span>
          {listings.length === 0
            ? "No locations in this view"
            : listings.some((p) => p.discovery)
              ? listings.every((p) => !mapPosition(p))
                ? "These sources have not provided map locations"
                : "Source / area locations · " +
                  listings.filter((p) => !mapPosition(p)).length +
                  " without a pin"
              : "Approximate demo locations"}
        </span>
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
      {selected && mapPosition(selected) && (
        <button
          className="map-preview"
          onClick={onOpen}
          aria-label={"Open details for " + selected.title}
        >
          {photo && (
            <img
              src={photo.src}
              alt=""
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          )}
          <span>
            <small>
              {selected.neighborhood}, {selected.region}
            </small>
            <strong>
              {money(selected.priceEur)}{" "}
              {selected.status === "needs-checking" ? (
                <em>Unconfirmed</em>
              ) : selected.score !== null ? (
                <em className="map-fit">
                  {score(selected.score)} /100 fit
                  <small>{selected.scoreCoverage}% assessed</small>
                </em>
              ) : null}
            </strong>
            <span>{selected.title}</span>
            {mapPosition(selected)?.areaOnly && (
              <small>Area only · exact property position unknown</small>
            )}
          </span>
          <Icon name="chevron" size={18} />
        </button>
      )}
    </section>
  );
}
