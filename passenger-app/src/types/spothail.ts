export type VehicleType = 'AUTO' | 'BUS';
export type OccupancyStatus = 'EMPTY' | 'HAS_SPACE' | 'FULL';

export interface DestinationInfo {
  name: string;
  via?: string;
  lat?: number;
  lng?: number;
}

export interface TransitVehicle {
  id: string;
  type: VehicleType;
  label: string;
  routeNumber?: string;
  driverName?: string;
  registrationNumber?: string;
  lat: number;
  lng: number;
  occupancy: number; // current passengers
  maxCapacity: number; // total seats/capacity
  heading?: number;
  destination?: DestinationInfo | null;
  distanceMeters?: number;
  lastUpdated?: string | number;
}

export type VehicleFilter = 'ALL' | 'AUTO' | 'BUS';
export type OccupancyFilter = 'ALL' | 'EMPTY' | 'HAS_SPACE';

export function getOccupancyStatus(occupancy: number, maxCapacity: number): OccupancyStatus {
  if (occupancy <= 0) return 'EMPTY';
  if (occupancy >= maxCapacity) return 'FULL';
  return 'HAS_SPACE';
}
