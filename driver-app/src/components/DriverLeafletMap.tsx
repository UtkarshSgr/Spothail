"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

interface DriverLeafletMapProps {
  driverLat: number;
  driverLng: number;
  driverHeading?: number;
  destination?: { name: string; via?: string; center?: [number, number] } | null;
  pings?: Array<{ lat: number; lng: number; timestamp?: number; id?: string }>;
  className?: string;
}

export function DriverLeafletMap({
  driverLat,
  driverLng,
  destination,
  pings = [],
  className = "w-full h-full",
}: DriverLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const pingMarkersRef = useRef<any[]>([]);
  const L = useRef<any>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapTheme, setMapTheme] = useState<"streets" | "dark" | "satellite">("streets");

  // ── Switch Map Theme / Tile Provider (Zero API Key) ─────────────────────
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

  // ── Initialize Leaflet Map ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || mapRef.current) return;

    let mounted = true;

    (async () => {
      const leaflet = (await import("leaflet")).default;
      // @ts-expect-error — CSS module import; bundled by Next.js at runtime
      await import("leaflet/dist/leaflet.css");
      if (!mounted || !containerRef.current) return;

      L.current = leaflet;

      const map = leaflet.map(containerRef.current, {
        center: [driverLat, driverLng],
        zoom: 15.5,
        zoomControl: false,
        attributionControl: true,
      });

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

      leaflet.control.zoom({ position: "topright" }).addTo(map);

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

  // ── Driver Position Marker ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    const icon = L.current.divIcon({
      html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;">
          <div style="position:absolute;width:40px;height:40px;border-radius:50%;background:rgba(59,130,246,0.3);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:relative;width:32px;height:32px;border-radius:50%;background:#1d4ed8;border:2.5px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:16px;">
            🛺
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      className: "",
    });

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLat, driverLng]);
    } else {
      driverMarkerRef.current = L.current
        .marker([driverLat, driverLng], { icon, zIndexOffset: 2000 })
        .addTo(mapRef.current)
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;font-weight:bold;color:#1e40af">
            🛺 Your Auto (Driver HUD)
          </div>`
        );
    }
  }, [driverLat, driverLng, mapReady]);

  // ── Destination Marker ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }

    if (destination?.center) {
      const [destLng, destLat] = destination.center;
      const icon = L.current.divIcon({
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="padding:3px 8px;border-radius:8px;background:#0f172a;color:#ffffff;font-size:11px;font-weight:bold;border:1px solid #334155;box-shadow:0 4px 12px rgba(0,0,0,0.4);white-space:nowrap;">
              🎯 ${destination.name}
            </div>
            <div style="width:2px;height:12px;background:#3b82f6;"></div>
            <div style="width:8px;height:8px;border-radius:50%;background:#3b82f6;border:2px solid #ffffff;"></div>
          </div>
        `,
        iconSize: [120, 40],
        iconAnchor: [60, 40],
        className: "",
      });

      destMarkerRef.current = L.current
        .marker([destLat, destLng], { icon })
        .addTo(mapRef.current);
    }
  }, [destination, mapReady]);

  // ── Passenger Ping Markers ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    pingMarkersRef.current.forEach((m) => m.remove());
    pingMarkersRef.current = [];

    pings.forEach((ping) => {
      const icon = L.current.divIcon({
        html: `
          <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#16a34a;border:2px solid #ffffff;box-shadow:0 0 16px rgba(34,197,94,0.8);font-size:16px;">
            👋
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        className: "",
      });

      const marker = L.current
        .marker([ping.lat, ping.lng], { icon, zIndexOffset: 1500 })
        .addTo(mapRef.current)
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px">
            <b style="color:#16a34a">👋 Passenger Handwave!</b><br/>Waiting for pickup
          </div>`
        );

      pingMarkersRef.current.push(marker);
    });
  }, [pings, mapReady]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        ref={containerRef}
        className={`w-full h-full ${mapTheme === "dark" ? "dark-tiles" : ""}`}
        style={{ minHeight: 250 }}
      />

      <style>{`
        .leaflet-container {
          background: #030712;
          font-family: inherit;
        }
        .dark-tiles .leaflet-tile-pane {
          filter: invert(100%) hue-rotate(180deg) brightness(90%) contrast(90%);
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
      `}</style>

      {/* Theme Switcher Pill (Streets / Dark / Satellite - Zero API Key) */}
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
          <span>Streets</span>
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
          <span>Dark</span>
        </button>
        <button
          type="button"
          onClick={() => changeTheme("satellite")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            mapTheme === "satellite"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
          title="Satellite Imagery (Zero API Key)"
        >
          <span>🛰️</span>
          <span>Satellite</span>
        </button>
      </div>

      {!mapReady && (
        <div className="absolute inset-0 z-[2000] flex flex-col items-center justify-center bg-slate-950 gap-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-xs text-slate-400 font-medium">Loading Live Driver Map…</div>
        </div>
      )}
    </div>
  );
}

export default DriverLeafletMap;
