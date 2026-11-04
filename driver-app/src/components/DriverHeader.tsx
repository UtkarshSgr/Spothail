"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Settings,
  X,
  Eye,
  EyeOff,
  Bell,
  MapPin,
  ChevronDown,
  Navigation,
  Search,
  Route,
  CheckCircle2,
  Clock,
  User,
  Layers,
  LocateFixed,
} from "lucide-react";
import {
  CorridorDestination,
  RouteOption,
  SeatCapacity,
  VehicleType,
  getOccupancyStatus,
} from "@/types/spothail";

export interface DriverHeaderProps {
  driverId?: string;
  setDriverId?: (id: string) => void;
  isOnline?: boolean;
  onTogglePublicRoute?: (isPublic: boolean) => void;
  vehicleType: VehicleType;
  setVehicleType: (type: VehicleType) => void;
  occupancy: number;
  maxSeats: SeatCapacity;
  setMaxSeats: (seats: SeatCapacity) => void;
  showDestination: boolean;
  setShowDestination: (show: boolean) => void;
  activeDestination: CorridorDestination | null;
  onSelectDestination: (dest: CorridorDestination, selectedRoute?: RouteOption) => void;
  corridors?: CorridorDestination[];
  onSimulatePing?: () => void;
  triggerHaptics?: () => void;
  isSettingsOpen?: boolean;
  setIsSettingsOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  mapTheme?: "streets" | "dark" | "satellite";
  onSelectMapTheme?: (theme: "streets" | "dark" | "satellite") => void;
  onRecenter?: () => void;
}

