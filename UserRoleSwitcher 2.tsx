import { Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import type { UserRole } from "../types";

const roles: UserRole[] = [
  "farmer_admin",
  "farmer_employee",
  "contractor_admin",
  "driver",
  "advisor",
  "support_admin",
];

export function UserRoleSwitcher() {
  const { t } = useTranslation();
  const { currentRole, setCurrentRole } = useAppData();

  return (
    <label className="role-switcher" aria-label={t("user.role")}>
      <Shield size={16} />
      <select value={currentRole} onChange={(event) => setCurrentRole(event.target.value as UserRole)}>
        {roles.map((role) => (
          <option key={role} value={role}>
            {t(`roles.${role}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
