// Haversine formula for distance in meters
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Distance from point (lat, lng) to segment (p1, p2) in meters
function distanceToSegmentMeters(
  pLat: number,
  pLng: number,
  s1Lng: number,
  s1Lat: number,
  s2Lng: number,
  s2Lat: number
): number {
  const d12 = getDistanceMeters(s1Lat, s1Lng, s2Lat, s2Lng);
  if (d12 === 0) return getDistanceMeters(pLat, pLng, s1Lat, s1Lng);

  // Approximate projection in meters using local coordinates
  const toRad = Math.PI / 180;
  const cosLat = Math.cos(pLat * toRad);
  const x = (pLng - s1Lng) * 111320 * cosLat;
  const y = (pLat - s1Lat) * 110540;
  const dx = (s2Lng - s1Lng) * 111320 * cosLat;
  const dy = (s2Lat - s1Lat) * 110540;

  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy)));
  const projX = s1Lng + t * (s2Lng - s1Lng);
  const projLat = s1Lat + t * (s2Lat - s1Lat);

  return getDistanceMeters(pLat, pLng, projLat, projX);
}

// Check deviation of driver from active route polyline
export function getMinDistanceToPolyline(
  pointLat: number,
  pointLng: number,
  polyline: [number, number][]
): number {
  if (!polyline || polyline.length < 2) return 0;
  let minDist = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const [s1Lng, s1Lat] = polyline[i];
    const [s2Lng, s2Lat] = polyline[i + 1];
    const dist = distanceToSegmentMeters(pointLat, pointLng, s1Lng, s1Lat, s2Lng, s2Lat);
    if (dist < minDist) minDist = dist;
  }

  return minDist;
}

export interface RouteResult {
  coordinates: [number, number][]; // [[lng, lat], ...]
  distanceMeters: number;
  durationMinutes: number;
}

// Free OSRM driving route with automatic fallback
export async function fetchOSRMRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number }
): Promise<RouteResult> {
  const defaultDist = getDistanceMeters(start.lat, start.lng, end.lat, end.lng);
  // Estimate ~25 km/h for local auto/e-rickshaw
  const defaultMinutes = Math.max(1, Math.round((defaultDist / 1000 / 25) * 60));

  // Fallback direct geometry with a natural midpoint curve
  const fallbackCoords: [number, number][] = [
    [start.lng, start.lat],
    [(start.lng + end.lng) / 2 + 0.0003, (start.lat + end.lat) / 2 - 0.0002],
    [end.lng, end.lat],
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data?.routes?.[0]?.geometry?.coordinates?.length > 0) {
        const route = data.routes[0];
        const durationMin = Math.max(1, Math.round(route.duration / 60));
        return {
          coordinates: route.geometry.coordinates as [number, number][],
          distanceMeters: Math.round(route.distance),
          durationMinutes: durationMin,
        };
      }
    }
  } catch (err) {
    // Graceful fallback to local geometry
  }

  return {
    coordinates: fallbackCoords,
    distanceMeters: defaultDist,
    durationMinutes: defaultMinutes,
  };
}

