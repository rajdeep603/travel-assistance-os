"use client";

import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Offline network map: plots the search origin and the ranked providers on an
// SVG plane with real distance rings. No tile server — the demo stays fully
// offline — but positions, distances and rings come from the true lat/lng.
// ---------------------------------------------------------------------------

export interface MapProvider {
  id: string;
  name: string;
  facility: string;
  latitude: number;
  longitude: number;
}

interface Point {
  x: number;
  y: number;
}

const W = 640;
const H = 400;
const PAD = 52;

export function ProviderMap({
  providers,
  origin,
  selectedId,
  onSelect,
}: {
  providers: MapProvider[];
  origin: { lat: number; lng: number; label: string } | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const layout = useMemo(() => {
    const pts = [
      ...providers.map((p) => ({ lat: p.latitude, lng: p.longitude })),
      ...(origin ? [{ lat: origin.lat, lng: origin.lng }] : []),
    ];
    if (pts.length === 0) return null;

    const midLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    // km per degree at this latitude — keeps the plane true to scale.
    const kmPerLat = 111.32;
    const kmPerLng = 111.32 * Math.cos((midLat * Math.PI) / 180);

    // Work in km east/north of the centroid so x and y share one scale.
    const midLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    const toKm = (p: { lat: number; lng: number }) => ({
      x: (p.lng - midLng) * kmPerLng,
      y: (p.lat - midLat) * kmPerLat,
    });

    const kmPts = pts.map(toKm);
    const xs = kmPts.map((p) => p.x);
    const ys = kmPts.map((p) => p.y);
    const spanX = Math.max(1.5, Math.max(...xs) - Math.min(...xs));
    const spanY = Math.max(1.5, Math.max(...ys) - Math.min(...ys));
    const span = Math.max(spanX / (W - PAD * 2), spanY / (H - PAD * 2));
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;

    const project = (p: { lat: number; lng: number }): Point => {
      const km = toKm(p);
      return {
        x: W / 2 + (km.x - cx) / span,
        y: H / 2 - (km.y - cy) / span, // north is up
      };
    };
    const pxPerKm = 1 / span;
    return { project, pxPerKm };
  }, [providers, origin]);

  if (!layout) return null;
  const { project, pxPerKm } = layout;
  const originPt = origin ? project(origin) : null;

  // Distance rings every 1 km while they fit, capped for legibility.
  const rings: number[] = [];
  if (originPt) {
    for (let km = 1; km <= 8; km++) {
      if (km * pxPerKm < Math.max(W, H)) rings.push(km);
      if (rings.length >= 4) break;
    }
  }

  const active = hoverId ?? selectedId;
  const activeProvider = providers.find((p) => p.id === active);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full rounded-xl border border-slate-200 bg-slate-50"
      role="img"
      aria-label={`Map of ${providers.length} matched providers${origin ? ` around ${origin.label}` : ""}`}
    >
      {/* subtle plane grid */}
      <defs>
        <pattern id="map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e2e8f0" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#map-grid)" />

      {/* distance rings around the patient */}
      {originPt
        ? rings.map((km) => (
            <g key={km}>
              <circle
                cx={originPt.x}
                cy={originPt.y}
                r={km * pxPerKm}
                fill="none"
                stroke="#cbd5e1"
                strokeDasharray="4 5"
              />
              <text
                x={originPt.x + km * pxPerKm + 4}
                y={originPt.y - 4}
                fontSize="10"
                fill="#94a3b8"
              >
                {km} km
              </text>
            </g>
          ))
        : null}

      {/* connection line origin → selected provider */}
      {originPt && activeProvider
        ? (() => {
            const p = project({ lat: activeProvider.latitude, lng: activeProvider.longitude });
            return (
              <line
                x1={originPt.x}
                y1={originPt.y}
                x2={p.x}
                y2={p.y}
                stroke="#2563eb"
                strokeWidth="1.5"
                strokeDasharray="3 4"
                opacity="0.6"
              />
            );
          })()
        : null}

      {/* patient origin */}
      {originPt ? (
        <g>
          <circle cx={originPt.x} cy={originPt.y} r="14" fill="#2563eb" opacity="0.12">
            <animate attributeName="r" values="10;20;10" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={originPt.x} cy={originPt.y} r="6" fill="#2563eb" stroke="#fff" strokeWidth="2" />
          <text
            x={originPt.x}
            y={originPt.y + 22}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#1e40af"
          >
            {origin!.label}
          </text>
        </g>
      ) : null}

      {/* ranked provider pins */}
      {providers.map((p, i) => {
        const pt = project({ lat: p.latitude, lng: p.longitude });
        const isActive = p.id === active;
        return (
          <g
            key={p.id}
            onClick={() => onSelect(p.id)}
            onMouseEnter={() => setHoverId(p.id)}
            onMouseLeave={() => setHoverId(null)}
            className="map-pin animate-pop-in cursor-pointer"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            {isActive ? (
              <circle cx={pt.x} cy={pt.y} r="17" fill="#2563eb" opacity="0.15" />
            ) : null}
            <circle
              cx={pt.x}
              cy={pt.y}
              r={isActive ? 12 : 10}
              fill={isActive ? "#1d4ed8" : "#3b82f6"}
              stroke="#fff"
              strokeWidth="2"
            />
            <text
              x={pt.x}
              y={pt.y + 4}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="#fff"
            >
              {i + 1}
            </text>
          </g>
        );
      })}

      {/* hover / selection label */}
      {activeProvider
        ? (() => {
            const pt = project({
              lat: activeProvider.latitude,
              lng: activeProvider.longitude,
            });
            const label = activeProvider.name;
            const sub = activeProvider.facility;
            const w = Math.max(label.length, sub.length) * 6.2 + 20;
            const x = Math.min(Math.max(pt.x - w / 2, 6), W - w - 6);
            const y = pt.y > 64 ? pt.y - 58 : pt.y + 18;
            return (
              <g pointerEvents="none">
                <rect x={x} y={y} width={w} height="40" rx="8" fill="#0f172a" opacity="0.92" />
                <text x={x + 10} y={y + 17} fontSize="11.5" fontWeight="600" fill="#fff">
                  {label}
                </text>
                <text x={x + 10} y={y + 31} fontSize="10" fill="#cbd5e1">
                  {sub}
                </text>
              </g>
            );
          })()
        : null}
    </svg>
  );
}
