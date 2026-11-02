// ---------------------------------------------------------------------------
// Driving minutes from the patient to each provider, from OSRM's public demo
// router (no key, no account). When it can't answer (offline booth), a
// straight-line estimate at urban speed, marked as such.
// ---------------------------------------------------------------------------

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Travel {
  minutes: number;
  basis: "driving" | "estimate";
}

const estimate = (km: number): Travel => ({ minutes: Math.max(2, Math.round((km * 1.3) / 0.5)), basis: "estimate" }); // 30 km/h, a third longer than the crow flies

export async function drivingMinutes(from: LatLng, to: LatLng[], straightKm: number[]): Promise<Travel[]> {
  if (!to.length) return [];
  try {
    const out: Travel[] = [];
    for (let i = 0; i < to.length; i += 40) {
      const chunk = to.slice(i, i + 40);
      const coords = [from, ...chunk].map((p) => `${p.lng},${p.lat}`).join(";");
      const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=duration`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const body = (await res.json()) as { durations?: (number | null)[][] };
      const row = body.durations?.[0] ?? [];
      chunk.forEach((_, k) => {
        const s = row[k + 1];
        out.push(s != null ? { minutes: Math.max(1, Math.round(s / 60)), basis: "driving" } : estimate(straightKm[i + k]));
      });
    }
    return out;
  } catch {
    return straightKm.map(estimate);
  }
}
