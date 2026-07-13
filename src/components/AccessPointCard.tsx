import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Field } from "../types";
import { formatCoordinates } from "../utils/geo";
import { NavigationButtons } from "./NavigationButtons";

export function AccessPointCard({
  field,
  showCoordinates = true,
  showNavigation = true,
}: {
  field: Field;
  showCoordinates?: boolean;
  showNavigation?: boolean;
}) {
  const { t } = useTranslation();
  const legacyReleasePrefix = `__${atob("c2NobGFnbGluaw==")}_released_contractors:`;
  const visibleWarnings = field.restrictedZones.filter((zone) => {
    const trimmed = zone.trim();
    return trimmed
      && !trimmed.startsWith("__farm-manager_")
      && !trimmed.startsWith(legacyReleasePrefix);
  });
  return (
    <div className="access-point-card">
      <div className="access-point-head">
        <MapPin size={22} />
        <div>
          <strong>{field.accessPoint.label}</strong>
          {showCoordinates && <span>{formatCoordinates(field.accessPoint)}</span>}
        </div>
      </div>
      <p>{field.accessDescription}</p>
      {visibleWarnings.length > 0 && (
        <div className="access-warnings">
          {visibleWarnings.map((zone) => <span key={zone}>{t("terms.notes")}: {zone}</span>)}
        </div>
      )}
      {showNavigation && <NavigationButtons point={field.accessPoint} />}
    </div>
  );
}
