import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";
import sv from "./locales/sv.json";

export const supportedLanguages = ["de", "en", "sv"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

function detectInitialLanguage(): SupportedLanguage {
  const stored = window.localStorage.getItem("farm-manager.language");
  if (stored && supportedLanguages.includes(stored as SupportedLanguage)) {
    return stored as SupportedLanguage;
  }

  const browserLanguage = window.navigator.language.slice(0, 2);
  if (supportedLanguages.includes(browserLanguage as SupportedLanguage)) {
    return browserLanguage as SupportedLanguage;
  }

  return "de";
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      de: { translation: de },
      en: { translation: en },
      sv: { translation: sv },
    },
    lng: detectInitialLanguage(),
    fallbackLng: "de",
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on("languageChanged", (language) => {
  window.localStorage.setItem("farm-manager.language", language);
});

export default i18n;
