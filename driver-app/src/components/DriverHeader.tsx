"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import {
  CorridorDestination,
  RouteOption,
  SeatCapacity,
  VehicleType,
  getOccupancyStatus,
} from "@/types/spothail";

export interface DriverHeaderProps {
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
}

export const DriverHeader: React.FC<DriverHeaderProps> = ({
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
}) => {
  const [internalIsSettingsOpen, setInternalIsSettingsOpen] = useState(false);
  const [isDestDropdownOpen, setIsDestDropdownOpen] = useState(false);
  const [destSearch, setDestSearch] = useState("");
  const [expandedCorridorId, setExpandedCorridorId] = useState<string | null>(null);

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
      <header className="absolute top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md px-3 py-2 border-b border-emerald-200/90 flex items-center justify-between gap-2 shadow-sm">
        {/* Left: Branding & Vehicle Selector */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-black tracking-tight text-slate-900 select-none">
            Spot<span className="text-emerald-600">Hail</span>
          </span>

          {/* Quick Vehicle Type Toggle (Auto vs E-Rickshaw) */}
          <div className="flex items-center bg-emerald-50/80 p-0.5 rounded-xl border border-emerald-200 text-xs">
            <button
              onClick={() => {
                triggerHaptics?.();
                setVehicleType("AUTO");
              }}
              className={`px-2 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
                vehicleType === "AUTO" ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-800 hover:text-emerald-950"
              }`}
              title="Auto Rickshaw (3-4 seats)"
            >
              <img src="/icons/auto.jpg" alt="Auto" className="w-4 h-4 rounded-full object-contain bg-white" />
              <span className="hidden sm:inline">Auto</span>
            </button>
            <button
              onClick={() => {
                triggerHaptics?.();
                setVehicleType("ERICKSHAW");
              }}
              className={`px-2 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
                vehicleType === "ERICKSHAW" ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-800 hover:text-emerald-950"
              }`}
              title="E-Rickshaw (3-4 seats)"
            >
              <img src="/icons/erickshaw.jpg" alt="E-Rickshaw" className="w-4 h-4 rounded-full object-contain bg-white" />
              <span className="hidden sm:inline">E-Rick</span>
            </button>
          </div>
        </div>

        {/* Center: Destination & Route Setup Pill with Dropdown */}
        <div className="relative flex-1 max-w-xs sm:max-w-md mx-auto">
          <button
            type="button"
            onClick={() => {
              setIsDestDropdownOpen((prev) => !prev);
              if (activeDestination) {
                setExpandedCorridorId(activeDestination.id);
              }
            }}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white border border-emerald-200 hover:border-emerald-300 text-left transition text-xs shadow-sm"
          >
            <div className="flex items-center gap-1.5 truncate">
              <Navigation className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              {activeDestination ? (
                <div className="flex items-center gap-1.5 truncate">
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
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {/* Destination & Alternate Routes Dropdown Menu */}
          {isDestDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-emerald-200 rounded-2xl shadow-xl p-2.5 z-50 animate-in fade-in slide-in-from-top-2 max-h-96 flex flex-col">
              {/* Search filter input */}
              <div className="relative mb-2">
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
              <div className="space-y-2 overflow-y-auto max-h-80 pr-1 divide-y divide-emerald-100">
                {filteredCorridors.map((c) => {
                  const isSelected = activeDestination?.id === c.id;
                  const isExpanded = expandedCorridorId === c.id || isSelected;

                  return (
                    <div key={c.id} className="pt-2 first:pt-0">
                      {/* Destination Header Item */}
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedCorridorId(isExpanded ? null : c.id);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs transition flex items-center justify-between gap-2 ${
                          isSelected
                            ? "bg-emerald-50 border border-emerald-300"
                            : "hover:bg-emerald-50/70 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <MapPin className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-emerald-700" : "text-slate-400"}`} />
                          <div>
                            <span className="font-extrabold text-slate-900 block truncate">{c.name}</span>
                            <span className="text-[10px] text-slate-500 block truncate">
                              Standard auto speed (~25 km/h) • {c.distanceKm} km
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-200">
                            Estimated time: {c.estimatedMinutes} mins
                          </span>
                          <ChevronDown
                            className={`w-3 h-3 text-slate-400 transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>

                      {/* Alternate Route Options Drawer */}
                      {isExpanded && c.routes && c.routes.length > 0 && (
                        <div className="mt-1.5 ml-2 pl-3 border-l-2 border-emerald-200 space-y-1.5 pb-1">
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
                                className={`w-full text-left p-2 rounded-xl text-xs transition border flex flex-col gap-0.5 ${
                                  isCurrentRoute
                                    ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                                    : "bg-white text-slate-800 hover:bg-emerald-50 border-emerald-100"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 font-bold">
                                    <Route className={`w-3 h-3 ${isCurrentRoute ? "text-white" : "text-emerald-600"}`} />
                                    <span>{routeOpt.name}</span>
                                    <span className={`text-[10px] font-normal ${isCurrentRoute ? "text-emerald-100" : "text-slate-500"}`}>
                                      (via {routeOpt.via})
                                    </span>
                                  </div>
                                  {isCurrentRoute && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                                  )}
                                </div>

                                <div className="flex items-center justify-between text-[10px] mt-0.5 font-medium">
                                  <span className={isCurrentRoute ? "text-emerald-100" : "text-slate-500"}>
                                    {routeOpt.description}
                                  </span>
                                  <span className={`font-bold shrink-0 ml-2 ${isCurrentRoute ? "text-white" : "text-emerald-700"}`}>
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

            {/* Dynamic Seating Capacity Selector (3 or 4 Seats) */}
            <div className="py-3.5 border-b border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase text-slate-400 block">
                  Vehicle Seating Capacity
                </label>
                <span className="text-xs font-black text-amber-400">
                  {maxSeats} Passenger Seats
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSetCapacity(3)}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-bold border transition flex items-center justify-center gap-2 ${
                    maxSeats === 3
                      ? "bg-emerald-600 text-white border-emerald-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <span>3 Seats (Standard Auto)</span>
                </button>
                <button
                  onClick={() => handleSetCapacity(4)}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-bold border transition flex items-center justify-center gap-2 ${
                    maxSeats === 4
                      ? "bg-emerald-600 text-white border-emerald-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <span>4 Seats (Shared Auto / E-Rick)</span>
                </button>
              </div>
            </div>

            {/* Destination Public Visibility Toggle */}
            <div className="py-3.5 border-b border-slate-800">
              <label className="text-xs font-bold uppercase text-slate-400 block mb-2">
                Corridor Route Privacy
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    triggerHaptics?.();
                    setShowDestination(true);
                  }}
                  className={`py-2.5 px-3 rounded-2xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${
                    showDestination
                      ? "bg-emerald-700 text-white border-emerald-500 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  <span>Public Route</span>
                </button>
                <button
                  onClick={() => {
                    triggerHaptics?.();
                    setShowDestination(false);
                  }}
                  className={`py-2.5 px-3 rounded-2xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${
                    !showDestination
                      ? "bg-slate-700 text-white border-slate-500 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <EyeOff className="w-4 h-4" />
                  <span>Roaming / Private</span>
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
