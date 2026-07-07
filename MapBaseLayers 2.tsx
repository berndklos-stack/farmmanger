import { LayersControl, TileLayer } from "react-leaflet";

export function MapBaseLayers({ defaultLayer = "imagery" }: { defaultLayer?: "map" | "imagery" }) {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked={defaultLayer === "map"} name="Karte">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer checked={defaultLayer === "imagery"} name="Luftbild / Satellit">
        <TileLayer
          attribution="Tiles &copy; Esri"
          maxZoom={19}
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
      </LayersControl.BaseLayer>
    </LayersControl>
  );
}
