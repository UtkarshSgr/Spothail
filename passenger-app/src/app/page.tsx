"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
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
  ChevronDown,
  Layers,
  CarFront,
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
  { id: "mbh-hostel", text: "MBH Hostel", center: [75.9315, 11.3175] },
  { id: "main-gate", text: "NIT Main Gate", center: [75.9336, 11.3216] },
  { id: "mbb-hostels", text: "Mega Boys Block (MBB)", center: [75.9315, 11.3175] },
  { id: "kattangal-jn", text: "Kattangal Junction", center: [75.9348, 11.3275] },
  { id: "central-library", text: "Central Library", center: [75.9392, 11.3228] },
  { id: "kunnamangalam", text: "Kunnamangalam", center: [75.8767, 11.3056] },
];

export default function PassengerAppPage() {
  const [userPos, setUserPos] = useState(DEFAULT_CENTER);
  const [selectedPickupLocation, setSelectedPickupLocation] = useState<string>("MBH Hostel");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);

  // Map Theme state ("streets" | "dark" | "satellite")
  const [mapTheme, setMapTheme] = useState<"streets" | "dark" | "satellite">("streets");
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  // Collapsible Nearby Fleet column state
  const [isFleetOpen, setIsFleetOpen] = useState(false);

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

  // Refs for click-outside auto-collapse
  const fleetRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Global click-away / click-outside listener to auto-collapse open menus
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | PointerEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      // When clicking outside the open Nearby Fleet menu, collapse it
      if (isFleetOpen && fleetRef.current && !fleetRef.current.contains(target)) {
        setIsFleetOpen(false);
      }

      // When clicking outside the open Map Layer dropdown, collapse it
      if (isThemeMenuOpen && themeMenuRef.current && !themeMenuRef.current.contains(target)) {
        setIsThemeMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isFleetOpen, isThemeMenuOpen]);


  // Connect to Socket.io to receive live broadcasted drivers and status changes
  useEffect(() => {
    const socket = socketService.connect();

    socket.on("server:nearby_autos", (liveDrivers: any[]) => {
      if (!Array.isArray(liveDrivers)) return;
      setVehicles((prev) => {
        const liveMap = new Map(
          liveDrivers
            .filter((d) => d.status === "ONLINE" || (d.status !== "OFFLINE" && d.isOnline !== false && d.isPublic !== false))
            .map((d) => [
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
                destination: d.destination || (d.campusLocation ? { name: d.campusLocation } : undefined),
                routePolyline: d.routePolyline,
                lastUpdated: Date.now(),
                status: "ONLINE",
                isOnline: true,
                isPublic: true,
              } as TransitVehicle,
            ])
        );

        // Keep mock vehicles that are not in liveDrivers. Any live driver not in liveMap is offline!
        const MOCK_IDS = new Set(["AUTO-01", "AUTO-02", "ERICK-01"]);
        const updated = prev.filter((v) => MOCK_IDS.has(v.id) && !liveMap.has(v.id));
        return [...Array.from(liveMap.values()), ...updated];
      });
    });

    // Requirement 2: Listen for real-time DRIVER_STATUS_CHANGE broadcasts
    socket.on("DRIVER_STATUS_CHANGE", (data: any) => {
      if (!data?.driverId) return;
      console.log("[Passenger App] Real-time DRIVER_STATUS_CHANGE broadcast:", data);

      if (data.status === "OFFLINE" || data.isOnline === false || data.isPublic === false) {
        // Vehicle went offline -> immediately remove marker from active map state array so the vehicle disappears instantly
        setVehicles((prev) => prev.filter((v) => v.id !== data.driverId));
        setSelectedVehicleId((prevId) => (prevId === data.driverId ? null : prevId));
      } else if (data.status === "ONLINE" || data.isPublic === true) {
        // Vehicle went online -> dynamically render vehicle in fleet
        setVehicles((prev) => {
          const updatedVehicle: TransitVehicle = {
            id: data.driverId,
            type: data.type || "AUTO",
            label: data.label || data.driverId,
            driverName: data.driverName || "Live Driver",
            registrationNumber: data.registrationNumber || "KL-11-LIVE",
            lat: data.lat ?? DEFAULT_CENTER.lat,
            lng: data.lng ?? DEFAULT_CENTER.lng,
            occupancy: data.occupancy ?? 0,
            maxCapacity: data.maxCapacity ?? 4,
            destination:
              data.destination || (data.campusLocation ? { name: data.campusLocation } : undefined),
            routePolyline: data.routePolyline,
            lastUpdated: Date.now(),
            status: "ONLINE",
            isOnline: true,
            isPublic: true,
          };
          const filtered = prev.filter((v) => v.id !== data.driverId);
          return [updatedVehicle, ...filtered];
        });
      }
    });

    return () => {
      socket.off("server:nearby_autos");
      socket.off("DRIVER_STATUS_CHANGE");
    };
  }, []);

  // Continuous smooth road path traversal simulation for mock vehicles
  useEffect(() => {
    const interval = setInterval(() => {
      setVehicles((prev) =>
        prev.map((v) => {
          if (!v.pathWaypoints || v.pathWaypoints.length < 2) {
            return v;
          }

          const waypoints = v.pathWaypoints;
          const idx = v.pathIndex ?? 0;
          // Step to next micro-waypoint along the multi-corridor circuit
          const nextIdx = (idx + 1) % waypoints.length;

          // Dynamically resolve target destination from circuit milestones
          let destination = v.destination;
          if (v.circuitMilestones && v.circuitMilestones.length > 0) {
            const nextMilestone =
              v.circuitMilestones.find((m) => m.index >= nextIdx) ||
              v.circuitMilestones[0];
            if (nextMilestone) {
              destination = nextMilestone.destination;
            }
          }

          const [nextLng, nextLat] = waypoints[nextIdx];
          const [currLng, currLat] = waypoints[idx];

          // Calculate heading angle in degrees (0 = North)
          const dLng = nextLng - currLng;
          const dLat = nextLat - currLat;
          let heading = v.heading ?? 0;
          if (Math.abs(dLng) > 0.000005 || Math.abs(dLat) > 0.000005) {
            heading = Math.round((Math.atan2(dLng, dLat) * 180) / Math.PI);
            if (heading < 0) heading += 360;
          }

          return {
            ...v,
            lat: nextLat,
            lng: nextLng,
            heading,
            pathIndex: nextIdx,
            destination,
            lastUpdated: Date.now(),
          };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Filtered vehicles within 2.5km with Haversine distance
  // Ensure ONLY drivers with status === 'ONLINE' (or isPublic: true) are rendered
  const filteredVehicles = useMemo(() => {
    return vehicles
      .filter((v) => {
        if (v.status && v.status !== "ONLINE") return false;
        if (v.isOnline === false) return false;
        if (v.isPublic === false) return false;
        return true;
      })
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

  // Dynamic Route Generation for live drivers (mock vehicles use real OSRM circuit waypoints)
  useEffect(() => {
    if (!selectedVehicle || !selectedVehicle.destination) return;

    // Mock vehicles already possess their real OSRM road coordinates
    if (selectedVehicle.pathWaypoints && selectedVehicle.pathWaypoints.length > 1) {
      return;
    }

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
  }, [selectedVehicle?.id, selectedVehicle?.destination?.name]);

  // Active Purple Route Polyline on Map:
  // For mock vehicles, draws the remaining real-road path directly ahead of the vehicle to its destination!
  const activeRoutePolyline = useMemo(() => {
    if (!selectedVehicle) return null;

    if (selectedVehicle.pathWaypoints && selectedVehicle.pathWaypoints.length > 1) {
      const waypoints = selectedVehicle.pathWaypoints;
      const currIdx = selectedVehicle.pathIndex ?? 0;

      let targetIdx = waypoints.length - 1;
      if (selectedVehicle.circuitMilestones && selectedVehicle.circuitMilestones.length > 0) {
        const nextMilestone =
          selectedVehicle.circuitMilestones.find((m) => m.index >= currIdx) ||
          selectedVehicle.circuitMilestones[0];
        if (nextMilestone) {
          targetIdx = nextMilestone.index;
        }
      }

      if (targetIdx >= currIdx) {
        return waypoints.slice(currIdx, targetIdx + 1);
      } else {
        return [...waypoints.slice(currIdx), ...waypoints.slice(0, targetIdx + 1)];
      }
    }

    if (selectedVehicle.routePolyline && selectedVehicle.routePolyline.length > 1) {
      return selectedVehicle.routePolyline;
    }

    return routePolylines[selectedVehicle.id] ?? null;
  }, [selectedVehicle, routePolylines]);

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

  // Requirement 3: Live Passenger Ping & Driver Notification
  const handleWaveAtDriver = (vehicleId: string) => {
    setPingedDrivers((prev) => ({ ...prev, [vehicleId]: true }));

    const socket = socketService.connect();
    const pickupLoc = selectedPickupLocation || "MBH Hostel";
    const pingPayload = {
      id: `PING-${Date.now()}`,
      driverId: vehicleId,
      targetDriverId: vehicleId,
      pickupLocation: pickupLoc,
      passengerLat: userPos.lat,
      passengerLng: userPos.lng,
      lat: userPos.lat,
      lng: userPos.lng,
      timestamp: Date.now(),
    };

    console.log(`[PASSENGER_PING] Sending ping to driver ${vehicleId} at pickup "${pickupLoc}"`);
    socket.emit("PASSENGER_PING", pingPayload);
    socket.emit("passenger:ping_driver", pingPayload);

    setTimeout(() => {
      setPingedDrivers((prev) => ({ ...prev, [vehicleId]: false }));
    }, 25000);
  };

  // Shared Vehicle Detail Content
  const renderVehicleDetailContent = (vehicle: TransitVehicle, onClose?: () => void) => {
    const status = getOccupancyStatus(vehicle.occupancy, vehicle.maxCapacity);
    const theme = getOccupancyTheme(status);
    const etaMin =
      vehicleEtas[vehicle.id] ??
      vehicle.destination?.etaMinutes ??
      Math.max(1, Math.round((vehicle.distanceMeters ?? 400) / 250));

    return (
      <div className="flex flex-col gap-2.5">
        {/* Header: Vehicle icon, title, reg number, close */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-sm">
              <img
                src={vehicle.type === "ERICKSHAW" ? "/icons/erickshaw.jpg" : "/icons/auto.jpg"}
                alt={vehicle.label}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-black text-slate-900 truncate">{vehicle.label}</h2>
                {vehicle.registrationNumber && (
                  <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                    {vehicle.registrationNumber}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate">
                {vehicle.driverName || "Corridor Auto"} •{" "}
                <span className="capitalize">{vehicle.type.toLowerCase()}</span>
              </p>
              {/* Destination cleanly integrated under vehicle header */}
              {vehicle.destination ? (
                <p className="text-xs text-emerald-800 font-bold truncate flex items-center gap-1 mt-0.5">
                  <Navigation className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="truncate">→ {vehicle.destination.name}</span>
                  {vehicle.destination.via && (
                    <span className="text-slate-500 font-normal text-[10px] truncate">
                      (via {vehicle.destination.via})
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 italic mt-0.5">
                  Roaming locally along corridor
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => {
              if (onClose) onClose();
              else setSelectedVehicleId(null);
            }}
            className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition shrink-0"
            aria-label="Close vehicle card"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selected Pickup Location Selector */}
        <div className="flex items-center justify-between gap-2 bg-[#f0fbf5] p-2.5 rounded-2xl border border-emerald-200/90 my-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-emerald-100/90 border border-emerald-300 flex items-center justify-center text-emerald-800 shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-500 block leading-none">
                Pickup Location
              </span>
              <span className="text-xs font-black text-slate-900 truncate block mt-0.5">
                {selectedPickupLocation}
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <select
              value={selectedPickupLocation}
              onChange={(e) => {
                const nextVal = e.target.value;
                setSelectedPickupLocation(nextVal);
                const found = CAMPUS_LOCATIONS.find((c) => c.text === nextVal);
                if (found) {
                  setUserPos({ lat: found.center[1], lng: found.center[0] });
                }
              }}
              className="text-xs font-bold text-emerald-950 bg-white border border-emerald-300 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 shadow-xs cursor-pointer"
            >
              {CAMPUS_LOCATIONS.map((loc) => (
                <option key={loc.id} value={loc.text}>
                  {loc.text}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Occupancy Indicator Badge & Distance */}
        <div className="flex items-center justify-between gap-2 bg-[#f0fdf4] p-2.5 rounded-2xl border border-emerald-200/90 my-0.5">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{
                backgroundColor: theme.color,
                boxShadow: `0 0 6px ${theme.color}`,
              }}
            />
            <div>
              <span className="text-xs font-black text-emerald-950">
                {theme.label} ({vehicle.occupancy}/{vehicle.maxCapacity} Seats)
              </span>
              <span className="text-[10px] text-emerald-700 block leading-tight font-medium">
                {theme.advice}
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 font-extrabold text-xs border border-emerald-300 shadow-xs inline-flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-emerald-700" />
              <span>{vehicle.distanceMeters ?? 300}m away</span>
            </span>
          </div>
        </div>

        {/* Primary Call-To-Action (CTA): Wave at Driver */}
        <div>
          <button
            disabled={Boolean(pingedDrivers[vehicle.id])}
            onClick={() => handleWaveAtDriver(vehicle.id)}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs tracking-wide shadow-md flex items-center justify-center gap-2 transition active:scale-[0.98] ${
              pingedDrivers[vehicle.id]
                ? "bg-teal-700 text-white shadow-teal-700/20"
                : "bg-[#059669] hover:bg-[#047857] text-white shadow-emerald-700/20"
            }`}
          >
            {pingedDrivers[vehicle.id] ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                <span>Driver Signaled at {selectedPickupLocation}!</span>
              </>
            ) : (
              <>
                <Hand className="w-4 h-4 text-amber-200" />
                <span>Wave at Driver (Signal Curb Pickup at {selectedPickupLocation})</span>
              </>
            )}
          </button>
          <p className="text-[10px] text-slate-500 text-center mt-1.5 font-medium">
            Signals driver for curb pickup • No booking needed
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-[#f0fbf5] font-sans select-none">
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
          onMapClick={() => {
            setIsFleetOpen(false);
            setIsThemeMenuOpen(false);
          }}
          onLocationChange={(latlng, label) => {
            setUserPos(latlng);
            setSearchQuery(label.split(",").slice(0, 2).join(",").trim());
          }}
          onDriverStatusChange={(data) => {
            if (data?.driverId && (data.status === "OFFLINE" || data.isOnline === false || data.isPublic === false)) {
              setVehicles((prev) => prev.filter((v) => v.id !== data.driverId));
              setSelectedVehicleId((prevId) => (prevId === data.driverId ? null : prevId));
            }
          }}
          vehicles={filteredVehicles.map((v) => ({
            id: v.id,
            type: v.type,
            lat: v.lat,
            lng: v.lng,
            label: v.label,
            status: getOccupancyStatus(v.occupancy, v.maxCapacity),
            driverStatus: v.status || "ONLINE",
            isOnline: v.isOnline !== false,
            isPublic: v.isPublic !== false,
            onClick: () => {
              setSelectedVehicleId(v.id);
            },
          }))}
          className="w-full h-full"
        />
      </main>

      {/* ====================================================================== */}
      {/* 2. MINIMALIST FLOATING TOP BAR & SEARCH                                 */}
      {/* ====================================================================== */}
      <header className="absolute top-3 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[500px] z-50 pointer-events-none">
        <div className="pointer-events-auto flex flex-col gap-1.5">
          {/* Main Search & Action Bar */}
          <div className="flex items-center gap-2 bg-white/90 backdrop-blur-2xl border border-emerald-200/90 rounded-2xl p-1.5 shadow-md">
            <div className="flex items-center gap-1 pl-2 shrink-0">
              <span className="text-sm font-black tracking-tight text-slate-900">
                Spot<span className="text-emerald-600">Hail</span>
              </span>
            </div>

            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search destination..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-emerald-50/50 text-slate-900 rounded-xl border border-emerald-100 focus:outline-none focus:border-emerald-500 transition placeholder:text-slate-400 font-medium"
              />
            </div>

            {/* GPS & Layer Stack Controls Group */}
            <div className="flex items-center gap-2 shrink-0">
              {/* GPS Re-center */}
              <button
                onClick={handleUseGPS}
                title="Locate me with GPS"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 border border-blue-200 shadow-sm transition shrink-0 active:scale-95 flex items-center justify-center"
              >
                <LocateFixed className="w-3.5 h-3.5" />
              </button>

              {/* Consolidated Circular Layer-Stack Icon Button */}
              <div ref={themeMenuRef} className="relative shrink-0">
                <button
                  onClick={() => setIsThemeMenuOpen((prev) => !prev)}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border shadow-sm flex items-center justify-center active:scale-95 transition-all ${
                    isThemeMenuOpen
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-emerald-600/25 ring-2 ring-emerald-200"
                      : "bg-white/95 backdrop-blur-2xl border-emerald-200/90 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900"
                  }`}
                  aria-label="Toggle map layer style"
                  title="Change map style"
                >
                  <Layers className="w-3.5 h-3.5 stroke-[2.2]" />
                </button>

                {/* Dropdown Menu (Streets / Dark / Satellite) */}
                {isThemeMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-50"
                      onClick={() => setIsThemeMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 bg-white/95 backdrop-blur-2xl border border-emerald-200 rounded-2xl p-1.5 shadow-xl flex flex-col gap-1 min-w-[130px] animate-in fade-in slide-in-from-top-2 z-[60]">
                      <span className="text-[10px] font-black text-emerald-800/70 px-2 py-0.5 uppercase tracking-wider">
                        Map Style
                      </span>
                      <button
                        onClick={() => {
                          setMapTheme("streets");
                          setIsThemeMenuOpen(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold text-left transition ${
                          mapTheme === "streets" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-700 hover:bg-emerald-50"
                        }`}
                      >
                        Streets
                      </button>
                      <button
                        onClick={() => {
                          setMapTheme("dark");
                          setIsThemeMenuOpen(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold text-left transition ${
                          mapTheme === "dark" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-700 hover:bg-emerald-50"
                        }`}
                      >
                        Dark
                      </button>
                      <button
                        onClick={() => {
                          setMapTheme("satellite");
                          setIsThemeMenuOpen(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold text-left transition ${
                          mapTheme === "satellite" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-700 hover:bg-emerald-50"
                        }`}
                      >
                        Satellite
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Search Suggestions Dropdown */}
          {searchSuggestions.length > 0 && (
            <div className="bg-white/95 backdrop-blur-2xl rounded-2xl shadow-xl border border-emerald-200 overflow-hidden divide-y divide-emerald-100 max-h-48 overflow-y-auto">
              {searchSuggestions.map((place) => (
                <button
                  key={place.id}
                  onClick={() => {
                    const [lng, lat] = place.center;
                    setUserPos({ lat, lng });
                    setSearchQuery(place.text);
                    setSelectedPickupLocation(place.text);
                    setSearchSuggestions([]);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-800 hover:bg-emerald-50 flex items-center gap-2.5 transition"
                >
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-semibold truncate">{place.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ====================================================================== */}
      {/* 3. TOP-RIGHT CONTROLS: OCCUPANCY LEGEND                                */}
      {/* ====================================================================== */}
      <div className="hidden sm:flex absolute top-3 right-4 z-40 items-center gap-2 pointer-events-auto">
        {/* Strict 3-Color Occupancy Indicator Legend Pill */}
        <div className="flex items-center gap-2.5 text-[11px] font-bold bg-white/90 backdrop-blur-2xl px-3.5 py-1.5 rounded-full border border-emerald-200/90 shadow-md text-slate-700">
          <span className="flex items-center gap-1.5" title="Plenty of seats open">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            <span>Empty</span>
          </span>
          <span className="flex items-center gap-1.5" title="Has space, wave down!">
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
            <span>Partly Full</span>
          </span>
          <span className="flex items-center gap-1.5" title="Full, don't bother waving">
            <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
            <span>Full</span>
          </span>
        </div>
      </div>

      {/* ====================================================================== */}
      {/* 4. COLLAPSIBLE NEARBY FLEET COLUMN (ALIGNED TO LEFT OF SEARCH BOX)     */}
      {/* ====================================================================== */}
      <div
        ref={fleetRef}
        className="absolute top-16 left-4 sm:top-3 sm:left-6 z-30 w-[calc(100vw-2rem)] sm:w-[340px] pointer-events-auto"
      >
        <div className="flex flex-col bg-[#f0fbf5]/95 backdrop-blur-2xl border border-emerald-200/90 rounded-3xl shadow-xl overflow-hidden transition-all duration-300">
          {/* Column Header (Click to drop down or collapse) */}
          <button
            onClick={() => setIsFleetOpen((prev) => !prev)}
            className="w-full h-11 px-3.5 flex items-center justify-between text-xs font-black text-slate-900 hover:bg-white/60 transition select-none cursor-pointer group"
            aria-expanded={isFleetOpen}
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                <CarFront className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-extrabold tracking-tight text-slate-900">Nearby Fleet</span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold border border-emerald-200/60">
                {filteredVehicles.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-500 group-hover:text-slate-800 transition">
              <span className="text-[11px] font-medium">Within 2.5km</span>
              <div
                className={`p-0.5 rounded-lg transition-transform duration-300 ${
                  isFleetOpen ? "rotate-180 text-emerald-600" : ""
                }`}
              >
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </button>

          {/* Dropped Down Contents */}
          {isFleetOpen && (
            <div className="flex flex-col divide-y divide-emerald-100 animate-in fade-in slide-in-from-top-3 duration-300 ease-out border-t border-emerald-200/70">
              {/* Scrollable Vehicle List */}
              <div className="p-2 space-y-2 overflow-y-auto max-h-[42vh]">
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
                          ? "bg-white border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
                          : "bg-white/90 border-emerald-100 hover:border-emerald-300 hover:bg-white shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-emerald-50/90 border border-emerald-200 flex items-center justify-center p-0.5 overflow-hidden shrink-0 shadow-sm">
                            <img
                              src={v.type === "ERICKSHAW" ? "/icons/erickshaw.jpg" : "/icons/auto.jpg"}
                              alt={v.label}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <span className="font-extrabold text-xs text-slate-900">{v.label}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: theme.color }}
                          />
                          <span className={`text-[11px] font-bold ${
                            status === "EMPTY"
                              ? "text-emerald-700"
                              : status === "FULL"
                              ? "text-rose-700"
                              : "text-amber-700"
                          }`}>
                            {theme.label} ({v.occupancy}/{v.maxCapacity})
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{v.distanceMeters ?? 300}m away</span>
                        {v.destination?.name ? (
                          <span className="text-slate-700 font-semibold truncate max-w-[150px]">
                            → {v.destination.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Roaming</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====================================================================== */}
      {/* 5. PINNED BOTTOM VEHICLE DETAIL CARD                                   */}
      {/* ====================================================================== */}
      {selectedVehicle && (
        <div className="absolute bottom-3 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[480px] z-30 bg-white/95 backdrop-blur-2xl border border-emerald-200 rounded-3xl p-4 shadow-xl animate-in slide-in-from-bottom-3 duration-200">
          {renderVehicleDetailContent(selectedVehicle, () => setSelectedVehicleId(null))}
        </div>
      )}
    </div>
  );
}
