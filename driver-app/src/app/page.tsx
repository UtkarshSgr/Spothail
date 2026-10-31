"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { io, Socket } from "socket.io-client";
import { Navigation, Compass } from "lucide-react";
import {
  DriverState,
  CorridorDestination,
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
  const [isCockpitMinimized, setIsCockpitMinimized] = useState(false);
  const [pings, setPings] = useState<PassengerPing[]>([]);
  const [, setSocketConnected] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_SOCKET_SERVER_URL ||
    "http://localhost:4000";

  // Native Web Audio Dashboard Chime for passenger handwaves
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

  // ── OSRM Road Route Generation & Dynamic Rerouting ──────────────────────
  const regenerateRoute = useCallback(
    async (startCoords: { lat: number; lng: number }, dest: CorridorDestination) => {
      const route = await fetchOSRMRoute(startCoords, { lat: dest.lat, lng: dest.lng });
      setDriverState((prev) => ({
        ...prev,
        routePolyline: route.coordinates,
        etaMinutes: route.durationMinutes,
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

  // Handle incoming Passenger Handwave Ping
  const handleIncomingPing = useCallback(
    (pingData: { id: string; lat: number; lng: number; timestamp?: number }) => {
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
      if (driverState.isOnline) {
        socket.emit("driver:sync_status", driverState);
      }
    });

    socket.on("driver:ping_received", (data: { id: string; lat: number; lng: number }) => {
      handleIncomingPing(data);
    });

    socket.on("disconnect", () => setSocketConnected(false));

    return () => {
      socket.disconnect();
    };
  }, [backendUrl, handleIncomingPing]);

  // Broadcast Driver Telemetry (Position, Capacity, Occupancy, Route) in Real-Time
  useEffect(() => {
    if (socketRef.current?.connected && driverState.isOnline) {
      socketRef.current.emit("driver:sync_status", driverState);
    }
  }, [driverState]);

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
      {/* 1. TOP COMMAND BAR WITH PROMINENT "BROADCASTING GPS" TOGGLE            */}
      {/* ====================================================================== */}
      <DriverHeader
        isOnline={driverState.isOnline}
        setIsOnline={(val) => {
          triggerHaptics();
          setDriverState((prev) => ({ ...prev, isOnline: val }));
        }}
        vehicleType={driverState.type}
        setVehicleType={handleSetVehicleType}
        maxSeats={driverState.maxCapacity}
        setMaxSeats={handleSetCapacity}
        showDestination={driverState.showDestination}
        setShowDestination={(val) => {
          triggerHaptics();
          setDriverState((prev) => ({ ...prev, showDestination: val }));
        }}
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
      {/* 2. LIVE LEAFLET DRIVER MAP CANVAS WITH DYNAMIC ROAD ROUTING           */}
      {/* ====================================================================== */}
      <section
        className={`relative w-full overflow-hidden bg-slate-950 isolate transition-all duration-300 ease-in-out ${
          isCockpitMinimized ? "h-[calc(100%-4rem)]" : "h-[52%]"
        }`}
      >
        <DriverLeafletMap
          driverLat={driverState.lat}
          driverLng={driverState.lng}
          vehicleType={driverState.type}
          destination={driverState.showDestination ? driverState.destination : null}
          routePolyline={driverState.showDestination ? driverState.routePolyline : null}
          pings={pings}
          isMinimized={isCockpitMinimized}
          recenterTrigger={recenterTrigger}
          className="w-full h-full"
        />

        {/* Floating Active Corridor Badge in Map Area */}
        <div className="absolute bottom-3 left-3 right-3 pointer-events-none flex items-center justify-between">
          <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-700/80 shadow-xl flex items-center gap-2.5 max-w-[75%]">
            <Navigation className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                Active Road Route (OSRM)
              </span>
              <span className="text-xs font-black text-white truncate block">
                {driverState.showDestination && driverState.destination
                  ? `${driverState.destination.name} (${driverState.destination.via || "Direct"})`
                  : "Local / Free Roaming"}
              </span>
            </div>
          </div>

          {/* Re-center Map Button */}
          <button
            onClick={() => setRecenterTrigger((prev) => prev + 1)}
            className="pointer-events-auto p-2.5 rounded-2xl bg-slate-900/90 border border-slate-700 text-blue-400 shadow-xl active:scale-90 transition"
            aria-label="Re-center map on vehicle"
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
        etaMinutes={driverState.etaMinutes}
      />
    </main>
  );
}
