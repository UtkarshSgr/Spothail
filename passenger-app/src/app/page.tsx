"use client";

import React, { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Search,
  LocateFixed,
  MapPin,
  Navigation,
  Hand,
  CheckCircle2,
  X,
  Clock,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";
import {
  TransitVehicle,
  VehicleFilter,
  OccupancyFilter,
  getOccupancyStatus,
  getOccupancyTheme,
} from "@/types/spothail";
import { MOCK_TRANSIT_VEHICLES } from "@/lib/mockData";
import { fetchOSRMRoute, getDistanceMeters } from "@/lib/routing";
import socketService from "@/lib/socket";

// Dynamic import of LeafletMap (SSR-safe)
const LeafletMap = dynamic(
  () => import("@/components/LeafletMap").then((m) => m.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading map…</span>
      </div>
    ),
  }
);

// Default center: NIT Calicut
const DEFAULT_CENTER = { lat: 11.3216, lng: 75.9336 };

// Common corridor landmarks for 1-tap fast geocoding
const CAMPUS_LOCATIONS = [
  { id: "main-gate", text: "NIT Main Gate", center: [75.9336, 11.3216] },
  { id: "mbb-hostels", text: "Mega Boys Block (MBB)", center: [75.9315, 11.3175] },
  { id: "kattangal-jn", text: "Kattangal Junction", center: [75.9348, 11.3275] },
  { id: "central-library", text: "Central Library", center: [75.9392, 11.3228] },
  { id: "kunnamangalam", text: "Kunnamangalam", center: [75.8767, 11.3056] },
];

