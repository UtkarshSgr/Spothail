"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { io, Socket } from "socket.io-client";
import { Navigation, Compass, AlertCircle } from "lucide-react";
import {
  DriverState,
  CorridorDestination,
  PassengerPing,
  SeatCapacity,
} from "@/types/spothail";
import { DriverHeader } from "@/components/DriverHeader";
import { DriverCockpit, CORRIDORS } from "@/components/DriverCockpit";

// Default driver starting coordinates: NIT Calicut corridor
const DEFAULT_COORDS = { lat: 11.3216, lng: 75.9342 };

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
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  // 1. Initialize Mapbox Map Canvas (Top 55% or Full when minimized)
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

  const handleCorridorSelect = (corridor: CorridorDestination) => {
    triggerHaptics();
    setDriverState((prev) => ({
      ...prev,
      destination: corridor,
      showDestination: true,
    }));
  };

  return (
    <main className="relative w-full h-[100dvh] flex flex-col overflow-hidden bg-slate-950 select-none font-sans">
      {/* ====================================================================== */}
      {/* 1. MODULAR DRIVER HEADER & SETTINGS DRAWER                             */}
      {/* ====================================================================== */}
      <DriverHeader
        isOnline={driverState.isOnline}
        setIsOnline={(val) => {
          triggerHaptics();
          setDriverState((prev) => ({ ...prev, isOnline: val }));
        }}
        maxSeats={driverState.maxCapacity}
        setMaxSeats={handleSetCapacity}
        showDestination={driverState.showDestination}
        setShowDestination={(val) => {
          triggerHaptics();
          setDriverState((prev) => ({ ...prev, showDestination: val }));
        }}
        showHeatmap={showHeatmap}
        setShowHeatmap={setShowHeatmap}
        onSimulatePing={() =>
          handleIncomingPing({
            id: `SIM-${Date.now()}`,
            lat: driverState.lat + (Math.random() - 0.4) * 0.003,
            lng: driverState.lng + (Math.random() - 0.4) * 0.003,
            timestamp: Date.now(),
          })
        }
        triggerHaptics={triggerHaptics}
      />

      {/* ====================================================================== */}
      {/* 2. MAPBOX RADAR, HEATMAP & PASSENGER PINGS CANVAS                      */}
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
      {/* 3. MODULAR DRIVER COCKPIT & SEAT CONTROLS                             */}
      {/* ====================================================================== */}
      <DriverCockpit
        occupancy={driverState.occupancy}
        maxCapacity={driverState.maxCapacity}
        isMinimized={isCockpitMinimized}
        setIsMinimized={setIsCockpitMinimized}
        handleDrop={handleDecrement}
        handleBoard={handleIncrement}
        handleCorridorSelect={handleCorridorSelect}
        activeCorridor={driverState.destination}
        handleQuickEmpty={handleQuickEmpty}
        handleQuickFull={handleQuickFull}
        triggerHaptics={triggerHaptics}
      />
    </main>
  );
}
