"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LeafletVehicleMarker {
  id: string;
  type?: 'AUTO' | 'ERICKSHAW';
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
  theme?: "streets" | "dark" | "satellite";
  defaultTheme?: "streets" | "dark" | "satellite";
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
  theme,
  defaultTheme = "streets",
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const vehicleMarkersRef = useRef<Map<string, any>>(new Map());
  const routeLineRef = useRef<any>(null);
  const routeCasingRef = useRef<any>(null);
  const L = useRef<any>(null);

  const [mapTheme, setMapTheme] = useState<"streets" | "dark" | "satellite">(theme || defaultTheme);
  const [mapReady, setMapReady] = useState(false);

  // ── Switch Map Tile Theme (Zero API Key) ────────────────────────────────
  const changeTheme = useCallback((targetTheme: "streets" | "dark" | "satellite") => {
    setMapTheme(targetTheme);
    if (!mapRef.current || !L.current) return;

    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (targetTheme === "satellite") {
      const sat = L.current.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: '&copy; <a href="https://www.esri.com/" target="_blank">Esri</a>',
          maxZoom: 19,
        }
      );
      sat.addTo(mapRef.current);
      tileLayerRef.current = sat;
    } else {
      const osm = L.current.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>',
          maxZoom: 19,
        }
      );
      osm.addTo(mapRef.current);
      tileLayerRef.current = osm;
    }
  }, []);

  // Sync external theme changes
  useEffect(() => {
    if (theme && theme !== mapTheme) {
      changeTheme(theme);
    }
  }, [theme, changeTheme, mapTheme]);

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
        attributionControl: false,
      });

      const initialLayer = leaflet.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 19 }
      );
      initialLayer.addTo(map);
      tileLayerRef.current = initialLayer;

      leaflet.control.zoom({ position: "bottomright" }).addTo(map);

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

  // ── Center Map programmatically ─────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !center) return;
    mapRef.current.flyTo([center.lat, center.lng], mapRef.current.getZoom(), {
      animate: true,
      duration: 0.8,
    });
  }, [center]);

  // ── User Location Marker (Pulse Dot) ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    if (!userLocation) {
      if (userMarkerRef.current) {
        mapRef.current.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      return;
    }

    const userIcon = L.current.divIcon({
      html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;">
          <div style="position:absolute;width:32px;height:32px;border-radius:50%;background:rgba(59,130,246,0.3);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:relative;width:14px;height:14px;border-radius:50%;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 0 10px rgba(37,99,235,0.8);"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      className: "",
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      userMarkerRef.current = L.current
        .marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 2000 })
        .addTo(mapRef.current)
        .bindPopup('<b style="color:#2563eb;font-family:sans-serif;font-size:12px;">📍 You are standing here</b>');
    }
  }, [userLocation, mapReady]);

  // ── Render Vehicles with Strict 3-Color Occupancy Rule ──────────────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    const currentIds = new Set(vehicles.map((v) => v.id));

    // Remove expired markers
    vehicleMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        mapRef.current.removeLayer(marker);
        vehicleMarkersRef.current.delete(id);
      }
    });

    // Upsert vehicle markers
    vehicles.forEach((v) => {
      let dotColor = "#f59e0b"; // Yellow (Partly Full)
      let ringColor = "rgba(245, 158, 11, 0.4)";
      if (v.status === "EMPTY") {
        dotColor = "#10b981"; // Green (Empty)
        ringColor = "rgba(16, 185, 129, 0.4)";
      } else if (v.status === "FULL") {
        dotColor = "#ef4444"; // Red (Full)
        ringColor = "rgba(239, 68, 68, 0.4)";
      }

      const isERickshaw = v.type === "ERICKSHAW";
      const iconEmoji = isERickshaw ? "⚡" : "🛺";

      const icon = L.current.divIcon({
        html: `
          <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;">
            <div style="position:relative;width:38px;height:38px;border-radius:50%;background:#0f172a;border:2.5px solid ${dotColor};box-shadow:0 0 14px ${ringColor};display:flex;align-items:center;justify-content:center;">
              <span style="font-size:17px;line-height:1;">${iconEmoji}</span>
              <span style="position:absolute;top:-2px;right:-2px;width:11px;height:11px;border-radius:50%;background:${dotColor};border:2px solid #0f172a;"></span>
            </div>
            <div style="margin-top:2px;padding:2px 6px;border-radius:8px;background:rgba(15,23,42,0.92);color:#e2e8f0;font-size:10px;font-weight:800;border:1px solid #334155;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.5);">
              ${v.label}
            </div>
          </div>
        `,
        iconSize: [60, 52],
        iconAnchor: [30, 26],
        className: "",
      });

      const existing = vehicleMarkersRef.current.get(v.id);
      if (existing) {
        existing.setLatLng([v.lat, v.lng]);
        existing.setIcon(icon);
      } else {
        const marker = L.current
          .marker([v.lat, v.lng], { icon, zIndexOffset: 1200 })
          .addTo(mapRef.current);

        marker.on("click", () => {
          v.onClick?.();
        });

        vehicleMarkersRef.current.set(v.id, marker);
      }
    });
  }, [vehicles, mapReady]);

  // ── Render Active Route Polyline on Map (Distinct Blue/Purple) ──────────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

    if (routeLineRef.current) {
      mapRef.current.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }
    if (routeCasingRef.current) {
      mapRef.current.removeLayer(routeCasingRef.current);
      routeCasingRef.current = null;
    }

    if (activeRoutePolyline && activeRoutePolyline.length > 1) {
      const latlngs = activeRoutePolyline.map((pt) => [pt[1], pt[0]]);

      const casing = L.current.polyline(latlngs, {
        color: "#4338ca",
        weight: 8,
        opacity: 0.45,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(mapRef.current);

      const line = L.current.polyline(latlngs, {
        color: "#6366f1",
        weight: 4,
        opacity: 0.95,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(mapRef.current);

      routeCasingRef.current = casing;
      routeLineRef.current = line;
    }
  }, [activeRoutePolyline, mapReady]);

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
          box-shadow: 0 4px 16px rgba(0,0,0,0.4) !important;
          border-radius: 12px !important;
          overflow: hidden;
        }
        .leaflet-control-zoom a {
          background: #0f172a !important;
          color: #e2e8f0 !important;
          border-color: #334155 !important;
          width: 32px !important;
          height: 32px !important;
          line-height: 32px !important;
        }
        .leaflet-control-zoom a:hover {
          background: #1e293b !important;
          color: #ffffff !important;
        }
        .leaflet-attribution-flag { display: none; }
      `}</style>
    </div>
  );
}

export default LeafletMap;
