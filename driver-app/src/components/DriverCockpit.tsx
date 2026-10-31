"use client";

import React from "react";
import { Plus, Minus } from "lucide-react";
import { CorridorDestination, SeatCapacity } from "@/types/spothail";

// Corridor Presets with Detailed Route Info & Alternate Routes around NIT Calicut
// Standard auto speed ~25 km/h (distanceKm / 25 * 60 = minutes)
export const CORRIDORS: CorridorDestination[] = [
  {
    id: "nit-main-gate",
    name: "NIT Main Gate",
    via: "Rajpath Main Ave",
    lat: 11.3216,
    lng: 75.9336,
    distanceKm: 1.8,
    estimatedMinutes: 4,
    selectedRouteId: "main-primary",
    routes: [
      {
        id: "main-primary",
        name: "Primary Route",
        via: "Rajpath Main Ave",
        distanceKm: 1.8,
        estimatedMinutes: 4,
        description: "Direct campus arterial corridor",
        trafficStatus: "Smooth",
      },
      {
        id: "main-alt",
        name: "Alternate Route",
        via: "East Ring Road",
        distanceKm: 2.4,
        estimatedMinutes: 6,
        description: "Bypasses campus speed breakers & pedestrian crossings",
        trafficStatus: "Normal",
      },
    ],
  },
  {
    id: "kattangal-jn",
    name: "Kattangal Jn",
    via: "Main Road",
    lat: 11.3275,
    lng: 75.9348,
    distanceKm: 2.2,
    estimatedMinutes: 5,
    selectedRouteId: "kattangal-primary",
    routes: [
      {
        id: "kattangal-primary",
        name: "Primary Route",
        via: "Main Road",
        distanceKm: 2.2,
        estimatedMinutes: 5,
        description: "Direct market corridor to auto stand",
        trafficStatus: "Normal",
      },
      {
        id: "kattangal-alt",
        name: "Alternate Route",
        via: "Bypass Link Road",
        distanceKm: 2.9,
        estimatedMinutes: 7,
        description: "Avoids Kattangal junction bottleneck",
        trafficStatus: "Smooth",
      },
    ],
  },
  {
    id: "mbb-hostels",
    name: "MBB Hostels",
    via: "Campus Avenue",
    lat: 11.3175,
    lng: 75.9315,
    distanceKm: 1.4,
    estimatedMinutes: 3,
    selectedRouteId: "mbb-primary",
    routes: [
      {
        id: "mbb-primary",
        name: "Primary Route",
        via: "Campus Avenue",
        distanceKm: 1.4,
        estimatedMinutes: 3,
        description: "Central student hostel corridor",
        trafficStatus: "Smooth",
      },
      {
        id: "mbb-alt",
        name: "Alternate Route",
        via: "Sports Complex Road",
        distanceKm: 2.1,
        estimatedMinutes: 5,
        description: "Quiet perimeter road around stadium",
        trafficStatus: "Normal",
      },
    ],
  },
  {
    id: "central-library",
    name: "Central Library",
    via: "East Campus",
    lat: 11.3228,
    lng: 75.9392,
    distanceKm: 1.6,
    estimatedMinutes: 4,
    selectedRouteId: "library-primary",
    routes: [
      {
        id: "library-primary",
        name: "Primary Route",
        via: "East Campus Ave",
        distanceKm: 1.6,
        estimatedMinutes: 4,
        description: "Direct route to library roundabout",
        trafficStatus: "Smooth",
      },
      {
        id: "library-alt",
        name: "Alternate Route",
        via: "South Admin Boulevard",
        distanceKm: 2.3,
        estimatedMinutes: 6,
        description: "Avoids department crossing pedestrian flow",
        trafficStatus: "Normal",
      },
    ],
  },
  {
    id: "kunnamangalam",
    name: "Kunnamangalam",
    via: "SH 34 Corridor",
    lat: 11.3056,
    lng: 75.8767,
    distanceKm: 6.5,
    estimatedMinutes: 16,
    selectedRouteId: "kunna-primary",
    routes: [
      {
        id: "kunna-primary",
        name: "Primary Route",
        via: "State Highway 34",
        distanceKm: 6.5,
        estimatedMinutes: 16,
        description: "Direct state highway corridor",
        trafficStatus: "Normal",
      },
      {
        id: "kunna-alt",
        name: "Alternate Route",
        via: "Old Town Bypass",
        distanceKm: 7.8,
        estimatedMinutes: 19,
        description: "Bypasses town center traffic congestion",
        trafficStatus: "Smooth",
      },
    ],
  },
  {
    id: "kallanthod",
    name: "Kallanthod",
    via: "Mavoor Link",
    lat: 11.334,
    lng: 75.942,
    distanceKm: 3.2,
    estimatedMinutes: 8,
    selectedRouteId: "kallan-primary",
    routes: [
      {
        id: "kallan-primary",
        name: "Primary Route",
        via: "Mavoor Link Road",
        distanceKm: 3.2,
        estimatedMinutes: 8,
        description: "Standard bus corridor route",
        trafficStatus: "Normal",
      },
      {
        id: "kallan-alt",
        name: "Alternate Route",
        via: "Canal Road",
        distanceKm: 4.1,
        estimatedMinutes: 10,
        description: "Smooth continuous moving bypass route",
        trafficStatus: "Smooth",
      },
    ],
  },
];

