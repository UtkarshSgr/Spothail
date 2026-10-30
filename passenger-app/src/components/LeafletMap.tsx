"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { LocateFixed, Search, MapPin, X, Loader2, Navigation, AlertCircle, RefreshCw, Map as MapIcon } from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
interface LatLng {
  lat: number;
  lng: number;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    suburb?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  type?: string;
  class?: string;
}

export interface LeafletMapProps {
  /** Called when user selects/moves to a location */
  onLocationChange?: (latlng: LatLng, label: string) => void;
  /** Initial map center */
  initialCenter?: LatLng;
  /** Controlled center: moves map when changed externally */
  center?: LatLng;
  /** Current user GPS coordinates for marker rendering */
  userLocation?: LatLng | null;
  /** Initial zoom level (1–19) */
  initialZoom?: number;
  /** Extra custom markers to show (e.g. nearby autos) */
  extraMarkers?: Array<{
    id: string;
    lat: number;
    lng: number;
    label: string;
    color?: "blue" | "green" | "amber" | "red";
    popup?: string;
  }>;
  /** Height class for the map container */
  className?: string;
  /** Whether to show the search bar inside the map */
  showSearch?: boolean;
  /** Whether to show the GPS button */
  showGPS?: boolean;
  /** Default theme: streets | dark | satellite */
  defaultTheme?: "streets" | "dark" | "satellite";
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: Marker SVG icon builder (no external image needed)
// ──────────────────────────────────────────────────────────────────────────────
function buildMarkerSVG(color: string, size = 32): string {
  return `
    <svg width="${size}" height="${size * 1.3}" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2.5"/>
      <circle cx="16" cy="14" r="5" fill="white" fill-opacity="0.9"/>
      <path d="M16 26 L16 42" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="16" cy="42" rx="4" ry="1.5" fill="${color}" fill-opacity="0.3"/>
    </svg>
  `.trim();
}

function buildUserSVG(): string {
  return `
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="18" r="14" fill="#2563eb" stroke="white" stroke-width="3"/>
      <circle cx="18" cy="18" r="6" fill="white"/>
      <circle cx="18" cy="18" r="14" fill="none" stroke="#93c5fd" stroke-width="6" opacity="0.4" class="ping-ring"/>
    </svg>
  `.trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// Nominatim geocoding (OpenStreetMap – completely free, no API key)
// ──────────────────────────────────────────────────────────────────────────────
async function nominatimSearch(query: string, limit = 6): Promise<NominatimResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "IN"); // bias to India (NIT Calicut region)

  const res = await fetch(url.toString(), {
    headers: { "Accept-Language": "en", "User-Agent": "SpotHail/1.0" },
  });
  if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
  return res.json();
}

async function nominatimReverse(lat: number, lng: number): Promise<string> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("zoom", "16");

  const res = await fetch(url.toString(), {
    headers: { "Accept-Language": "en", "User-Agent": "SpotHail/1.0" },
  });
  if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const data = await res.json();
  return data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Component – loaded dynamically (no SSR) from the page
// ──────────────────────────────────────────────────────────────────────────────
const DEFAULT_CENTER: LatLng = { lat: 11.3216, lng: 75.9336 }; // NIT Calicut

const MARKER_COLORS: Record<string, string> = {
  blue: "#2563eb",
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
};

