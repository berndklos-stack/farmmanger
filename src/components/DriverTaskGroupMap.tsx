import { CheckCircle2, MapPin, TriangleAlert } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LatLngBoundsExpression } from "leaflet";
import { CircleMarker, MapContainer, Polygon, Popup, useMap } from "react-leaflet";
import type { Field, Status } from "../types";
import { formatCoordinates } from "../utils/geo";
import { MapBaseLayers } from "./MapBaseLayers";

type Props = {
  fields: Field[];
  statusesByFieldId: Record<string, Status[]>;
};

export function DriverTaskGroupMap({ fields, statusesByFieldId }: Props) {
  const { t } = useTranslation();
  const mapCenter = fields[0]?.center ?? { lat: 55.72, lng: 13.18 };
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const points = fields.flatMap((field) => field.boundary.map((point) => [point.lat, point.lng] as [number, number]));
    return points.length > 0 ? points : null;
  }, [fields]);

  return (
    <div className="driver-task-group-map">
      <div className="map-meta-bar">
        <div>
          <strong>{t("driver.groupMap")}</strong>
          <span>{t("driver.groupMapFields", { count: fields.length })}</span>
        </div>
      </div>
      <MapContainer center={[mapCenter.lat, mapCenter.lng]} className="leaflet-map" scrollWheelZoom={false} zoom={13}>
        {bounds && <FitBounds bounds={bounds} />}
        <MapBaseLayers defaultLayer="imagery" />
        {fields.map((field) => {
          const statuses = statusesByFieldId[field.id] ?? [];
          return (
            <Polygon
              key={field.id}
              pathOptions={{ color: "#e8fff0", fillColor: "#dff8cf", fillOpacity: 0.13, weight: 3 }}
              positions={field.boundary.map((point) => [point.lat, point.lng] as [number, number])}
            >
              <Popup>
                <strong>{field.name}</strong>
                <br />
                {field.areaHa} ha · {field.crop}
                {statuses.length > 0 && (
                  <>
                    <br />
                    {statuses.map((status) => t(`status.${status}`)).join(", ")}
                  </>
                )}
              </Popup>
            </Polygon>
          );
        })}
        {fields.map((field) => (
          <CircleMarker
            center={[field.accessPoint.lat, field.accessPoint.lng]}
            key={`${field.id}-access`}
            pathOptions={{ color: "#1f5f9a", fillColor: "#1f78c1", fillOpacity: 0.95 }}
            radius={6}
          >
            <Popup>
              <strong>{t("terms.accessPoint")}</strong>
              <br />
              {field.name}
              <br />
              {field.accessPoint.label}
              <br />
              {formatCoordinates(field.accessPoint)}
            </Popup>
          </CircleMarker>
        ))}
        {fields.flatMap((field) => field.hazards.map((hazard) => (
          <CircleMarker
            center={[hazard.location.lat, hazard.location.lng]}
            key={`${field.id}-${hazard.id}`}
            pathOptions={{ color: "#9b2e1e", fillColor: "#d7533f", fillOpacity: 0.9 }}
            radius={5}
          >
            <Popup>
              <strong>{hazard.title}</strong>
              <br />
              {field.name}
              <br />
              {hazard.description}
            </Popup>
          </CircleMarker>
        )))}
      </MapContainer>
      <div className="map-legend">
        <span><CheckCircle2 size={16} /> {t("terms.fieldBoundary")}</span>
        <span><MapPin size={16} /> {t("terms.accessPoint")}</span>
        <span><TriangleAlert size={16} /> {t("terms.hazards")}</span>
      </div>
    </div>
  );
}

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [bounds, map]);

  return null;
}