export interface DriverCockpitProps {
  occupancy: number;
  maxCapacity: SeatCapacity;
  handleDrop: () => void;
  handleBoard: () => void;
  triggerHaptics?: () => void;
}

export const DriverCockpit: React.FC<DriverCockpitProps> = ({
  occupancy,
  maxCapacity,
  handleDrop,
  handleBoard,
  triggerHaptics,
}) => {
  return (
    <div className="absolute bottom-5 left-3 right-3 sm:left-6 sm:right-6 max-w-lg mx-auto z-30 pointer-events-none">
      {/* Floating BOARD and DROP Thumb Zone */}
      <div className="pointer-events-auto grid grid-cols-2 gap-3 p-2 bg-white/95 backdrop-blur-xl border border-emerald-200/90 rounded-3xl shadow-xl">
        {/* DROP Button (-1 Passenger) */}
        <button
          disabled={occupancy <= 0}
          onClick={() => {
            triggerHaptics?.();
            handleDrop();
          }}
          className={`h-16 rounded-2xl flex items-center justify-center gap-3 font-black text-base border shadow-sm transition-all active:scale-95 select-none ${
            occupancy <= 0
              ? "bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed opacity-40"
              : "bg-slate-100 hover:bg-slate-200 border-rose-200 text-rose-700"
          }`}
          aria-label="Drop passenger (-1)"
        >
          <div className="w-8 h-8 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600">
            <Minus className="w-5 h-5 stroke-[3]" />
          </div>
          <div className="text-left">
            <span className="block text-sm font-black leading-none text-slate-900 tracking-wide">DROP</span>
            <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
              -1 Passenger
            </span>
          </div>
        </button>

        {/* BOARD Button (+1 Passenger) */}
        <button
          disabled={occupancy >= maxCapacity}
          onClick={() => {
            triggerHaptics?.();
            handleBoard();
          }}
          className={`h-16 rounded-2xl flex items-center justify-center gap-3 font-black text-base border shadow-sm transition-all active:scale-95 select-none ${
            occupancy >= maxCapacity
              ? "bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed opacity-40"
              : "bg-emerald-600 hover:bg-emerald-700 border-emerald-500 text-white shadow-emerald-600/30"
          }`}
          aria-label="Board passenger (+1)"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-500 border border-emerald-400 flex items-center justify-center text-white">
            <Plus className="w-5 h-5 stroke-[3]" />
          </div>
          <div className="text-left">
            <span className="block text-sm font-black leading-none text-white tracking-wide">BOARD</span>
            <span className="text-[10px] text-emerald-100 font-semibold block mt-0.5">
              +1 Passenger
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
