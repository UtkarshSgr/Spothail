export type SeatCapacity = 3 | 4 | 6;

export interface CorridorDestination {
  id: string;
  name: string;
  via?: string;
  lat: number;
  lng: number;
}

export interface DriverState {
  driverId: string;
  label?: string;
  lat: number;
  lng: number;
  occupancy: number;
  maxCapacity: SeatCapacity;
  isOnline: boolean;
  showDestination: boolean;
  destination: CorridorDestination | null;
}

export interface PassengerPing {
  id: string;
  lat: number;
  lng: number;
  timestamp: number;
  distanceMeters?: number;
}
