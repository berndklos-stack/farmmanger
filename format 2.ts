import type { SupportedLanguage } from "./index";

const localeMap: Record<SupportedLanguage, string> = {
  de: "de-DE",
  en: "en-US",
  sv: "sv-SE",
};

export function formatNumber(value: number, language: string, maximumFractionDigits = 1) {
  const locale = localeMap[(language.slice(0, 2) as SupportedLanguage) || "de"] ?? "de-DE";
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export function formatArea(value: number, language: string) {
  return `${formatNumber(value, language, 1)} ha`;
}

export function formatUnit(value: number, unit: string, language: string) {
  return `${formatNumber(value, language, 1)} ${unit}`;
}