export const DriverHeader: React.FC<DriverHeaderProps> = ({
  driverId = "AUTO-04",
  setDriverId,
  isOnline = true,
  onTogglePublicRoute,
  vehicleType,
  setVehicleType,
  occupancy,
  maxSeats,
  setMaxSeats,
  showDestination,
  setShowDestination,
  activeDestination,
  onSelectDestination,
  corridors = [],
  onSimulatePing,
  triggerHaptics,
  isSettingsOpen: externalIsSettingsOpen,
  setIsSettingsOpen: externalSetIsSettingsOpen,
  mapTheme = "streets",
  onSelectMapTheme,
  onRecenter,
}) => {
  const [internalIsSettingsOpen, setInternalIsSettingsOpen] = useState(false);
  const [isDestDropdownOpen, setIsDestDropdownOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [destSearch, setDestSearch] = useState("");
  const [expandedDestinationId, setExpandedDestinationId] = useState<string | null>(null);

  const destDropdownRef = useRef<HTMLDivElement>(null);
  const destTriggerRef = useRef<HTMLButtonElement>(null);
  const layersDropdownRef = useRef<HTMLDivElement>(null);
  const layersTriggerRef = useRef<HTMLButtonElement>(null);

  // Global click-outside listener to auto-collapse destination dropdown and theme menu
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | PointerEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (
        isDestDropdownOpen &&
        destDropdownRef.current &&
        !destDropdownRef.current.contains(target) &&
        (!destTriggerRef.current || !destTriggerRef.current.contains(target))
      ) {
        setIsDestDropdownOpen(false);
      }

      if (
        isThemeMenuOpen &&
        layersDropdownRef.current &&
        !layersDropdownRef.current.contains(target) &&
        (!layersTriggerRef.current || !layersTriggerRef.current.contains(target))
      ) {
        setIsThemeMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDestDropdownOpen) setIsDestDropdownOpen(false);
        if (isThemeMenuOpen) setIsThemeMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDestDropdownOpen, isThemeMenuOpen]);

  const isSettingsOpen =
    externalIsSettingsOpen !== undefined
      ? externalIsSettingsOpen
      : internalIsSettingsOpen;
  const setIsSettingsOpen =
    externalSetIsSettingsOpen || setInternalIsSettingsOpen;

  const handleSetCapacity = (capacity: SeatCapacity) => {
    triggerHaptics?.();
    setMaxSeats(capacity);
  };

  const status = getOccupancyStatus(occupancy, maxSeats);
  const seatsTheme =
    status === "EMPTY"
      ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm"
      : status === "FULL"
      ? "bg-rose-50 border-rose-300 text-rose-800 shadow-sm"
      : "bg-amber-50 border-amber-300 text-amber-800 shadow-sm";

  const filteredCorridors = corridors.filter((c) =>
    c.name.toLowerCase().includes(destSearch.toLowerCase()) ||
    (c.via && c.via.toLowerCase().includes(destSearch.toLowerCase()))
  );

  // Active selected route option details
  const activeRoute = activeDestination?.routes?.find(
    (r) => r.id === activeDestination.selectedRouteId
  ) || activeDestination?.routes?.[0];

  return (
    <>
      {/* ====================================================================== */}
      {/* 1. TOP COMMAND BAR                                                     */}
      {/* ====================================================================== */}
      <header className="absolute top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md px-3 py-2 border-b border-emerald-200/90 flex items-center justify-between gap-2 shadow-sm">
        {/* Left: Branding */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-black tracking-tight text-slate-900 select-none">
            Spot<span className="text-emerald-600">Hail</span>
          </span>
        </div>

        {/* Center: Destination & Route Setup Pill */}
        <div className="flex-1 min-w-0 mx-2 sm:mx-4">
          <button
            ref={destTriggerRef}
            type="button"
            onClick={() => {
              setIsDestDropdownOpen((prev) => {
                const next = !prev;
                if (next) {
                  setIsThemeMenuOpen(false);
                  if (activeDestination) {
                    setExpandedDestinationId(activeDestination.id);
                  }
                }
                return next;
              });
            }}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white border border-emerald-200 hover:border-emerald-300 text-left transition text-xs shadow-sm"
          >
            <div className="flex items-center gap-2 truncate flex-1 min-w-0">
              <Navigation className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              {activeDestination ? (
                <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                  <span className="font-bold text-slate-900 truncate">
                    → {activeDestination.name}
                  </span>
                  {activeRoute && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0 hidden sm:inline">
                      Estimated time: {activeRoute.estimatedMinutes} mins
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-slate-400 truncate">
                  Set Destination & Routes (e.g. Kattangal)...
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
                isDestDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        {/* Right: Seats Indicator (Number of Seats Filled / Total Seats with Color) & Settings */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Seats Filled / Total Seats Pill with Color Indication (NO BUBBLE INDICATOR) */}
          <div
            className={`px-3 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors ${seatsTheme}`}
            title={`Occupancy: ${occupancy} filled out of ${maxSeats} seats`}
          >
            <span className="text-[10px] tracking-wider uppercase opacity-80 hidden sm:inline">Seats</span>
            <span className="font-mono text-sm font-black tracking-tight">{occupancy}/{maxSeats}</span>
          </div>

          {/* Quick Settings Drawer Toggle */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition active:scale-95"
            aria-label="Open settings"
            title="Configure capacity and settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ====================================================================== */}
      {/* 2. TOP-RIGHT FLOATING MAP CONTROLS (GPS CROSSHAIR & MAP LAYERS)        */}
      {/* ====================================================================== */}
      <div className="absolute top-[75px] right-3 sm:right-4 z-20 flex flex-col items-center gap-2 pointer-events-auto">
        {/* Blue GPS Crosshair Icon Button */}
        <button
          type="button"
          onClick={() => {
            triggerHaptics?.();
            onRecenter?.();
          }}
          title="Locate me / Re-center vehicle"
          aria-label="Locate me with GPS"
          className="w-9 h-9 rounded-2xl bg-white/95 border border-emerald-200 text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 shadow-md transition shrink-0 active:scale-90 flex items-center justify-center backdrop-blur-md"
        >
          <LocateFixed className="w-4 h-4" />
        </button>

        {/* Green Map Layers Icon Button & Dropdown */}
        <div className="relative shrink-0" ref={layersDropdownRef}>
          <button
            ref={layersTriggerRef}
            type="button"
            onClick={() => {
              triggerHaptics?.();
              setIsThemeMenuOpen((prev) => {
                const next = !prev;
                if (next) {
                  setIsDestDropdownOpen(false);
                }
                return next;
              });
            }}
            className={`w-9 h-9 rounded-2xl border shadow-md flex items-center justify-center active:scale-90 transition-all ${
              isThemeMenuOpen
                ? "bg-emerald-600 text-white border-emerald-600 shadow-emerald-600/25 ring-2 ring-emerald-200"
                : "bg-white/95 backdrop-blur-2xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900"
            }`}
            aria-label="Toggle map layer style"
            title="Change map style"
          >
            <Layers className="w-4 h-4 stroke-[2.2]" />
          </button>

          {/* Dropdown Menu (Streets / Dark / Satellite) */}
          {isThemeMenuOpen && (
            <div className="absolute right-0 mt-2 bg-white/95 backdrop-blur-2xl border border-emerald-200 rounded-2xl p-1.5 shadow-xl flex flex-col gap-1 min-w-[130px] animate-in fade-in slide-in-from-top-2 z-30">
              <span className="text-[10px] font-black text-emerald-800/70 px-2 py-0.5 uppercase tracking-wider">
                Map Style
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptics?.();
                  onSelectMapTheme?.("streets");
                  setIsThemeMenuOpen(false);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold text-left transition ${
                  mapTheme === "streets" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-700 hover:bg-emerald-50"
                }`}
              >
                Streets
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptics?.();
                  onSelectMapTheme?.("dark");
                  setIsThemeMenuOpen(false);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold text-left transition ${
                  mapTheme === "dark" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-700 hover:bg-emerald-50"
                }`}
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptics?.();
                  onSelectMapTheme?.("satellite");
                  setIsThemeMenuOpen(false);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold text-left transition ${
                  mapTheme === "satellite" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-700 hover:bg-emerald-50"
                }`}
              >
                Satellite
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ====================================================================== */}
      {/* 2. EXPANDED DESTINATION & ROUTE DROPDOWN PANEL OVERLAY                  */}
      {/* ====================================================================== */}
      {isDestDropdownOpen && (
        <div
          ref={destDropdownRef}
          className="fixed top-14 sm:top-16 left-4 right-4 w-[calc(100%-2rem)] max-w-2xl mx-auto z-50 bg-white border border-emerald-200 rounded-2xl shadow-2xl p-3 animate-in fade-in slide-in-from-top-2 max-h-[80vh] flex flex-col"
        >
          {/* Header bar inside dropdown */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-100">
            <div className="flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                Select Destination & Corridors
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsDestDropdownOpen(false)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
              aria-label="Close destinations menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search filter input */}
          <div className="relative mb-2 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={destSearch}
              onChange={(e) => setDestSearch(e.target.value)}
              placeholder="Search destinations & routes..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-emerald-50/50 text-slate-900 rounded-lg border border-emerald-100 focus:outline-none focus:border-emerald-500 placeholder:text-slate-400 font-medium"
            />
          </div>

          {/* Corridor List with Route Options */}
          <div className="w-full space-y-2 overflow-y-auto max-h-[60vh] pr-1 divide-y divide-emerald-100">
            {filteredCorridors.map((c) => {
              const isSelected = activeDestination?.id === c.id;
              const isExpanded = expandedDestinationId === c.id;

              return (
                <div key={c.id} className="pt-2 first:pt-0">
                  {/* Destination Header Item */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptics?.();
                      setExpandedDestinationId((prevId) => (prevId === c.id ? null : c.id));
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs transition flex justify-between items-center gap-3 ${
                      isSelected
                        ? "bg-emerald-50 border border-emerald-300"
                        : "hover:bg-emerald-50/70 border border-transparent"
                    }`}
                  >
                    {/* Left: Location Pin & Title / Details */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <MapPin
                        className={`w-4 h-4 shrink-0 ${
                          isSelected ? "text-emerald-700" : "text-slate-400"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-extrabold text-slate-900 block truncate text-xs sm:text-sm">
                          {c.name}
                        </span>
                        <span className="text-[10px] sm:text-xs text-slate-500 block truncate">
                          Standard auto speed (~25 km/h) • {c.distanceKm} km
                        </span>
                      </div>
                    </div>

                    {/* Right: Estimated Time Badge & Chevron */}
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] sm:text-xs font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-1 rounded-full border border-emerald-200 whitespace-nowrap">
                        Estimated time: {c.estimatedMinutes} mins
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {/* Alternate Route Options Drawer */}
                  {isExpanded && c.routes && c.routes.length > 0 && (
                    <div className="mt-2 ml-2 pl-3 border-l-2 border-emerald-200 space-y-1.5 pb-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Select Route Option:
                      </span>
                      {c.routes.map((routeOpt) => {
                        const isCurrentRoute =
                          isSelected &&
                          (activeDestination.selectedRouteId === routeOpt.id ||
                            (!activeDestination.selectedRouteId && routeOpt.id === c.routes?.[0]?.id));

                        return (
                          <button
                            key={routeOpt.id}
                            type="button"
                            onClick={() => {
                              triggerHaptics?.();
                              onSelectDestination(
                                {
                                  ...c,
                                  selectedRouteId: routeOpt.id,
                                  distanceKm: routeOpt.distanceKm,
                                  estimatedMinutes: routeOpt.estimatedMinutes,
                                  via: routeOpt.via,
                                },
                                routeOpt
                              );
                              setIsDestDropdownOpen(false);
                            }}
                            className={`w-full text-left p-2.5 rounded-xl text-xs transition border flex flex-col gap-1 ${
                              isCurrentRoute
                                ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                                : "bg-white text-slate-800 hover:bg-emerald-50 border-emerald-100"
                            }`}
                          >
                            <div className="flex justify-between items-center w-full gap-2">
                              <div className="flex items-center gap-1.5 font-bold flex-1 min-w-0">
                                <Route
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isCurrentRoute ? "text-white" : "text-emerald-600"
                                  }`}
                                />
                                <span className="truncate">{routeOpt.name}</span>
                                <span
                                  className={`text-[10px] font-normal truncate ${
                                    isCurrentRoute ? "text-emerald-100" : "text-slate-500"
                                  }`}
                                >
                                  (via {routeOpt.via})
                                </span>
                              </div>
                              {isCurrentRoute && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0 ml-1" />
                              )}
                            </div>

                            <div className="flex justify-between items-center w-full text-[10px] mt-0.5 font-medium gap-2">
                              <span
                                className={`truncate flex-1 min-w-0 ${
                                  isCurrentRoute ? "text-emerald-100" : "text-slate-500"
                                }`}
                              >
                                {routeOpt.description}
                              </span>
                              <span
                                className={`font-bold shrink-0 whitespace-nowrap ml-2 ${
                                  isCurrentRoute ? "text-white" : "text-emerald-700"
                                }`}
                              >
                                Estimated time: {routeOpt.estimatedMinutes} mins ({routeOpt.distanceKm} km)
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredCorridors.length === 0 && (
              <div className="p-3 text-center text-xs text-slate-500 italic">
                No matching destinations found
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SETTINGS DRAWER MODAL                                                  */}
      {/* ====================================================================== */}
      {isSettingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 shadow-2xl animate-in slide-in-from-bottom-5 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-black text-white">Driver Cockpit Controls</h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-800"
                aria-label="Close settings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Vehicle Type Selector */}
            <div className="py-3.5 border-b border-slate-800">
              <label className="text-xs font-bold uppercase text-slate-400 block mb-2">
                Vehicle Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    triggerHaptics?.();
                    setVehicleType("AUTO");
                  }}
                  className={`py-2.5 px-3 rounded-2xl font-bold text-xs border flex items-center justify-center gap-2 transition ${
                    vehicleType === "AUTO"
                      ? "bg-emerald-600 text-white border-emerald-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <img src="/icons/auto.jpg" alt="Auto" className="w-5 h-5 rounded-md object-contain bg-white p-0.5" />
                  <span>Auto Rickshaw</span>
                </button>
                <button
                  onClick={() => {
                    triggerHaptics?.();
                    setVehicleType("ERICKSHAW");
                  }}
                  className={`py-2.5 px-3 rounded-2xl font-bold text-xs border flex items-center justify-center gap-2 transition ${
                    vehicleType === "ERICKSHAW"
                      ? "bg-emerald-600 text-white border-emerald-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <img src="/icons/erickshaw.jpg" alt="E-Rickshaw" className="w-5 h-5 rounded-md object-contain bg-white p-0.5" />
                  <span>E-Rickshaw</span>
                </button>
              </div>
            </div>

            {/* Dynamic Seating Capacity Selector (3, 4, or 6 Seats) */}
            <div className="py-3.5 border-b border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase text-slate-400 block">
                  Vehicle Seating Capacity
                </label>
                <span className="text-xs font-black text-amber-400">
                  {maxSeats} Passenger Seats
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {/* Option 1: 3 Seats (Standard) */}
                <button
                  type="button"
                  onClick={() => handleSetCapacity(3)}
                  className={`py-2.5 px-1.5 rounded-2xl text-xs font-bold border transition flex flex-col items-center justify-center gap-1.5 text-center ${
                    maxSeats === 3
                      ? "bg-emerald-600 text-white border-emerald-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750 hover:text-slate-200"
                  }`}
                >
                  <User className={`w-4 h-4 ${maxSeats === 3 ? "text-emerald-100" : "text-slate-400"}`} />
                  <span className="leading-tight text-[11px] sm:text-xs">3 Seats (Standard)</span>
                </button>

                {/* Option 2: 4 Seats (Shared) */}
                <button
                  type="button"
                  onClick={() => handleSetCapacity(4)}
                  className={`py-2.5 px-1.5 rounded-2xl text-xs font-bold border transition flex flex-col items-center justify-center gap-1.5 text-center ${
                    maxSeats === 4
                      ? "bg-emerald-600 text-white border-emerald-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750 hover:text-slate-200"
                  }`}
                >
                  <User className={`w-4 h-4 ${maxSeats === 4 ? "text-emerald-100" : "text-slate-400"}`} />
                  <span className="leading-tight text-[11px] sm:text-xs">4 Seats (Shared)</span>
                </button>

                {/* Option 3: 6 Seats (E-Rickshaw) */}
                <button
                  type="button"
                  onClick={() => handleSetCapacity(6)}
                  className={`py-2.5 px-1.5 rounded-2xl text-xs font-bold border transition flex flex-col items-center justify-center gap-1.5 text-center ${
                    maxSeats === 6
                      ? "bg-emerald-600 text-white border-emerald-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750 hover:text-slate-200"
                  }`}
                >
                  <User className={`w-4 h-4 ${maxSeats === 6 ? "text-emerald-100" : "text-slate-400"}`} />
                  <span className="leading-tight text-[11px] sm:text-xs">6 Seats (E-Rickshaw)</span>
                </button>
              </div>
            </div>

            {/* Destination Public Visibility Toggle */}
            <div className="py-3.5 border-b border-slate-800">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase text-slate-400 block">
                  Corridor Route Privacy & Broadcast
                </label>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  isOnline && showDestination
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}>
                  {isOnline && showDestination ? "Live Online" : "Offline"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2.5">
                {isOnline && showDestination
                  ? "Broadcasting active vehicle marker to passenger maps."
                  : "Vehicle marker hidden from passenger maps."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptics?.();
                    onTogglePublicRoute?.(true);
                    setShowDestination(true);
                  }}
                  className={`py-2.5 px-3 rounded-2xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${
                    isOnline && showDestination
                      ? "bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-500/20"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750 hover:text-slate-200"
                  }`}
                >
                  <Eye className="w-4 h-4 text-emerald-300" />
                  <span>Public Route (Online)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptics?.();
                    onTogglePublicRoute?.(false);
                    setShowDestination(false);
                  }}
                  className={`py-2.5 px-3 rounded-2xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${
                    !isOnline || !showDestination
                      ? "bg-slate-700 text-white border-slate-500 shadow-md ring-2 ring-slate-500/20"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750 hover:text-slate-200"
                  }`}
                >
                  <EyeOff className="w-4 h-4 text-slate-300" />
                  <span>Roaming / Private (Offline)</span>
                </button>
              </div>
            </div>

            {/* Diagnostics Sound + Haptics Test */}
            {onSimulatePing && (
              <div className="pt-3.5">
                <label className="text-xs font-bold uppercase text-slate-400 block mb-2">
                  Diagnostics Test
                </label>
                <button
                  onClick={onSimulatePing}
                  className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-xl flex items-center justify-center gap-2 active:scale-95 transition"
                >
                  <Bell className="w-4 h-4 text-white" />
                  <span>Test Passenger Handwave Alert (Sound + Haptics)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default DriverHeader;
