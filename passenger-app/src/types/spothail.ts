export type SeatStatus = 'EMPTY' | 'HAS_SPACE' | 'FULL';

export interface DestinationInfo {
  name: string;
  via?: string;
  lat?: number;
  lng?: number;
}

export interface AutoDriver {
  driverId: string;
  id?: string;
  label?: string;
  name?: string;
  registrationNumber?: string;
  lat: number;
  lng: number;
  occupancy: number;
  maxCapacity: number;
  occupiedSeats?: number;
  totalSeats?: number;
  heading?: number;
  showDestination?: boolean;
  destination?: DestinationInfo | null;
  distanceMeters?: number;
  lastUpdated?: string | number;
}

export type FilterType = 'ALL' | 'EMPTY' | 'HAS_SPACE' | 'SEARCH_DESTINATION';
export type FilterMode = 'ALL' | 'EMPTY' | 'HAS_SPACE' | 'DESTINATION';

export interface PingState {
  driverId: string;
  timestamp: number;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  cooldownSeconds: number;
}

/**
 * Helper to compute SeatStatus given occupied and total seats
 */
export function getSeatStatus(
  occupiedSeats: number,
  totalSeats: number = 4
): SeatStatus {
  if (occupiedSeats <= 0) return 'EMPTY';
  if (occupiedSeats < totalSeats) return 'HAS_SPACE';
  return 'FULL';
}

/**
 * Helper to get available seats count
 */
export function getAvailableSeats(driver: AutoDriver): number {
  const max = driver.maxCapacity ?? driver.totalSeats ?? 4;
  const occ = driver.occupancy ?? driver.occupiedSeats ?? 0;
  return Math.max(0, max - occ);
}
