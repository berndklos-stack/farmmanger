import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FieldHazard } from "../types";
import { formatCoordinates } from "../utils/geo";

export function FieldHazards({ compact = false, hazards }: { compact?: boolean; hazards: FieldHazard[] }) {
  const { t } = useTranslation();
  if (hazards.length === 0) {
    return <p className="muted">{t("hazards.none")}</p>;
  }

  return (
    <div className={compact ? "hazard-list compact" : "hazard-list"}>
      {hazards.map((hazard) => (
        <div className="hazard-item" key={hazard.id}>
          <AlertTriangle size={18} />
          <div>
            <strong>{hazard.title}</strong>
            <span>{t(`hazards.${hazard.type}`)} · {hazard.description}</span>
            <small>{formatCoordinates(hazard.location)}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
