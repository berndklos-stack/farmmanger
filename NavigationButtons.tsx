import { Copy, ExternalLink, Navigation } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { GeoPoint } from "../types";
import { appleMapsUrl, formatCoordinates, googleMapsUrl, hittaMapsUrl, lantmaterietMapsUrl, openStreetMapUrl } from "../utils/geo";

export function NavigationButtons({ point }: { point: GeoPoint }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyCoordinates() {
    await navigator.clipboard?.writeText(formatCoordinates(point));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="navigation-buttons">
      <button className="primary-action wide" onClick={() => setIsOpen((current) => !current)} type="button">
        <Navigation size={20} /> {t("actions.startNavigation")}
      </button>
      {isOpen && (
        <div className="navigation-choice-grid">
          <a href={googleMapsUrl(point)} rel="noreferrer" target="_blank">
            <ExternalLink size={18} /> {t("actions.googleMaps")}
          </a>
          <a href={appleMapsUrl(point)} rel="noreferrer" target="_blank">
            <ExternalLink size={18} /> {t("actions.appleMaps")}
          </a>
          <a href={openStreetMapUrl(point)} rel="noreferrer" target="_blank">
            <ExternalLink size={18} /> {t("actions.openStreetMap")}
          </a>
          <a href={hittaMapsUrl(point)} rel="noreferrer" target="_blank">
            <ExternalLink size={18} /> {t("actions.hittaMaps")}
          </a>
          <a href={lantmaterietMapsUrl(point)} rel="noreferrer" target="_blank">
            <ExternalLink size={18} /> {t("actions.lantmaterietMaps")}
          </a>
        </div>
      )}
      <button className="secondary-action wide" onClick={copyCoordinates} type="button">
        <Copy size={18} /> {copied ? t("actions.coordinatesCopied") : t("actions.copyCoordinates")}
      </button>
    </div>
  );
}
