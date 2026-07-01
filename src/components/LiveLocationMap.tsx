import { useEffect, useMemo } from "react";
import { divIcon } from "leaflet";
import { CircleMarker, MapContainer, Marker, Polygon, Popup, Tooltip, useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import type { DriverLocation, Field, FieldMapStyle, Job, Subtask } from "../types";
import { formatCoordinates } from "../utils/geo";
import { MapBaseLayers } from "./MapBaseLayers";
import { getTask } from "./shared";

type FieldWorkMapStatus = FieldMapStyle & {
  taskName: string;
  recordedAt: string;
  workState?: "manual" | "planned" | "active" | "completed";
  dueDate?: string;
  note?: string;
};

const activeWorkStatuses: Subtask["status"][] = ["in Arbeit"];

function mixHexColor(baseColor: string, overlayColor: string, overlayWeight = 0.45) {
  const parse = (value: string) => {
    const match = value.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return null;
    return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)];
  };
  const base = parse(baseColor);
  const overlay = parse(overlayColor);
  if (!base || !overlay) return baseColor;
  const mixed = base.map((channel, index) => Math.round(channel * (1 - overlayWeight) + overlay[index] * overlayWeight));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function LiveLocationMap({
  fields,
  jobs,
  locations,
  subtasks,
}: {
  fields: Field[];
  jobs?: Job[];
  locations: DriverLocation[];
  subtasks?: Subtask[];
}) {
  const { t, i18n } = useTranslation();
  const { jobTypes, taskTemplates } = useAppData();
  const fallbackCenter = fields[0]?.center ?? { lat: 55.72572, lng: 13.17942 };
  const center = locations[0] ? { lat: locations[0].lat, lng: locations[0].lng } : fallbackCenter;
  const fieldMapStatuses = useMemo(() => {
    const next: Record<string, FieldWorkMapStatus> = {};
    const liveActiveSubtaskIds = new Set(locations
      .filter((location) => location.status === "in Arbeit" && location.subtaskId)
      .map((location) => location.subtaskId));
    const liveActiveFieldIds = new Set(locations
      .filter((location) => location.status === "in Arbeit" && location.fieldId)
      .map((location) => location.fieldId));
    const liveKnownFieldIds = new Set(locations
      .filter((location) => location.fieldId)
      .map((location) => location.fieldId));
    const findConfiguredMapStyle = (taskName?: string) => {
      if (!taskName) return undefined;
      const normalized = taskName.trim().toLowerCase();
      return taskTemplates.find((template) => template.name.trim().toLowerCase() === normalized)?.mapStyle
        ?? jobTypes.flatMap((jobType) => jobType.tasks).find((task) => task.name.trim().toLowerCase() === normalized)?.mapStyle;
    };
    fields.forEach((field) => {
      const fieldSubtasks = (subtasks ?? [])
        .filter((subtask) => subtask.fieldId === field.id)
        .map((subtask) => {
          const job = jobs?.find((item) => item.id === subtask.jobId);
          const task = jobs ? getTask(subtask, jobs) : undefined;
          const mapStyle = task?.mapStyle ?? findConfiguredMapStyle(task?.name);
          return { job, mapStyle, subtask, task };
        })
        .filter((item) => Boolean(item.mapStyle));
      const liveActive = fieldSubtasks.find((item) => liveActiveSubtaskIds.has(item.subtask.id))
        ?? fieldSubtasks.find(() => liveActiveFieldIds.has(field.id));
      const localActive = liveKnownFieldIds.has(field.id) ? undefined : fieldSubtasks.find((item) => activeWorkStatuses.includes(item.subtask.status));
      const active = liveActive ?? localActive;
      const completed = fieldSubtasks
        .filter((item) => item.subtask.status === "erledigt")
        .sort((a, b) => Date.parse(b.subtask.completedAt ?? b.subtask.statusChangedAt ?? b.subtask.updatedAt ?? "") - Date.parse(a.subtask.completedAt ?? a.subtask.statusChangedAt ?? a.subtask.updatedAt ?? ""))[0];
      const planned = active ?? completed ?? fieldSubtasks.find((item) => item.subtask.status !== "erledigt");
      if (planned?.task && planned.mapStyle) {
        const activeColor = mixHexColor(planned.mapStyle.color, "#f4c542", 0.48);
        next[field.id] = {
          ...planned.mapStyle,
          color: active ? activeColor : planned.mapStyle.color,
          label: active ? `${planned.mapStyle.label} · ${t("fields.workStateActive")}` : planned.mapStyle.label,
          taskName: planned.task.name,
          recordedAt: planned.subtask.completedAt ?? planned.subtask.statusChangedAt ?? planned.subtask.updatedAt ?? planned.job?.timeWindow ?? "",
          workState: active ? "active" : completed ? "completed" : "planned",
        };
        return;
      }
      if (field.manualWorkPlan) {
        next[field.id] = {
          ...field.manualWorkPlan.mapStyle,
          label: field.manualWorkPlan.label,
          taskName: field.manualWorkPlan.label,
          recordedAt: field.manualWorkPlan.dueDate ?? field.manualWorkPlan.createdAt,
          workState: "manual",
          dueDate: field.manualWorkPlan.dueDate,
          note: field.manualWorkPlan.note,
        };
      }
    });
    return next;
  }, [fields, jobTypes, jobs, locations, subtasks, taskTemplates, t]);
  const getFieldPathOptions = (field: Field) => {
    const mapStatus = fieldMapStatuses[field.id];
    const baseStyle = field.mapStyle;
    const color = mapStatus?.color ?? baseStyle?.color ?? "#dff8cf";
    const pattern = mapStatus?.pattern ?? baseStyle?.pattern;
    const patternId = pattern === "whiteDots" ? `dispatch-field-dots-${field.id}` : undefined;
    return {
      color: mapStatus?.workState === "active" ? "#f4c542" : "#e8fff0",
      fillColor: patternId ? `url(#${patternId})` : color,
      fillOpacity: mapStatus ? 0.66 : baseStyle ? 0.26 : 0.1,
      opacity: 0.9,
      weight: mapStatus?.workState === "active" ? 5 : 2,
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
  const getDisplayStatus = (subtask: Subtask | undefined, locationStatus: DriverLocation["status"]) => {
    if (!subtask) return t(`liveLocation.status.${locationStatus}`);
    if (subtask.status !== "offen") return t(`status.${subtask.status}`);
    if (locationStatus === "unterwegs") return t("status.reserviert");
    return t(`liveLocation.status.${locationStatus}`);
  };
  const workStateIcon = (mapStatus?: FieldWorkMapStatus) => divIcon({
    className: `field-work-state-marker ${mapStatus?.workState ?? "planned"}`,
    html: `<span>${getWorkStateSymbol(mapStatus?.workState)}</span>`,
    iconAnchor: [12, 12],
    iconSize: [24, 24],
  });

  return (
    <div className="live-location-map">
      <MapContainer center={[center.lat, center.lng]} className="leaflet-map" scrollWheelZoom zoom={13}>
        <MapBaseLayers />
        <LiveMapPatternDefs fieldMapStatuses={fieldMapStatuses} fields={fields} />
        {fields.filter((field) => field.boundary.length >= 3).map((field) => {
          const mapStatus = fieldMapStatuses[field.id];
          return (
            <Polygon
              key={field.id}
              pathOptions={getFieldPathOptions(field)}
              positions={field.boundary.map((point) => [point.lat, point.lng] as [number, number])}
            >
              <Tooltip sticky>
                <strong>{field.name}</strong>
                <br />
                {field.areaHa} ha
                {mapStatus && (
                  <>
                    <br />
                    {mapStatus.label}
                  </>
                )}
              </Tooltip>
            </Polygon>
          );
        })}
        {fields.map((field) => {
          const mapStatus = fieldMapStatuses[field.id];
          if (!mapStatus) return null;
          return (
            <Marker icon={workStateIcon(mapStatus)} key={`${field.id}-work-state`} position={[field.center.lat, field.center.lng]}>
              <Tooltip sticky>
                <strong>{mapStatus.label}</strong>
                <br />
                {getWorkStateLabel(mapStatus.workState)}
                {mapStatus.dueDate ? ` · ${mapStatus.dueDate}` : ""}
              </Tooltip>
            </Marker>
          );
        })}
        {locations.map((location) => {
          const field = fields.find((item) => item.id === location.fieldId);
          const subtask = subtasks?.find((item) => item.id === location.subtaskId);
          const job = jobs?.find((item) => item.id === subtask?.jobId);
          const displayStatus = getDisplayStatus(subtask, location.status);
          return (
            <CircleMarker
              center={[location.lat, location.lng]}
              key={location.id}
              pathOptions={{ color: "#1f5f3c", fillColor: "#2f8a55", fillOpacity: 0.9 }}
              radius={9}
            >
              <Tooltip className="driver-location-tooltip" direction="right" offset={[10, 0]} permanent>
                <span>{location.driverName}</span>
                <small>{t("jobs.jobNumberShort")}: {job?.jobNumber ?? "-"}</small>
                <small>{displayStatus}</small>
              </Tooltip>
              <Popup>
                <div className="map-popup">
                  <strong>{location.driverName}</strong>
                  <span>{location.vehicleName}</span>
                  <span>{t("jobs.jobNumberShort")}: {job?.jobNumber ?? "-"}</span>
                  <span>{field?.name ?? t("liveLocation.noField")}</span>
                  <span>{displayStatus}</span>
                  <span>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "medium" }).format(new Date(location.recordedAt))}</span>
                  <small>{formatCoordinates({ lat: location.lat, lng: location.lng })}</small>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

function LiveMapPatternDefs({
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
    let defs = svg.querySelector("defs[data-schlaglink-dispatch-patterns='true']");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      defs.setAttribute("data-schlaglink-dispatch-patterns", "true");
      svg.prepend(defs);
    }
    defs.innerHTML = "";
    fields.forEach((field) => {
      const style = fieldMapStatuses[field.id] ?? field.mapStyle;
      if (!style || style.pattern !== "whiteDots") return;
      const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
      pattern.setAttribute("id", `dispatch-field-dots-${field.id}`);
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
