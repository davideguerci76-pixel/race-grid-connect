import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { MarketCountry } from "@/lib/market.functions";

export default function MarketWorldMap({ countries, labels }: { countries: MarketCountry[]; labels: { demand: string; supply: string; teams: string } }) {
  const points = countries.filter((c) => c.lat != null && c.lng != null);
  const max = Math.max(1, ...points.map((c) => c.demand + c.supply));

  return (
    <div className="h-[420px] w-full border border-border">
      <MapContainer center={[30, 5]} zoom={2} scrollWheelZoom={false} worldCopyJump style={{ height: "100%", width: "100%", background: "hsl(var(--secondary))" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {points.map((c) => {
          const total = c.demand + c.supply;
          const radius = 6 + Math.round((total / max) * 22);
          const demandHeavy = c.gap >= 0;
          return (
            <CircleMarker
              key={c.country}
              center={[Number(c.lat), Number(c.lng)]}
              radius={radius}
              pathOptions={{
                color: demandHeavy ? "#e10600" : "#ffd400",
                fillColor: demandHeavy ? "#e10600" : "#ffd400",
                fillOpacity: 0.35,
                weight: 2,
              }}
            >
              <Tooltip direction="top" opacity={1}>
                <div className="font-mono text-[11px] uppercase tracking-widest">
                  <div className="font-black">{c.country}</div>
                  <div>{labels.demand}: {c.demand}</div>
                  <div>{labels.supply}: {c.supply}</div>
                  <div>{labels.teams}: {c.teams}</div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
