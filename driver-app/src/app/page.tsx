"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { io, Socket } from "socket.io-client";
import { Navigation, Compass, Hand, X, CheckCircle2, MapPin } from "lucide-react";
import {
  DriverState,
  CorridorDestination,
  RouteOption,
  PassengerPing,
  SeatCapacity,
  VehicleType,
} from "@/types/spothail";
import { DriverHeader } from "@/components/DriverHeader";
import { DriverCockpit, CORRIDORS } from "@/components/DriverCockpit";
import { fetchOSRMRoute, getMinDistanceToPolyline, getDistanceMeters } from "@/lib/routing";

const DriverLeafletMap = dynamic(
  () => import("@/components/DriverLeafletMap").then((m) => m.DriverLeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading live driver map…</span>
      </div>
    ),
  }
);

// Default driver starting coordinates: NIT Calicut corridor
const DEFAULT_COORDS = { lat: 11.3216, lng: 75.9342 };

export default function DriverHudPage() {
  const socketRef = useRef<Socket | null>(null);
  const lastRerouteTimeRef = useRef<number>(0);

  // Driver Core State (Only Autos and E-Rickshaws, capacity 3-4)
  const [driverState, setDriverState] = useState<DriverState>({
    driverId: "AUTO-04",
    type: "AUTO",
    label: "Auto #04 (Calicut Stand)",
    lat: DEFAULT_COORDS.lat,
    lng: DEFAULT_COORDS.lng,
    occupancy: 2,
    maxCapacity: 4,
    isOnline: true,
    showDestination: true,
    destination: CORRIDORS[0],
    routePolyline: undefined,
    etaMinutes: 4,
  });

  // UI & HUD State
  const [pings, setPings] = useState<PassengerPing[]>([]);
  const [, setSocketConnected] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [zoomTrigger, setZoomTrigger] = useState<{ action: "in" | "out"; count: number } | null>(null);
  const [mapTheme, setMapTheme] = useState<"streets" | "dark" | "satellite">("streets");

  const backendUrl = useMemo(() => {
    let envUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (envUrl) {
      envUrl = envUrl.trim().replace(/\/$/, "");
      if (!envUrl.startsWith("http://") && !envUrl.startsWith("https://")) {
        envUrl = `https://${envUrl}`;
      }
      if (!envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
        return envUrl;
      }
    }
    if (
      typeof window !== "undefined" &&
      window.location.hostname &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      const protocol = window.location.protocol === "https:" ? "https:" : "http:";
      return `${protocol}//${window.location.hostname}:4000`;
    }
    return envUrl || "http://localhost:4000";
  }, []);

  // Native Web Audio Dashboard Chime for passenger handwaves
  const playDashboardChime = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume();
      }
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

  // Screen Wake Lock API: Keep driver display active while mounted
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

  // Real Hardware GPS Streaming: Tracks driver coordinates when online
  useEffect(() => {
    if (!driverState.isOnline) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setDriverState((prev) => {
          const dist = getDistanceMeters(prev.lat, prev.lng, latitude, longitude);
          if (dist < 2) return prev;
          return {
            ...prev,
            lat: latitude,
            lng: longitude,
          };
        });
      },
      (err) => {
        console.warn("GPS tracking status:", err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1500,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [driverState.isOnline]);

  // ── OSRM Road Route Generation & Dynamic Rerouting ──────────────────────
  const regenerateRoute = useCallback(
    async (startCoords: { lat: number; lng: number }, dest: CorridorDestination) => {
      const route = await fetchOSRMRoute(startCoords, { lat: dest.lat, lng: dest.lng });
      // Calculate estimated time based on auto speed ~25 km/h:
      const distKm = dest.distanceKm || ((route.distanceMeters || 1500) / 1000);
      const estMinutes = dest.estimatedMinutes || Math.max(1, Math.round((distKm / 25) * 60));

      setDriverState((prev) => ({
        ...prev,
        routePolyline: route.coordinates,
        estimatedMinutes: estMinutes,
        etaMinutes: estMinutes,
      }));
      lastRerouteTimeRef.current = Date.now();
    },
    []
  );

  // Initial and destination change route calculation
  useEffect(() => {
    if (driverState.destination) {
      regenerateRoute(
        { lat: driverState.lat, lng: driverState.lng },
        driverState.destination
      );
    }
  }, [driverState.destination, regenerateRoute]);

  // Dynamic Rerouting: Check if driver deviates from road by > 50 meters
  useEffect(() => {
    if (!driverState.destination || !driverState.routePolyline) return;

    // Throttle rerouting checks to at most once every 6 seconds
    if (Date.now() - lastRerouteTimeRef.current < 6000) return;

    const deviationMeters = getMinDistanceToPolyline(
      driverState.lat,
      driverState.lng,
      driverState.routePolyline
    );

    // If driver deviates by more than 50 meters, recalculate route along actual roads!
    if (deviationMeters > 50) {
      console.log(`[Rerouting] Driver deviated by ${Math.round(deviationMeters)}m (>50m). Recalculating...`);
      regenerateRoute(
        { lat: driverState.lat, lng: driverState.lng },
        driverState.destination
      );
    }
  }, [driverState.lat, driverState.lng, driverState.destination, driverState.routePolyline, regenerateRoute]);

  // Passenger Ping Toast on Driver HUD
  const [activeToast, setActiveToast] = useState<{
    id: string;
    pickupLocation: string;
    distanceMeters?: number;
    timestamp: number;
  } | null>(null);

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Broadcast Driver Status (ONLINE / OFFLINE) with campus location
  const broadcastStatus = useCallback(
    (status: "ONLINE" | "OFFLINE", overrides?: Partial<DriverState>) => {
      const currentState = { ...driverState, ...overrides };
      const campusLocation = currentState.destination?.name || "NIT Calicut Main Gate";
      const socket = socketRef.current;
      if (!socket?.connected) return;

      if (status === "OFFLINE") {
        console.log(`[Broadcast] Driver ${currentState.driverId} -> OFFLINE`);
        socket.emit("DRIVER_STATUS_CHANGE", {
          driverId: currentState.driverId,
          status: "OFFLINE",
          campusLocation,
          timestamp: Date.now(),
        });
      } else {
        console.log(`[Broadcast] Driver ${currentState.driverId} -> ONLINE at ${campusLocation}`);
        socket.emit("DRIVER_STATUS_CHANGE", {
          driverId: currentState.driverId,
          status: "ONLINE",
          campusLocation,
          lat: currentState.lat,
          lng: currentState.lng,
          type: currentState.type,
          label: currentState.label,
          occupancy: currentState.occupancy,
          maxCapacity: currentState.maxCapacity,
          destination: currentState.destination,
          routePolyline: currentState.routePolyline,
          timestamp: Date.now(),
        });
        socket.emit("driver:sync_status", currentState);
      }
    },
    [driverState]
  );

  // Toggle Public Route (Online) vs Roaming / Private (Offline)
  const handleToggleMode = useCallback(
    (isPublic: boolean) => {
      triggerHaptics();
      setDriverState((prev) => {
        const nextState = {
          ...prev,
          isOnline: isPublic,
          showDestination: isPublic,
        };
        broadcastStatus(isPublic ? "ONLINE" : "OFFLINE", nextState);
        return nextState;
      });
    },
    [triggerHaptics, broadcastStatus]
  );

  // Handle incoming Passenger Handwave Ping
  const handleIncomingPing = useCallback(
    (pingData: {
      id?: string;
      driverId?: string;
      targetDriverId?: string;
      lat: number;
      lng: number;
      pickupLocation?: string;
      timestamp?: number;
    }) => {
      // 1. Play audio alert sound
      playDashboardChime();

      // 2. Trigger device haptics
      triggerHaptics();

      const dist = getDistanceMeters(driverState.lat, driverState.lng, pingData.lat, pingData.lng);
      const pickupLocation = pingData.pickupLocation || "MBH Hostel";

      const newPing: PassengerPing = {
        id: pingData.id || `PING-${Date.now()}`,
        driverId: pingData.driverId || driverState.driverId,
        targetDriverId: pingData.targetDriverId || driverState.driverId,
        lat: pingData.lat,
        lng: pingData.lng,
        timestamp: pingData.timestamp || Date.now(),
        distanceMeters: dist,
        pickupLocation,
      };

      setPings((prev) => [newPing, ...prev.slice(0, 4)]);

      // 3. Display toast notification on Driver HUD
      setActiveToast({
        id: newPing.id!,
        pickupLocation,
        distanceMeters: dist,
        timestamp: Date.now(),
      });

      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = setTimeout(() => {
        setActiveToast(null);
      }, 9000);
    },
    [driverState.lat, driverState.lng, driverState.driverId, playDashboardChime, triggerHaptics]
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
      if (driverState.isOnline && driverState.showDestination) {
        broadcastStatus("ONLINE");
      }
    });

    const handlePing = (data: any) => {
      const targetId = data?.targetDriverId || data?.driverId;
      // Filter ping by driverId
      if (targetId && targetId !== driverState.driverId) {
        return;
      }
      handleIncomingPing({
        id: data?.id,
        driverId: targetId,
        targetDriverId: targetId,
        lat: data?.passengerLat ?? data?.lat ?? driverState.lat,
        lng: data?.passengerLng ?? data?.lng ?? driverState.lng,
        pickupLocation: data?.pickupLocation || "MBH Hostel",
        timestamp: data?.timestamp,
      });
    };

    socket.on("PASSENGER_PING", handlePing);
    socket.on("driver:ping_received", handlePing);

    socket.on("disconnect", () => setSocketConnected(false));

    return () => {
      socket.disconnect();
    };
  }, [backendUrl, broadcastStatus, driverState.driverId, driverState.isOnline, driverState.lat, driverState.lng, driverState.showDestination, handleIncomingPing]);

  // Broadcast Driver Telemetry (Position, Capacity, Occupancy, Route) in Real-Time
  useEffect(() => {
    if (socketRef.current?.connected && driverState.isOnline && driverState.showDestination) {
      broadcastStatus("ONLINE");
    }
  }, [driverState.occupancy, driverState.maxCapacity, driverState.destination, driverState.type, broadcastStatus, driverState.isOnline, driverState.showDestination]);

  // Occupancy Adjustments
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

  const handleSetVehicleType = (type: VehicleType) => {
    triggerHaptics();
    setDriverState((prev) => ({
      ...prev,
      type,
      label: type === "ERICKSHAW" ? "E-Rickshaw #04" : "Auto #04 (Calicut Stand)",
    }));
  };

  const handleCorridorSelect = (corridor: CorridorDestination, selectedRoute?: RouteOption) => {
    triggerHaptics();
    const updatedDest: CorridorDestination = {
      ...corridor,
      selectedRouteId: selectedRoute?.id || corridor.selectedRouteId,
      via: selectedRoute?.via || corridor.via,
      distanceKm: selectedRoute?.distanceKm || corridor.distanceKm,
      estimatedMinutes: selectedRoute?.estimatedMinutes || corridor.estimatedMinutes,
    };
    setDriverState((prev) => ({
      ...prev,
      destination: updatedDest,
      estimatedMinutes: updatedDest.estimatedMinutes,
      etaMinutes: updatedDest.estimatedMinutes,
      showDestination: true,
    }));
  };

  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-[#f0fbf5] select-none font-sans">
      {/* ====================================================================== */}
      {/* 1. TOP COMMAND BAR (DESTINATION SETUP & SEAT INDICATOR)                */}
      {/* ====================================================================== */}
      <DriverHeader
        driverId={driverState.driverId}
        isOnline={driverState.isOnline}
        onTogglePublicRoute={handleToggleMode}
        vehicleType={driverState.type}
        setVehicleType={handleSetVehicleType}
        occupancy={driverState.occupancy}
        maxSeats={driverState.maxCapacity}
        setMaxSeats={handleSetCapacity}
        showDestination={driverState.showDestination}
        setShowDestination={(val) => handleToggleMode(val)}
        activeDestination={driverState.destination}
        onSelectDestination={handleCorridorSelect}
        corridors={CORRIDORS}
        onSimulatePing={() =>
          handleIncomingPing({
            id: `SIM-${Date.now()}`,
            lat: driverState.lat + (Math.random() - 0.4) * 0.003,
            lng: driverState.lng + (Math.random() - 0.4) * 0.003,
            pickupLocation: "MBH Hostel",
            timestamp: Date.now(),
          })
        }
        triggerHaptics={triggerHaptics}
        mapTheme={mapTheme}
        onSelectMapTheme={setMapTheme}
        onRecenter={() => setRecenterTrigger((prev) => prev + 1)}
      />

      {/* ====================================================================== */}
      {/* PASSENGER PING TOAST NOTIFICATION ON DRIVER HUD                        */}
      {/* ====================================================================== */}
      {activeToast && (
        <div className="absolute top-14 sm:top-16 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-[440px] z-50 pointer-events-auto animate-in slide-in-from-top-4 duration-300">
          <div className="relative overflow-hidden bg-slate-900/95 backdrop-blur-2xl border-2 border-emerald-500 rounded-3xl p-3.5 sm:p-4 shadow-2xl text-white">
            {/* Animated Glow Accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 animate-pulse" />

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {/* Waving Hand Badge */}
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0 shadow-lg text-emerald-300">
                  <Hand className="w-6 h-6 animate-bounce" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                      Passenger Waved at Curb!
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Just now</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-black text-sm sm:text-base text-white truncate">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">Pickup: {activeToast.pickupLocation}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-300 mt-1">
                    <span className="font-semibold text-emerald-300">
                      ~{typeof activeToast.distanceMeters === "number"
                        ? Math.round(activeToast.distanceMeters) >= 1000
                          ? `${(activeToast.distanceMeters / 1000).toFixed(1)} km away`
                          : `${Math.round(activeToast.distanceMeters)}m away`
                        : "Nearby"}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">Audio chime & vibration active</span>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptics();
                  setActiveToast(null);
                }}
                className="p-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition shrink-0"
                aria-label="Dismiss toast"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Action Button */}
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 font-medium">
                Signal ready for curb pickup
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptics();
                  setActiveToast(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md active:scale-95 transition flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Acknowledge</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 2. FULL-SCREEN DRIVER LEAFLET MAP WITH DYNAMIC ROAD ROUTING           */}
      {/* ====================================================================== */}
      <section className="absolute inset-0 z-0 w-full h-full">
        <DriverLeafletMap
          driverLat={driverState.lat}
          driverLng={driverState.lng}
          vehicleType={driverState.type}
          destination={driverState.showDestination ? driverState.destination : null}
          routePolyline={driverState.showDestination ? driverState.routePolyline : null}
          pings={pings}
          isMinimized={false}
          recenterTrigger={recenterTrigger}
          zoomTrigger={zoomTrigger}
          mapTheme={mapTheme}
          onMapThemeChange={setMapTheme}
          className="w-full h-full"
        />
      </section>

      {/* ====================================================================== */}
      {/* 3. FLOATING MAP CONTROLS (COMPASS & ZOOM STACK)                        */}
      {/* ====================================================================== */}
      <div className="absolute bottom-[115px] sm:bottom-28 right-3 sm:right-4 z-20 flex flex-col gap-2 pointer-events-auto">
        {/* Re-center Compass Button */}
        <button
          onClick={() => setRecenterTrigger((prev) => prev + 1)}
          className="p-2.5 rounded-2xl bg-white/95 border border-emerald-200 text-emerald-700 shadow-md active:scale-90 transition flex items-center justify-center hover:bg-emerald-50"
          aria-label="Re-center map on vehicle"
          title="Re-center on vehicle"
        >
          <Compass className="w-4 h-4" />
        </button>

        {/* Zoom In Button */}
        <button
          type="button"
          onClick={() => setZoomTrigger((prev) => ({ action: "in", count: (prev?.count ?? 0) + 1 }))}
          className="w-9 h-9 rounded-2xl bg-white/95 border border-emerald-200 text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 shadow-md flex items-center justify-center font-bold text-base active:scale-90 transition select-none"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>

        {/* Zoom Out Button */}
        <button
          type="button"
          onClick={() => setZoomTrigger((prev) => ({ action: "out", count: (prev?.count ?? 0) + 1 }))}
          className="w-9 h-9 rounded-2xl bg-white/95 border border-emerald-200 text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 shadow-md flex items-center justify-center font-bold text-base active:scale-90 transition select-none"
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
      </div>

      {/* ====================================================================== */}
      {/* 4. FLOATING BOARD AND DROP THUMB CONTROLS (FULL MAP VISIBILITY)        */}
      {/* ====================================================================== */}
      <DriverCockpit
        occupancy={driverState.occupancy}
        maxCapacity={driverState.maxCapacity}
        handleDrop={handleDecrement}
        handleBoard={handleIncrement}
        triggerHaptics={triggerHaptics}
      />
    </main>
  );
}
