"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import dynamic from "next/dynamic";
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
  Layers,
  Map as MapIcon,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { AutoDriver, FilterMode } from "@/types/spothail";
import { MOCK_DRIVERS } from "@/lib/mockData";
import { RadarMapCanvas } from "@/components/RadarMapCanvas";
import { MapboxTokenModal } from "@/components/MapboxTokenModal";

// LeafletMap loaded dynamically (SSR-safe — Leaflet needs the browser DOM)
const LeafletMap = dynamic(
  () => import("@/components/LeafletMap").then((m) => m.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading Live Map…</span>
      </div>
    ),
  }
);

// Default center: NIT Calicut / Kattangal corridor
const DEFAULT_CENTER = { lat: 11.3216, lng: 75.9336 };

// Campus landmarks for instant search without API token
const CAMPUS_LOCATIONS = [
  { id: "main-gate", text: "NIT Main Gate Stand", place_name: "NIT Calicut Main Gate, Rajpath, Kattangal", center: [75.9336, 11.3216] },
  { id: "mbb-hostels", text: "Mega Boys Block (MBB)", place_name: "MBB Hostels, Campus Avenue, NIT Calicut", center: [75.9315, 11.3175] },
  { id: "kattangal-jn", text: "Kattangal Junction", place_name: "Kattangal Junction Stand, SH-34 Corridor", center: [75.9348, 11.3275] },
  { id: "central-library", text: "Central Library & East Campus", place_name: "Central Library & LH Complex, NIT Calicut", center: [75.9392, 11.3228] },
  { id: "ladies-hostels", text: "Ladies Hostels (LH)", place_name: "Ladies Hostels Avenue, NIT Calicut", center: [75.9285, 11.3195] },
  { id: "kunnamangalam", text: "Kunnamangalam Stand", place_name: "Kunnamangalam Bus Stand, SH 34", center: [75.8767, 11.3056] },
];

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

  // View Mode: LEAFLET (default real map), RADAR (SVG vector), or MAPBOX (3D, needs token)
  const [viewMode, setViewMode] = useState<"LEAFLET" | "RADAR" | "MAPBOX">("LEAFLET");
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return (
        localStorage.getItem("spothail_mapbox_token") ||
        process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
        ""
      );
    }
    return process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  });

  const autosRef = useRef(autos);
  autosRef.current = autos;

  // Handle Token Save from Modal
  const handleSaveToken = (newToken: string) => {
    setMapboxToken(newToken);
    if (typeof window !== "undefined") {
      localStorage.setItem("spothail_mapbox_token", newToken);
    }
    if (newToken) {
      setViewMode("MAPBOX");
    }
  };

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

  // Aggregate stats for desktop dashboard
  const emptyCount = useMemo(
    () => autos.filter((a) => (a.occupancy ?? a.occupiedSeats ?? 0) === 0).length,
    [autos]
  );
  const hasSpaceCount = useMemo(
    () =>
      autos.filter((a) => {
        const occ = a.occupancy ?? a.occupiedSeats ?? 0;
        const cap = a.maxCapacity ?? a.totalSeats ?? 4;
        return occ > 0 && occ < cap;
      }).length,
    [autos]
  );

  // 1. Initialize Mapbox Canvas if in MAPBOX mode
  useEffect(() => {
    if (viewMode !== "MAPBOX" || !mapContainerRef.current || mapRef.current || !mapboxToken)
      return;

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

      map.addSource("radar-circle-source", {
        type: "geojson",
        data: createGeoJSONCircle([userPos.lng, userPos.lat], 2.0),
      });

      map.addLayer({
        id: "radar-circle-fill",
        type: "fill",
        source: "radar-circle-source",
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": 0.08,
        },
      });

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
  }, [viewMode, mapboxToken]);

  // 2. Render & Update User Location Marker + Radar Circle (Mapbox mode)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || viewMode !== "MAPBOX") return;

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
  }, [userPos, viewMode]);

  // 3. Render Custom Traffic-Light Pill Markers for Autos (Mapbox mode)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || viewMode !== "MAPBOX") return;

    const activeIds = new Set(filteredAutos.map((a) => a.driverId));
    autoMarkersRef.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        autoMarkersRef.current.delete(id);
      }
    });

    filteredAutos.forEach((auto) => {
      const occ = auto.occupancy ?? auto.occupiedSeats ?? 0;
      const cap = auto.maxCapacity ?? auto.totalSeats ?? 4;
      const isEmpty = occ === 0;
      const isFull = occ >= cap;
      const isSelected = auto.driverId === selectedAutoId;

      let colorClass = "bg-amber-400 text-slate-950 border-amber-300";
      if (isEmpty) {
        colorClass = "bg-emerald-400 text-slate-950 border-emerald-300";
      } else if (isFull) {
        colorClass = "bg-rose-950/90 text-rose-300 border-rose-800/60";
      }

      const ringClass = isSelected
        ? "ring-4 ring-blue-500/50 scale-110"
        : "hover:scale-105";

      const rootClasses =
        "w-max inline-flex items-center justify-center cursor-pointer z-30 pointer-events-auto";

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
  }, [filteredAutos, selectedAutoId, viewMode]);

  // 4. Mock Movement Loop OR Live Socket.io Connection
  useEffect(() => {
    if (useMockMode) {
      const interval = setInterval(() => {
        setAutos((prev) => {
          const nextAutos = prev.map((a) => {
            if (a.driverId === selectedAutoId && activeRouteCoordsRef.current.length > 1) {
              const nextCoord = activeRouteCoordsRef.current[1];
              activeRouteCoordsRef.current = activeRouteCoordsRef.current.slice(1);
              return {
                ...a,
                lng: nextCoord[0],
                lat: nextCoord[1],
              };
            }

            return {
              ...a,
              lat: a.lat + (Math.random() - 0.49) * 0.00012,
              lng: a.lng + (Math.random() - 0.49) * 0.00012,
            };
          });

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

  // 5. Geocoding / Landmark Autocomplete Search
  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setSearchSuggestions([]);
      return;
    }

    // First: Match local NIT Calicut campus landmarks
    const lower = value.toLowerCase();
    const localMatches = CAMPUS_LOCATIONS.filter(
      (loc) => loc.text.toLowerCase().includes(lower) || loc.place_name.toLowerCase().includes(lower)
    );

    if (localMatches.length > 0) {
      setSearchSuggestions(localMatches);
      return;
    }

    // Second: Search using Mapbox (if token) or Free OpenStreetMap Nominatim (Zero API Key)
    if (value.trim().length >= 3) {
      if (mapboxToken) {
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            value
          )}.json?proximity=${userPos.lng},${userPos.lat}&country=IN&limit=4&access_token=${mapboxToken}`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.features && data.features.length > 0) {
            setSearchSuggestions(data.features);
            return;
          }
        } catch {
          // fallback to Nominatim
        }
      }

      // 100% Free OpenStreetMap Nominatim geocoder (No API key required)
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          value
        )}&format=json&limit=5&countrycodes=IN`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        const data = await res.json();
        const formatted = (data || []).map((item: any) => ({
          id: String(item.place_id),
          text: item.display_name.split(",")[0],
          place_name: item.display_name,
          center: [parseFloat(item.lon), parseFloat(item.lat)],
        }));
        setSearchSuggestions(formatted);
      } catch {
        setSearchSuggestions([]);
      }
    } else {
      setSearchSuggestions([]);
    }
  };

  // 6. Use Hardware GPS Button
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

  // 7. Virtual Handwave ("Ping Driver")
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
    <div className="w-full h-screen flex flex-col bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      {/* ====================================================================== */}
      {/* 1. DESKTOP FULL-WIDTH TOP NAVIGATION BAR                               */}
      {/* ====================================================================== */}
      <header className="h-16 w-full bg-slate-900 border-b border-slate-800 px-4 md:px-6 flex items-center justify-between shrink-0 z-30 shadow-md">
        {/* Brand & Campus Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-tight text-white">
              Spot<span className="text-blue-500">Hail</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              NIT Calicut Radar
            </span>
          </div>

          {/* Quick Telemetry Counters for Desktop */}
          <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-slate-800 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <strong>{autos.length}</strong> Autos in 2km
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <strong>{emptyCount}</strong> Empty (Instant Board)
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-400 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <strong>{hasSpaceCount}</strong> With Space
            </span>
          </div>
        </div>

        {/* View Mode & Actions Toolbar */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* View Mode switcher — Leaflet Real Map / Transit Radar / Mapbox 3D */}
          <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold">
            <button
              onClick={() => setViewMode("LEAFLET")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                viewMode === "LEAFLET"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Live Map</span>
            </button>
            <button
              onClick={() => setViewMode("RADAR")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                viewMode === "RADAR"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Transit Radar</span>
            </button>
            <button
              onClick={() => {
                if (!mapboxToken) {
                  setTokenModalOpen(true);
                } else {
                  setViewMode("MAPBOX");
                }
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                viewMode === "MAPBOX"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Mapbox 3D</span>
            </button>
          </div>

          {/* Demo Simulation Toggle */}
          <button
            onClick={() => setUseMockMode(!useMockMode)}
            className={`hidden sm:flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition ${
              useMockMode
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : socketConnected
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-red-500/10 text-red-400 border-red-500/30"
            }`}
            title={useMockMode ? "Simulated Corridor Fleet" : "Live Backend WebSockets"}
          >
            <span className={`w-2 h-2 rounded-full ${useMockMode ? "bg-amber-400" : socketConnected ? "bg-emerald-400" : "bg-red-400"}`} />
            <span>{useMockMode ? "Demo Mode" : socketConnected ? "Live Server" : "Connecting..."}</span>
          </button>

          {/* External link to Driver Cockpit */}
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition shadow-sm"
            title="Open Driver Cockpit in new tab"
          >
            <span>Driver HUD</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>
      </header>

      {/* ====================================================================== */}
      {/* 2. DESKTOP RESPONSIVE SPLIT SCREEN LAYOUT                              */}
      {/* ====================================================================== */}
      <div className="flex-1 w-full flex flex-col lg:flex-row overflow-hidden relative">
        {/* ==================================================================== */}
        {/* LEFT DESKTOP SIDEBAR / DISPATCH PANEL (w-full lg:w-[460px] xl:w-[500px]) */}
        {/* ==================================================================== */}
        <aside className="w-full lg:w-[460px] xl:w-[500px] h-full flex flex-col bg-slate-900 border-r border-slate-800/80 shrink-0 z-20 overflow-hidden shadow-2xl">
          {/* Search Location Bar */}
          <div className="p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Where are you standing? (e.g. Main Gate, MBB)..."
                className="w-full pl-9 pr-20 py-2.5 text-xs sm:text-sm bg-slate-950 text-white rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500 transition"
              />
              <button
                onClick={handleUseGPS}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition active:scale-95"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>GPS</span>
              </button>
            </div>

            {/* Instant Landmark Chips */}
            <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-bold uppercase text-slate-500 shrink-0">Quick:</span>
              {CAMPUS_LOCATIONS.slice(0, 4).map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => {
                    const [lng, lat] = loc.center;
                    setUserPos({ lat, lng });
                    setSearchQuery(loc.text);
                    setSearchSuggestions([]);
                    mapRef.current?.flyTo({ center: [lng, lat], zoom: 15.2 });
                  }}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700/60 transition"
                >
                  {loc.text}
                </button>
              ))}
            </div>

            {/* Autocomplete Dropdown */}
            {searchSuggestions.length > 0 && (
              <div className="mt-2 bg-slate-950 rounded-xl shadow-2xl border border-slate-700 overflow-hidden divide-y divide-slate-800">
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
                    className="w-full text-left px-3.5 py-2.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2.5 transition"
                  >
                    <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <div className="truncate">
                      <div className="font-bold text-white truncate">{place.text}</div>
                      <div className="text-[10px] text-slate-400 truncate">{place.place_name}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 1-Tap Filter Row */}
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex flex-col gap-2">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setFilterMode("ALL")}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  filterMode === "ALL"
                    ? "bg-blue-600 text-white border-blue-500 shadow-md"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
                }`}
              >
                All Nearby ({filteredAutos.length})
              </button>

              <button
                onClick={() => setFilterMode("EMPTY")}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  filterMode === "EMPTY"
                    ? "bg-emerald-600 text-white border-emerald-500 shadow-md"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Empty Only
              </button>

              <button
                onClick={() => setFilterMode("HAS_SPACE")}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  filterMode === "HAS_SPACE"
                    ? "bg-amber-600 text-white border-amber-500 shadow-md"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Has Space
              </button>

              <button
                onClick={() => setFilterMode("DESTINATION")}
                className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  filterMode === "DESTINATION"
                    ? "bg-blue-600 text-white border-blue-500 shadow-md"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                Going To...
              </button>
            </div>

            {filterMode === "DESTINATION" && (
              <input
                type="text"
                value={destinationFilterText}
                onChange={(e) => setDestinationFilterText(e.target.value)}
                placeholder="Filter by destination (e.g. Main Gate, Kattangal)..."
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-blue-500/50 rounded-lg text-white focus:outline-none"
              />
            )}
          </div>

          {/* Hero Selected Auto Card */}
          {selectedAuto && (
            <div className="p-4 border-b border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl p-2 rounded-xl bg-slate-800 border border-slate-700 shadow-inner">🛺</span>
                  <div>
                    <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                      <span>{selectedAuto.label || selectedAuto.name || selectedAuto.driverId}</span>
                      {selectedAuto.registrationNumber && (
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {selectedAuto.registrationNumber}
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <span>Driver: {selectedAuto.name || "Stand Driver"}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedAutoId(null)}
                  className="p-1 rounded-full text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
                  title="Deselect"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status Badges: Distance & Tactile Seats Indicator */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-blue-400" />
                  <span>{selectedAuto.distanceMeters ?? 350}m away</span>
                  <span className="text-slate-500">•</span>
                  <span>~{Math.max(1, Math.round((selectedAuto.distanceMeters ?? 350) / 220))}m ETA</span>
                </span>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 border ${
                    selectedOccupancy >= selectedCapacity
                      ? "bg-rose-950/40 text-rose-300 border-rose-500/30"
                      : selectedOccupancy === 0
                      ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/30"
                      : "bg-amber-950/40 text-amber-300 border-amber-500/30"
                  }`}
                >
                  <span>{selectedCapacity - selectedOccupancy} Seats Available</span>
                  <span className="font-mono tracking-widest text-sm">
                    (
                    {Array.from({ length: selectedCapacity }).map((_, idx) =>
                      idx < selectedOccupancy ? "●" : "○"
                    )}
                    )
                  </span>
                </span>
              </div>

              {/* Destination / Route Info */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 mb-3 text-xs text-slate-300 flex items-start gap-2">
                <Navigation className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  {selectedAuto.showDestination && selectedAuto.destination ? (
                    <div>
                      <span className="text-slate-400">Heading to: </span>
                      <strong className="text-white font-bold">{selectedAuto.destination.name}</strong>
                      {selectedAuto.destination.via && (
                        <span className="text-slate-400"> via <strong className="text-slate-200">{selectedAuto.destination.via}</strong></span>
                      )}
                    </div>
                  ) : (
                    <span className="italic text-slate-400">
                      Local / Roaming (Free standby auto at stand)
                    </span>
                  )}
                </div>
              </div>

              {/* Primary Thumb-Zone CTA: Virtual Handwave */}
              <button
                disabled={
                  selectedOccupancy >= selectedCapacity ||
                  Boolean(pingedDrivers[selectedAuto.driverId])
                }
                onClick={() => handlePingDriver(selectedAuto.driverId)}
                className={`w-full py-3 rounded-xl font-extrabold text-sm shadow-xl flex items-center justify-center gap-2 transition active:scale-98 ${
                  pingedDrivers[selectedAuto.driverId]
                    ? "bg-emerald-600 text-white shadow-emerald-600/30"
                    : selectedOccupancy >= selectedCapacity
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 hover:shadow-blue-500/50"
                }`}
              >
                {pingedDrivers[selectedAuto.driverId] ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>Driver Notified! Waiting for Pickup</span>
                  </>
                ) : selectedOccupancy >= selectedCapacity ? (
                  <span>Auto Currently Full (4/4)</span>
                ) : (
                  <>
                    <Hand className="w-4 h-4 text-amber-300" />
                    <span>Ping Driver (Wait for Me)</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Scrollable Nearby Autos Directory */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-3 space-y-2">
            <div className="flex items-center justify-between px-1 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span>Nearby Fleet ({filteredAutos.length})</span>
              <span>Sorted by Proximity</span>
            </div>

            {filteredAutos.map((auto) => {
              const occ = auto.occupancy ?? auto.occupiedSeats ?? 0;
              const cap = auto.maxCapacity ?? auto.totalSeats ?? 4;
              const isSelected = auto.driverId === selectedAutoId;
              const isEmpty = occ === 0;
              const isFull = occ >= cap;

              let badgeStyle = "bg-amber-400/10 text-amber-400 border-amber-400/20";
              if (isEmpty) badgeStyle = "bg-emerald-400/10 text-emerald-400 border-emerald-400/20";
              else if (isFull) badgeStyle = "bg-rose-400/10 text-rose-400 border-rose-400/20";

              return (
                <div
                  key={auto.driverId}
                  onClick={() => setSelectedAutoId(auto.driverId)}
                  className={`p-3.5 rounded-2xl cursor-pointer transition border ${
                    isSelected
                      ? "bg-blue-950/40 border-blue-500/60 shadow-lg shadow-blue-900/20"
                      : "bg-slate-900/70 border-slate-800/70 hover:bg-slate-850 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🛺</span>
                      <div>
                        <div className="font-extrabold text-sm text-white flex items-center gap-2">
                          <span>{auto.label || auto.driverId}</span>
                          {auto.name && (
                            <span className="text-xs text-slate-400 font-normal">({auto.name})</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeStyle}`}>
                      {isEmpty ? "Empty" : isFull ? "Full" : `${cap - occ} Seats Left`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <span>{auto.distanceMeters ?? 400}m away</span>
                      <span>•</span>
                      <span>~{Math.max(1, Math.round((auto.distanceMeters ?? 400) / 220))}m ETA</span>
                    </div>

                    {auto.destination?.name ? (
                      <div className="text-slate-300 font-semibold truncate max-w-[180px]">
                        → {auto.destination.name}
                      </div>
                    ) : (
                      <span className="italic text-slate-500">Roaming</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ==================================================================== */}
        {/* RIGHT MAIN DESKTOP CANVAS (LEAFLET REAL MAP / RADAR / MAPBOX)       */}
        {/* ==================================================================== */}
        <main className="flex-1 h-full relative overflow-hidden bg-[#030712]">
          {viewMode === "LEAFLET" ? (
            <LeafletMap
              initialCenter={DEFAULT_CENTER}
              center={userPos}
              userLocation={userPos}
              initialZoom={15}
              showSearch={false}
              showGPS={true}
              defaultTheme="streets"
              onLocationChange={(latlng, label) => {
                setUserPos(latlng);
                setSearchQuery(label.split(",").slice(0, 2).join(",").trim());
              }}
              extraMarkers={filteredAutos.map((auto) => {
                const occ = auto.occupancy ?? auto.occupiedSeats ?? 0;
                const cap = auto.maxCapacity ?? auto.totalSeats ?? 4;
                return {
                  id: auto.driverId,
                  lat: auto.lat,
                  lng: auto.lng,
                  label: `${auto.label || auto.driverId} [${occ}/${cap}]`,
                  color:
                    occ === 0 ? "green" : occ >= cap ? "red" : "amber",
                  popup: `<b>🛺 ${auto.label || auto.driverId}</b><br/>${occ}/${cap} seats<br/>${
                    auto.destination?.name ?? "Roaming"
                  }`,
                };
              })}
              className="w-full h-full"
            />
          ) : viewMode === "RADAR" || !mapboxToken ? (
            <RadarMapCanvas
              center={DEFAULT_CENTER}
              userPos={userPos}
              autos={filteredAutos}
              selectedAutoId={selectedAutoId}
              onSelectAuto={(id) => setSelectedAutoId(id)}
              onOpenTokenModal={() => setTokenModalOpen(true)}
              hasMapboxToken={Boolean(mapboxToken)}
            />
          ) : (
            <div ref={mapContainerRef} className="w-full h-full" />
          )}
        </main>
      </div>

      {/* Mapbox Token Modal Dialog */}
      <MapboxTokenModal
        isOpen={tokenModalOpen}
        onClose={() => setTokenModalOpen(false)}
        onSaveToken={handleSaveToken}
        currentToken={mapboxToken}
      />
    </div>
  );
}
