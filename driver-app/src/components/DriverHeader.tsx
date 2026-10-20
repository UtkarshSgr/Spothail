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
  Flame,
} from "lucide-react";
import { SeatCapacity } from "@/types/spothail";

export interface DriverHeaderProps {
  isOnline: boolean;
  setIsOnline: (val: boolean) => void;
  maxSeats: SeatCapacity;
  setMaxSeats: (seats: SeatCapacity) => void;
  showDestination: boolean;
  setShowDestination: (show: boolean) => void;
  showHeatmap?: boolean;
  setShowHeatmap?: React.Dispatch<React.SetStateAction<boolean>>;
  onSimulatePing?: () => void;
  triggerHaptics?: () => void;
  isSettingsOpen?: boolean;
  setIsSettingsOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const DriverHeader: React.FC<DriverHeaderProps> = ({
  isOnline,
  setIsOnline,
  maxSeats,
  setMaxSeats,
  showDestination,
  setShowDestination,
  showHeatmap,
  setShowHeatmap,
  onSimulatePing,
  triggerHaptics,
  isSettingsOpen: externalIsSettingsOpen,
  setIsSettingsOpen: externalSetIsSettingsOpen,
}) => {
  // Support both internal and controlled settings drawer state
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

  const handleSetDestinationPrivacy = (show: boolean) => {
    triggerHaptics?.();
    setShowDestination(show);
  };

  return (
    <>
      {/* ====================================================================== */}
      {/* TOP HEADER COMMAND STRIP                                              */}
      {/* ====================================================================== */}
      <header className="absolute top-0 left-0 right-0 z-40 bg-[#1C1C1E] px-3.5 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        {/* Left: SpotHail Branding & Compact Status Pill (Live / Offline Toggle) */}
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-black tracking-tight text-white select-none">
            Spot<span className="text-blue-500">Hail</span>
          </span>

          <button
            onClick={handleToggleOnline}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-semibold hover:bg-zinc-700 active:scale-95 transition"
            aria-label={
              isOnline
                ? "Status: Live (Tap to go offline)"
                : "Status: Offline (Tap to go live)"
            }
            title={isOnline ? "Live - Tap to go offline" : "Offline - Tap to go live"}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className={isOnline ? "text-white" : "text-zinc-300"}>
              {isOnline ? "Live" : "Offline"}
            </span>
          </button>
        </div>

        {/* Right: Action Controls (Heatmap & Settings) */}
        <div className="flex items-center gap-2">
          {/* Heatmap Toggle */}
          {setShowHeatmap && (
            <button
              onClick={() => setShowHeatmap((prev) => !prev)}
              className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 transition ${
                showHeatmap
                  ? "bg-zinc-800 text-yellow-400 border-yellow-400"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-yellow-400 hover:bg-zinc-700"
              }`}
              title="Toggle Commuter Heatmap"
            >
              <Flame
                className={`w-4 h-4 ${
                  showHeatmap ? "text-yellow-400" : "text-zinc-400"
                }`}
              />
            </button>
          )}

          {/* Gear Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-zinc-800 text-white border border-zinc-700 hover:bg-zinc-700 active:scale-95 transition"
            aria-label="Open settings"
          >
            <Settings className="w-4 h-4 text-white" />
          </button>
        </div>
      </header>

      {/* ====================================================================== */}
      {/* SLIDE-IN SETTINGS DRAWER                                               */}
      {/* ====================================================================== */}
      {isSettingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 shadow-2xl animate-in slide-in-from-bottom-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Drag Handle & Header */}
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-black text-white">HUD Cockpit Settings</h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-800"
                aria-label="Close settings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section 1: Broadcasting Status Toggle */}
            <div className="py-3.5 border-b border-slate-800">
              <label className="text-xs font-bold uppercase text-slate-400 block mb-2">
                Radar Visibility
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    triggerHaptics?.();
                    setIsOnline(true);
                  }}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-2 transition ${
                    isOnline
                      ? "bg-green-700 text-white border-green-700"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}
                >
                  <Radio className="w-4 h-4" />
                  <span>🟢 Online (Broadcast)</span>
                </button>
                <button
                  onClick={() => {
                    triggerHaptics?.();
                    setIsOnline(false);
                  }}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-2 transition ${
                    !isOnline
                      ? "bg-red-800 text-zinc-100 border-red-800"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}
                >
                  <span>⚫ Offline (Hidden)</span>
                </button>
              </div>
            </div>

            {/* Section 2: Dynamic Seating Capacity Selector */}
            <div className="py-3.5 border-b border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase text-slate-400 block">
                  Vehicle Seating Capacity
                </label>
                <span className="text-xs font-black text-amber-400">
                  {maxSeats} Seats
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleSetCapacity(3)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 ${
                    maxSeats === 3
                      ? "bg-blue-600 text-white border-blue-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>3 Seats (Standard)</span>
                </button>
                <button
                  onClick={() => handleSetCapacity(4)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 ${
                    maxSeats === 4
                      ? "bg-blue-600 text-white border-blue-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>4 Seats (Shared)</span>
                </button>
                <button
                  onClick={() => handleSetCapacity(6)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 ${
                    maxSeats === 6
                      ? "bg-blue-600 text-white border-blue-400 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>6 Seats (E-Rickshaw)</span>
                </button>
              </div>
            </div>

            {/* Section 3: Privacy Route Toggle */}
            <div className="py-3.5 border-b border-slate-800">
              <label className="text-xs font-bold uppercase text-slate-400 block mb-2">
                Corridor Route Privacy
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSetDestinationPrivacy(true)}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${
                    showDestination
                      ? "bg-blue-700 text-white border-blue-500 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  <span>👁️ Public Route</span>
                </button>
                <button
                  onClick={() => handleSetDestinationPrivacy(false)}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${
                    !showDestination
                      ? "bg-slate-700 text-white border-slate-500 shadow-md"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <EyeOff className="w-4 h-4" />
                  <span>🔒 Roaming / Private</span>
                </button>
              </div>
            </div>

            {/* Section 4: Demo Simulator Controls */}
            {onSimulatePing && (
              <div className="pt-3.5">
                <label className="text-xs font-bold uppercase text-slate-400 block mb-2">
                  Demo & Audio Diagnostics
                </label>
                <button
                  onClick={onSimulatePing}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl flex items-center justify-center gap-2 active:scale-95 transition"
                >
                  <Bell className="w-5 h-5 text-slate-950" />
                  <span>🔔 Simulate Passenger Ping (Sound + Vibrate)</span>
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
