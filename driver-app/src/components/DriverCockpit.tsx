"use client";

import React, { useMemo } from "react";
import { Plus, Minus, X, ChevronUp, MapPin } from "lucide-react";
import { CorridorDestination, SeatCapacity } from "@/types/spothail";

// Corridor Presets for 1-Tap Fast Selection
export const CORRIDORS: CorridorDestination[] = [
  {
    id: "nit-main-gate",
    name: "NIT Main Gate",
    via: "Rajpath",
    lat: 11.3216,
    lng: 75.9336,
  },
  {
    id: "kattangal-jn",
    name: "Kattangal Jn",
    via: "Main Road",
    lat: 11.3275,
    lng: 75.9348,
  },
  {
    id: "mbb-hostels",
    name: "MBB Hostels",
    via: "Campus Avenue",
    lat: 11.3175,
    lng: 75.9315,
  },
  {
    id: "kunnamangalam",
    name: "Kunnamangalam",
    via: "SH 34 Corridor",
    lat: 11.3056,
    lng: 75.8767,
  },
  {
    id: "kallanthod",
    name: "Kallanthod",
    via: "Mavoor Link",
    lat: 11.334,
    lng: 75.942,
  },
];

export interface DriverCockpitProps {
  occupancy: number;
  maxCapacity: SeatCapacity;
  isMinimized: boolean;
  setIsMinimized: (val: boolean) => void;
  handleDrop: () => void;
  handleBoard: () => void;
  handleCorridorSelect: (corridor: CorridorDestination) => void;
  activeCorridor: CorridorDestination | null;
  corridors?: CorridorDestination[];
  handleQuickEmpty?: () => void;
  handleQuickFull?: () => void;
  triggerHaptics?: () => void;
}

