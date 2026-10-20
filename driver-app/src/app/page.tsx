"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { io, Socket } from "socket.io-client";
import {
  Users,
  Plus,
  Minus,
  Settings,
  X,
  Radio,
  Eye,
  EyeOff,
  Bell,
  MapPin,
  Navigation,
  Compass,
  AlertCircle,
  Flame,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  DriverState,
  CorridorDestination,
  PassengerPing,
  SeatCapacity,
} from "@/types/spothail";

// Default driver starting coordinates: NIT Calicut corridor
const DEFAULT_COORDS = { lat: 11.3216, lng: 75.9342 };

// Corridor Presets for 1-Tap Fast Selection
const CORRIDORS: CorridorDestination[] = [
  {
    id: "nit-main-gate",
    name: "NIT Main Gate",
    via: "Rajpath",
    lat: 11.3216,
    lng: 75.9336,
  },
  {
    id: "kattangal-jn",
    name: "Kattangal Jn",
    via: "Main Road",
    lat: 11.3275,
    lng: 75.9348,
  },
  {
    id: "mbb-hostels",
    name: "MBB Hostels",
    via: "Campus Avenue",
    lat: 11.3175,
    lng: 75.9315,
  },
  {
    id: "kunnamangalam",
    name: "Kunnamangalam",
    via: "SH 34 Corridor",
    lat: 11.3056,
    lng: 75.8767,
  },
  {
    id: "kallanthod",
    name: "Kallanthod",
    via: "Mavoor Link",
    lat: 11.334,
    lng: 75.942,
  },
];

// Commuter Demand GeoJSON Heatmap Nodes around NIT Calicut
const COMMUTER_HEATMAP_DATA = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [75.9315, 11.3175] },
      properties: { name: "MBB Hostels", weight: 0.95, label: "MBB Hostels (8 waiting)" },
    },
    {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [75.9336, 11.3216] },
      properties: { name: "Main Gate", weight: 0.9, label: "Main Gate Stand (12 waiting)" },
    },
    {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [75.9348, 11.3275] },
      properties: { name: "Kattangal Junction", weight: 0.85, label: "Kattangal Jn (6 waiting)" },
    },
    {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [75.9285, 11.3195] },
      properties: { name: "Hostel Avenue", weight: 0.75, label: "Ladies Hostels (5 waiting)" },
    },
    {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [75.9392, 11.3228] },
      properties: { name: "East Campus / Library", weight: 0.7, label: "East Campus (4 waiting)" },
    },
  ],
};