export function LeafletMap({
  onLocationChange,
  initialCenter = DEFAULT_CENTER,
  center,
  userLocation,
  initialZoom = 15,
  extraMarkers = [],
  className = "w-full h-full",
  showSearch = true,
  showGPS = true,
  defaultTheme = "streets",
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null); // L.Map
  const tileLayerRef = useRef<any>(null); // Active tile layer
  const userMarkerRef = useRef<any>(null); // L.Marker
  const selectedMarkerRef = useRef<any>(null); // L.Marker
  const extraMarkerRefs = useRef<Map<string, any>>(new Map());
  const L = useRef<any>(null); // Leaflet module

  // ── State ────────────────────────────────────────────────────────────────
  const [mapTheme, setMapTheme] = useState<"streets" | "dark" | "satellite">(defaultTheme);
  const [mapReady, setMapReady] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [userPos, setUserPos] = useState<LatLng | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState<{ latlng: LatLng; label: string } | null>(null);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Switch Map Theme / Tile Provider (100% Free - NO API KEY) ────────────
  const changeTheme = useCallback((theme: "streets" | "dark" | "satellite") => {
    setMapTheme(theme);
    if (!mapRef.current || !L.current) return;

    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (theme === "satellite") {
      const satLayer = L.current.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution:
            '&copy; <a href="https://www.esri.com/" target="_blank">Esri</a>, Maxar, Earthstar Geographics',
          maxZoom: 19,
        }
      );
      satLayer.addTo(mapRef.current);
      tileLayerRef.current = satLayer;
    } else {
      // Both "streets" and "dark" use official OpenStreetMap tiles (never require an API key)
      const osmLayer = L.current.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }
      );
      osmLayer.addTo(mapRef.current);
      tileLayerRef.current = osmLayer;
    }
  }, []);

  // ── Initialize Leaflet (client-side only) ────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || mapRef.current) return;

    let mounted = true;

    (async () => {
      // Dynamic import so SSR never sees it
      const leaflet = (await import("leaflet")).default;
      // @ts-expect-error — CSS module import; bundled by Next.js at runtime
      await import("leaflet/dist/leaflet.css");
      if (!mounted || !mapContainerRef.current) return;

      L.current = leaflet;

      // ── Build the map ─────────────────────────────────────────────────
      const map = leaflet.map(mapContainerRef.current, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: initialZoom,
        zoomControl: false, // we add it manually at top-right
        attributionControl: true,
      });

      // ── 100% Free Official OpenStreetMap Tile Layer (Zero API key required) ──
      const initialLayer = leaflet.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }
      );
      initialLayer.addTo(map);
      tileLayerRef.current = initialLayer;

      // ── Custom Zoom Control ──────────────────────────────────────────
      leaflet
        .control
        .zoom({ position: "topright" })
        .addTo(map);

      // ── Click on map to select location ───────────────────────────────
      map.on("click", async (e: any) => {
        const { lat, lng } = e.latlng;
        await selectLocation({ lat, lng }, null);
      });

      mapRef.current = map;
      setMapReady(true);
    })();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helper: build a Leaflet DivIcon ─────────────────────────────────────
  const makeIcon = useCallback(
    (svgStr: string, w: number, h: number, anchorX: number, anchorY: number) => {
      if (!L.current) return null;
      return L.current.divIcon({
        html: svgStr,
        iconSize: [w, h],
        iconAnchor: [anchorX, anchorY],
        popupAnchor: [0, -anchorY + 5],
        className: "",
      });
    },
    []
  );

  // ── Controlled Center update from props ─────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !center) return;
    mapRef.current.flyTo([center.lat, center.lng], Math.max(mapRef.current.getZoom(), 15), {
      animate: true,
      duration: 0.8,
    });
  }, [center?.lat, center?.lng]);

  // ── External User GPS Location update from props ────────────────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !userLocation) return;
    const userIcon = makeIcon(buildUserSVG(), 36, 36, 18, 18);
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      userMarkerRef.current = L.current
        .marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(mapRef.current)
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;line-height:1.4">
            <b style="color:#2563eb">🔵 Your Current Location</b><br/>
            ${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)}
          </div>`
        );
    }
  }, [userLocation?.lat, userLocation?.lng, makeIcon]);

  // ── selectLocation: move map, place marker, reverse geocode if needed ──
  const selectLocation = useCallback(
    async (latlng: LatLng, labelOverride: string | null) => {
      if (!mapRef.current || !L.current) return;

      let label = labelOverride;
      if (!label) {
        try {
          label = await nominatimReverse(latlng.lat, latlng.lng);
        } catch {
          label = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
        }
      }

      // Place/update selected marker
      const icon = makeIcon(buildMarkerSVG(MARKER_COLORS.blue, 32), 32, 42, 16, 42);
      if (selectedMarkerRef.current) {
        selectedMarkerRef.current.setLatLng([latlng.lat, latlng.lng]);
      } else {
        selectedMarkerRef.current = L.current
          .marker([latlng.lat, latlng.lng], { icon })
          .addTo(mapRef.current)
          .bindPopup(
            `<div style="font-family:sans-serif;max-width:220px;font-size:12px;line-height:1.4">
              <b style="color:#1d4ed8">📍 Selected Location</b><br/>${label}
            </div>`,
            { maxWidth: 260 }
          )
          .openPopup();
      }

      mapRef.current.flyTo([latlng.lat, latlng.lng], Math.max(mapRef.current.getZoom(), 15), {
        animate: true,
        duration: 0.8,
      });

      const result = { latlng, label };
      setSelectedLocation(result);
      onLocationChange?.(latlng, label);
    },
    [makeIcon, onLocationChange]
  );

  // ── GPS handler ──────────────────────────────────────────────────────────
  const handleGPS = useCallback(() => {
    setGpsError(null);

    if (!("geolocation" in navigator)) {
      setGpsError("Geolocation is not supported by this browser.");
      return;
    }

    setGpsLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latlng: LatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserPos(latlng);
        setGpsLoading(false);

        if (!mapRef.current || !L.current) return;

        // Place / update blue "You" pulsing marker
        const userIcon = makeIcon(buildUserSVG(), 36, 36, 18, 18);
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([latlng.lat, latlng.lng]);
        } else {
          userMarkerRef.current = L.current
            .marker([latlng.lat, latlng.lng], { icon: userIcon, zIndexOffset: 1000 })
            .addTo(mapRef.current)
            .bindPopup(
              `<div style="font-family:sans-serif;font-size:12px;line-height:1.4">
                <b style="color:#2563eb">🔵 Your Current Location</b><br/>
                ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}
              </div>`
            )
            .openPopup();
        }

        mapRef.current.flyTo([latlng.lat, latlng.lng], 16, { animate: true, duration: 1 });

        // Also set as selected location
        try {
          const label = await nominatimReverse(latlng.lat, latlng.lng);
          setSelectedLocation({ latlng, label });
          setSearchQuery(label.split(",").slice(0, 3).join(",").trim());
          onLocationChange?.(latlng, label);
        } catch {
          setSelectedLocation({ latlng, label: "Your GPS Location" });
          onLocationChange?.(latlng, "Your GPS Location");
        }
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === 1) {
          setGpsError("Location permission denied. Please allow access in your browser settings.");
        } else if (err.code === 2) {
          setGpsError("Location unavailable. Please check your GPS signal.");
        } else if (err.code === 3) {
          setGpsError("Location request timed out. Please try again.");
        } else {
          setGpsError("Could not get your location. Please try again.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      }
    );
  }, [makeIcon, onLocationChange]);

  // ── Extra custom markers (autos etc.) ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    // Remove stale markers
    extraMarkerRefs.current.forEach((marker, id) => {
      if (!extraMarkers.find((m) => m.id === id)) {
        marker.remove();
        extraMarkerRefs.current.delete(id);
      }
    });

    // Upsert
    extraMarkers.forEach((em) => {
      const color = MARKER_COLORS[em.color ?? "amber"];
      const icon = makeIcon(buildMarkerSVG(color, 28), 28, 36, 14, 36);
      const existing = extraMarkerRefs.current.get(em.id);

      if (existing) {
        existing.setLatLng([em.lat, em.lng]);
      } else {
        const marker = L.current
          .marker([em.lat, em.lng], { icon })
          .addTo(mapRef.current);

        if (em.popup) {
          marker.bindPopup(`<div style="font-family:sans-serif;font-size:12px">${em.popup}</div>`);
        } else {
          marker.bindTooltip(em.label, { permanent: false, className: "leaflet-tooltip-spothail" });
        }

        extraMarkerRefs.current.set(em.id, marker);
      }
    });
  }, [extraMarkers, mapReady, makeIcon]);

  // ── Re-center on user location ───────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    if (!mapRef.current || !selectedLocation) return;
    mapRef.current.flyTo(
      [selectedLocation.latlng.lat, selectedLocation.latlng.lng],
      16,
      { animate: true, duration: 0.8 }
    );
  }, [selectedLocation]);

  // ── Search: debounced Nominatim call ────────────────────────────────────
  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    setSearchError(null);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!value.trim() || value.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await nominatimSearch(value);
        setSearchResults(results);
        setShowDropdown(results.length > 0);
      } catch {
        setSearchError("Search failed. Check your network connection.");
        setSearchResults([]);
        setShowDropdown(false);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  };

  const handleSelectResult = async (result: NominatimResult) => {
    const latlng: LatLng = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
    const label = result.display_name;

    setSearchQuery(label.split(",").slice(0, 3).join(",").trim());
    setShowDropdown(false);
    setSearchResults([]);

    await selectLocation(latlng, label);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
    setSearchError(null);
    if (selectedMarkerRef.current && mapRef.current) {
      selectedMarkerRef.current.remove();
      selectedMarkerRef.current = null;
    }
    setSelectedLocation(null);
  };

  // ── Keyboard: close dropdown on Escape ───────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDropdown(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      {/* ================================================================ */}
      {/* MAP CANVAS                                                        */}
      {/* ================================================================ */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full ${mapTheme === "dark" ? "dark-tiles" : ""}`}
        style={{ minHeight: 300 }}
      />

      {/* Leaflet CSS override for dark theme tiles */}
      <style>{`
        .leaflet-container {
          background: #030712;
          font-family: inherit;
        }
        .dark-tiles .leaflet-tile-pane {
          filter: invert(100%) hue-rotate(180deg) brightness(90%) contrast(90%);
        }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5) !important;
        }
        .leaflet-control-zoom a {
          background: #0f172a !important;
          color: #e2e8f0 !important;
          border-color: #334155 !important;
        }
        .leaflet-control-zoom a:hover {
          background: #1e293b !important;
          color: #ffffff !important;
        }
        .leaflet-popup-content-wrapper {
          background: #0f172a;
          color: #f1f5f9;
          border: 1px solid #334155;
          box-shadow: 0 12px 32px rgba(0,0,0,0.6);
          border-radius: 12px;
        }
        .leaflet-popup-tip {
          background: #0f172a;
        }
        .leaflet-attribution-flag {
          display: none;
        }
        .leaflet-control-attribution {
          background: rgba(2,6,23,0.7) !important;
          color: #64748b !important;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 6px;
        }
        .leaflet-control-attribution a {
          color: #3b82f6 !important;
        }
        .leaflet-tooltip-spothail {
          background: #0f172a;
          color: #f1f5f9;
          border: 1px solid #334155;
          border-radius: 6px;
          font-size: 12px;
          padding: 4px 8px;
        }
      `}</style>

      {/* Theme Switcher Pill (Streets / Dark / Satellite - 100% Free, NO API Key) */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-2xl">
        <button
          type="button"
          onClick={() => changeTheme("streets")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            mapTheme === "streets"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
          title="OpenStreetMap Streets (Zero API Key)"
        >
          <span>🗺️</span>
          <span className="hidden sm:inline">Streets</span>
        </button>
        <button
          type="button"
          onClick={() => changeTheme("dark")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            mapTheme === "dark"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
          title="Dark Mode (Zero API Key)"
        >
          <span>🌙</span>
          <span className="hidden sm:inline">Dark</span>
        </button>
        <button
          type="button"
          onClick={() => changeTheme("satellite")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            mapTheme === "satellite"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
          title="Esri Satellite Imagery (Zero API Key)"
        >
          <span>🛰️</span>
          <span className="hidden sm:inline">Satellite</span>
        </button>
      </div>

      {/* ================================================================ */}
      {/* FLOATING OVERLAY CONTROLS                                        */}
      {/* ================================================================ */}

      {/* Search Bar ──────────────────────────────────────────────────── */}
      {showSearch && (
        <div className="absolute top-3 left-3 right-14 z-[1000] flex flex-col gap-2">
          {/* Input Row */}
          <div className="relative flex items-center gap-2">
            <div className="flex-1 relative">
              {searchLoading ? (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                placeholder="Search any location, city, landmark..."
                autoComplete="off"
                spellCheck={false}
                className="w-full pl-9 pr-9 py-2.5 text-sm text-white bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl focus:outline-none focus:border-blue-500 transition placeholder:text-slate-500"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Autocomplete Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800/60 max-h-72 overflow-y-auto">
              {searchResults.map((result) => (
                <button
                  key={result.place_id}
                  onMouseDown={() => handleSelectResult(result)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-800 flex items-start gap-2.5 transition"
                >
                  <MapPin className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-white font-medium truncate">
                      {result.display_name.split(",")[0]}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {result.display_name.split(",").slice(1, 4).join(",").trim()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Search Error Toast */}
          {searchError && (
            <div className="flex items-center gap-2 bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs px-3 py-2 rounded-lg backdrop-blur-md">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}
        </div>
      )}

      {/* GPS Button + Recenter (positioned neatly below zoom controls) ── */}
      {showGPS && (
        <div className="absolute top-20 right-3 z-[1000] flex flex-col gap-2">
          {/* GPS button */}
          <button
            onClick={handleGPS}
            disabled={gpsLoading}
            title="Use My Current Location"
            className={`p-2.5 rounded-xl shadow-2xl border text-sm font-bold transition flex items-center justify-center ${
              gpsLoading
                ? "bg-slate-800 border-slate-700 text-slate-400 cursor-wait"
                : userPos
                ? "bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500"
                : "bg-slate-900/95 backdrop-blur-md border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-blue-500"
            }`}
          >
            {gpsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LocateFixed className="w-4 h-4" />
            )}
          </button>

          {/* Recenter button (only if a location is selected) */}
          {selectedLocation && (
            <button
              onClick={handleRecenter}
              title="Re-center map on selected location"
              className="p-2.5 rounded-xl shadow-2xl border bg-slate-900/95 backdrop-blur-md border-slate-700 text-slate-200 hover:bg-slate-800 transition flex items-center justify-center"
            >
              <Navigation className="w-4 h-4 text-blue-400" />
            </button>
          )}
        </div>
      )}

      {/* GPS Error Toast ────────────────────────────────────────────────── */}
      {gpsError && (
        <div className="absolute bottom-16 left-3 right-3 z-[1000] flex items-start gap-2 bg-rose-950/90 border border-rose-500/40 text-rose-200 text-xs px-3.5 py-3 rounded-xl shadow-xl backdrop-blur-md">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1">
            <span>{gpsError}</span>
          </div>
          <button onClick={() => setGpsError(null)} className="text-rose-400 hover:text-white ml-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Selected Location Info Bar ─────────────────────────────────────── */}
      {selectedLocation && (
        <div className="absolute bottom-3 left-3 right-3 z-[999] flex items-center gap-2 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl px-3.5 py-2.5 shadow-2xl">
          <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white truncate">
              {selectedLocation.label.split(",").slice(0, 2).join(",").trim()}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {selectedLocation.latlng.lat.toFixed(5)}, {selectedLocation.latlng.lng.toFixed(5)}
            </div>
          </div>
          {userPos && selectedLocation.latlng.lat === userPos.lat && (
            <span className="shrink-0 text-[10px] font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              GPS
            </span>
          )}
          <button
            onClick={clearSearch}
            className="text-slate-500 hover:text-slate-300 shrink-0 ml-1"
            title="Clear location"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Map Loading Skeleton ─────────────────────────────────────────── */}
      {!mapReady && (
        <div className="absolute inset-0 z-[2000] flex flex-col items-center justify-center bg-slate-950 gap-3">
          <div className="relative">
            <MapIcon className="w-10 h-10 text-blue-500 animate-pulse" />
          </div>
          <div className="text-sm text-slate-400 font-medium">Loading interactive map…</div>
          <div className="text-[11px] text-slate-600">Powered by OpenStreetMap (Zero API Key)</div>
        </div>
      )}

      {/* Click-to-select hint ───────────────────────────────────────────── */}
      {mapReady && !selectedLocation && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[999] bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 text-slate-400 text-[11px] font-medium px-3 py-1.5 rounded-full shadow whitespace-nowrap pointer-events-none">
          🗺️ Click anywhere on the map to select a location
        </div>
      )}
    </div>
  );
}

export default LeafletMap;