export const DriverCockpit: React.FC<DriverCockpitProps> = ({
  occupancy,
  maxCapacity,
  isMinimized,
  setIsMinimized,
  handleDrop,
  handleBoard,
  handleCorridorSelect,
  activeCorridor,
  corridors = CORRIDORS,
  handleQuickEmpty,
  handleQuickFull,
  triggerHaptics,
}) => {
  const isFull = occupancy >= maxCapacity;
  const isEmpty = occupancy === 0;

  const occupancyTheme = useMemo(() => {
    if (isEmpty) {
      return {
        bg: "bg-emerald-950/40 border-emerald-500/50",
        text: "text-emerald-400",
        badge: "bg-emerald-500 text-slate-950",
        label: "EMPTY AUTO",
        glow: "shadow-emerald-500/20",
      };
    }
    if (isFull) {
      return {
        bg: "bg-rose-950/40 border-rose-500/50",
        text: "text-rose-400",
        badge: "bg-rose-600 text-white",
        label: "FULL - NOT BOARDING",
        glow: "shadow-rose-500/20",
      };
    }
    return {
      bg: "bg-amber-950/40 border-amber-500/50",
      text: "text-amber-400",
      badge: "bg-amber-500 text-slate-950",
      label: "HAS SPACE",
      glow: "shadow-amber-500/20",
    };
  }, [isEmpty, isFull]);

  const toggleMinimized = () => {
    triggerHaptics?.();
    setIsMinimized(!isMinimized);
  };

  const expandCockpit = () => {
    triggerHaptics?.();
    setIsMinimized(false);
  };

  return (
    <section
      className={`relative w-full bg-slate-950 border-t border-slate-800/80 flex flex-col justify-between px-3.5 pt-1.5 pb-2.5 transition-all duration-300 ease-in-out z-20 ${
        isMinimized ? "h-16" : "h-[45%]"
      }`}
    >
      {/* Drag Handle & Collapse/Expand Bar */}
      <div className="flex items-center justify-between w-full pb-0.5">
        <button
          type="button"
          onClick={toggleMinimized}
          className="py-1 cursor-pointer flex-1 flex items-center justify-center -ml-2 select-none"
          aria-label={isMinimized ? "Expand cockpit" : "Collapse cockpit"}
        >
          <div className="w-10 h-1 bg-slate-700 hover:bg-slate-500 rounded-full transition-colors" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleMinimized();
          }}
          className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 text-[11px] font-black flex items-center gap-1 shadow-sm active:scale-95 transition"
        >
          {isMinimized ? (
            <span>🛺 {occupancy}/{maxCapacity} Seats ▾</span>
          ) : (
            <>
              <X className="w-3 h-3 text-slate-400" />
              <span>Collapse Cockpit</span>
            </>
          )}
        </button>
      </div>

      {/* Minimized Compact Bar View */}
      {isMinimized ? (
        <div
          onClick={expandCockpit}
          className="flex items-center justify-between w-full h-full pb-1 cursor-pointer select-none"
        >
          {/* Left: Occupancy badge & dot array */}
          <div className="flex items-center gap-2">
            <span className="text-xl">🛺</span>
            <span className="text-sm font-extrabold text-white">
              Occupancy:{" "}
              <span className={`font-mono font-black ${occupancyTheme.text}`}>
                {occupancy} / {maxCapacity} Seats
              </span>
            </span>
            <span className="text-sm">
              {isEmpty ? "🟢" : isFull ? "🔴" : "🟡"}
            </span>
          </div>

          {/* Right: Quick Expand button */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-bold hidden sm:inline">
              {activeCorridor?.name || "Local Roaming"}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                expandCockpit();
              }}
              className="px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition"
            >
              <span>Open</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Row 1: Giant Occupancy Counter & Status Badge */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${occupancyTheme.badge}`}
                >
                  {occupancyTheme.label}
                </span>
                <span className="text-xs text-slate-400 font-bold">
                  {maxCapacity - occupancy} seats free
                </span>
              </div>
              {/* Visual Dot Array */}
              <div className="flex items-center gap-1.5 mt-1">
                {Array.from({ length: maxCapacity }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-3 h-3 rounded-full border transition-all ${
                      idx < occupancy
                        ? isFull
                          ? "bg-rose-500 border-rose-400 shadow-sm shadow-rose-500"
                          : "bg-amber-400 border-amber-300 shadow-sm shadow-amber-500"
                        : "bg-slate-800 border-slate-700"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Giant Numbers */}
            <div className="flex items-baseline gap-1">
              <span
                className={`text-5xl font-black font-mono tracking-tight ${occupancyTheme.text}`}
              >
                {occupancy}
              </span>
              <span className="text-2xl font-bold font-mono text-slate-500">
                / {maxCapacity}
              </span>
            </div>
          </div>

          {/* Row 2: Massive Thumb-Zone Board/Drop Buttons */}
          <div className="grid grid-cols-2 gap-3 my-1">
            {/* Decrement Button: DROP PASSENGER */}
            <button
              disabled={occupancy <= 0}
              onClick={() => {
                triggerHaptics?.();
                handleDrop();
              }}
              className={`h-16 rounded-2xl flex items-center justify-center gap-3 font-black text-lg border shadow-xl transition-all active:scale-95 select-none ${
                occupancy <= 0
                  ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed opacity-50"
                  : "bg-slate-850 hover:bg-slate-800 border-slate-700 text-rose-300 active:bg-rose-950/30"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                <Minus className="w-5 h-5 stroke-[3]" />
              </div>
              <div className="text-left">
                <span className="block text-sm font-extrabold leading-none text-white">DROP</span>
                <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                  -1 Passenger
                </span>
              </div>
            </button>

            {/* Increment Button: BOARD PASSENGER */}
            <button
              disabled={occupancy >= maxCapacity}
              onClick={() => {
                triggerHaptics?.();
                handleBoard();
              }}
              className={`h-16 rounded-2xl flex items-center justify-center gap-3 font-black text-lg border shadow-xl transition-all active:scale-95 select-none ${
                occupancy >= maxCapacity
                  ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed opacity-50"
                  : "bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white shadow-emerald-900/40"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                <Plus className="w-5 h-5 stroke-[3]" />
              </div>
              <div className="text-left">
                <span className="block text-sm font-extrabold leading-none text-white">BOARD</span>
                <span className="text-[10px] text-emerald-100 font-semibold block mt-0.5">
                  +1 Passenger
                </span>
              </div>
            </button>
          </div>

          {/* Row 3: 1-Tap Quick Shortcut Pills */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                triggerHaptics?.();
                handleQuickEmpty?.();
              }}
              className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 font-bold text-xs border border-slate-800 active:scale-95 transition flex items-center justify-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Empty Auto (0/{maxCapacity})
            </button>
            <button
              onClick={() => {
                triggerHaptics?.();
                handleQuickFull?.();
              }}
              className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 font-bold text-xs border border-slate-800 active:scale-95 transition flex items-center justify-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Full Auto ({maxCapacity}/{maxCapacity})
            </button>
          </div>

          {/* Row 4: 1-Tap Horizontal Corridor Presets */}
          <div className="mt-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                1-Tap Corridor Destination
              </span>
              <span className="text-[10px] text-blue-400 font-bold">
                {activeCorridor?.name || "None"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {corridors.map((corridor) => {
                const isSelected = activeCorridor?.id === corridor.id;
                return (
                  <button
                    key={corridor.id}
                    onClick={() => {
                      triggerHaptics?.();
                      handleCorridorSelect(corridor);
                    }}
                    className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black border transition active:scale-95 flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-900/40"
                        : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-850"
                    }`}
                  >
                    <MapPin className="w-3 h-3 text-current" />
                    <span>{corridor.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default DriverCockpit;
