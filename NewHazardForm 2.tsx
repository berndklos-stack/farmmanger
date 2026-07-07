import { Camera, LocateFixed, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Field, FieldHazardType, Subtask } from "../types";
import { formatCoordinates } from "../utils/geo";

const options: { labelKey: string; value: FieldHazardType }[] = [
  { labelKey: "hazards.wet_area", value: "wet_area" },
  { labelKey: "hazards.obstacle", value: "other" },
  { labelKey: "hazards.blocked_access", value: "narrow_access" },
  { labelKey: "hazards.stones", value: "stones" },
  { labelKey: "hazards.water_protection", value: "water_protection" },
  { labelKey: "hazards.other", value: "other" },
];

export function NewHazardForm({
  field,
  subtask,
  onReport,
}: {
  field: Field;
  subtask: Subtask;
  onReport: (patch: Partial<Subtask>) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FieldHazardType>("wet_area");
  const [description, setDescription] = useState("");
  const fallbackPosition = field.accessPoint;

  function submit() {
    onReport({
      status: "Problem",
      note: description || "Neue Problemstelle vom Fahrer gemeldet.",
      driverNote: description,
      newHazardReported: true,
      newHazardType: type,
      newHazardDescription: description,
      accessUsed: field.accessPoint.label,
      accessOk: subtask.accessOk ?? true,
    });
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <button className="secondary-action wide" onClick={() => setIsOpen(true)} type="button">
        <Plus size={18} /> {t("actions.reportNewHazard")}
      </button>
    );
  }

  return (
    <div className="new-hazard-form">
      <div className="section-heading">
        <h2>{t("driver.newHazard")}</h2>
        <button className="icon-button" onClick={() => setIsOpen(false)} type="button" aria-label={t("driver.closeHazard")}>
          <X size={18} />
        </button>
      </div>
      <label>
        {t("driver.hazardType")}
        <select value={type} onChange={(event) => setType(event.target.value as FieldHazardType)}>
          {options.map((option) => <option key={`${option.labelKey}-${option.value}`} value={option.value}>{t(option.labelKey)}</option>)}
        </select>
      </label>
      <label>
        {t("driver.description")}
        <input
          placeholder={t("driver.hazardPlaceholder")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className="hazard-form-actions">
        <span><LocateFixed size={17} /> {t("driver.gpsPosition", { coords: formatCoordinates(fallbackPosition) })}</span>
        <button className="secondary-action" type="button"><Camera size={18} /> {t("actions.attachPhotoPlaceholder")}</button>
      </div>
      <button className="primary-action wide" onClick={submit} type="button">
        {t("actions.assignHazardToField")}
      </button>
    </div>
  );
}
