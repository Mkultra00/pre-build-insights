import type { GeoPrecision } from "./report-schema";

/** Great-circle distance in metres. */
export function haversineM(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * The guardrail that stops a borough-wide fact from reading as a block-level one.
 * ADDRESS is assigned by the caller when a fact is tied to the target lot.
 */
export function precisionFor(
  distanceM: number | null,
  radiusM: number,
): GeoPrecision {
  if (distanceM === null || !Number.isFinite(distanceM)) return "UNVERIFIED";
  if (distanceM <= 25) return "ADDRESS";
  if (distanceM <= radiusM) return "IN_RADIUS";
  if (distanceM <= radiusM * 3) return "NEARBY";
  return "UNVERIFIED";
}

/** Renders only these. UNVERIFIED never reaches a page. */
export const RENDERABLE_PRECISION: GeoPrecision[] = [
  "ADDRESS",
  "IN_RADIUS",
  "NEARBY",
  "NEIGHBORHOOD",
];
