"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { VehicleType, PassengerPing } from "@/types/spothail";

export interface DriverLeafletMapProps {
  driverLat: number;
  driverLng: number;
  driverHeading?: number;
  vehicleType?: VehicleType;
  destination?: { name: string; via?: string; center?: [number, number]; lat?: number; lng?: number } | null;
  routePolyline?: [number, number][] | null;
  pings?: PassengerPing[];
  isMinimized?: boolean;
  recenterTrigger?: number;
  zoomTrigger?: { action: "in" | "out"; count: number } | null;
  onMapClick?: () => void;
  className?: string;
}

export type { PassengerPing };

export function DriverLeafletMap({
  driverLat,
  driverLng,
  vehicleType = "AUTO",
  destination,
  routePolyline = null,
  pings = [],
  isMinimized,
  recenterTrigger,
  zoomTrigger,
  onMapClick,
  className = "w-full h-full",
}: DriverLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const routeGlowRef = useRef<any>(null);
  const routeCasingRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const pingMarkersRef = useRef<any[]>([]);
  const L = useRef<any>(null);
  const onMapClickRef = useRef(onMapClick);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

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
          attribution: '&copy; <a href="https://www.esri.com/" target="_blank">Esri</a>',
          maxZoom: 19,
        }
      );
      satLayer.addTo(mapRef.current);
      tileLayerRef.current = satLayer;
    } else {
      const osmLayer = L.current.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>',
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
        attributionControl: false,
      });

      const initialLayer = leaflet.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 19 }
      );
      initialLayer.addTo(map);
      tileLayerRef.current = initialLayer;

      map.on("click", () => {
        onMapClickRef.current?.();
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

  // ── Invalidate Size on Cockpit Toggle ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const interval = setInterval(() => {
      mapRef.current?.invalidateSize();
    }, 50);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      mapRef.current?.invalidateSize();
    }, 350);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isMinimized]);

  // ── Re-center Trigger ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !recenterTrigger) return;
    mapRef.current.setView([driverLat, driverLng], 15.5, { animate: true });
  }, [recenterTrigger, driverLat, driverLng]);

  // ── Programmatic Zoom Trigger (+ / -) ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !zoomTrigger) return;
    if (zoomTrigger.action === "in") {
      mapRef.current.zoomIn();
    } else if (zoomTrigger.action === "out") {
      mapRef.current.zoomOut();
    }
  }, [zoomTrigger]);

  // ── Driver Position Marker (Uploaded Vehicle Icon) ─────────────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    const isERickshaw = vehicleType === "ERICKSHAW";
    const labelTitle = isERickshaw ? "Your E-Rickshaw" : "Your Auto";
    const vehicleImageSrc = isERickshaw ? "/icons/erickshaw.jpg" : "/icons/auto.jpg";

    const icon = L.current.divIcon({
      html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:48px;height:48px;">
          <div style="position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(59,130,246,0.35);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:relative;width:40px;height:40px;border-radius:50%;background:#ffffff;border:2.5px solid #3b82f6;box-shadow:0 4px 14px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;overflow:hidden;padding:2px;">
            <img src="${vehicleImageSrc}" alt="${labelTitle}" style="width:100%;height:100%;object-fit:contain;border-radius:50%;" />
          </div>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
      className: "",
    });

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLat, driverLng]);
      driverMarkerRef.current.setIcon(icon);
    } else {
      driverMarkerRef.current = L.current
        .marker([driverLat, driverLng], { icon, zIndexOffset: 2000 })
        .addTo(mapRef.current)
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;font-weight:bold;color:#1e40af">
            ${labelTitle} (HUD)
          </div>`
        );
    }
  }, [driverLat, driverLng, vehicleType, mapReady]);

  // ── Destination Marker & Active Road Polyline (Matching Passenger Glow Styling) ───
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
    if (routeGlowRef.current) {
      mapRef.current.removeLayer(routeGlowRef.current);
      routeGlowRef.current = null;
    }
    if (routeCasingRef.current) {
      mapRef.current.removeLayer(routeCasingRef.current);
      routeCasingRef.current = null;
    }
    if (routeLineRef.current) {
      mapRef.current.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    const destLat = destination?.lat ?? destination?.center?.[1];
    const destLng = destination?.lng ?? destination?.center?.[0];

    if (destLat !== undefined && destLng !== undefined && destination) {
      const icon = L.current.divIcon({
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="padding:4px 10px;border-radius:12px;background:#ffffff;color:#0f172a;font-size:11px;font-weight:800;border:1.5px solid #10b981;box-shadow:0 4px 14px rgba(0,0,0,0.15);white-space:nowrap;display:flex;align-items:center;gap:4px;">
              <span style="color:#059669;">●</span>
              <span>${destination.name}</span>
            </div>
            <div style="width:2px;height:10px;background:#059669;"></div>
            <div style="width:8px;height:8px;border-radius:50%;background:#059669;border:2px solid #ffffff;box-shadow:0 0 6px #059669;"></div>
          </div>
        `,
        iconSize: [140, 44],
        iconAnchor: [70, 44],
        className: "",
      });

      destMarkerRef.current = L.current
        .marker([destLat, destLng], { icon })
        .addTo(mapRef.current);

      let latlngs: [number, number][];
      if (routePolyline && routePolyline.length > 1) {
        latlngs = routePolyline.map((pt) => [pt[1], pt[0]]);
      } else {
        const midLat = (driverLat + destLat) / 2 + 0.0003;
        const midLng = (driverLng + destLng) / 2 - 0.0003;
        latlngs = [
          [driverLat, driverLng],
          [midLat, midLng],
          [destLat, destLng],
        ];
      }

      // Outer soft glow (Matches passenger app styling)
      const glow = L.current.polyline(latlngs, {
        color: "#6366f1",
        weight: 14,
        opacity: 0.28,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(mapRef.current);

      // Saturated middle casing
      const casing = L.current.polyline(latlngs, {
        color: "#4f46e5",
        weight: 6,
        opacity: 0.75,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(mapRef.current);

      // Vibrant core line (royal purple / bright violet)
      const line = L.current.polyline(latlngs, {
        color: "#c084fc",
        weight: 3.5,
        opacity: 0.98,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(mapRef.current);

      routeGlowRef.current = glow;
      routeCasingRef.current = casing;
      routeLineRef.current = line;
    }
  }, [destination, routePolyline, driverLat, driverLng, mapReady]);

  // ── Passenger Ping Markers ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    pingMarkersRef.current.forEach((m) => m.remove());
    pingMarkersRef.current = [];

    pings.forEach((ping) => {
      const icon = L.current.divIcon({
        html: `
          <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;background:#16a34a;border:2px solid #ffffff;box-shadow:0 0 16px rgba(34,197,94,0.85);color:#ffffff;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        className: "",
      });

      const distanceDisplay =
        typeof ping.distanceMeters === "number" && !Number.isNaN(ping.distanceMeters)
          ? ping.distanceMeters >= 1000
            ? `${(ping.distanceMeters / 1000).toFixed(1)} km`
            : `${Math.round(ping.distanceMeters)}m`
          : "300m";

      const marker = L.current
        .marker([ping.lat, ping.lng], { icon, zIndexOffset: 1500 })
        .addTo(mapRef.current)
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;">
            <b style="color:#16a34a">Passenger Waiting!</b><br/>Standing near curb for pickup (~${distanceDisplay})
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
          background: #f0fbf5;
          font-family: inherit;
        }
        .dark-tiles .leaflet-tile-pane {
          filter: invert(100%) hue-rotate(180deg) brightness(90%) contrast(90%);
        }
        .leaflet-control-zoom {
          border: 1px solid rgba(16, 185, 129, 0.25) !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important;
          border-radius: 12px !important;
          overflow: hidden;
        }
        .leaflet-control-zoom a {
          background: #ffffff !important;
          color: #1e293b !important;
          border-color: #e2e8f0 !important;
          width: 32px !important;
          height: 32px !important;
          line-height: 32px !important;
        }
        .leaflet-control-zoom a:hover {
          background: #f0fdf4 !important;
          color: #059669 !important;
        }
        .leaflet-attribution-flag { display: none; }
      `}</style>

      {/* Theme Switcher Pill (Streets / Dark / Satellite - Clean Light Mint Pill) */}
      <div className="absolute top-14 left-3 z-[1000] flex items-center bg-white/95 backdrop-blur-md border border-emerald-200/90 rounded-xl p-1 shadow-md">
        <button
          type="button"
          onClick={() => changeTheme("streets")}
          className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition ${
            mapTheme === "streets" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
          title="OpenStreetMap Streets"
        >
          Streets
        </button>
        <button
          type="button"
          onClick={() => changeTheme("dark")}
          className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition ${
            mapTheme === "dark" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
          title="Dark Mode"
        >
          Dark
        </button>
        <button
          type="button"
          onClick={() => changeTheme("satellite")}
          className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition ${
            mapTheme === "satellite" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
          title="Satellite Imagery"
        >
          Satellite
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
