"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { io, Socket } from "socket.io-client";
import {
  Search,
  LocateFixed,
  MapPin,
  Navigation,
  Hand,
  CheckCircle2,
  X,
  Radio,
} from "lucide-react";
import { AutoDriver, FilterMode } from "@/types/spothail";
import { MOCK_DRIVERS } from "@/lib/mockData";

// Default center: NIT Calicut / Kattangal corridor
const DEFAULT_CENTER = { lat: 11.3216, lng: 75.9336 };

// Helper: Calculate straight-line distance in meters (Haversine)
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

// Helper: Generate GeoJSON polygon circle for 2km radar overlay
function createGeoJSONCircle(center: [number, number], radiusInKm: number, points = 64) {
  const coords = { latitude: center[1], longitude: center[0] };
  const km = radiusInKm;
  const ret = [];
  const distanceX = km / (111.32 * Math.cos((coords.latitude * Math.PI) / 180));
  const distanceY = km / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]);

  return {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [ret],
    },
    properties: {},
  };
}

export default function PassengerRadarPage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const autoMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const selectedOriginMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const activeRouteCoordsRef = useRef<[number, number][]>([]);
  const socketRef = useRef<Socket | null>(null);

  const [mapLoaded, setMapLoaded] = useState<boolean>(false);

  // User & Map state
  const [userPos, setUserPos] = useState(DEFAULT_CENTER);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("ALL");
  const [destinationFilterText, setDestinationFilterText] = useState("");

  // Autos & Selection state
  const [autos, setAutos] = useState<AutoDriver[]>(MOCK_DRIVERS);
  const [selectedAutoId, setSelectedAutoId] = useState<string | null>("AUTO-02");
  const [pingedDrivers, setPingedDrivers] = useState<Record<string, boolean>>({});
  const [useMockMode, setUseMockMode] = useState<boolean>(true);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

  const autosRef = useRef(autos);
  autosRef.current = autos;

  // Currently inspected auto
  const selectedAuto = useMemo(
    () => autos.find((a) => a.driverId === selectedAutoId) || null,
    [autos, selectedAutoId]
  );

  // Filtered autos within 2000m
  const filteredAutos = useMemo(() => {
    return autos
      .map((auto) => ({
        ...auto,
        distanceMeters: getDistanceMeters(userPos.lat, userPos.lng, auto.lat, auto.lng),
      }))
      .filter((auto) => (auto.distanceMeters ?? 0) <= 2000)
      .filter((auto) => {
        const occ = auto.occupancy ?? auto.occupiedSeats ?? 0;
        const cap = auto.maxCapacity ?? auto.totalSeats ?? 4;
        if (filterMode === "EMPTY") return occ === 0;
        if (filterMode === "HAS_SPACE") return occ < cap;
        if (filterMode === "DESTINATION" && destinationFilterText.trim()) {
          const target = destinationFilterText.toLowerCase();
          return (
            Boolean(auto.showDestination) &&
            Boolean(
              auto.destination?.name.toLowerCase().includes(target) ||
                auto.destination?.via?.toLowerCase().includes(target)
            )
          );
        }
        return true;
      });
  }, [autos, userPos, filterMode, destinationFilterText]);

  // 1. Initialize Mapbox Canvas
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [userPos.lng, userPos.lat],
      zoom: 15.2,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on("load", () => {
      setMapLoaded(true);
      // 2km Radar Ring Overlay
      map.addSource("radar-circle-source", {
        type: "geojson",
        data: createGeoJSONCircle([userPos.lng, userPos.lat], 2.0),
      });

      // Softened Radar Fill Opacity (0.08)
      map.addLayer({
        id: "radar-circle-fill",
        type: "fill",
        source: "radar-circle-source",
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": 0.08,
        },
      });

      // Radar Border Line
      map.addLayer({
        id: "radar-circle-stroke",
        type: "line",
        source: "radar-circle-source",
        paint: {
          "line-color": "#3b82f6",
          "line-width": 2,
          "line-opacity": 0.5,
        },
      });

      // GeoJSON source for selected auto's blue route line
      map.addSource("selected-route", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "selected-route-line",
        type: "line",
        source: "selected-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#2563eb",
          "line-width": 5,
          "line-opacity": 0.95,
        },
      });
    });

    return () => {
      setMapLoaded(false);
      activeRouteCoordsRef.current = [];
      if (selectedOriginMarkerRef.current) {
        selectedOriginMarkerRef.current.remove();
        selectedOriginMarkerRef.current = null;
      }
      autoMarkersRef.current.forEach((marker) => marker.remove());
      autoMarkersRef.current.clear();
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken]);

  // 2. Render & Update User Location Marker + Radar Circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "flex flex-col items-center pointer-events-none";
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="w-10 h-10 rounded-full bg-blue-500/30 animate-ping absolute"></div>
          <div class="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-lg z-10"></div>
        </div>
        <span class="mt-1 px-2 py-0.5 rounded-full bg-white/95 text-slate-900 text-[11px] font-semibold shadow">
          You (My GPS)
        </span>
      `;
      userMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([userPos.lng, userPos.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userPos.lng, userPos.lat]);
    }

    const radarSource = map.getSource("radar-circle-source") as mapboxgl.GeoJSONSource;
    if (radarSource) {
      radarSource.setData(createGeoJSONCircle([userPos.lng, userPos.lat], 2.0));
    }
  }, [userPos]);

  // 3. Render Custom Traffic-Light Pill Markers for Autos
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Cleanly remove markers that are no longer in filtered list to avoid DOM leaks
    const activeIds = new Set(filteredAutos.map((a) => a.driverId));
    autoMarkersRef.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        autoMarkersRef.current.delete(id);
      }
    });

    // Upsert custom HTML markers
    filteredAutos.forEach((auto) => {
      const occ = auto.occupancy ?? auto.occupiedSeats ?? 0;
      const cap = auto.maxCapacity ?? auto.totalSeats ?? 4;
      const isEmpty = occ === 0;
      const isFull = occ >= cap;
      const isSelected = auto.driverId === selectedAutoId;

      // Color scheme based on traffic-light specification:
      // Empty (0/4): Emerald (bg-emerald-400 text-slate-950)
      // Has space (1-3/4): Amber (bg-amber-400 text-slate-950)
      // Full (4/4): Dimmed Red (bg-rose-950/90 text-rose-300)
      let colorClass = "bg-amber-400 text-slate-950 border-amber-300";
      if (isEmpty) {
        colorClass = "bg-emerald-400 text-slate-950 border-emerald-300";
      } else if (isFull) {
        colorClass = "bg-rose-950/90 text-rose-300 border-rose-800/60";
      }

      // Highlight ring when selected
      const ringClass = isSelected
        ? "ring-4 ring-blue-500/50 scale-110"
        : "hover:scale-105";

      // Root element strictly shrink-wrapped with w-max inline-flex
      const rootClasses =
        "w-max inline-flex items-center justify-center cursor-pointer z-30 pointer-events-auto";

      // Inner pill div with requested inline-flex styling
      const innerPillClasses = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-xl text-xs font-bold border-2 whitespace-nowrap transition-transform duration-200 ${colorClass} ${ringClass}`;

      const badgeLabel = `🛺 [${occ}/${cap}]`;
      const innerHtmlContent = `<div class="${innerPillClasses}"><span>${badgeLabel}</span></div>`;

      const existing = autoMarkersRef.current.get(auto.driverId);
      if (existing) {
        existing.setLngLat([auto.lng, auto.lat]);
        const el = existing.getElement();
        el.className = rootClasses;
        el.innerHTML = innerHtmlContent;
      } else {
        const el = document.createElement("div");
        el.className = rootClasses;
        el.innerHTML = innerHtmlContent;
        el.onclick = (e) => {
          e.stopPropagation();
          setSelectedAutoId(auto.driverId);
        };

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([auto.lng, auto.lat])
          .addTo(map);

        autoMarkersRef.current.set(auto.driverId, marker);
      }
    });
  }, [filteredAutos, selectedAutoId]);

  // 4. Render Origin Pulse Pin for Selected Auto
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedAuto) {
      if (selectedOriginMarkerRef.current) {
        selectedOriginMarkerRef.current.remove();
        selectedOriginMarkerRef.current = null;
      }
      return;
    }

    if (!selectedOriginMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "pointer-events-none z-20 -translate-x-1/2 -translate-y-1/2";
      el.innerHTML = `
        <div class="relative flex h-5 w-5 items-center justify-center">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-3 w-3 bg-blue-600 border-2 border-white"></span>
        </div>
      `;
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([selectedAuto.lng, selectedAuto.lat])
        .addTo(map);
      selectedOriginMarkerRef.current = marker;
    } else {
      selectedOriginMarkerRef.current.setLngLat([selectedAuto.lng, selectedAuto.lat]);
    }
  }, [selectedAuto?.driverId, selectedAuto?.lat, selectedAuto?.lng]);

  // 5. Route Line for Selected Auto
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const routeSource = map.getSource("selected-route") as mapboxgl.GeoJSONSource;
    if (!routeSource) return;

    const currentAuto = autosRef.current.find((a) => a.driverId === selectedAutoId) || null;

    if (!currentAuto || !currentAuto.showDestination || !currentAuto.destination) {
      activeRouteCoordsRef.current = [];
      routeSource.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const fetchRoute = async () => {
      try {
        const { lng: startLng, lat: startLat } = currentAuto;
        const { lng: endLng, lat: endLat } = currentAuto.destination!;
        if (!endLng || !endLat) {
          activeRouteCoordsRef.current = [];
          routeSource.setData({ type: "FeatureCollection", features: [] });
          return;
        }

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&overview=full&access_token=${mapboxToken}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.routes?.[0]?.geometry?.coordinates) {
          const roadCoords: [number, number][] = data.routes[0].geometry.coordinates;
          // Prepend exact current [startLng, startLat] to eliminate visual gap to marker
          const snappedCoords: [number, number][] = [[startLng, startLat], ...roadCoords];
          activeRouteCoordsRef.current = snappedCoords;

          routeSource.setData({
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: snappedCoords,
            },
          });
        } else {
          // Direct line fallback with intermediate interpolation
          const steps = 15;
          const fallbackCoords: [number, number][] = [];
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            fallbackCoords.push([
              startLng + (endLng - startLng) * t,
              startLat + (endLat - startLat) * t,
            ]);
          }
          activeRouteCoordsRef.current = fallbackCoords;

          routeSource.setData({
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: fallbackCoords,
            },
          });
        }
      } catch (err) {
        console.error("Failed to fetch route:", err);
      }
    };

    fetchRoute();
  }, [selectedAutoId, mapLoaded, mapboxToken]);

  // 6. Mock Movement Loop OR Live Socket.io Connection
  useEffect(() => {
    if (useMockMode) {
      const interval = setInterval(() => {
        setAutos((prev) => {
          let updatedRouteLine = false;

          const nextAutos = prev.map((a) => {
            // If this auto is selected and we have road route coordinates to follow
            if (a.driverId === selectedAutoId && activeRouteCoordsRef.current.length > 1) {
              const nextCoord = activeRouteCoordsRef.current[1];
              // Advance along the road and slice the first element off
              activeRouteCoordsRef.current = activeRouteCoordsRef.current.slice(1);
              updatedRouteLine = true;
              return {
                ...a,
                lng: nextCoord[0],
                lat: nextCoord[1],
              };
            }

            // For unselected autos, reduced realistic drift so they don't wander off-road
            return {
              ...a,
              lat: a.lat + (Math.random() - 0.49) * 0.00012,
              lng: a.lng + (Math.random() - 0.49) * 0.00012,
            };
          });

          // Keep the blue route polyline locked to the moving auto without visual gap
          if (updatedRouteLine && mapRef.current) {
            const routeSource = mapRef.current.getSource("selected-route") as mapboxgl.GeoJSONSource;
            if (routeSource && activeRouteCoordsRef.current.length > 0) {
              routeSource.setData({
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: activeRouteCoordsRef.current,
                },
              });
            }
          }

          return nextAutos;
        });
      }, 2500);

      return () => clearInterval(interval);
    } else {
      const backendUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:4000";
      const socket = io(backendUrl);
      socketRef.current = socket;

      socket.on("connect", () => {
        setSocketConnected(true);
        socket.emit("passenger:sync_location", userPos);
      });

      socket.on("server:nearby_autos", (liveAutos: AutoDriver[]) => {
        setAutos(liveAutos);
      });

      socket.on("disconnect", () => setSocketConnected(false));

      return () => {
        socket.disconnect();
      };
    }
  }, [useMockMode, userPos, selectedAutoId]);

  // 7. Geocoding Autocomplete Search
  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    if (value.trim().length < 3 || !mapboxToken) {
      setSearchSuggestions([]);
      return;
    }
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        value
      )}.json?proximity=${userPos.lng},${userPos.lat}&country=IN&limit=4&access_token=${mapboxToken}`;
      const res = await fetch(url);
      const data = await res.json();
      setSearchSuggestions(data.features || []);
    } catch {
      setSearchSuggestions([]);
    }
  };

  // 8. Use Hardware GPS Button
  const handleUseGPS = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(nextPos);
        mapRef.current?.flyTo({ center: [nextPos.lng, nextPos.lat], zoom: 15.2 });
        socketRef.current?.emit("passenger:sync_location", nextPos);
      },
      () => {
        mapRef.current?.flyTo({ center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat], zoom: 15 });
      },
      { enableHighAccuracy: true }
    );
  };

  // 9. Virtual Handwave ("Ping Driver")
  const handlePingDriver = (driverId: string) => {
    setPingedDrivers((prev) => ({ ...prev, [driverId]: true }));
    socketRef.current?.emit("passenger:ping_driver", {
      targetDriverId: driverId,
      passengerLat: userPos.lat,
      passengerLng: userPos.lng,
    });
    setTimeout(() => {
      setPingedDrivers((prev) => ({ ...prev, [driverId]: false }));
    }, 30000);
  };

  const selectedOccupancy = selectedAuto
    ? selectedAuto.occupancy ?? selectedAuto.occupiedSeats ?? 0
    : 0;
  const selectedCapacity = selectedAuto
    ? selectedAuto.maxCapacity ?? selectedAuto.totalSeats ?? 4
    : 4;

  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-slate-950 select-none font-sans">
      {/* ==================== LAYER 1: TOP FLOATING COMMAND BAR ==================== */}
      <header className="fixed top-4 left-1/2 -translate-x-1/2 max-w-md w-[calc(100%-2rem)] z-30 bg-white/95 backdrop-blur-md shadow-xl px-4 pt-3.5 pb-3.5 rounded-2xl border border-slate-200">
        {/* Brand Header & Mode Switch */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-black tracking-tight text-slate-900">
              Spot<span className="text-blue-700">Hail</span>
            </span>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              2km Radar
            </span>
          </div>

          <button
            onClick={() => setUseMockMode(!useMockMode)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition ${
              useMockMode
                ? "bg-amber-50 text-amber-800 border-amber-300"
                : socketConnected
                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                : "bg-red-50 text-red-700 border-red-300"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {useMockMode ? "Demo Radar" : socketConnected ? "Live Server" : "Connecting..."}
          </button>
        </div>

        {/* Search Input + GPS Button */}
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Where are you standing?"
              className="w-full pl-9 pr-20 py-2.5 text-sm bg-slate-100 text-slate-900 rounded-full border border-slate-300 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
            <button
              onClick={handleUseGPS}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-3 py-1.5 rounded-full bg-white text-blue-700 border border-blue-600 text-xs font-bold shadow-sm hover:bg-blue-50 active:scale-95 transition"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              GPS
            </button>
          </div>
        </div>

        {/* Autocomplete Dropdown */}
        {searchSuggestions.length > 0 && (
          <div className="mt-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            {searchSuggestions.map((place) => (
              <button
                key={place.id}
                onClick={() => {
                  const [lng, lat] = place.center;
                  setUserPos({ lat, lng });
                  setSearchQuery(place.text);
                  setSearchSuggestions([]);
                  mapRef.current?.flyTo({ center: [lng, lat], zoom: 15.2 });
                }}
                className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2 border-b last:border-none"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">{place.place_name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Horizontal 1-Tap Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mt-2.5 pb-0.5">
          <button
            onClick={() => setFilterMode("ALL")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              filterMode === "ALL"
                ? "bg-blue-900 text-white border-blue-900"
                : "bg-white text-slate-700 border-slate-300"
            }`}
          >
            All Nearby ({filteredAutos.length})
          </button>

          <button
            onClick={() => setFilterMode("EMPTY")}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              filterMode === "EMPTY"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-700 border-emerald-500"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Empty Only
          </button>

          <button
            onClick={() => setFilterMode("HAS_SPACE")}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              filterMode === "HAS_SPACE"
                ? "bg-amber-500 text-slate-950 border-amber-500"
                : "bg-white text-slate-700 border-amber-400"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            Has Space
          </button>

          <button
            onClick={() => setFilterMode("DESTINATION")}
            className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              filterMode === "DESTINATION"
                ? "bg-blue-700 text-white border-blue-700"
                : "bg-white text-slate-700 border-slate-300"
            }`}
          >
            <MapPin className="w-3 h-3" />
            Going To...
          </button>
        </div>

        {/* Optional Destination Filter Input */}
        {filterMode === "DESTINATION" && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={destinationFilterText}
              onChange={(e) => setDestinationFilterText(e.target.value)}
              placeholder="Filter by route (e.g., Main Gate, Kunnamangalam)..."
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-blue-300 rounded-lg text-slate-900 focus:outline-none"
            />
          </div>
        )}
      </header>

      {/* ==================== LAYER 2: LIVE MAPBOX RADAR CANVAS ==================== */}
      {!mapboxToken ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
          <p className="text-lg font-bold mb-2">Mapbox Token Required</p>
          <p className="text-xs text-slate-300 max-w-xs">
            Paste your <code className="text-amber-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> inside{" "}
            <code className="text-amber-400">/passenger-app/.env.local</code> and restart{" "}
            <code className="text-amber-400">npm run dev</code>.
          </p>
        </div>
      ) : (
        <div ref={mapContainerRef} className="w-full h-full" />
      )}

      {/* ==================== LAYER 3: BOTTOM INSPECTION & PING DRAWER ==================== */}
      {selectedAuto && (
        <section className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-md w-[calc(100%-2rem)] z-30 bg-white rounded-3xl shadow-2xl border border-slate-200 px-5 pt-3.5 pb-5 transition-transform duration-300">
          {/* Drag Handle & Close */}
          <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-2.5" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛺</span>
              <h2 className="text-lg font-extrabold text-slate-900">
                {selectedAuto.label || selectedAuto.name || selectedAuto.driverId}
              </h2>
            </div>
            <button
              onClick={() => setSelectedAutoId(null)}
              className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Distance Pill + Seat Dots Pill */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">
              {selectedAuto.distanceMeters ?? 350}m away •{" "}
              {Math.max(1, Math.round((selectedAuto.distanceMeters ?? 350) / 220))}m out
            </span>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                selectedOccupancy >= selectedCapacity
                  ? "bg-red-100 text-red-800"
                  : selectedOccupancy === 0
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              <span>{selectedCapacity - selectedOccupancy} Seats Left (</span>
              <span className="tracking-widest">
                {Array.from({ length: selectedCapacity }).map((_, idx) =>
                  idx < selectedOccupancy ? "●" : "○"
                )}
              </span>
              <span>)</span>
            </span>
          </div>

          {/* Destination / Route Line Info */}
          <div className="flex items-center gap-2 mt-3 text-xs text-slate-700">
            <Navigation className="w-4 h-4 text-blue-600 shrink-0" />
            {selectedAuto.showDestination && selectedAuto.destination ? (
              <span>
                Heading to: <strong className="text-slate-900">{selectedAuto.destination.name}</strong>
                {selectedAuto.destination.via && (
                  <>
                    {" "}
                    via <strong className="text-slate-900">{selectedAuto.destination.via}</strong>
                  </>
                )}
              </span>
            ) : (
              <span className="italic text-slate-500">
                Destination hidden by driver (Local / Roaming)
              </span>
            )}
          </div>

          {/* Primary Thumb-Zone CTA: Virtual Handwave */}
          <button
            disabled={
              selectedOccupancy >= selectedCapacity ||
              Boolean(pingedDrivers[selectedAuto.driverId])
            }
            onClick={() => handlePingDriver(selectedAuto.driverId)}
            className={`mt-4 w-full py-3.5 rounded-full font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 transition active:scale-98 ${
              pingedDrivers[selectedAuto.driverId]
                ? "bg-emerald-600 text-white"
                : selectedOccupancy >= selectedCapacity
                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-blue-700 hover:bg-blue-800 text-white"
            }`}
          >
            {pingedDrivers[selectedAuto.driverId] ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Driver Notified! Watch the Map
              </>
            ) : selectedOccupancy >= selectedCapacity ? (
              "Auto Currently Full (4/4)"
            ) : (
              <>
                <Hand className="w-4 h-4 text-amber-300" />
                Ping Driver (Wait for Me)
              </>
            )}
          </button>
        </section>
      )}
    </main>
  );
}