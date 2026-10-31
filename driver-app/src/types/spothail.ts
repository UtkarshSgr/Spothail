export type VehicleType = 'AUTO' | 'ERICKSHAW';
export type SeatCapacity = 3 | 4;
export type OccupancyStatus = 'EMPTY' | 'HAS_SPACE' | 'FULL';

export function getOccupancyStatus(occupancy: number, maxCapacity: number): OccupancyStatus {
  if (occupancy <= 0) return 'EMPTY';
  if (occupancy >= maxCapacity) return 'FULL';
  return 'HAS_SPACE';
}

export interface RouteOption {
  id: string;
  name: string; // e.g. "Primary Route", "Alternate Route"
  via: string;
  distanceKm: number;
  estimatedMinutes: number; // calculated according to auto speed ~25 km/h
  description?: string;
  trafficStatus?: 'Normal' | 'Smooth' | 'Congested';
}

export interface CorridorDestination {
  id: string;
  name: string;
  via?: string;
  lat: number;
  lng: number;
  distanceKm?: number;
  estimatedMinutes?: number;
  selectedRouteId?: string;
  routes?: RouteOption[];
}

export interface DriverState {
  driverId: string;
  type: VehicleType;
  label?: string;
  lat: number;
  lng: number;
  occupancy: number;
  maxCapacity: SeatCapacity;
  isOnline: boolean;
  showDestination: boolean;
  destination: CorridorDestination | null;
  routePolyline?: [number, number][]; // [[lng, lat], ...] road route
  estimatedMinutes?: number;
  etaMinutes?: number;
}

export interface PassengerPing {
  id: string;
  lat: number;
  lng: number;
  timestamp: number;
  distanceMeters?: number;
}
