"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { LocateFixed, Search, MapPin, X, Loader2, Navigation, AlertCircle } from "lucide-react";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export interface LeafletVehicleMarker {
  id: string;
  type?: 'AUTO' | 'BUS';
  lat: number;
  lng: number;
  label: string;
  status: 'EMPTY' | 'HAS_SPACE' | 'FULL'; // green | yellow | red
  routeCoords?: [number, number][]; // optional road geometry
  popup?: string;
  onClick?: () => void;
}

export interface LeafletMapProps {
  onLocationChange?: (latlng: LatLng, label: string) => void;
  initialCenter?: LatLng;
  center?: LatLng;
  userLocation?: LatLng | null;
  initialZoom?: number;
  vehicles?: LeafletVehicleMarker[];
  activeRoutePolyline?: [number, number][] | null;
  className?: string;
  showGPS?: boolean;
  defaultTheme?: "streets" | "dark" | "satellite";
}

// ──────────────────────────────────────────────────────────────────────────────
// Free OpenStreetMap Nominatim Geocoding
// ──────────────────────────────────────────────────────────────────────────────
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

const DEFAULT_CENTER: LatLng = { lat: 11.3216, lng: 75.9336 }; // NIT Calicut

export function LeafletMap({
  onLocationChange,
  initialCenter = DEFAULT_CENTER,
  center,
  userLocation,
  initialZoom = 15,
  vehicles = [],
  activeRoutePolyline = null,
  className = "w-full h-full",
  showGPS = true,
  defaultTheme = "streets",
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const selectedPinMarkerRef = useRef<any>(null);
  const vehicleMarkersRef = useRef<Map<string, any>>(new Map());
  const routeLineRef = useRef<any>(null);
  const L = useRef<any>(null);

  const [mapTheme, setMapTheme] = useState<"streets" | "dark" | "satellite">(defaultTheme);
  const [mapReady, setMapReady] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // ── Switch Map Tile Theme (Zero API Key) ────────────────────────────────
  const changeTheme = useCallback((theme: "streets" | "dark" | "satellite") => {
    setMapTheme(theme);
    if (!mapRef.current || !L.current) return;

    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (theme === "satellite") {
      const sat = L.current.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: '&copy; <a href="https://www.esri.com/" target="_blank">Esri</a>, Maxar, Earthstar Geographics',
          maxZoom: 19,
        }
      );
      sat.addTo(mapRef.current);
      tileLayerRef.current = sat;
    } else {
      const osm = L.current.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }
      );
      osm.addTo(mapRef.current);
      tileLayerRef.current = osm;
    }
  }, []);

  // ── Initialize Map (Browser only) ───────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || mapRef.current) return;
    let mounted = true;

    (async () => {
      const leaflet = (await import("leaflet")).default;
      // @ts-expect-error — CSS module handled by Next.js
      await import("leaflet/dist/leaflet.css");
      if (!mounted || !mapContainerRef.current) return;

      L.current = leaflet;

      const map = leaflet.map(mapContainerRef.current, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: initialZoom,
        zoomControl: false,
        attributionControl: true,
      });

      const initialLayer = leaflet.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }
      );
      initialLayer.addTo(map);
      tileLayerRef.current = initialLayer;

      leaflet.control.zoom({ position: "topright" }).addTo(map);

      // Tap on map to select/move location
      map.on("click", async (e: any) => {
        const { lat, lng } = e.latlng;
        try {
          const label = await nominatimReverse(lat, lng);
          onLocationChange?.({ lat, lng }, label);
        } catch {
          onLocationChange?.({ lat, lng }, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
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

  // ── Pan/Fly to center prop when changed ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !center) return;
    mapRef.current.flyTo([center.lat, center.lng], Math.max(mapRef.current.getZoom(), 15), {
      animate: true,
      duration: 0.8,
    });
  }, [center?.lat, center?.lng]);

  // ── User Current Location Pin ────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !userLocation) return;

    const userIcon = L.current.divIcon({
      html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px;">
          <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:rgba(37,99,235,0.25);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:relative;width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #ffffff;box-shadow:0 4px 10px rgba(0,0,0,0.4);"></div>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      className: "",
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      userMarkerRef.current = L.current
        .marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 2000 })
        .addTo(mapRef.current);
    }
  }, [userLocation?.lat, userLocation?.lng]);

  // ── Render Vehicles (Autos & Buses with 3 Occupancy Colors) ──────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    // Remove old stale vehicle markers
    const currentIds = new Set(vehicles.map((v) => v.id));
    vehicleMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        vehicleMarkersRef.current.delete(id);
      }
    });

    // Color mapping according to requirement:
    // Green = Empty, Yellow = Partly Full, Red = Full
    const STATUS_BORDER_COLORS = {
      EMPTY: "#16a34a",     // Green
      HAS_SPACE: "#eab308", // Yellow
      FULL: "#dc2626",      // Red
    };

    vehicles.forEach((v) => {
      const isBus = v.type === 'BUS';
      const iconEmoji = isBus ? '🚌' : '🛺';
      const borderColor = STATUS_BORDER_COLORS[v.status] || '#eab308';

      const icon = L.current.divIcon({
        html: `
          <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
            <div style="display:flex;align-items:center;justify-content:center;width:${isBus ? '38px' : '32px'};height:${isBus ? '38px' : '32px'};border-radius:50%;background:#0f172a;border:3px solid ${borderColor};box-shadow:0 6px 14px rgba(0,0,0,0.5);font-size:${isBus ? '18px' : '15px'};">
              ${iconEmoji}
            </div>
            <div style="margin-top:2px;padding:1px 6px;border-radius:6px;background:rgba(15,23,42,0.9);color:#ffffff;font-size:9px;font-weight:800;border:1px solid #334155;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4);">
              ${v.label}
            </div>
          </div>
        `,
        iconSize: [60, 48],
        iconAnchor: [30, 24],
        className: "",
      });

      const existing = vehicleMarkersRef.current.get(v.id);
      if (existing) {
        existing.setLatLng([v.lat, v.lng]);
        existing.setIcon(icon);
      } else {
        const marker = L.current
          .marker([v.lat, v.lng], { icon, zIndexOffset: isBus ? 1500 : 1000 })
          .addTo(mapRef.current);

        marker.on("click", () => {
          v.onClick?.();
        });

        vehicleMarkersRef.current.set(v.id, marker);
      }
    });
  }, [vehicles, mapReady]);

  // ── Render Active Route Polyline on Map ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    if (routeLineRef.current) {
      mapRef.current.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    if (activeRoutePolyline && activeRoutePolyline.length > 1) {
      const line = L.current.polyline(
        activeRoutePolyline.map((pt) => [pt[1], pt[0]]), // GeoJSON is [lng, lat], Leaflet is [lat, lng]
        {
          color: "#3b82f6",
          weight: 5,
          opacity: 0.9,
          lineJoin: "round",
          lineCap: "round",
        }
      ).addTo(mapRef.current);

      routeLineRef.current = line;
    }
  }, [activeRoutePolyline, mapReady]);

  // ── Hardware GPS Handler ────────────────────────────────────────────────
  const handleGPS = useCallback(() => {
    setGpsError(null);
    if (!("geolocation" in navigator)) {
      setGpsError("Geolocation not supported on this browser.");
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latlng: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsLoading(false);
        try {
          const label = await nominatimReverse(latlng.lat, latlng.lng);
          onLocationChange?.(latlng, label);
        } catch {
          onLocationChange?.(latlng, "Your GPS Location");
        }
        mapRef.current?.flyTo([latlng.lat, latlng.lng], 16, { animate: true, duration: 1 });
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === 1) setGpsError("Location permission denied. Please allow GPS access.");
        else setGpsError("Could not retrieve GPS location.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [onLocationChange]);

  return (
    <div className={`relative overflow-hidden w-full h-full ${className}`}>
      {/* Map Canvas */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full ${mapTheme === "dark" ? "dark-tiles" : ""}`}
      />

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
          box-shadow: 0 8px 20px rgba(0,0,0,0.5) !important;
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
        .leaflet-attribution-flag { display: none; }
        .leaflet-control-attribution {
          background: rgba(2,6,23,0.7) !important;
          color: #64748b !important;
          font-size: 10px;
        }
      `}</style>

      {/* Minimal Theme Switcher (Streets / Dark / Satellite) */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-xl">
        <button
          type="button"
          onClick={() => changeTheme("streets")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            mapTheme === "streets" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
          }`}
          title="Street View"
        >
          <span>🗺️</span>
          <span className="hidden sm:inline">Streets</span>
        </button>
        <button
          type="button"
          onClick={() => changeTheme("dark")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            mapTheme === "dark" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
          }`}
          title="Dark Mode"
        >
          <span>🌙</span>
          <span className="hidden sm:inline">Dark</span>
        </button>
        <button
          type="button"
          onClick={() => changeTheme("satellite")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            mapTheme === "satellite" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
          }`}
          title="Satellite Imagery"
        >
          <span>🛰️</span>
          <span className="hidden sm:inline">Sat</span>
        </button>
      </div>

      {/* GPS Button */}
      {showGPS && (
        <div className="absolute top-20 right-3 z-[1000]">
          <button
            onClick={handleGPS}
            disabled={gpsLoading}
            title="Use My Current Location"
            className="p-2.5 rounded-xl shadow-xl border bg-slate-900/95 backdrop-blur-md border-slate-700 text-slate-200 hover:bg-slate-800 transition flex items-center justify-center active:scale-95"
          >
            {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <LocateFixed className="w-4 h-4 text-blue-400" />}
          </button>
        </div>
      )}

      {/* GPS Error Toast */}
      {gpsError && (
        <div className="absolute bottom-4 left-4 right-4 z-[1000] flex items-center justify-between bg-rose-950/95 border border-rose-500/50 text-rose-200 text-xs px-3.5 py-2.5 rounded-xl shadow-2xl backdrop-blur-md max-w-md mx-auto">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{gpsError}</span>
          </div>
          <button onClick={() => setGpsError(null)} className="text-rose-400 hover:text-white ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default LeafletMap;
