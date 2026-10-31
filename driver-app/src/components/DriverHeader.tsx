"use client";

import React, { useState } from "react";
import {
  Radio,
  Users,
  Settings,
  X,
  Eye,
  EyeOff,
  Bell,
  Zap,
} from "lucide-react";
import { SeatCapacity, VehicleType } from "@/types/spothail";

export interface DriverHeaderProps {
  isOnline: boolean;
  setIsOnline: (val: boolean) => void;
  vehicleType: VehicleType;
  setVehicleType: (type: VehicleType) => void;
  maxSeats: SeatCapacity;
  setMaxSeats: (seats: SeatCapacity) => void;
  showDestination: boolean;
  setShowDestination: (show: boolean) => void;
  onSimulatePing?: () => void;
  triggerHaptics?: () => void;
  isSettingsOpen?: boolean;
  setIsSettingsOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const DriverHeader: React.FC<DriverHeaderProps> = ({
  isOnline,
  setIsOnline,
  vehicleType,
  setVehicleType,
  maxSeats,
  setMaxSeats,
  showDestination,
  setShowDestination,
  onSimulatePing,
  triggerHaptics,
  isSettingsOpen: externalIsSettingsOpen,
  setIsSettingsOpen: externalSetIsSettingsOpen,
}) => {
  const [internalIsSettingsOpen, setInternalIsSettingsOpen] = useState(false);
  const isSettingsOpen =
    externalIsSettingsOpen !== undefined
      ? externalIsSettingsOpen
      : internalIsSettingsOpen;
  const setIsSettingsOpen =
    externalSetIsSettingsOpen || setInternalIsSettingsOpen;

  const handleToggleOnline = () => {
    triggerHaptics?.();
    setIsOnline(!isOnline);
  };

  const handleSetCapacity = (capacity: SeatCapacity) => {
    triggerHaptics?.();
    setMaxSeats(capacity);
  };

  return (
    <>
      {/* ====================================================================== */}
      {/* TOP COMMAND BAR WITH PROMINENT "BROADCASTING GPS" TOGGLE               */}
      {/* ====================================================================== */}
      <header className="absolute top-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md px-3.5 py-2 border-b border-slate-800 flex items-center justify-between shadow-lg">
        {/* Left: Branding & Vehicle Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-black tracking-tight text-white select-none">
            Spot<span className="text-blue-500">Hail</span>
          </span>

          {/* Quick Vehicle Type Toggle (Auto vs E-Rickshaw) */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => {
                triggerHaptics?.();
                setVehicleType("AUTO");
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
                vehicleType === "AUTO" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
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
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
                vehicleType === "ERICKSHAW" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
              title="E-Rickshaw (3-4 seats)"
            >
              <img src="/icons/erickshaw.jpg" alt="E-Rickshaw" className="w-4 h-4 rounded-full object-contain bg-white" />
              <span className="hidden sm:inline">E-Rick</span>
            </button>
          </div>
        </div>

        {/* Center: Large Prominent "Broadcasting GPS" Toggle */}
        <button
          onClick={handleToggleOnline}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-2xl text-xs font-black shadow-lg transition-all active:scale-95 border ${
            isOnline
              ? "bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white shadow-emerald-900/40"
              : "bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300"
          }`}
          aria-label={isOnline ? "Broadcasting GPS: ON" : "Broadcasting GPS: OFF"}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isOnline
                ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] animate-pulse"
                : "bg-slate-500"
            }`}
          />
          <span>{isOnline ? "Broadcasting GPS (LIVE)" : "Turn On GPS Broadcast"}</span>
        </button>

        {/* Right: Quick Capacity Selector (3 or 4) & Settings */}
        <div className="flex items-center gap-1.5">
          {/* Quick Capacity Toggle */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-xs font-mono font-bold">
            <button
              onClick={() => handleSetCapacity(3)}
              className={`px-2 py-1 rounded-lg transition ${
                maxSeats === 3 ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
              title="3 Seats capacity"
            >
              3S
            </button>
            <button
              onClick={() => handleSetCapacity(4)}
              className={`px-2 py-1 rounded-lg transition ${
                maxSeats === 4 ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
              title="4 Seats capacity"
            >
              4S
            </button>
          </div>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:text-white hover:bg-slate-750 transition active:scale-95"
            aria-label="Open settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ====================================================================== */}
      {/* SETTINGS DRAWER                                                        */}
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
                <Settings className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-black text-white">Driver HUD Controls</h3>
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
                      ? "bg-blue-600 text-white border-blue-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <span className="text-[10px] font-black tracking-wider text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-500/30">
                    AUTO
                  </span>
                  <span>Auto Rickshaw</span>
                </button>
                <button
                  onClick={() => {
                    triggerHaptics?.();
                    setVehicleType("ERICKSHAW");
                  }}
                  className={`py-2.5 px-3 rounded-2xl font-bold text-xs border flex items-center justify-center gap-2 transition ${
                    vehicleType === "ERICKSHAW"
                      ? "bg-blue-600 text-white border-blue-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <span className="text-[10px] font-black tracking-wider text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    EV
                  </span>
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
                      ? "bg-blue-600 text-white border-blue-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>3 Seats (Standard Auto)</span>
                </button>
                <button
                  onClick={() => handleSetCapacity(4)}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-bold border transition flex items-center justify-center gap-2 ${
                    maxSeats === 4
                      ? "bg-blue-600 text-white border-blue-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Users className="w-4 h-4" />
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
                      ? "bg-blue-700 text-white border-blue-500 shadow-md"
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
                  className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-xl flex items-center justify-center gap-2 active:scale-95 transition"
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
