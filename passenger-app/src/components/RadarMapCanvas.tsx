"use client";

import React, { useMemo, useState, useEffect } from "react";
import { AutoDriver } from "@/types/spothail";
import { Navigation, Compass, Plus, Minus, RotateCcw, Radio, Sparkles } from "lucide-react";

interface RadarMapCanvasProps {
  center: { lat: number; lng: number };
  userPos: { lat: number; lng: number };
  autos: AutoDriver[];
  selectedAutoId: string | null;
  onSelectAuto: (driverId: string) => void;
  destinationText?: string;
  onOpenTokenModal?: () => void;
  hasMapboxToken?: boolean;
}

// Campus landmarks around NIT Calicut
const LANDMARKS = [
  { id: "main-gate", name: "NIT Main Gate Stand", lat: 11.3216, lng: 75.9336, icon: "🏛️" },
  { id: "mbb", name: "MBB Hostels", lat: 11.3175, lng: 75.9315, icon: "🏢" },
  { id: "kattangal", name: "Kattangal Junction", lat: 11.3275, lng: 75.9348, icon: "🚦" },
  { id: "library", name: "Central Library & East Campus", lat: 11.3228, lng: 75.9392, icon: "📚" },
  { id: "ladies-hostel", name: "Ladies Hostels (LH)", lat: 11.3195, lng: 75.9285, icon: "🏢" },
];

// Campus road corridors
const ROAD_CORRIDORS = [
  // Main Gate to Kattangal
  [
    { lat: 11.3216, lng: 75.9336 },
    { lat: 11.3245, lng: 75.9342 },
    { lat: 11.3275, lng: 75.9348 },
    { lat: 11.332, lng: 75.937 },
  ],
  // Main Gate to MBB Hostels
  [
    { lat: 11.3216, lng: 75.9336 },
    { lat: 11.3195, lng: 75.9325 },
    { lat: 11.3175, lng: 75.9315 },
  ],
  // Main Gate to Library / East Campus
  [
    { lat: 11.3216, lng: 75.9336 },
    { lat: 11.3222, lng: 75.9365 },
    { lat: 11.3228, lng: 75.9392 },
  ],
  // MBB to Ladies Hostels
  [
    { lat: 11.3175, lng: 75.9315 },
    { lat: 11.3185, lng: 75.9298 },
    { lat: 11.3195, lng: 75.9285 },
  ],
  // Main Gate toward Kunnamangalam (SH 34)
  [
    { lat: 11.3216, lng: 75.9336 },
    { lat: 11.316, lng: 75.926 },
    { lat: 11.311, lng: 75.92 },
  ],
];

