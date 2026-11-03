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
  onMapClick?: () => void;
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
  onMapClick,
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
  const routeGlowRef = useRef<any>(null);
  const L = useRef<any>(null);
  const onMapClickRef = useRef(onMapClick);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

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

      leaflet.control.zoom({ position: "topright" }).addTo(map);

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
        .bindPopup('<b style="color:#2563eb;font-family:sans-serif;font-size:12px;">You are standing here</b>');
    }
  }, [userLocation, mapReady]);

  // ── Render Vehicles with Clean SVG Badges & Strict 3-Color Occupancy ────
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
      const vehicleImageSrc = isERickshaw ? "/icons/erickshaw.jpg" : "/icons/auto.jpg";

      // Sleek vehicle badge without redundant under-pin label text
      const icon = L.current.divIcon({
        html: `
          <div style="position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;transition:transform 0.15s ease;">
            <!-- Outer Glow & Avatar Circle with Custom Vehicle Image -->
            <div style="position:relative;width:42px;height:42px;border-radius:50%;background:#ffffff;border:2.5px solid ${dotColor};box-shadow:0 2px 12px ${ringColor}, 0 0 0 1px rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;overflow:hidden;padding:2px;">
              <img src="${vehicleImageSrc}" alt="${v.label}" style="width:100%;height:100%;object-fit:contain;border-radius:50%;" />
              <!-- Occupancy Status Indicator Dot -->
              <span style="position:absolute;top:0px;right:0px;width:11px;height:11px;border-radius:50%;background:${dotColor};border:2px solid #ffffff;box-shadow:0 0 6px ${dotColor};"></span>
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
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

  // ── Render Active Route Polyline on Map (Glowing Royal Blue/Purple) ────
  useEffect(() => {
    if (!mapRef.current || !L.current || !mapReady) return;

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

    if (activeRoutePolyline && activeRoutePolyline.length > 1) {
      const latlngs = activeRoutePolyline.map((pt) => [pt[1], pt[0]]);

      // Outer soft glow
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
          background: #f0fbf5;
          font-family: inherit;
        }
        .dark-tiles .leaflet-tile-pane {
          filter: invert(100%) hue-rotate(180deg) brightness(90%) contrast(90%);
        }
        .leaflet-top.leaflet-right {
          position: absolute !important;
          top: 114px !important;
          right: 16px !important;
          z-index: 20 !important;
        }
        @media (min-width: 640px) {
          .leaflet-top.leaflet-right {
            position: absolute !important;
            top: 60px !important;
            right: 20px !important;
            z-index: 20 !important;
          }
        }
        .leaflet-control-zoom {
          border: 1px solid rgba(16, 185, 129, 0.25) !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important;
          border-radius: 12px !important;
          overflow: hidden;
          transform: scale(0.9);
          transform-origin: top right;
        }
        .leaflet-control-zoom a {
          background: rgba(255, 255, 255, 0.95) !important;
          backdrop-filter: blur(8px) !important;
          color: #1e293b !important;
          border-color: #e2e8f0 !important;
          width: 28px !important;
          height: 28px !important;
          line-height: 28px !important;
          font-size: 14px !important;
        }
        .leaflet-control-zoom a:hover {
          background: #f0fdf4 !important;
          color: #059669 !important;
        }
        .leaflet-attribution-flag { display: none; }
      `}</style>
    </div>
  );
}

export default LeafletMap;