export default function PassengerAppPage() {
  const [userPos, setUserPos] = useState(DEFAULT_CENTER);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);

  // Map Theme state ("streets" | "dark" | "satellite")
  const [mapTheme, setMapTheme] = useState<"streets" | "dark" | "satellite">("streets");
  const [isMobileThemeOpen, setIsMobileThemeOpen] = useState(false);

  // Filters (Only Autos & E-Rickshaws)
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>("ALL");
  const [occupancyFilter, setOccupancyFilter] = useState<OccupancyFilter>("ALL");

  // Fleet state
  const [vehicles, setVehicles] = useState<TransitVehicle[]>(MOCK_TRANSIT_VEHICLES);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>("AUTO-02");
  const [pingedDrivers, setPingedDrivers] = useState<Record<string, boolean>>({});

  // Dynamic Polyline cache for tapped vehicles
  const [routePolylines, setRoutePolylines] = useState<Record<string, [number, number][]>>({});
  const [vehicleEtas, setVehicleEtas] = useState<Record<string, number>>({});

  // Desktop Nearby Fleet open state (default open)
  const [isFleetListOpen, setIsFleetListOpen] = useState(true);

  // Connect to Socket.io to receive live broadcasted drivers
  useEffect(() => {
    const socket = socketService.connect();

    socket.on("server:nearby_autos", (liveDrivers: any[]) => {
      if (!Array.isArray(liveDrivers)) return;
      setVehicles((prev) => {
        const liveMap = new Map(
          liveDrivers.map((d) => [
            d.driverId,
            {
              id: d.driverId,
              type: d.type || "AUTO",
              label: d.label || d.driverId,
              driverName: d.driverName || "Live Driver",
              registrationNumber: d.registrationNumber || "KL-11-LIVE",
              lat: d.lat,
              lng: d.lng,
              occupancy: d.occupancy ?? 0,
              maxCapacity: d.maxCapacity ?? 4,
              destination: d.destination,
              routePolyline: d.routePolyline,
              lastUpdated: Date.now(),
            } as TransitVehicle,
          ])
        );

        const updated = prev.filter((v) => !liveMap.has(v.id));
        return [...Array.from(liveMap.values()), ...updated];
      });
    });

    return () => {
      socket.off("server:nearby_autos");
    };
  }, []);

  // Ambient vehicle movement simulation for mock vehicles
  useEffect(() => {
    const interval = setInterval(() => {
      setVehicles((prev) =>
        prev.map((v) => {
          if (v.id.startsWith("AUTO-") || v.id.startsWith("ERICK-")) {
            return {
              ...v,
              lat: v.lat + (Math.random() - 0.49) * 0.00014,
              lng: v.lng + (Math.random() - 0.49) * 0.00014,
            };
          }
          return v;
        })
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Filtered vehicles within 2km with Haversine distance
  const filteredVehicles = useMemo(() => {
    return vehicles
      .map((v) => ({
        ...v,
        distanceMeters: getDistanceMeters(userPos.lat, userPos.lng, v.lat, v.lng),
      }))
      .filter((v) => (v.distanceMeters ?? 0) <= 2500)
      .filter((v) => {
        if (vehicleFilter === "AUTO" && v.type !== "AUTO") return false;
        if (vehicleFilter === "ERICKSHAW" && v.type !== "ERICKSHAW") return false;

        const status = getOccupancyStatus(v.occupancy, v.maxCapacity);
        if (occupancyFilter === "EMPTY" && status !== "EMPTY") return false;
        if (occupancyFilter === "HAS_SPACE" && status === "FULL") return false;

        return true;
      })
      .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  }, [vehicles, userPos, vehicleFilter, occupancyFilter]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId]
  );

  // Dynamic OSRM Route Generation when a vehicle is selected
  useEffect(() => {
    if (!selectedVehicle || !selectedVehicle.destination) return;

    if (selectedVehicle.routePolyline && selectedVehicle.routePolyline.length > 1) {
      setRoutePolylines((prev) => ({
        ...prev,
        [selectedVehicle.id]: selectedVehicle.routePolyline!,
      }));
      return;
    }

    const destLat = selectedVehicle.destination.lat ?? selectedVehicle.lat;
    const destLng = selectedVehicle.destination.lng ?? selectedVehicle.lng;

    let mounted = true;
    fetchOSRMRoute(
      { lat: selectedVehicle.lat, lng: selectedVehicle.lng },
      { lat: destLat, lng: destLng }
    ).then((route) => {
      if (!mounted) return;
      setRoutePolylines((prev) => ({
        ...prev,
        [selectedVehicle.id]: route.coordinates,
      }));
      setVehicleEtas((prev) => ({
        ...prev,
        [selectedVehicle.id]: route.durationMinutes,
      }));
    });

    return () => {
      mounted = false;
    };
  }, [selectedVehicle]);

  const activeRoutePolyline = selectedVehicle ? routePolylines[selectedVehicle.id] ?? null : null;

  // Search geocoder (Local chips + OpenStreetMap Nominatim)
  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setSearchSuggestions([]);
      return;
    }

    const lower = value.toLowerCase();
    const localMatches = CAMPUS_LOCATIONS.filter((loc) =>
      loc.text.toLowerCase().includes(lower)
    ).map((loc) => ({
      id: loc.id,
      text: loc.text,
      center: loc.center,
    }));

    if (localMatches.length > 0) {
      setSearchSuggestions(localMatches);
      return;
    }

    if (value.trim().length >= 3) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          value
        )}&format=json&limit=4&countrycodes=IN`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        const data = await res.json();
        setSearchSuggestions(
          (data || []).map((item: any) => ({
            id: String(item.place_id),
            text: item.display_name.split(",")[0],
            center: [parseFloat(item.lon), parseFloat(item.lat)],
          }))
        );
      } catch {
        setSearchSuggestions([]);
      }
    } else {
      setSearchSuggestions([]);
    }
  };

  const handleUseGPS = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSearchQuery("My Location (GPS)");
      },
      () => {},
      { enableHighAccuracy: true }
    );
  };

  // Optional Digital Wave (Signals driver on curb)
  const handleWaveAtDriver = (vehicleId: string) => {
    setPingedDrivers((prev) => ({ ...prev, [vehicleId]: true }));

    const socket = socketService.getSocket();
    if (socket?.connected) {
      socket.emit("passenger:ping_driver", {
        targetDriverId: vehicleId,
        passengerLat: userPos.lat,
        passengerLng: userPos.lng,
      });
    }

    setTimeout(() => {
      setPingedDrivers((prev) => ({ ...prev, [vehicleId]: false }));
    }, 25000);
  };

  // Shared Detail Card Component Content
  const renderVehicleDetailCard = (vehicle: TransitVehicle) => {
    const status = getOccupancyStatus(vehicle.occupancy, vehicle.maxCapacity);
    const theme = getOccupancyTheme(status);
    const etaMin =
      vehicleEtas[vehicle.id] ??
      vehicle.destination?.etaMinutes ??
      Math.max(1, Math.round((vehicle.distanceMeters ?? 400) / 250));

    return (
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-3xl p-4 shadow-2xl text-white">
        {/* Header: Vehicle icon, title, reg number, close */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl p-2 rounded-2xl bg-slate-800 border border-slate-700">
              {vehicle.type === "ERICKSHAW" ? "⚡" : "🛺"}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-white">{vehicle.label}</h2>
                {vehicle.registrationNumber && (
                  <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                    {vehicle.registrationNumber}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {vehicle.driverName || "Corridor Auto"} •{" "}
                <span className="capitalize">{vehicle.type.toLowerCase()}</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => setSelectedVehicleId(null)}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
            aria-label="Close vehicle card"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Strict 3-Color Occupancy Indicator Badge & Distance */}
        <div className="flex items-center justify-between gap-2 mb-3 bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{
                backgroundColor: theme.color,
                boxShadow: `0 0 10px ${theme.color}`,
              }}
            />
            <div>
              <span className={`text-xs font-black ${theme.textColor}`}>
                {theme.label} ({vehicle.occupancy}/{vehicle.maxCapacity} Seats)
              </span>
              <span className="text-[10px] text-slate-400 block leading-tight">
                {theme.advice}
              </span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-xs font-bold text-slate-200 flex items-center justify-end gap-1">
              <Clock className="w-3 h-3 text-blue-400" />
              <span>~{etaMin} min ETA</span>
            </span>
            <span className="text-[10px] text-slate-400">
              {vehicle.distanceMeters ?? 300}m away
            </span>
          </div>
        </div>

        {/* Route Path (Dynamic Polyline indicator) */}
        {vehicle.destination ? (
          <div className="p-2.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-indigo-200 flex items-start gap-2 mb-3">
            <Navigation className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-indigo-300 text-[11px] font-bold">Active Path Drawn on Map</span>
                <span className="text-[10px] bg-indigo-900/60 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-500/40 font-mono">
                  OSM Road Routing
                </span>
              </div>
              <strong className="text-white text-xs block mt-0.5">
                → {vehicle.destination.name}
              </strong>
              {vehicle.destination.via && (
                <span className="text-slate-400 text-[11px] block">
                  via {vehicle.destination.via}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic mb-3">
            Roaming locally along corridor
          </div>
        )}

        {/* Ping Driver: Optional Digital Wave CTA */}
        <button
          disabled={Boolean(pingedDrivers[vehicle.id])}
          onClick={() => handleWaveAtDriver(vehicle.id)}
          className={`w-full py-3 rounded-2xl font-black text-xs shadow-xl flex items-center justify-center gap-2 transition active:scale-95 ${
            pingedDrivers[vehicle.id]
              ? "bg-emerald-600 text-white"
              : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white"
          }`}
        >
          {pingedDrivers[vehicle.id] ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>Driver Signaled! Wave your hand when they approach 👋</span>
            </>
          ) : (
            <>
              <Hand className="w-4 h-4 text-amber-300" />
              <span>Wave at Driver (Signal Curb Pickup)</span>
            </>
          )}
        </button>
        <p className="text-[10px] text-slate-500 text-center mt-1.5 font-medium">
          No booking or payment needed • Acts like waving your arm from the curb
        </p>
      </div>
    );
  };

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-slate-950 font-sans select-none">
      {/* ====================================================================== */}
      {/* 1. FULL-SCREEN INTERACTIVE LEAFLET MAP                                 */}
      {/* ====================================================================== */}
      <main className="absolute inset-0 z-0">
        <LeafletMap
          initialCenter={DEFAULT_CENTER}
          center={userPos}
          userLocation={userPos}
          initialZoom={15}
          theme={mapTheme}
          activeRoutePolyline={activeRoutePolyline}
          onLocationChange={(latlng, label) => {
            setUserPos(latlng);
            setSearchQuery(label.split(",").slice(0, 2).join(",").trim());
          }}
          vehicles={filteredVehicles.map((v) => ({
            id: v.id,
            type: v.type,
            lat: v.lat,
            lng: v.lng,
            label: v.label,
            status: getOccupancyStatus(v.occupancy, v.maxCapacity),
            onClick: () => setSelectedVehicleId(v.id),
          }))}
          className="w-full h-full"
        />
      </main>

      {/* ====================================================================== */}
      {/* 2. MINIMALIST FLOATING TOP BAR & SEARCH                                 */}
      {/* ====================================================================== */}
      <header className="absolute top-3 left-3 right-14 sm:right-6 md:max-w-xl md:mx-auto z-30 pointer-events-none">
        <div className="pointer-events-auto flex flex-col gap-2">
          {/* Main Search Pill */}
          <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-1.5 shadow-2xl">
            <div className="flex items-center gap-1.5 pl-2.5 shrink-0">
              <span className="text-base font-black tracking-tight text-white">
                Spot<span className="text-blue-500">Hail</span>
              </span>
            </div>

            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Where are you standing? (e.g. Main Gate)..."
                className="w-full pl-8 pr-3 py-1.5 text-xs sm:text-sm bg-slate-950/80 text-white rounded-xl border border-slate-800 focus:outline-none focus:border-blue-500 transition placeholder:text-slate-500"
              />
            </div>

            {/* GPS Re-center */}
            <button
              onClick={handleUseGPS}
              title="Locate me with GPS"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition shrink-0 active:scale-95"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">GPS</span>
            </button>

            {/* Link to Driver Mode */}
            <a
              href="http://localhost:3001"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition shrink-0 flex items-center gap-1 shadow-sm"
              title="Open Driver Cockpit (Port 3001)"
            >
              <span>Driver</span>
              <ArrowUpRight className="w-3 h-3 text-slate-400" />
            </a>
          </div>

          {/* Search Suggestions Dropdown */}
          {searchSuggestions.length > 0 && (
            <div className="bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700 overflow-hidden divide-y divide-slate-800 max-h-48 overflow-y-auto">
              {searchSuggestions.map((place) => (
                <button
                  key={place.id}
                  onClick={() => {
                    const [lng, lat] = place.center;
                    setUserPos({ lat, lng });
                    setSearchQuery(place.text);
                    setSearchSuggestions([]);
                  }}
                  className="w-full text-left px-3.5 py-2.5 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 transition"
                >
                  <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="font-bold truncate">{place.text}</span>
                </button>
              ))}
            </div>
          )}

          {/* Quick Landmark Chips + Vehicle Filter Row */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
            {/* Quick Campus Chips */}
            <div className="flex items-center gap-1.5 shrink-0">
              {CAMPUS_LOCATIONS.slice(0, 3).map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => {
                    const [lng, lat] = loc.center;
                    setUserPos({ lat, lng });
                    setSearchQuery(loc.text);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-slate-900/85 backdrop-blur-md hover:bg-slate-800 text-slate-300 text-[11px] font-bold border border-slate-700/70 shadow-sm transition whitespace-nowrap"
                >
                  {loc.text}
                </button>
              ))}
            </div>

            {/* Vehicle Type Toggle: All / Autos / E-Rickshaws */}
            <div className="flex items-center bg-slate-900/90 backdrop-blur-md p-0.5 rounded-xl border border-slate-700/80 shadow-md shrink-0 text-[11px]">
              <button
                onClick={() => setVehicleFilter("ALL")}
                className={`px-2 py-0.5 rounded-lg font-bold transition ${
                  vehicleFilter === "ALL" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setVehicleFilter("AUTO")}
                className={`px-2 py-0.5 rounded-lg font-bold transition flex items-center gap-1 ${
                  vehicleFilter === "AUTO" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <span>🛺</span>
                <span className="hidden sm:inline">Autos</span>
              </button>
              <button
                onClick={() => setVehicleFilter("ERICKSHAW")}
                className={`px-2 py-0.5 rounded-lg font-bold transition flex items-center gap-1 ${
                  vehicleFilter === "ERICKSHAW" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <span>⚡</span>
                <span className="hidden sm:inline">E-Rick</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ====================================================================== */}
      {/* 3. TOP-RIGHT STACK: THEME SWITCHER (ABOVE) & OCCUPANCY LEGEND (BELOW)  */}
      {/* ====================================================================== */}
      {/* DESKTOP VIEW: Stacked on Top-Right */}
      <div className="hidden md:flex absolute top-3 right-6 z-30 flex-col items-end gap-2 pointer-events-auto">
        {/* Map Theme Switcher Pill (Streets / Dark / Satellite) */}
        <div className="flex items-center bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-xl text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setMapTheme("streets")}
            className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
              mapTheme === "streets"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
            title="OpenStreetMap Streets"
          >
            <span>🗺️</span>
            <span>Streets</span>
          </button>
          <button
            type="button"
            onClick={() => setMapTheme("dark")}
            className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
              mapTheme === "dark"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
            title="Dark Mode"
          >
            <span>🌙</span>
            <span>Dark</span>
          </button>
          <button
            type="button"
            onClick={() => setMapTheme("satellite")}
            className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
              mapTheme === "satellite"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
            title="Satellite Imagery"
          >
            <span>🛰️</span>
            <span>Satellite</span>
          </button>
        </div>

        {/* Strict 3-Color Occupancy Indicator Legend Pill */}
        <div className="flex items-center gap-3 text-[11px] font-bold bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-lg text-slate-300">
          <span className="flex items-center gap-1.5" title="Plenty of seats open">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            <span>Empty</span>
          </span>
          <span className="flex items-center gap-1.5" title="Has space, wave down!">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <span>Partly Full</span>
          </span>
          <span className="flex items-center gap-1.5" title="Full, don't bother waving">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            <span>Full</span>
          </span>
        </div>
      </div>

      {/* MOBILE VIEW: Collapsible Theme Switcher Button in Top-Right */}
      <div className="md:hidden absolute top-3 right-3 z-40">
        <button
          onClick={() => setIsMobileThemeOpen((prev) => !prev)}
          className="p-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-blue-400 shadow-2xl flex items-center justify-center active:scale-95 transition"
          aria-label="Toggle map layer style"
          title="Change map style"
        >
          <Layers className="w-4 h-4" />
        </button>

        {/* Mobile Dropdown Menu */}
        {isMobileThemeOpen && (
          <div className="absolute right-0 mt-2 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 min-w-[130px] animate-in fade-in slide-in-from-top-2">
            <span className="text-[10px] font-black text-slate-400 px-2 py-0.5 uppercase tracking-wider">
              Map Style
            </span>
            <button
              onClick={() => {
                setMapTheme("streets");
                setIsMobileThemeOpen(false);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold text-left transition flex items-center gap-2 ${
                mapTheme === "streets" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span>🗺️</span>
              <span>Streets</span>
            </button>
            <button
              onClick={() => {
                setMapTheme("dark");
                setIsMobileThemeOpen(false);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold text-left transition flex items-center gap-2 ${
                mapTheme === "dark" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span>🌙</span>
              <span>Dark</span>
            </button>
            <button
              onClick={() => {
                setMapTheme("satellite");
                setIsMobileThemeOpen(false);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold text-left transition flex items-center gap-2 ${
                mapTheme === "satellite" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span>🛰️</span>
              <span>Satellite</span>
            </button>
          </div>
        )}
      </div>

      {/* ====================================================================== */}
      {/* 4. DESKTOP LEFT DOCK: NEARBY FLEET (STRICTLY ABOVE DETAIL BOX) + CARD */}
      {/* ====================================================================== */}
      <div className="hidden lg:flex flex-col absolute top-20 left-6 bottom-4 z-30 w-[360px] pointer-events-none justify-end gap-3">
        {/* Nearby Fleet Box (Flexes to fill space strictly above the detail box) */}
        <div
          className={`pointer-events-auto flex flex-col bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden transition-all duration-200 ${
            isFleetListOpen ? "flex-1 min-h-[140px] max-h-full" : "h-12 shrink-0"
          }`}
        >
          {/* Header Toggle */}
          <button
            onClick={() => setIsFleetListOpen((prev) => !prev)}
            className="w-full px-4 py-3 flex items-center justify-between text-xs font-black text-white hover:bg-slate-800/60 transition shrink-0"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Nearby Fleet ({filteredVehicles.length})</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="text-[11px] font-mono">Within 2.5km</span>
              {isFleetListOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {/* Smooth Scrollable Vehicle List */}
          {isFleetListOpen && (
            <div className="p-2 space-y-1.5 overflow-y-auto divide-y divide-slate-800/60 flex-1 min-h-0">
              {filteredVehicles.map((v) => {
                const status = getOccupancyStatus(v.occupancy, v.maxCapacity);
                const theme = getOccupancyTheme(status);
                const isSelected = v.id === selectedVehicleId;

                return (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVehicleId(v.id)}
                    className={`p-2.5 rounded-2xl cursor-pointer transition border ${
                      isSelected
                        ? "bg-blue-950/70 border-blue-500 shadow-md"
                        : "bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{v.type === "ERICKSHAW" ? "⚡" : "🛺"}</span>
                        <span className="font-extrabold text-xs text-white">{v.label}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: theme.color }}
                        />
                        <span className={`text-[11px] font-bold ${theme.textColor}`}>
                          {theme.label} ({v.occupancy}/{v.maxCapacity})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{v.distanceMeters ?? 300}m away</span>
                      {v.destination?.name ? (
                        <span className="text-slate-300 font-medium truncate max-w-[140px]">
                          → {v.destination.name}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Roaming</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Vehicle Detail Box (Anchored directly beneath Nearby Fleet) */}
        {selectedVehicle && (
          <div className="pointer-events-auto shrink-0 animate-in slide-in-from-bottom-2 duration-200">
            {renderVehicleDetailCard(selectedVehicle)}
          </div>
        )}
      </div>

      {/* ====================================================================== */}
      {/* 5. MOBILE BOTTOM SHEET: SELECTED VEHICLE DETAIL CARD                   */}
      {/* ====================================================================== */}
      {selectedVehicle && (
        <div className="lg:hidden absolute bottom-3 left-3 right-3 z-30 animate-in slide-in-from-bottom-3 duration-200">
          {renderVehicleDetailCard(selectedVehicle)}
        </div>
      )}
    </div>
  );
}