// Helper: Haversine distance in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export default function DriverHudPage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const pingMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const socketRef = useRef<Socket | null>(null);

  // Driver Core State
  const [driverState, setDriverState] = useState<DriverState>({
    driverId: "AUTO-04",
    label: "Auto #04 (Calicut Stand)",
    lat: DEFAULT_COORDS.lat,
    lng: DEFAULT_COORDS.lng,
    occupancy: 2,
    maxCapacity: 4,
    isOnline: true,
    showDestination: true,
    destination: CORRIDORS[0],
  });

  // UI & HUD State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCockpitMinimized, setIsCockpitMinimized] = useState(false);
  const [pings, setPings] = useState<PassengerPing[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_SOCKET_SERVER_URL ||
    "http://localhost:4000";

  // Native Web Audio Dashboard Chime
  const playDashboardChime = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Tone 1: High crisp alert chime
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, now); // A5
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Tone 2: Ascending confirmation tone
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1320, now + 0.14); // E6
      gain2.gain.setValueAtTime(0.5, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.65);
    } catch (e) {
      console.warn("Web Audio Chime failed to initialize:", e);
    }
  }, []);

  // Native Haptic Vibration
  const triggerHaptics = useCallback(() => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([250, 100, 250]);
      } catch {
        // Handled silently
      }
    }
  }, []);

  // Screen Wake Lock API: Keep phone display active while mounted
  useEffect(() => {
    let wakeLockSentinel: { release: () => Promise<void> } | null = null;
    const requestWakeLock = async () => {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        try {
          const nav = navigator as unknown as {
            wakeLock: { request: (type: string) => Promise<{ release: () => Promise<void> }> };
          };
          wakeLockSentinel = await nav.wakeLock.request("screen");
        } catch {
          // Handled silently
        }
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, []);

  // Trigger Incoming Passenger Ping (Real Socket or Simulated)
  const handleIncomingPing = useCallback(
    (pingData: { id: string; lat: number; lng: number; timestamp?: number }) => {
      // Quiet, ambient alerts: native Web Audio chime & haptic feedback only
      playDashboardChime();
      triggerHaptics();

      const dist = getDistanceMeters(driverState.lat, driverState.lng, pingData.lat, pingData.lng);
      const newPing: PassengerPing = {
        id: pingData.id || `PING-${Date.now()}`,
        lat: pingData.lat,
        lng: pingData.lng,
        timestamp: pingData.timestamp || Date.now(),
        distanceMeters: dist,
      };

      setPings((prev) => [newPing, ...prev.slice(0, 4)]);
    },
    [driverState.lat, driverState.lng, playDashboardChime, triggerHaptics]
  );

  // Initialize Socket.io Connection
  useEffect(() => {
    const socket = io(backendUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("driver:sync_status", driverState);
    });

    socket.on("driver:ping_received", (data: { id: string; lat: number; lng: number }) => {
      handleIncomingPing(data);
    });

    socket.on("disconnect", () => setSocketConnected(false));

    return () => {
      socket.disconnect();
    };
  }, [backendUrl, handleIncomingPing]);

  // Broadcast Driver Telemetry on State Change
  useEffect(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("driver:sync_status", driverState);
    }
  }, [driverState]);

  // 1. Initialize Mapbox Map Canvas (Top 55%)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [driverState.lng, driverState.lat],
      zoom: 15.0,
      attributionControl: false,
    });

    map.setPadding({ top: 60, bottom: 20, left: 20, right: 20 });

    mapRef.current = map;

    map.on("load", () => {
      // Commuter Demand GeoJSON Heatmap Layer
      map.addSource("commuter-heat", {
        type: "geojson",
        data: COMMUTER_HEATMAP_DATA,
      });

      map.addLayer({
        id: "commuter-heat-layer",
        type: "heatmap",
        source: "commuter-heat",
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 12, 1, 16, 2.8],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(30, 58, 138, 0)",
            0.2,
            "rgba(59, 130, 246, 0.4)",
            0.4,
            "rgba(16, 185, 129, 0.6)",
            0.7,
            "rgba(245, 158, 11, 0.8)",
            1,
            "rgba(239, 68, 68, 0.95)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 12, 25, 16, 48],
          "heatmap-opacity": 0.85,
        },
      });

      // Commuter Hotspot Center Glowing Nodes
      map.addLayer({
        id: "commuter-node-layer",
        type: "circle",
        source: "commuter-heat",
        paint: {
          "circle-radius": 6,
          "circle-color": "#fbbf24",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.95,
        },
      });

      // Active Corridor Route Line Source
      map.addSource("driver-route", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "driver-route-line",
        type: "line",
        source: "driver-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#3b82f6",
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken]);

  // 2. Render Driver GPS Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!driverMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "w-max inline-flex flex-col items-center pointer-events-none z-10";
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="w-10 h-10 rounded-full bg-blue-500/30 animate-ping absolute"></div>
          <div class="w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow-xl flex items-center justify-center text-white text-xs z-10">
            🛺
          </div>
        </div>
        <div class="mt-0.5 px-2 py-0.5 rounded-full bg-slate-900/90 text-blue-300 font-extrabold text-[10px] border border-blue-500/40 shadow-md">
          YOU (AUTO-04)
        </div>
      `;
      driverMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([driverState.lng, driverState.lat])
        .addTo(map);
    } else {
      driverMarkerRef.current.setLngLat([driverState.lng, driverState.lat]);
    }
  }, [driverState.lat, driverState.lng]);

  // 3. Render Passenger Ping Pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up expired markers
    const activePingIds = new Set(pings.map((p) => p.id));
    pingMarkersRef.current.forEach((marker, id) => {
      if (!activePingIds.has(id)) {
        marker.remove();
        pingMarkersRef.current.delete(id);
      }
    });

    // Upsert custom pulsating pins
    pings.forEach((ping) => {
      if (pingMarkersRef.current.has(ping.id)) {
        pingMarkersRef.current.get(ping.id)?.setLngLat([ping.lng, ping.lat]);
      } else {
        const el = document.createElement("div");
        el.className = "w-max inline-flex flex-col items-center cursor-pointer z-10";
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-amber-400 opacity-75"></span>
            <div class="relative inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 border-2 border-white shadow-xl text-xs">
              👋
            </div>
          </div>
          <div class="mt-1 px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] shadow-lg border border-white whitespace-nowrap animate-bounce">
            Waiting Here (~${ping.distanceMeters || 320}m)
          </div>
        `;
        el.onclick = () => {
          map.flyTo({
            center: [ping.lng, ping.lat],
            zoom: 16,
            padding: { top: 60, bottom: 20, left: 20, right: 20 },
          });
        };

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([ping.lng, ping.lat])
          .addTo(map);

        pingMarkersRef.current.set(ping.id, marker);
      }
    });
  }, [pings]);

  // 4. Update Corridor Route Polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const routeSource = map.getSource("driver-route") as mapboxgl.GeoJSONSource;
    if (!routeSource) return;

    if (!driverState.showDestination || !driverState.destination) {
      routeSource.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const fetchRoute = async () => {
      try {
        const { lng: startLng, lat: startLat } = driverState;
        const { lng: endLng, lat: endLat } = driverState.destination!;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&overview=full&access_token=${mapboxToken}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.routes?.[0]?.geometry?.coordinates) {
          routeSource.setData({
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [startLng, startLat],
                ...data.routes[0].geometry.coordinates,
              ],
            },
          });
        }
      } catch (err) {
        console.warn("Failed to update driver route:", err);
      }
    };

    fetchRoute();
  }, [driverState.destination, driverState.showDestination, mapboxToken]);

  // 5. Toggle Commuter Heatmap Layer Visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer("commuter-heat-layer")) {
      map.setLayoutProperty(
        "commuter-heat-layer",
        "visibility",
        showHeatmap ? "visible" : "none"
      );
    }
    if (map.getLayer("commuter-node-layer")) {
      map.setLayoutProperty(
        "commuter-node-layer",
        "visibility",
        showHeatmap ? "visible" : "none"
      );
    }
  }, [showHeatmap]);

  // 6. Smoothly resize Mapbox canvas during and after cockpit collapse transition
  useEffect(() => {
    const interval = setInterval(() => {
      mapRef.current?.resize();
    }, 40);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      mapRef.current?.resize();
    }, 350);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isCockpitMinimized]);

  // Cockpit Occupancy Actions
  const handleIncrement = () => {
    triggerHaptics();
    setDriverState((prev) => ({
      ...prev,
      occupancy: Math.min(prev.maxCapacity, prev.occupancy + 1),
    }));
  };

  const handleDecrement = () => {
    triggerHaptics();
    setDriverState((prev) => ({
      ...prev,
      occupancy: Math.max(0, prev.occupancy - 1),
    }));
  };

  const handleSetCapacity = (capacity: SeatCapacity) => {
    triggerHaptics();
    setDriverState((prev) => ({
      ...prev,
      maxCapacity: capacity,
      occupancy: Math.min(prev.occupancy, capacity),
    }));
  };

  const handleQuickEmpty = () => {
    triggerHaptics();
    setDriverState((prev) => ({ ...prev, occupancy: 0 }));
  };

  const handleQuickFull = () => {
    triggerHaptics();
    setDriverState((prev) => ({ ...prev, occupancy: prev.maxCapacity }));
  };

  // Color Coding Based on Seat Radar Protocol
  const isFull = driverState.occupancy >= driverState.maxCapacity;
  const isEmpty = driverState.occupancy === 0;

  const occupancyTheme = useMemo(() => {
    if (isEmpty) {
      return {
        bg: "bg-emerald-950/40 border-emerald-500/50",
        text: "text-emerald-400",
        badge: "bg-emerald-500 text-slate-950",
        label: "EMPTY AUTO",
        glow: "shadow-emerald-500/20",
      };
    }
    if (isFull) {
      return {
        bg: "bg-rose-950/40 border-rose-500/50",
        text: "text-rose-400",
        badge: "bg-rose-600 text-white",
        label: "FULL - NOT BOARDING",
        glow: "shadow-rose-500/20",
      };
    }
    return {
      bg: "bg-amber-950/40 border-amber-500/50",
      text: "text-amber-400",
      badge: "bg-amber-500 text-slate-950",
      label: "HAS SPACE",
      glow: "shadow-amber-500/20",
    };
  }, [isEmpty, isFull]);

  return (
    <main className="relative w-full h-[100dvh] flex flex-col overflow-hidden bg-slate-950 select-none font-sans">
      {/* ====================================================================== */}
      {/* TOP HEADER COMMAND STRIP                                              */}
      {/* ====================================================================== */}
      <header className="absolute top-0 left-0 right-0 z-40 bg-[#1C1C1E] px-3.5 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        {/* Left: Compact Status Pill (Live / Offline Toggle) */}
        <button
          onClick={() => {
            triggerHaptics();
            setDriverState((prev) => ({ ...prev, isOnline: !prev.isOnline }));
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-semibold hover:bg-zinc-700 active:scale-95 transition"
          aria-label={driverState.isOnline ? "Status: Live (Tap to go offline)" : "Status: Offline (Tap to go live)"}
          title={driverState.isOnline ? "Live - Tap to go offline" : "Offline - Tap to go live"}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              driverState.isOnline ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className={driverState.isOnline ? "text-white" : "text-zinc-300"}>
            {driverState.isOnline ? "Live" : "Offline"}
          </span>
        </button>

        {/* Right: Action Controls (Heatmap & Settings) */}
        <div className="flex items-center gap-2">
          {/* Heatmap Toggle */}
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 transition ${
              showHeatmap
                ? "bg-zinc-800 text-yellow-400 border-yellow-400"
                : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-yellow-400 hover:bg-zinc-700"
            }`}
            title="Toggle Commuter Heatmap"
          >
            <Flame className={`w-4 h-4 ${showHeatmap ? "text-yellow-400" : "text-zinc-400"}`} />
          </button>

          {/* Gear Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-zinc-800 text-white border border-zinc-700 hover:bg-zinc-700 active:scale-95 transition"
            aria-label="Open settings"
          >
            <Settings className="w-4 h-4 text-white" />
          </button>
        </div>
      </header>

      {/* ====================================================================== */}
      {/* TOP MAPBOX RADAR, HEATMAP & PASSENGER PINGS CANVAS                     */}
      {/* ====================================================================== */}
      <section
        className={`relative w-full overflow-hidden bg-slate-950 isolate transition-all duration-300 ease-in-out ${
          isCockpitMinimized ? "h-[calc(100%-4rem)]" : "h-[55%]"
        }`}
      >
        {!mapboxToken ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-300 bg-slate-900">
            <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
            <p className="font-bold text-sm">Mapbox Token Required</p>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Add NEXT_PUBLIC_MAPBOX_TOKEN to your .env.local file to activate live map.
            </p>
          </div>
        ) : (
          <div ref={mapContainerRef} className="w-full h-full relative overflow-hidden" />
        )}

        {/* Floating Active Corridor Badge in Map Area */}
        <div className="absolute bottom-2.5 left-3 right-3 pointer-events-none flex items-center justify-between">
          <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-lg flex items-center gap-2 max-w-[75%]">
            <Navigation className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                Active Corridor
              </span>
              <span className="text-xs font-black text-white truncate block">
                {driverState.showDestination && driverState.destination
                  ? `${driverState.destination.name} (${driverState.destination.via})`
                  : "Local / Free Roaming (Route Hidden)"}
              </span>
            </div>
          </div>

          {/* Re-center Map Button */}
          <button
            onClick={() => {
              mapRef.current?.flyTo({
                center: [driverState.lng, driverState.lat],
                zoom: 15.5,
                padding: { top: 60, bottom: 20, left: 20, right: 20 },
              });
            }}
            className="pointer-events-auto p-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-blue-400 shadow-lg active:scale-90 transition"
            aria-label="Re-center on auto"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ====================================================================== */}
      {/* BOTTOM COCKPIT & SEAT CONTROLS (EXPANDED OR MINIMAL STATUS BAR)        */}
      {/* ====================================================================== */}
      <section
        className={`relative w-full bg-slate-950 border-t border-slate-800/80 flex flex-col justify-between px-3.5 pt-1.5 pb-2.5 transition-all duration-300 ease-in-out z-20 ${
          isCockpitMinimized ? "h-16" : "h-[45%]"
        }`}
      >
        {/* Drag Handle & Collapse/Expand Bar */}
        <div className="flex items-center justify-between w-full pb-0.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptics();
              setIsCockpitMinimized(!isCockpitMinimized);
            }}
            className="py-1 cursor-pointer flex-1 flex items-center justify-center -ml-2 select-none"
            aria-label={isCockpitMinimized ? "Expand cockpit" : "Collapse cockpit"}
          >
            <div className="w-10 h-1 bg-slate-700 hover:bg-slate-500 rounded-full transition-colors" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptics();
              setIsCockpitMinimized(!isCockpitMinimized);
            }}
            className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 text-[11px] font-black flex items-center gap-1 shadow-sm active:scale-95 transition"
          >
            {isCockpitMinimized ? (
              <span>🛺 {driverState.occupancy}/{driverState.maxCapacity} Seats ▾</span>
            ) : (
              <>
                <X className="w-3 h-3 text-slate-400" />
                <span>Collapse Cockpit</span>
              </>
            )}
          </button>
        </div>

        {/* Minimized Compact Bar View */}
        {isCockpitMinimized ? (
          <div
            onClick={() => {
              triggerHaptics();
              setIsCockpitMinimized(false);
            }}
            className="flex items-center justify-between w-full h-full pb-1 cursor-pointer select-none"
          >
            {/* Left: Occupancy badge & dot array */}
            <div className="flex items-center gap-2">
              <span className="text-xl">🛺</span>
              <span className="text-sm font-extrabold text-white">
                Occupancy:{" "}
                <span className={`font-mono font-black ${occupancyTheme.text}`}>
                  {driverState.occupancy} / {driverState.maxCapacity} Seats
                </span>
              </span>
              <span className="text-sm">
                {isEmpty ? "🟢" : isFull ? "🔴" : "🟡"}
              </span>
            </div>

            {/* Right: Quick Expand button */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-bold hidden sm:inline">
                {driverState.destination?.name || "Local Roaming"}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptics();
                  setIsCockpitMinimized(false);
                }}
                className="px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition"
              >
                <span>Open</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Row 1: Giant Occupancy Counter & Status Badge */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${occupancyTheme.badge}`}
                  >
                    {occupancyTheme.label}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">
                    {driverState.maxCapacity - driverState.occupancy} seats free
                  </span>
                </div>
                {/* Visual Dot Array */}
                <div className="flex items-center gap-1.5 mt-1">
                  {Array.from({ length: driverState.maxCapacity }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-3 h-3 rounded-full border transition-all ${
                        idx < driverState.occupancy
                          ? isFull
                            ? "bg-rose-500 border-rose-400 shadow-sm shadow-rose-500"
                            : "bg-amber-400 border-amber-300 shadow-sm shadow-amber-500"
                          : "bg-slate-800 border-slate-700"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Giant Numbers */}
              <div className="flex items-baseline gap-1">
                <span
                  className={`text-5xl font-black font-mono tracking-tight ${occupancyTheme.text}`}
                >
                  {driverState.occupancy}
                </span>
                <span className="text-2xl font-bold font-mono text-slate-500">
                  / {driverState.maxCapacity}
                </span>
              </div>
            </div>

        {/* Row 2: Massive Thumb-Zone Board/Drop Buttons */}
        <div className="grid grid-cols-2 gap-3 my-1">
          {/* Decrement Button: DROP PASSENGER */}
          <button
            disabled={driverState.occupancy <= 0}
            onClick={handleDecrement}
            className={`h-16 rounded-2xl flex items-center justify-center gap-3 font-black text-lg border shadow-xl transition-all active:scale-95 select-none ${
              driverState.occupancy <= 0
                ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed opacity-50"
                : "bg-slate-850 hover:bg-slate-800 border-slate-700 text-rose-300 active:bg-rose-950/30"
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Minus className="w-5 h-5 stroke-[3]" />
            </div>
            <div className="text-left">
              <span className="block text-sm font-extrabold leading-none text-white">DROP</span>
              <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                -1 Passenger
              </span>
            </div>
          </button>

          {/* Increment Button: BOARD PASSENGER */}
          <button
            disabled={driverState.occupancy >= driverState.maxCapacity}
            onClick={handleIncrement}
            className={`h-16 rounded-2xl flex items-center justify-center gap-3 font-black text-lg border shadow-xl transition-all active:scale-95 select-none ${
              driverState.occupancy >= driverState.maxCapacity
                ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed opacity-50"
                : "bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white shadow-emerald-900/40"
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
              <Plus className="w-5 h-5 stroke-[3]" />
            </div>
            <div className="text-left">
              <span className="block text-sm font-extrabold leading-none text-white">BOARD</span>
              <span className="text-[10px] text-emerald-100 font-semibold block mt-0.5">
                +1 Passenger
              </span>
            </div>
          </button>
        </div>

        {/* Row 3: 1-Tap Quick Shortcut Pills */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleQuickEmpty}
            className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 font-bold text-xs border border-slate-800 active:scale-95 transition flex items-center justify-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Empty Auto (0/{driverState.maxCapacity})
          </button>
          <button
            onClick={handleQuickFull}
            className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 font-bold text-xs border border-slate-800 active:scale-95 transition flex items-center justify-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Full Auto ({driverState.maxCapacity}/{driverState.maxCapacity})
          </button>
        </div>

        {/* Row 4: 1-Tap Horizontal Corridor Presets */}
        <div className="mt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              1-Tap Corridor Destination
            </span>
            <span className="text-[10px] text-blue-400 font-bold">
              {driverState.destination?.name || "None"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {CORRIDORS.map((corridor) => {
              const isSelected = driverState.destination?.id === corridor.id;
              return (
                <button
                  key={corridor.id}
                  onClick={() => {
                    triggerHaptics();
                    setDriverState((prev) => ({
                      ...prev,
                      destination: corridor,
                      showDestination: true,
                    }));
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black border transition active:scale-95 flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-900/40"
                      : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-850"
                  }`}
                >
                  <MapPin className="w-3 h-3 text-current" />
                  <span>{corridor.name}</span>
                </button>
              );
            })}
          </div>
        </div>
          </>
        )}
      </section>

      {/* ====================================================================== */}
      {/* SLIDE-IN SETTINGS DRAWER                                               */}
      {/* ====================================================================== */}
      {isSettingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 shadow-2xl animate-in slide-in-from-bottom-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Drag Handle & Header */}
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-black text-white">HUD Cockpit Settings</h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-800"
                aria-label="Close settings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section 1: Broadcasting Status Toggle */}
            <div className="py-3.5 border-b border-slate-800">
              <label className="text-xs font-bold uppercase text-slate-400 block mb-2">
                Radar Visibility
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    triggerHaptics();
                    setDriverState((prev) => ({ ...prev, isOnline: true }));
                  }}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-2 transition ${
                    driverState.isOnline
                      ? "bg-green-700 text-white border-green-700"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}
                >
                  <Radio className="w-4 h-4" />
                  <span>🟢 Online (Broadcast)</span>
                </button>
                <button
                  onClick={() => {
                    triggerHaptics();
                    setDriverState((prev) => ({ ...prev, isOnline: false }));
                  }}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-2 transition ${
                    !driverState.isOnline
                      ? "bg-red-800 text-zinc-100 border-red-800"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}
                >
                  <span>⚫ Offline (Hidden)</span>
                </button>
              </div>
            </div>

            {/* Section 2: Dynamic Seating Capacity Selector */}
            <div className="py-3.5 border-b border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase text-slate-400 block">
                  Vehicle Seating Capacity
                </label>
                <span className="text-xs font-black text-amber-400">
                  {driverState.maxCapacity} Seats
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleSetCapacity(3)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 ${
                    driverState.maxCapacity === 3
                      ? "bg-blue-600 text-white border-blue-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>3 Seats (Standard)</span>
                </button>
                <button
                  onClick={() => handleSetCapacity(4)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 ${
                    driverState.maxCapacity === 4
                      ? "bg-blue-600 text-white border-blue-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>4 Seats (Shared)</span>
                </button>
                <button
                  onClick={() => handleSetCapacity(6)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 ${
                    driverState.maxCapacity === 6
                      ? "bg-blue-600 text-white border-blue-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>6 Seats (E-Rickshaw)</span>
                </button>
              </div>
            </div>

            {/* Section 3: Privacy Route Toggle */}
            <div className="py-3.5 border-b border-slate-800">
              <label className="text-xs font-bold uppercase text-slate-400 block mb-2">
                Corridor Route Privacy
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    triggerHaptics();
                    setDriverState((prev) => ({ ...prev, showDestination: true }));
                  }}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${
                    driverState.showDestination
                      ? "bg-blue-700 text-white border-blue-500 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  <span>👁️ Public Route</span>
                </button>
                <button
                  onClick={() => {
                    triggerHaptics();
                    setDriverState((prev) => ({ ...prev, showDestination: false }));
                  }}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${
                    !driverState.showDestination
                      ? "bg-slate-700 text-white border-slate-500 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <EyeOff className="w-4 h-4" />
                  <span>🔒 Roaming / Private</span>
                </button>
              </div>
            </div>

            {/* Section 4: Demo Simulator Controls */}
            <div className="pt-3.5">
              <label className="text-xs font-bold uppercase text-slate-400 block mb-2">
                Demo & Audio Diagnostics
              </label>
              <button
                onClick={() => {
                  // Simulate incoming passenger near Kattangal/NITC corridor
                  handleIncomingPing({
                    id: `SIM-${Date.now()}`,
                    lat: driverState.lat + (Math.random() - 0.4) * 0.003,
                    lng: driverState.lng + (Math.random() - 0.4) * 0.003,
                    timestamp: Date.now(),
                  });
                }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl flex items-center justify-center gap-2 active:scale-95 transition"
              >
                <Bell className="w-5 h-5 text-slate-950" />
                <span>🔔 Simulate Passenger Ping (Sound + Vibrate)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
