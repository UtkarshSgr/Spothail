export type VehicleType = 'AUTO' | 'ERICKSHAW';
export type OccupancyStatus = 'EMPTY' | 'HAS_SPACE' | 'FULL';
export type SeatCapacity = 3 | 4;

export interface DestinationInfo {
  name: string;
  via?: string;
  lat?: number;
  lng?: number;
  etaMinutes?: number;
}

export interface TransitVehicle {
  id: string;
  type: VehicleType;
  label: string;
  driverName?: string;
  registrationNumber?: string;
  lat: number;
  lng: number;
  occupancy: number; // current passengers (0 to maxCapacity)
  maxCapacity: SeatCapacity; // total seats (3 or 4)
  heading?: number;
  destination?: DestinationInfo | null;
  routePolyline?: [number, number][]; // [[lng, lat], ...] road route
  distanceMeters?: number;
  lastUpdated?: string | number;
}

export type VehicleFilter = 'ALL' | 'AUTO' | 'ERICKSHAW';
export type OccupancyFilter = 'ALL' | 'EMPTY' | 'HAS_SPACE';

export function getOccupancyStatus(occupancy: number, maxCapacity: number): OccupancyStatus {
  if (occupancy <= 0) return 'EMPTY';
  if (occupancy >= maxCapacity) return 'FULL';
  return 'HAS_SPACE';
}

export interface OccupancyTheme {
  color: string;
  badgeBg: string;
  textColor: string;
  borderColor: string;
  label: string;
  advice: string;
}

export function getOccupancyTheme(status: OccupancyStatus): OccupancyTheme {
  switch (status) {
    case 'EMPTY':
      return {
        color: '#10b981', // green
        badgeBg: 'bg-emerald-500/15',
        textColor: 'text-emerald-400',
        borderColor: 'border-emerald-500/40',
        label: 'Empty',
        advice: 'Plenty of seats open',
      };
    case 'HAS_SPACE':
      return {
        color: '#f59e0b', // yellow
        badgeBg: 'bg-amber-500/15',
        textColor: 'text-amber-400',
        borderColor: 'border-amber-500/40',
        label: 'Partly Full',
        advice: 'Has space, wave down!',
      };
    case 'FULL':
      return {
        color: '#ef4444', // red
        badgeBg: 'bg-rose-500/15',
        textColor: 'text-rose-400',
        borderColor: 'border-rose-500/40',
        label: 'Full',
        advice: "Don't bother waving",
      };
  }
}
