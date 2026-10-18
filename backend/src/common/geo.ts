export type GeoPoint = { type: 'Point'; coordinates: [number, number] };

/** API uses {lat, lng}; the database stores GeoJSON [lng, lat]. */
export function toPoint(lat: number, lng: number): GeoPoint {
  return { type: 'Point', coordinates: [lng, lat] };
}

export function fromPoint(p: { coordinates: number[] }): { lat: number; lng: number } {
  return { lat: p.coordinates[1] as number, lng: p.coordinates[0] as number };
}

/** Round integer paise to the nearest whole rupee (100 paise). */
export function roundToRupee(paise: number): number {
  return Math.round(paise / 100) * 100;
}

/** Great-circle distance in metres. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
