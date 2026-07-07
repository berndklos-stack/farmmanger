import { useTranslation } from "react-i18next";
import { supportedLanguages, type SupportedLanguage } from "../i18n";

const labels: Record<SupportedLanguage, { flag: string; label: string }> = {
  de: { flag: "🇩🇪", label: "DE" },
  en: { flag: "🇬🇧", label: "EN" },
  sv: { flag: "🇸🇪", label: "SV" },
};

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const currentLanguage = supportedLanguages.find((language) => i18n.language.startsWith(language)) ?? "de";

  return (
    <label className="language-switcher" aria-label={t("app.language")}>
      <select
        value={currentLanguage}
        onChange={(event) => i18n.changeLanguage(event.target.value)}
      >
        {supportedLanguages.map((language) => (
          <option key={language} value={language}>
            {labels[language].flag} {labels[language].label}
          </option>
        ))}
      </select>
    </label>
  );
}
