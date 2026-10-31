import { TransitVehicle } from '@/types/spothail';

export const NIT_CALICUT_COORDS = {
  lat: 11.3216,
  lng: 75.9336,
  zoom: 15.5,
};

// Smooth corridor road waypoints for continuous path simulation
const PATH_MAIN_KATTANGAL: [number, number][] = [
  [75.9336, 11.3216],
  [75.9338, 11.3224],
  [75.9340, 11.3232],
  [75.9342, 11.3242],
  [75.9344, 11.3252],
  [75.9346, 11.3263],
  [75.9348, 11.3275],
];

const PATH_MAIN_MBB: [number, number][] = [
  [75.9336, 11.3216],
  [75.9333, 11.3208],
  [75.9329, 11.3200],
  [75.9325, 11.3192],
  [75.9320, 11.3184],
  [75.9317, 11.3178],
  [75.9315, 11.3175],
];

const PATH_MAIN_LIBRARY: [number, number][] = [
  [75.9336, 11.3216],
  [75.9348, 11.3219],
  [75.9360, 11.3222],
  [75.9372, 11.3225],
  [75.9382, 11.3227],
  [75.9392, 11.3228],
];

export const MOCK_TRANSIT_VEHICLES: TransitVehicle[] = [
  // ── AUTO #01: Patrolling Main Gate <-> Kattangal Stand ──────────────────────
  {
    id: 'AUTO-01',
    type: 'AUTO',
    label: 'Auto #01',
    driverName: 'Suresh Kumar',
    registrationNumber: 'KL-11-AK-4821',
    lat: 11.3232,
    lng: 75.9340,
    occupancy: 0,
    maxCapacity: 3,
    heading: 30,
    distanceMeters: 210,
    pathWaypoints: PATH_MAIN_KATTANGAL,
    pathIndex: 2,
    pathDirection: 1,
    terminusA: {
      name: 'NIT Main Gate',
      via: 'Campus Road',
      lat: 11.3216,
      lng: 75.9336,
      etaMinutes: 2,
    },
    terminusB: {
      name: 'Kattangal Stand',
      via: 'Main Road',
      lat: 11.3275,
      lng: 75.9348,
      etaMinutes: 3,
    },
    destination: {
      name: 'Kattangal Stand',
      via: 'Main Road',
      lat: 11.3275,
      lng: 75.9348,
      etaMinutes: 3,
    },
  },

  // ── AUTO #02: Patrolling Main Gate <-> MBB Hostels ─────────────────────────
  {
    id: 'AUTO-02',
    type: 'AUTO',
    label: 'Auto #02',
    driverName: 'Manoj P.',
    registrationNumber: 'KL-11-BG-1092',
    lat: 11.3200,
    lng: 75.9329,
    occupancy: 2,
    maxCapacity: 4,
    heading: 195,
    distanceMeters: 340,
    pathWaypoints: PATH_MAIN_MBB,
    pathIndex: 2,
    pathDirection: 1,
    terminusA: {
      name: 'NIT Main Gate',
      via: 'Campus Avenue',
      lat: 11.3216,
      lng: 75.9336,
      etaMinutes: 3,
    },
    terminusB: {
      name: 'MBB Hostels',
      via: 'Hostel Road',
      lat: 11.3175,
      lng: 75.9315,
      etaMinutes: 2,
    },
    destination: {
      name: 'MBB Hostels',
      via: 'Hostel Road',
      lat: 11.3175,
      lng: 75.9315,
      etaMinutes: 2,
    },
  },

  // ── E-RICKSHAW #01: Patrolling Main Gate <-> Central Library Loop ─────────
  {
    id: 'ERICK-01',
    type: 'ERICKSHAW',
    label: 'E-Rickshaw #01',
    driverName: 'Shyam Sundar',
    registrationNumber: 'KL-11-ER-1021',
    lat: 11.3222,
    lng: 75.9360,
    occupancy: 1,
    maxCapacity: 4,
    heading: 100,
    distanceMeters: 280,
    pathWaypoints: PATH_MAIN_LIBRARY,
    pathIndex: 2,
    pathDirection: 1,
    terminusA: {
      name: 'NIT Main Gate',
      via: 'East Campus Road',
      lat: 11.3216,
      lng: 75.9336,
      etaMinutes: 3,
    },
    terminusB: {
      name: 'Central Library Loop',
      via: 'East Campus',
      lat: 11.3228,
      lng: 75.9392,
      etaMinutes: 2,
    },
    destination: {
      name: 'Central Library Loop',
      via: 'East Campus',
      lat: 11.3228,
      lng: 75.9392,
      etaMinutes: 2,
    },
  },
];
