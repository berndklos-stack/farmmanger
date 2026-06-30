import { CheckCircle2, MapPin } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CircleMarker, MapContainer, Polygon, Popup, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import type { Field } from "../types";
import { formatCoordinates } from "../utils/geo";
import { MapBaseLayers } from "./MapBaseLayers";

type Props = {
  fields: Field[];
  selectedFieldIds: string[];
  onToggleField: (fieldId: string) => void;
};

export function FieldSelectionMap({ fields, selectedFieldIds, onToggleField }: Props) {
  const { t } = useTranslation();
  const selectedSet = useMemo(() => new Set(selectedFieldIds), [selectedFieldIds]);
  const mapCenter = fields[0]?.center ?? { lat: 55.72, lng: 13.18 };
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const points = fields.flatMap((field) => field.boundary.map((point) => [point.lat, point.lng] as [number, number]));
    return points.length > 0 ? points : null;
  }, [fields]);

  return (
    <div className="field-selection-map">
      <MapContainer center={[mapCenter.lat, mapCenter.lng]} className="leaflet-map" scrollWheelZoom zoom={14}>
        {bounds && <FitBounds bounds={bounds} />}
        <MapBaseLayers />
        {fields.map((field) => {
          const selected = selectedSet.has(field.id);
          return (
            <Polygon
              eventHandlers={{ click: () => onToggleField(field.id) }}
              key={field.id}
              pathOptions={{
                color: selected ? "#dff2ff" : "#e8fff0",
                fillColor: selected ? "#cceeff" : "#dff8cf",
                fillOpacity: selected ? 0.22 : 0.12,
                weight: selected ? 4 : 2,
              }}
              positions={field.boundary.map((point) => [point.lat, point.lng] as [number, number])}
            >
              <Popup>
                <strong>{field.name}</strong>
                <br />
                {field.areaHa} ha · {field.crop}
                <br />
                {selected ? t("createJob.fieldSelected") : t("createJob.clickToSelectField")}
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
              {field.accessPoint.label}
              <br />
              {formatCoordinates(field.accessPoint)}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="map-legend">
        <span><CheckCircle2 size={16} /> {t("createJob.fieldSelected")}</span>
        <span><MapPin size={16} /> {t("terms.accessPoint")}</span>
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
