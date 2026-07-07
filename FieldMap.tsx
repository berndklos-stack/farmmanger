import { AlertTriangle, Check, Copy, ExternalLink, MapPin, Navigation, Pencil, Route, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { divIcon } from "leaflet";
import type { LeafletMouseEvent } from "leaflet";
import type { Field, FieldAccessPoint, FieldHazard, FieldHazardType, FieldMapStyle, GeoPoint, Status } from "../types";
import { appleMapsUrl, formatCoordinates, googleMapsUrl, hittaMapsUrl, lantmaterietMapsUrl, openStreetMapUrl } from "../utils/geo";
import { MapBaseLayers } from "./MapBaseLayers";

type FieldWorkMapStatus = FieldMapStyle & {
  taskName?: string;
  workState?: "manual" | "planned" | "active" | "completed";
  dueDate?: string;
  lastAction?: { date?: string; label: string };
  nextAction?: { date?: string; label: string };
  note?: string;
};

type Props = {
  field: Field;
  contextFields?: Field[];
  fieldMapStatuses?: Record<string, FieldWorkMapStatus | undefined>;
  statuses?: Status[];
  compact?: boolean;
  editable?: boolean;
  defaultMapLayer?: "map" | "imagery";
  showActions?: boolean;
  onBoundaryChange?: (boundary: GeoPoint[]) => void;
  onAccessPointChange?: (accessPoint: FieldAccessPoint) => void;
  onHazardAdd?: (hazard: FieldHazard) => void;
};

type MapEditMode = "none" | "boundary" | "access" | "hazard";

export function FieldMap({
  field,
  contextFields = [],
  fieldMapStatuses = {},
  statuses = [],
  compact = false,
  editable = false,
  defaultMapLayer,
  showActions = true,
  onBoundaryChange,
  onAccessPointChange,
  onHazardAdd,
}: Props) {
  const { t, i18n } = useTranslation();
  const access = field.accessPoint;
  const [editMode, setEditMode] = useState<MapEditMode>("none");
  const [draftBoundary, setDraftBoundary] = useState<GeoPoint[]>([]);
  const [draftAccessPoint, setDraftAccessPoint] = useState<GeoPoint | null>(null);
  const [draftHazardPoint, setDraftHazardPoint] = useState<GeoPoint | null>(null);
  const [draftHazard, setDraftHazard] = useState<{ type: FieldHazardType; title: string; description: string }>({
    type: "other",
    title: "",
    description: "",
  });
  const boundaryPositions = useMemo(
    () => field.boundary.map((point) => [point.lat, point.lng] as [number, number]),
    [field.boundary],
  );
  const draftPositions = draftBoundary.map((point) => [point.lat, point.lng] as [number, number]);
  const googleUrl = googleMapsUrl(access);
  const appleUrl = appleMapsUrl(access);
  const selectedMapStatus = fieldMapStatuses[field.id];
  const getFieldPathOptions = (targetField: Field, isMainField: boolean) => {
    const mapStatus = fieldMapStatuses[targetField.id];
    const baseStyle = targetField.mapStyle;
    const color = mapStatus?.color ?? baseStyle?.color ?? (isMainField ? "#dff8cf" : "#f4fff2");
    const pattern = mapStatus?.pattern ?? baseStyle?.pattern;
    const patternId = pattern === "whiteDots" ? `field-work-dots-${targetField.id}` : undefined;
    return {
      color: isMainField ? "#e8fff0" : "#f4fff2",
      dashArray: isMainField ? undefined : "6 6",
      fillColor: patternId ? `url(#${patternId})` : color,
      fillOpacity: mapStatus ? 0.74 : baseStyle ? 0.34 : isMainField ? 0.14 : 0.08,
      opacity: 0.9,
      weight: mapStatus?.workState === "active" ? 5 : isMainField ? 3 : 2,
    };
  };
  const getWorkStateSymbol = (state?: FieldWorkMapStatus["workState"]) => {
    if (state === "active") return "▶";
    if (state === "manual") return "!";
    if (state === "completed") return "✓";
    return "○";
  };
  const getWorkStateLabel = (state?: FieldWorkMapStatus["workState"]) => {
    if (state === "active") return t("fields.workStateActive");
    if (state === "manual") return t("fields.workStateManual");
    if (state === "completed") return t("fields.workStateCompleted");
    return t("fields.workStatePlanned");
  };
  const workStateIcon = (mapStatus?: typeof selectedMapStatus) => divIcon({
    className: `field-work-state-marker ${mapStatus?.workState ?? "planned"}`,
    html: `<span>${getWorkStateSymbol(mapStatus?.workState)}</span>`,
    iconAnchor: [12, 12],
    iconSize: [24, 24],
  });
  const formatTooltipDate = (value?: string) => {
    if (!value) return "";
    const isoMatch = value.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    const parsed = new Date(isoMatch ?? value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: "short" }).format(parsed);
  };
  const actionLine = (action?: FieldWorkMapStatus["lastAction"]) => {
    if (!action) return "";
    const date = formatTooltipDate(action.date);
    return date ? `${action.label} · ${date}` : action.label;
  };
  const FieldTooltipContent = ({ mapStatus, targetField }: { mapStatus?: FieldWorkMapStatus; targetField: Field }) => (
    <>
      <strong>{targetField.name}</strong>
      <br />
      {targetField.areaHa} ha
      {mapStatus && (
        <>
          <br />
          {mapStatus.label}
          {mapStatus.lastAction && (
            <>
              <br />
              {t("fields.lastAction")}: {actionLine(mapStatus.lastAction)}
            </>
          )}
          {mapStatus.nextAction && (
            <>
              <br />
              {t("fields.nextAction")}: {actionLine(mapStatus.nextAction)}
            </>
          )}
        </>
      )}
    </>
  );

  useEffect(() => {
    setDraftBoundary([]);
    setDraftAccessPoint(null);
    setDraftHazardPoint(null);
    setEditMode("none");
  }, [field.id]);

  function handleMapEditClick(point: GeoPoint) {
    if (editMode === "boundary") {
      setDraftBoundary((current) => [...current, point]);
      return;
    }
    if (editMode === "access") {
      setDraftAccessPoint(point);
      return;
    }
    if (editMode === "hazard") {
      setDraftHazardPoint(point);
      return;
    }
  }

  function handleEditableLayerClick(event: LeafletMouseEvent) {
    if (editMode === "none") return;
    event.originalEvent.preventDefault();
    event.originalEvent.stopPropagation();
    handleMapEditClick({ lat: event.latlng.lat, lng: event.latlng.lng });
  }

  function undoDraftPoint() {
    setDraftBoundary((current) => current.slice(0, -1));
  }

  function commitDraftBoundary() {
    if (draftBoundary.length < 3) return;
    onBoundaryChange?.(draftBoundary);
    setDraftBoundary([]);
    setEditMode("none");
  }

  function resetDraft() {
    setDraftBoundary([]);
    setDraftAccessPoint(null);
    setDraftHazardPoint(null);
    setEditMode("none");
  }

  function commitAccessPoint() {
    if (!draftAccessPoint) return;
    onAccessPointChange?.({ ...draftAccessPoint, label: field.accessPoint.label || t("terms.accessPoint") });
    setDraftAccessPoint(null);
    setEditMode("none");
  }

  function commitHazard() {
    if (!draftHazardPoint) return;
    onHazardAdd?.({
      id: `hazard-${Date.now()}`,
      type: draftHazard.type,
      title: draftHazard.title || t(`hazards.${draftHazard.type}`),
      description: draftHazard.description,
      location: draftHazardPoint,
    });
    setDraftHazardPoint(null);
    setDraftHazard({ type: "other", title: "", description: "" });
    setEditMode("none");
  }

  async function copyCoordinates() {
    await navigator.clipboard?.writeText(formatCoordinates(access));
  }

  return (
    <div className={compact ? "field-map-card compact" : "field-map-card"}>
      <div className="map-meta-bar">
        <div>
          <strong>{field.name}</strong>
          <span>{field.areaHa} ha · {field.crop}</span>
        </div>
        {statuses.length > 0 && (
          <div className="map-status-list">
            {statuses.map((status) => <span key={status}>{status}</span>)}
          </div>
        )}
      </div>

      <MapContainer
        center={[field.center.lat, field.center.lng]}
        className="leaflet-map"
        scrollWheelZoom={false}
        zoom={15}
      >
        <RecenterMap center={field.center} />
        <DrawClickHandler enabled={editMode !== "none"} onAddPoint={handleMapEditClick} />
        <MapBaseLayers defaultLayer={defaultMapLayer ?? "imagery"} />
        <FieldMapPatternDefs fieldMapStatuses={fieldMapStatuses} fields={[field, ...contextFields]} />
        {contextFields.filter((contextField) => contextField.id !== field.id && contextField.boundary.length >= 3).map((contextField) => (
          <Polygon
            eventHandlers={{ click: handleEditableLayerClick }}
            key={contextField.id}
            pathOptions={getFieldPathOptions(contextField, false)}
            positions={contextField.boundary.map((point) => [point.lat, point.lng] as [number, number])}
          >
            <Tooltip sticky>
              <FieldTooltipContent mapStatus={fieldMapStatuses[contextField.id]} targetField={contextField} />
            </Tooltip>
            {editMode === "none" && (
              <Popup>
                <strong>{contextField.name}</strong>
                <br />
                {contextField.areaHa} ha · {contextField.crop}
              </Popup>
            )}
          </Polygon>
        ))}
        {contextFields.filter((contextField) => contextField.id !== field.id).map((contextField) => {
          const mapStatus = fieldMapStatuses[contextField.id];
          if (!mapStatus) return null;
          return (
            <Marker icon={workStateIcon(mapStatus)} key={`${contextField.id}-work-state`} position={[contextField.center.lat, contextField.center.lng]} />
          );
        })}
        <Polygon
          eventHandlers={{ click: handleEditableLayerClick }}
          pathOptions={getFieldPathOptions(field, true)}
          positions={boundaryPositions}
        >
          <Tooltip sticky>
            <FieldTooltipContent mapStatus={selectedMapStatus} targetField={field} />
          </Tooltip>
          {editMode === "none" && (
            <Popup>
              <strong>{field.name}</strong>
              <br />
              {field.areaHa} ha · {field.crop}
            </Popup>
          )}
        </Polygon>
        {selectedMapStatus && (
          <Marker icon={workStateIcon(selectedMapStatus)} position={[field.center.lat, field.center.lng]} />
        )}
        {draftBoundary.length > 0 && (
          <>
            {draftBoundary.length >= 3 ? (
              <Polygon
                eventHandlers={{ click: handleEditableLayerClick }}
                pathOptions={{ color: "#d98725", dashArray: "8 6", fillColor: "#f2b872", fillOpacity: 0.24, weight: 3 }}
                positions={draftPositions}
              />
            ) : (
              <Polyline pathOptions={{ color: "#d98725", dashArray: "8 6", weight: 3 }} positions={draftPositions} />
            )}
            {draftBoundary.map((point, index) => (
              <CircleMarker
                center={[point.lat, point.lng]}
                key={`${point.lat}-${point.lng}-${index}`}
                pathOptions={{ color: "#7a4b12", fillColor: "#f2b872", fillOpacity: 1 }}
                radius={6}
              >
                <Popup>Grenzpunkt {index + 1}</Popup>
              </CircleMarker>
            ))}
          </>
        )}
        <CircleMarker center={[access.lat, access.lng]} pathOptions={{ color: "#1f5f9a", fillColor: "#1f78c1", fillOpacity: 0.9 }} radius={8}>
          <Popup>
            <strong>{t("terms.accessPoint")}</strong>
            <br />
            {access.label}
            <br />
            {formatCoordinates(access)}
          </Popup>
        </CircleMarker>
        {draftAccessPoint && (
          <CircleMarker center={[draftAccessPoint.lat, draftAccessPoint.lng]} pathOptions={{ color: "#0b4f8a", fillColor: "#58a6e8", fillOpacity: 0.9, dashArray: "4 4" }} radius={9}>
            <Popup>{t("mapEdit.newAccessPoint")}</Popup>
          </CircleMarker>
        )}
        {field.hazards.map((hazard) => (
          <CircleMarker
            center={[hazard.location.lat, hazard.location.lng]}
            key={hazard.id}
            pathOptions={{ color: "#9b2e1e", fillColor: "#d7533f", fillOpacity: 0.9 }}
            radius={7}
          >
            <Popup>
              <strong>{hazard.title}</strong>
              <br />
              {t(`hazards.${hazard.type}`)} · {hazard.description}
            </Popup>
          </CircleMarker>
        ))}
        {draftHazardPoint && (
          <CircleMarker center={[draftHazardPoint.lat, draftHazardPoint.lng]} pathOptions={{ color: "#7a1f12", fillColor: "#ff8a72", fillOpacity: 0.9, dashArray: "4 4" }} radius={8}>
            <Popup>{t("mapEdit.newHazard")}</Popup>
          </CircleMarker>
        )}
      </MapContainer>

      <div className="map-legend">
        <span><Route size={16} /> {t("fields.boundary")}</span>
        {selectedMapStatus && <span><span className="map-style-swatch" style={{ backgroundColor: selectedMapStatus.color }} /> {selectedMapStatus.label}</span>}
        <span><Navigation size={16} /> {t("fields.accessMarker")}</span>
        <span><MapPin size={16} /> {t("fields.hazardMarker")}</span>
        <span><MapPin size={16} /> {t("fields.accessCoordinate", { coords: formatCoordinates(access) })}</span>
        {editable && editMode === "boundary" && <span><Pencil size={16} /> {t("fields.drawingMode", { count: draftBoundary.length })}</span>}
        {editable && editMode === "access" && <span><Navigation size={16} /> {t("mapEdit.accessMode")}</span>}
        {editable && editMode === "hazard" && <span><AlertTriangle size={16} /> {t("mapEdit.hazardMode")}</span>}
      </div>

      {editable && (
        <div className="draw-toolbar">
          {editMode === "none" ? (
            <>
            <button className="primary-action" onClick={() => setEditMode("boundary")} type="button">
              <Pencil size={18} /> {t("actions.drawBoundary")}
            </button>
            <button className="secondary-action" onClick={() => setEditMode("access")} type="button">
              <Navigation size={18} /> {t("mapEdit.markAccess")}
            </button>
            <button className="secondary-action" onClick={() => setEditMode("hazard")} type="button">
              <AlertTriangle size={18} /> {t("mapEdit.addHazard")}
            </button>
            </>
          ) : (
            <>
              <span className="draw-hint">
                {editMode === "boundary" && t("fields.drawingHint")}
                {editMode === "access" && t("mapEdit.accessHint")}
                {editMode === "hazard" && t("mapEdit.hazardHint")}
              </span>
              {editMode === "boundary" && (
                <button className="secondary-action" disabled={draftBoundary.length === 0} onClick={undoDraftPoint} type="button">
                  <Undo2 size={18} /> {t("actions.undoPoint")}
                </button>
              )}
              <button className="secondary-action" onClick={resetDraft} type="button">
                <X size={18} /> {t("actions.cancel")}
              </button>
              {editMode === "boundary" && (
                <button className="primary-action" disabled={draftBoundary.length < 3} onClick={commitDraftBoundary} type="button">
                  <Check size={18} /> {t("actions.commitDrawing")}
                </button>
              )}
              {editMode === "access" && (
                <button className="primary-action" disabled={!draftAccessPoint} onClick={commitAccessPoint} type="button">
                  <Check size={18} /> {t("mapEdit.saveAccess")}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {editable && editMode === "hazard" && (
        <div className="map-edit-form">
          <label>
            {t("driver.hazardType")}
            <select value={draftHazard.type} onChange={(event) => setDraftHazard((current) => ({ ...current, type: event.target.value as FieldHazardType }))}>
              <option value="wet_area">{t("hazards.wet_area")}</option>
              <option value="stones">{t("hazards.stones")}</option>
              <option value="narrow_access">{t("hazards.narrow_access")}</option>
              <option value="water_protection">{t("hazards.water_protection")}</option>
              <option value="other">{t("hazards.other")}</option>
            </select>
          </label>
          <label>
            {t("mapEdit.hazardTitle")}
            <input value={draftHazard.title} onChange={(event) => setDraftHazard((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            {t("driver.description")}
            <input value={draftHazard.description} onChange={(event) => setDraftHazard((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <button className="primary-action" disabled={!draftHazardPoint} onClick={commitHazard} type="button">
            <Check size={18} /> {t("mapEdit.saveHazard")}
          </button>
        </div>
      )}

      {showActions && (
        <div className="map-actions">
          <a className="primary-action" href={googleUrl} rel="noreferrer" target="_blank">
            <Navigation size={18} /> {t("actions.googleMaps")}
          </a>
          <a className="secondary-action" href={appleUrl} rel="noreferrer" target="_blank">
            <ExternalLink size={18} /> {t("actions.appleMaps")}
          </a>
          <a className="secondary-action" href={openStreetMapUrl(access)} rel="noreferrer" target="_blank">
            <MapPin size={18} /> {t("actions.openStreetMap")}
          </a>
          <a className="secondary-action" href={hittaMapsUrl(access)} rel="noreferrer" target="_blank">
            <MapPin size={18} /> {t("actions.hittaMaps")}
          </a>
          <a className="secondary-action" href={lantmaterietMapsUrl(access)} rel="noreferrer" target="_blank">
            <MapPin size={18} /> {t("actions.lantmaterietMaps")}
          </a>
          <button className="secondary-action" onClick={copyCoordinates} type="button">
            <Copy size={18} /> {t("actions.copyCoordinates")}
          </button>
        </div>
      )}
    </div>
  );
}

function FieldMapPatternDefs({
  fieldMapStatuses,
  fields,
}: {
  fieldMapStatuses: Record<string, FieldWorkMapStatus | undefined>;
  fields: Field[];
}) {
  const map = useMap();

  useEffect(() => {
    const svg = map.getPanes().overlayPane.querySelector("svg");
    if (!svg) return;
    let defs = svg.querySelector("defs[data-farm-manager-patterns='true']");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      defs.setAttribute("data-farm-manager-patterns", "true");
      svg.prepend(defs);
    }
    defs.innerHTML = "";
    fields.forEach((field) => {
      const style = fieldMapStatuses[field.id] ?? field.mapStyle;
      if (!style || style.pattern !== "whiteDots") return;
      const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
      pattern.setAttribute("id", `field-work-dots-${field.id}`);
      pattern.setAttribute("patternUnits", "userSpaceOnUse");
      pattern.setAttribute("width", "14");
      pattern.setAttribute("height", "14");
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("width", "14");
      rect.setAttribute("height", "14");
      rect.setAttribute("fill", style.color);
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", "4");
      dot.setAttribute("cy", "4");
      dot.setAttribute("r", "1.8");
      dot.setAttribute("fill", "#ffffff");
      dot.setAttribute("opacity", "0.95");
      pattern.append(rect, dot);
      defs?.append(pattern);
    });
  }, [fieldMapStatuses, fields, map]);

  return null;
}

function DrawClickHandler({ enabled, onAddPoint }: { enabled: boolean; onAddPoint: (point: GeoPoint) => void }) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onAddPoint({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

function RecenterMap({ center }: { center: GeoPoint }) {
  const map = useMap();

  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom());
  }, [center.lat, center.lng, map]);

  return null;
}
