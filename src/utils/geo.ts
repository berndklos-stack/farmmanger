import type { Field, GeoPoint } from "../types";

export function googleMapsUrl(point: GeoPoint) {
  return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
}

export function googleMapsNativeUrl(point: GeoPoint) {
  return `comgooglemaps://?daddr=${point.lat},${point.lng}&directionsmode=driving`;
}

export function googleMapsSearchUrl(point: GeoPoint) {
  return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
}

export function appleMapsUrl(point: GeoPoint) {
  return `https://maps.apple.com/?daddr=${point.lat},${point.lng}`;
}

export function appleMapsNativeUrl(point: GeoPoint) {
  return `maps://?daddr=${point.lat},${point.lng}&dirflg=d`;
}

export function openStreetMapUrl(point: GeoPoint) {
  return `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=17/${point.lat}/${point.lng}`;
}

export function hittaMapsUrl(point: GeoPoint) {
  return `https://www.hitta.se/kartan!~${point.lat},${point.lng},16z?prefMapFramework=leaflet`;
}

function wgs84ToSweref99Tm(point: GeoPoint) {
  const axis = 6378137.0;
  const flattening = 1.0 / 298.257222101;
  const centralMeridian = 15.0;
  const scale = 0.9996;
  const falseNorthing = 0.0;
  const falseEasting = 500000.0;
  const lat = point.lat * Math.PI / 180;
  const lon = point.lng * Math.PI / 180;
  const lambdaZero = centralMeridian * Math.PI / 180;
  const e2 = flattening * (2.0 - flattening);
  const n = flattening / (2.0 - flattening);
  const aRoof = axis / (1.0 + n) * (1.0 + n * n / 4.0 + n ** 4 / 64.0);
  const delta1 = n / 2.0 - 2.0 * n ** 2 / 3.0 + 5.0 * n ** 3 / 16.0 + 41.0 * n ** 4 / 180.0;
  const delta2 = 13.0 * n ** 2 / 48.0 - 3.0 * n ** 3 / 5.0 + 557.0 * n ** 4 / 1440.0;
  const delta3 = 61.0 * n ** 3 / 240.0 - 103.0 * n ** 4 / 140.0;
  const delta4 = 49561.0 * n ** 4 / 161280.0;
  const aStar = e2 + e2 * e2 + e2 ** 3 + e2 ** 4;
  const bStar = -(7.0 * e2 * e2 + 17.0 * e2 ** 3 + 30.0 * e2 ** 4) / 6.0;
  const cStar = (224.0 * e2 ** 3 + 889.0 * e2 ** 4) / 120.0;
  const dStar = -(4279.0 * e2 ** 4) / 1260.0;
  const phiStar = lat - Math.sin(lat) * Math.cos(lat) * (
    aStar
    + bStar * Math.sin(lat) ** 2
    + cStar * Math.sin(lat) ** 4
    + dStar * Math.sin(lat) ** 6
  );
  const deltaLambda = lon - lambdaZero;
  const xiPrim = Math.atan(Math.tan(phiStar) / Math.cos(deltaLambda));
  const etaPrim = Math.atanh(Math.cos(phiStar) * Math.sin(deltaLambda));
  const northing = scale * aRoof * (
    xiPrim
    + delta1 * Math.sin(2.0 * xiPrim) * Math.cosh(2.0 * etaPrim)
    + delta2 * Math.sin(4.0 * xiPrim) * Math.cosh(4.0 * etaPrim)
    + delta3 * Math.sin(6.0 * xiPrim) * Math.cosh(6.0 * etaPrim)
    + delta4 * Math.sin(8.0 * xiPrim) * Math.cosh(8.0 * etaPrim)
  ) + falseNorthing;
  const easting = scale * aRoof * (
    etaPrim
    + delta1 * Math.cos(2.0 * xiPrim) * Math.sinh(2.0 * etaPrim)
    + delta2 * Math.cos(4.0 * xiPrim) * Math.sinh(4.0 * etaPrim)
    + delta3 * Math.cos(6.0 * xiPrim) * Math.sinh(6.0 * etaPrim)
    + delta4 * Math.cos(8.0 * xiPrim) * Math.sinh(8.0 * etaPrim)
  ) + falseEasting;
  return { easting: Math.round(easting), northing: Math.round(northing) };
}

export function lantmaterietMapsUrl(point: GeoPoint) {
  const { easting, northing } = wgs84ToSweref99Tm(point);
  return `https://minkarta.lantmateriet.se/?e=${easting}&n=${northing}&z=8&profile=karta&background=1&boundaries=true`;
}

export function formatCoordinates(point: GeoPoint) {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

export function getFieldGeoChecks(field: Field) {
  return [
    { label: "terms.fieldBoundary", ok: field.boundary.length >= 3, warning: "createJob.geoMissingBoundary" },
    { label: "terms.accessPoint", ok: Boolean(field.accessPoint), warning: "createJob.geoMissingAccess" },
    { label: "terms.accessInstructions", ok: field.accessDescription.trim().length > 0, warning: "createJob.geoMissingRoute" },
    { label: "terms.hazards", ok: field.hazards.length > 0, warning: "createJob.geoMissingHazards" },
  ];
}
