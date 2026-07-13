import { Copy, ExternalLink, MapPinned, Navigation } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { GeoPoint } from "../types";
import { appleMapsNativeUrl, appleMapsUrl, formatCoordinates, googleMapsNativeUrl, googleMapsUrl, hittaMapsUrl, lantmaterietMapsUrl, openStreetMapUrl } from "../utils/geo";

export function NavigationButtons({ point }: { point: GeoPoint }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyCoordinates() {
    await navigator.clipboard?.writeText(formatCoordinates(point));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function openNativeNavigation(nativeUrl: string, fallbackUrl: string) {
    let didLeavePage = false;
    const markLeft = () => {
      didLeavePage = true;
      window.removeEventListener("pagehide", markLeft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") markLeft();
    };
    window.addEventListener("pagehide", markLeft);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.setTimeout(() => {
      if (!didLeavePage && document.visibilityState === "visible") {
        window.location.assign(fallbackUrl);
      }
    }, 900);
    window.location.href = nativeUrl;
  }

  return (
    <div className="navigation-buttons">
      <button className="primary-action wide" onClick={() => setIsOpen((current) => !current)} type="button">
        <Navigation size={20} /> {t("actions.startNavigation")}
      </button>
      {isOpen && (
        <div className="navigation-choice-grid">
          <button onClick={() => openNativeNavigation(googleMapsNativeUrl(point), googleMapsUrl(point))} type="button">
            <MapPinned size={18} /> {t("actions.googleMaps")}
          </button>
          <button onClick={() => openNativeNavigation(appleMapsNativeUrl(point), appleMapsUrl(point))} type="button">
            <MapPinned size={18} /> {t("actions.appleMaps")}
          </button>
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
