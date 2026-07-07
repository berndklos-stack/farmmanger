import type { Field, Status } from "../types";
import { useTranslation } from "react-i18next";
import { AccessPointCard } from "./AccessPointCard";
import { FieldHazards } from "./FieldHazards";
import { FieldMap } from "./FieldMap";

export function DriverFieldMap({ field, status }: { field: Field; status: Status }) {
  const { t } = useTranslation();
  return (
    <div className="driver-field-map">
      <AccessPointCard field={field} />
      <FieldMap compact defaultMapLayer="imagery" field={field} showActions={false} statuses={[status]} />
      <div className="driver-hazards-panel">
        <strong>{t("terms.hazards")}</strong>
        <FieldHazards hazards={field.hazards} />
      </div>
    </div>
  );
}
