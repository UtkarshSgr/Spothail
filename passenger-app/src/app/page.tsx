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
} from "lucide-react";
import { TransitVehicle, VehicleFilter, OccupancyFilter, getOccupancyStatus } from "@/types/spothail";
import { MOCK_TRANSIT_VEHICLES } from "@/lib/mockData";

// Dynamic import of LeafletMap (SSR-safe, zero API key)
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

// Common corridor landmarks
const CAMPUS_LOCATIONS = [
  { id: "main-gate", text: "NIT Main Gate", center: [75.9336, 11.3216] },
  { id: "mbb-hostels", text: "Mega Boys Block (MBB)", center: [75.9315, 11.3175] },
  { id: "kattangal-jn", text: "Kattangal Junction", center: [75.9348, 11.3275] },
  { id: "central-library", text: "Central Library", center: [75.9392, 11.3228] },
  { id: "kunnamangalam", text: "Kunnamangalam", center: [75.8767, 11.3056] },
];

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

export default function PassengerAppPage() {
  const [userPos, setUserPos] = useState(DEFAULT_CENTER);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);

  // Filters
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>("ALL");
  const [occupancyFilter, setOccupancyFilter] = useState<OccupancyFilter>("ALL");

  // Vehicles state
  const [vehicles, setVehicles] = useState<TransitVehicle[]>(MOCK_TRANSIT_VEHICLES);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>("AUTO-02");
  const [pingedDrivers, setPingedDrivers] = useState<Record<string, boolean>>({});

  // Simulated vehicle movement along the corridor
  useEffect(() => {
    const interval = setInterval(() => {
      setVehicles((prev) =>
        prev.map((v) => ({
          ...v,
          lat: v.lat + (Math.random() - 0.49) * 0.00015,
          lng: v.lng + (Math.random() - 0.49) * 0.00015,
        }))
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Filtered vehicles within 2km with calculated distances
  const filteredVehicles = useMemo(() => {
    return vehicles
      .map((v) => ({
        ...v,
        distanceMeters: getDistanceMeters(userPos.lat, userPos.lng, v.lat, v.lng),
      }))
      .filter((v) => (v.distanceMeters ?? 0) <= 2000)
      .filter((v) => {
        if (vehicleFilter === "AUTO" && v.type !== "AUTO") return false;
        if (vehicleFilter === "BUS" && v.type !== "BUS") return false;

        const status = getOccupancyStatus(v.occupancy, v.maxCapacity);
        if (occupancyFilter === "EMPTY" && status !== "EMPTY") return false;
        if (occupancyFilter === "HAS_SPACE" && status === "FULL") return false;

        return true;
      });
  }, [vehicles, userPos, vehicleFilter, occupancyFilter]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId]
  );

  // Active route polyline to draw on the map when a vehicle is tapped
  const activeRoutePolyline = useMemo(() => {
    if (!selectedVehicle || !selectedVehicle.destination) return null;
    const destLat = selectedVehicle.destination.lat ?? selectedVehicle.lat;
    const destLng = selectedVehicle.destination.lng ?? selectedVehicle.lng;

    // Draw route connecting vehicle to its destination
    return [
      [selectedVehicle.lng, selectedVehicle.lat],
      [(selectedVehicle.lng + destLng) / 2 + 0.0004, (selectedVehicle.lat + destLat) / 2 - 0.0003],
      [destLng, destLat],
    ] as [number, number][];
  }, [selectedVehicle]);

  // Search handler (local campus chips + OpenStreetMap Nominatim geocoding)
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
      },
      () => {},
      { enableHighAccuracy: true }
    );
  };

  const handlePingDriver = (vehicleId: string) => {
    setPingedDrivers((prev) => ({ ...prev, [vehicleId]: true }));
    setTimeout(() => {
      setPingedDrivers((prev) => ({ ...prev, [vehicleId]: false }));
    }, 20000);
  };

  return (
    <div className="w-full h-screen flex flex-col bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      {/* ── MINIMAL TOP BAR ─────────────────────────────────────────────────── */}
      <header className="h-14 w-full bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 md:px-6 flex items-center justify-between shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-black tracking-tight text-white">
              Spot<span className="text-blue-500">Hail</span>
            </span>
          </div>
          <span className="text-xs text-slate-400 hidden sm:inline border-l border-slate-700 pl-3">
            Live local transit • No booking
          </span>
        </div>

        {/* Legend & Driver HUD link */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-3 text-xs text-slate-300 font-semibold bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Empty</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
              <span>Partly Full</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>Full</span>
            </span>
          </div>

          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition shadow-sm"
          >
            <span>Driver Mode</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>
      </header>

      {/* ── MAIN RESPONSIVE SPLIT ────────────────────────────────────────────── */}
      <div className="flex-1 w-full flex flex-col lg:flex-row overflow-hidden relative">
        {/* LEFT MINIMAL SIDEBAR (Fleet & Search) */}
        <aside className="w-full lg:w-[420px] h-full flex flex-col bg-slate-900 border-r border-slate-800 shrink-0 z-20 overflow-hidden shadow-xl">
          {/* Search Location Bar */}
          <div className="p-3 border-b border-slate-800 bg-slate-900">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Where are you standing? (e.g. Main Gate)..."
                className="w-full pl-9 pr-16 py-2 text-xs sm:text-sm bg-slate-950 text-white rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500 transition"
              />
              <button
                onClick={handleUseGPS}
                className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>GPS</span>
              </button>
            </div>

            {/* Quick Campus Chips */}
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto no-scrollbar">
              {CAMPUS_LOCATIONS.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => {
                    const [lng, lat] = loc.center;
                    setUserPos({ lat, lng });
                    setSearchQuery(loc.text);
                    setSearchSuggestions([]);
                  }}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700/60 transition"
                >
                  {loc.text}
                </button>
              ))}
            </div>

            {/* Suggestions */}
            {searchSuggestions.length > 0 && (
              <div className="mt-2 bg-slate-950 rounded-xl shadow-xl border border-slate-700 overflow-hidden divide-y divide-slate-800">
                {searchSuggestions.map((place) => (
                  <button
                    key={place.id}
                    onClick={() => {
                      const [lng, lat] = place.center;
                      setUserPos({ lat, lng });
                      setSearchQuery(place.text);
                      setSearchSuggestions([]);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2 transition"
                  >
                    <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="font-bold text-white truncate">{place.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Simple Clean Filter Pill */}
          <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between gap-2 text-xs">
            {/* Vehicle Type Toggle */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setVehicleFilter("ALL")}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  vehicleFilter === "ALL" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setVehicleFilter("AUTO")}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                  vehicleFilter === "AUTO" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <span>🛺</span> Autos
              </button>
              <button
                onClick={() => setVehicleFilter("BUS")}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                  vehicleFilter === "BUS" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <span>🚌</span> Buses
              </button>
            </div>

            {/* Occupancy Filter */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOccupancyFilter(occupancyFilter === "EMPTY" ? "ALL" : "EMPTY")}
                className={`px-2.5 py-1 rounded-lg font-bold border transition ${
                  occupancyFilter === "EMPTY"
                    ? "bg-emerald-600 text-white border-emerald-500"
                    : "bg-slate-800 text-slate-300 border-slate-700"
                }`}
              >
                Empty
              </button>
              <button
                onClick={() => setOccupancyFilter(occupancyFilter === "HAS_SPACE" ? "ALL" : "HAS_SPACE")}
                className={`px-2.5 py-1 rounded-lg font-bold border transition ${
                  occupancyFilter === "HAS_SPACE"
                    ? "bg-yellow-600 text-white border-yellow-500"
                    : "bg-slate-800 text-slate-300 border-slate-700"
                }`}
              >
                Has Space
              </button>
            </div>
          </div>

          {/* Selected Vehicle Card (Shows Route on tap) */}
          {selectedVehicle && (
            <div className="p-4 border-b border-slate-800 bg-slate-950 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl p-1.5 rounded-xl bg-slate-800 border border-slate-700">
                    {selectedVehicle.type === "BUS" ? "🚌" : "🛺"}
                  </span>
                  <div>
                    <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <span>{selectedVehicle.label}</span>
                      {selectedVehicle.registrationNumber && (
                        <span className="font-mono text-[10px] text-slate-400">
                          {selectedVehicle.registrationNumber}
                        </span>
                      )}
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      {selectedVehicle.driverName || "Corridor Stand"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedVehicleId(null)}
                  className="p-1 rounded-full text-slate-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status Pill & Distance */}
              <div className="flex items-center gap-2 mb-2.5">
                {(() => {
                  const status = getOccupancyStatus(selectedVehicle.occupancy, selectedVehicle.maxCapacity);
                  let colorClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
                  let text = "Partly Full (Seats Open)";
                  if (status === "EMPTY") {
                    colorClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
                    text = "Empty (Ready to board)";
                  } else if (status === "FULL") {
                    colorClass = "bg-rose-500/10 text-rose-400 border-rose-500/30";
                    text = "Full (No seats)";
                  }

                  return (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${colorClass}`}>
                      {text}
                    </span>
                  );
                })()}

                <span className="text-xs text-slate-400 flex items-center gap-1 font-semibold">
                  <Clock className="w-3 h-3 text-blue-400" />
                  <span>{selectedVehicle.distanceMeters ?? 300}m away</span>
                </span>
              </div>

              {/* Route Path Notice */}
              {selectedVehicle.destination ? (
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-start gap-2 mb-3">
                  <Navigation className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-slate-400">Heading to: </span>
                    <strong className="text-white">{selectedVehicle.destination.name}</strong>
                    {selectedVehicle.destination.via && (
                      <span className="text-slate-400 block text-[11px] mt-0.5">
                        via {selectedVehicle.destination.via}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic mb-3">Roaming locally along corridor</div>
              )}

              {/* Digital Wave (Flag Down) CTA */}
              <button
                disabled={Boolean(pingedDrivers[selectedVehicle.id])}
                onClick={() => handlePingDriver(selectedVehicle.id)}
                className={`w-full py-2.5 rounded-xl font-bold text-xs shadow-lg flex items-center justify-center gap-2 transition ${
                  pingedDrivers[selectedVehicle.id]
                    ? "bg-emerald-600 text-white"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}
              >
                {pingedDrivers[selectedVehicle.id] ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>Driver Flagged! Wave when vehicle approaches</span>
                  </>
                ) : (
                  <>
                    <Hand className="w-4 h-4 text-yellow-300" />
                    <span>Flag Down Vehicle (Wave Hand)</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* List of Vehicles Nearby (2km) */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800 p-2 space-y-1.5">
            <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Nearby ({filteredVehicles.length})</span>
              <span>Within 2 km</span>
            </div>

            {filteredVehicles.map((v) => {
              const status = getOccupancyStatus(v.occupancy, v.maxCapacity);
              const isSelected = v.id === selectedVehicleId;
              let dotColor = "bg-yellow-400";
              if (status === "EMPTY") dotColor = "bg-emerald-400";
              else if (status === "FULL") dotColor = "bg-rose-400";

              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVehicleId(v.id)}
                  className={`p-3 rounded-xl cursor-pointer transition border ${
                    isSelected
                      ? "bg-blue-950/50 border-blue-500 shadow-md"
                      : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-850"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{v.type === "BUS" ? "🚌" : "🛺"}</span>
                      <span className="font-extrabold text-sm text-white">{v.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <span className="text-xs font-bold text-slate-300 capitalize">
                        {status === "EMPTY" ? "Empty" : status === "FULL" ? "Full" : "Partly Full"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{v.distanceMeters ?? 300}m away</span>
                    {v.destination?.name ? (
                      <span className="text-slate-300 font-medium truncate max-w-[180px]">
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
        </aside>

        {/* RIGHT MAIN MAP (100% Focused Interactive OpenStreetMap) */}
        <main className="flex-1 h-full relative overflow-hidden bg-[#030712]">
          <LeafletMap
            initialCenter={DEFAULT_CENTER}
            center={userPos}
            userLocation={userPos}
            initialZoom={15}
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
      </div>
    </div>
  );
}