export const RadarMapCanvas: React.FC<RadarMapCanvasProps> = ({
  center,
  userPos,
  autos,
  selectedAutoId,
  onSelectAuto,
  onOpenTokenModal,
  hasMapboxToken,
}) => {
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [sweepActive, setSweepActive] = useState(true);

  // SVG dimensions (virtual coordinates for viewBox)
  const V_WIDTH = 1200;
  const V_HEIGHT = 850;
  const CENTER_X = V_WIDTH / 2;
  const CENTER_Y = V_HEIGHT / 2;

  // 2km radar radius in SVG coordinate units
  const BASE_RADIUS = 360;
  const RADIUS = BASE_RADIUS * zoom;

  // Coordinate projection: 2km radius is ~0.018 degrees
  const MAX_LAT_DELTA = 0.018087;
  const MAX_LNG_DELTA = 0.018323;

  const projectCoords = (lat: number, lng: number) => {
    const dLat = lat - center.lat;
    const dLng = lng - center.lng;
    const x = CENTER_X + panOffset.x + (dLng / MAX_LNG_DELTA) * RADIUS;
    const y = CENTER_Y + panOffset.y - (dLat / MAX_LAT_DELTA) * RADIUS;
    return { x, y };
  };

  const selectedAuto = useMemo(
    () => autos.find((a) => a.driverId === selectedAutoId) || null,
    [autos, selectedAutoId]
  );

  // Drag pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const resetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const userPoint = projectCoords(userPos.lat, userPos.lng);

  return (
    <div
      className="relative w-full h-full bg-[#030712] overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-950/20 via-slate-950/80 to-[#030712] pointer-events-none" />

      {/* Futuristic Grid Overlay */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#38bdf8 1px, transparent 1px), linear-gradient(90deg, #38bdf8 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Top Banner Status Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2.5 bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-700/80 shadow-2xl">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-black tracking-wide text-white uppercase">
              2KM Real-Time Radar
            </span>
          </div>
          <span className="text-slate-600">•</span>
          <span className="text-xs font-medium text-slate-300">
            NIT Calicut Campus & Kattangal Corridor
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
            {autos.length} Active Autos Detected
          </span>
        </div>

        {/* Quick Mapbox / Settings Badge */}
        <div className="pointer-events-auto flex items-center gap-2">
          {!hasMapboxToken && (
            <button
              onClick={onOpenTokenModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold backdrop-blur-md shadow-lg transition active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Connect Mapbox 3D Tiles</span>
            </button>
          )}

          <button
            onClick={() => setSweepActive(!sweepActive)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold backdrop-blur-md shadow-lg transition active:scale-95 ${
              sweepActive
                ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/40"
                : "bg-slate-900/80 text-slate-400 border-slate-700"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Radar Sweep: {sweepActive ? "ON" : "OFF"}</span>
          </button>
        </div>
      </div>

      {/* SVG Canvas for High-Precision Vector Transit Radar */}
      <svg
        viewBox={`0 0 ${V_WIDTH} ${V_HEIGHT}`}
        className="w-full h-full pointer-events-none"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Sweep Beam Conic Shader */}
          <radialGradient id="radarSweepGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
            <stop offset="70%" stopColor="#0284c7" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#0369a1" stopOpacity="0" />
          </radialGradient>

          {/* User Location Pulse Filter */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Radar Concentric Distance Rings */}
        <g className="radar-grid">
          {[0.25, 0.5, 0.75, 1.0].map((fraction, index) => {
            const r = RADIUS * fraction;
            const distanceM = fraction * 2000;
            const label = distanceM >= 1000 ? `${distanceM / 1000}km` : `${distanceM}m`;
            const isOuter = fraction === 1.0;

            return (
              <g key={distanceM}>
                <circle
                  cx={CENTER_X + panOffset.x}
                  cy={CENTER_Y + panOffset.y}
                  r={r}
                  fill={isOuter ? "rgba(2, 132, 199, 0.04)" : "none"}
                  stroke={isOuter ? "#0284c7" : "#0369a1"}
                  strokeWidth={isOuter ? "2" : "1"}
                  strokeOpacity={isOuter ? "0.6" : "0.3"}
                  strokeDasharray={isOuter ? "none" : "6 6"}
                />
                {/* Distance Annotation Pill on the Radar Ring */}
                <text
                  x={CENTER_X + panOffset.x + 8}
                  y={CENTER_Y + panOffset.y - r + 14}
                  fill="#38bdf8"
                  fontSize="11"
                  fontWeight="bold"
                  opacity="0.75"
                  className="font-mono tracking-wider select-none"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Cardinal Radar Axes (Crosshairs & Diagonals) */}
          <g stroke="#0369a1" strokeWidth="1" strokeOpacity="0.25">
            {/* North-South Axis */}
            <line
              x1={CENTER_X + panOffset.x}
              y1={CENTER_Y + panOffset.y - RADIUS - 20}
              x2={CENTER_X + panOffset.x}
              y2={CENTER_Y + panOffset.y + RADIUS + 20}
            />
            {/* East-West Axis */}
            <line
              x1={CENTER_X + panOffset.x - RADIUS - 20}
              y1={CENTER_Y + panOffset.y}
              x2={CENTER_X + panOffset.x + RADIUS + 20}
              y2={CENTER_Y + panOffset.y}
            />
            {/* NW-SE Diagonal */}
            <line
              x1={CENTER_X + panOffset.x - RADIUS * 0.707}
              y1={CENTER_Y + panOffset.y - RADIUS * 0.707}
              x2={CENTER_X + panOffset.x + RADIUS * 0.707}
              y2={CENTER_Y + panOffset.y + RADIUS * 0.707}
              strokeDasharray="4 6"
            />
            {/* NE-SW Diagonal */}
            <line
              x1={CENTER_X + panOffset.x + RADIUS * 0.707}
              y1={CENTER_Y + panOffset.y - RADIUS * 0.707}
              x2={CENTER_X + panOffset.x - RADIUS * 0.707}
              y2={CENTER_Y + panOffset.y + RADIUS * 0.707}
              strokeDasharray="4 6"
            />
          </g>

          {/* Compass Rose Coordinates */}
          <text
            x={CENTER_X + panOffset.x}
            y={CENTER_Y + panOffset.y - RADIUS - 28}
            fill="#38bdf8"
            fontSize="12"
            fontWeight="black"
            textAnchor="middle"
            className="font-mono tracking-widest"
          >
            000° NORTH (Kattangal)
          </text>
          <text
            x={CENTER_X + panOffset.x}
            y={CENTER_Y + panOffset.y + RADIUS + 36}
            fill="#38bdf8"
            fontSize="12"
            fontWeight="black"
            textAnchor="middle"
            className="font-mono tracking-widest"
          >
            180° SOUTH (Hostel Avenue)
          </text>
          <text
            x={CENTER_X + panOffset.x + RADIUS + 32}
            y={CENTER_Y + panOffset.y + 4}
            fill="#38bdf8"
            fontSize="12"
            fontWeight="black"
            textAnchor="start"
            className="font-mono tracking-widest"
          >
            090° EAST (Library)
          </text>
          <text
            x={CENTER_X + panOffset.x - RADIUS - 32}
            y={CENTER_Y + panOffset.y + 4}
            fill="#38bdf8"
            fontSize="12"
            fontWeight="black"
            textAnchor="end"
            className="font-mono tracking-widest"
          >
            270° WEST
          </text>
        </g>

        {/* Animated Radar Sweep Beam */}
        {sweepActive && (
          <g transform={`translate(${CENTER_X + panOffset.x}, ${CENTER_Y + panOffset.y})`}>
            <g className="origin-center animate-[spin_5s_linear_infinite]">
              {/* Pie wedge beam */}
              <path
                d={`M 0 0 L ${RADIUS} 0 A ${RADIUS} ${RADIUS} 0 0 1 ${RADIUS * 0.866} ${
                  -RADIUS * 0.5
                } Z`}
                fill="url(#radarSweepGradient)"
              />
              {/* Leading beam line */}
              <line
                x1="0"
                y1="0"
                x2={RADIUS}
                y2="0"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeOpacity="0.8"
              />
            </g>
          </g>
        )}

        {/* Campus Roads Network */}
        <g className="campus-roads">
          {ROAD_CORRIDORS.map((corridor, idx) => {
            const points = corridor.map((c) => projectCoords(c.lat, c.lng));
            const pathData = points.reduce(
              (acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`,
              ""
            );
            return (
              <g key={idx}>
                {/* Road Glow */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.7"
                />
                {/* Road Center Line */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pathData}
                  fill="none"
                  stroke="#475569"
                  strokeWidth="1"
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </g>

        {/* Selected Auto Animated Route Line */}
        {selectedAuto && selectedAuto.destination && (
          <g className="selected-route-line">
            {(() => {
              const start = projectCoords(selectedAuto.lat, selectedAuto.lng);
              const end = projectCoords(
                selectedAuto.destination.lat ?? center.lat,
                selectedAuto.destination.lng ?? center.lng
              );
              return (
                <>
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="#2563eb"
                    strokeWidth="8"
                    strokeOpacity="0.3"
                    strokeLinecap="round"
                  />
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="#60a5fa"
                    strokeWidth="3.5"
                    strokeDasharray="8 6"
                    strokeLinecap="round"
                    className="animate-[pulse_1.5s_cubic-bezier(0.4,0,0.6,1)_infinite]"
                  />
                  {/* Destination Marker */}
                  <circle
                    cx={end.x}
                    cy={end.y}
                    r="8"
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                  />
                </>
              );
            })()}
          </g>
        )}

        {/* Campus Landmark Nodes */}
        <g className="landmarks">
          {LANDMARKS.map((lm) => {
            const pt = projectCoords(lm.lat, lm.lng);
            return (
              <g key={lm.id} transform={`translate(${pt.x}, ${pt.y})`}>
                <circle r="4" fill="#64748b" stroke="#334155" strokeWidth="2" />
                <rect
                  x="-60"
                  y="8"
                  width="120"
                  height="20"
                  rx="6"
                  fill="#0f172a"
                  fillOpacity="0.85"
                  stroke="#334155"
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="22"
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontWeight="bold"
                  textAnchor="middle"
                  className="select-none"
                >
                  {lm.name}
                </text>
              </g>
            );
          })}
        </g>

        {/* Passenger Location Marker (You / GPS Center) */}
        <g transform={`translate(${userPoint.x}, ${userPoint.y})`}>
          <circle r="26" fill="#38bdf8" fillOpacity="0.15" className="animate-ping" />
          <circle r="14" fill="#0284c7" fillOpacity="0.3" />
          <circle r="7" fill="#38bdf8" stroke="#ffffff" strokeWidth="2.5" filter="url(#glow)" />
          {/* Passenger Pin Label */}
          <rect
            x="-44"
            y="-32"
            width="88"
            height="22"
            rx="11"
            fill="#ffffff"
            stroke="#0284c7"
            strokeWidth="1.5"
            filter="url(#glow)"
          />
          <text
            x="0"
            y="-17"
            fill="#0369a1"
            fontSize="10"
            fontWeight="black"
            textAnchor="middle"
          >
            YOU (My GPS)
          </text>
        </g>
      </svg>

      {/* Interactive HTML Overlays for Autos (Crisp, High-DPI & Fully Clickable) */}
      <div className="absolute inset-0 pointer-events-none">
        {autos.map((auto) => {
          const pt = projectCoords(auto.lat, auto.lng);
          const isSelected = auto.driverId === selectedAutoId;
          const occ = auto.occupancy ?? auto.occupiedSeats ?? 0;
          const cap = auto.maxCapacity ?? auto.totalSeats ?? 4;
          const isEmpty = occ === 0;
          const isFull = occ >= cap;

          // Convert SVG virtual coordinates to CSS percentage
          const leftPct = (pt.x / V_WIDTH) * 100;
          const topPct = (pt.y / V_HEIGHT) * 100;

          // Traffic light coloring
          let badgeBg = "bg-amber-400 text-slate-950 border-amber-300";
          let dotColor = "text-amber-300";
          if (isEmpty) {
            badgeBg = "bg-emerald-500 text-slate-950 border-emerald-400";
            dotColor = "text-emerald-400";
          } else if (isFull) {
            badgeBg = "bg-rose-900 text-rose-200 border-rose-700";
            dotColor = "text-rose-400";
          }

          return (
            <div
              key={auto.driverId}
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                transform: "translate(-50%, -50%)",
              }}
              className="absolute z-20 pointer-events-auto transition-transform duration-300 hover:scale-110 cursor-pointer"
              onClick={() => onSelectAuto(auto.driverId)}
            >
              {/* Selected Auto Target Halo */}
              {isSelected && (
                <div className="absolute -inset-3 rounded-full border-2 border-blue-400 border-dashed animate-spin-slow pointer-events-none" />
              )}

              {/* Tactical Auto Pill */}
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-2xl border-2 font-extrabold text-xs transition active:scale-95 ${badgeBg} ${
                  isSelected ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-slate-950 scale-105" : ""
                }`}
              >
                <span className="text-sm">🛺</span>
                <span className="tracking-tight">{auto.label || auto.driverId}</span>
                <span className="font-mono bg-black/20 px-1.5 py-0.5 rounded text-[11px]">
                  {occ}/{cap}
                </span>
              </div>

              {/* Destination Tag */}
              {auto.showDestination && auto.destination && (
                <div className="mt-1 px-2 py-0.5 rounded bg-slate-900/90 text-[10px] text-slate-300 border border-slate-700/80 shadow text-center whitespace-nowrap mx-auto max-w-[130px] truncate">
                  → {auto.destination.name}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Canvas Controls (Bottom Right) */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2">
        <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-700/80 p-1.5 shadow-2xl flex flex-col gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
            className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white transition active:scale-90"
            title="Zoom In Radar"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="h-px bg-slate-800 mx-1" />
          <button
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.25))}
            className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white transition active:scale-90"
            title="Zoom Out Radar"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="h-px bg-slate-800 mx-1" />
          <button
            onClick={resetView}
            className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white transition active:scale-90"
            title="Reset Radar Center"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Scale indicator */}
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 text-[11px] font-mono font-bold text-slate-400 text-center shadow-lg">
          Zoom: {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  );
};

