/* Same-origin METAR proxy.
 *
 * The NOAA Aviation Weather Center API needs no key, but sends no
 * Access-Control-Allow-Origin header, so the browser cannot call it directly.
 * This Cloudflare Pages Function fetches it server-side and returns normalised
 * JSON from our own origin. Coverage is worldwide.
 *
 * It also does the unit conversion in one place, because the upstream units are
 * not the ones the calculator wants and are easy to get wrong:
 *   altim -> hectopascals, NOT inHg   (1018 hPa == 30.06 inHg)
 *   elev  -> metres, NOT feet         (190 m == 623 ft)
 *   temp  -> degrees C                (used as-is)
 *
 * GET /api/metar?id=KHSV
 */

import { iataToIcao } from './_iata.js';

const UPSTREAM = 'https://aviationweather.gov/api/data/metar';
const HPA_PER_INHG = 33.8639;
const FT_PER_M = 3.28084;

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Weather must never be served stale from a shared cache for long.
      'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    },
  });
}

/* A 3-character entry is either an IATA code or a US/Canadian local code, and
 * those namespaces overlap: MDQ is Mar del Plata (SAZM) as IATA, but Madison
 * County, Alabama (KMDQ) as an FAA local code. So resolve every possibility and
 * let the caller see when more than one is real, rather than silently guessing.
 * A 4-character entry is already an ICAO identifier and is used as given. */
function candidatesFor(code) {
  if (code.length === 4) return [code];
  const found = [iataToIcao(code), `K${code}`, `P${code}`, `C${code}`].filter(Boolean);
  return [...new Set(found)];
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function normalise(m, id) {
  const elevM = num(m.elev);
  const altimHpa = num(m.altim);
  const obsMs = num(m.obsTime) !== null ? m.obsTime * 1000 : null;
  return {
    stationId: m.icaoId || id,
    name: m.name || null,
    // wdir is "VRB" for variable wind, so it is not always a number.
    windDirDeg: num(m.wdir),
    windDirRaw: m.wdir ?? null,
    windSpeedKt: num(m.wspd),
    oatC: num(m.temp),
    altimeterInHg: altimHpa === null ? null : Math.round((altimHpa / HPA_PER_INHG) * 100) / 100,
    elevationFt: elevM === null ? null : Math.round(elevM * FT_PER_M),
    observedAt: obsMs === null ? null : new Date(obsMs).toISOString(),
    ageMinutes: obsMs === null ? null : Math.max(0, Math.round((Date.now() - obsMs) / 60000)),
    rawOb: m.rawOb || null,
  };
}

export async function onRequestGet({ request }) {
  const code = (new URL(request.url).searchParams.get('id') || '')
    .trim()
    .toUpperCase();

  if (!/^[A-Z0-9]{3,4}$/.test(code)) {
    return json(
      { error: 'invalid_code', message: 'Enter a 3-letter IATA or 4-letter ICAO code.' },
      400
    );
  }

  const ids = candidatesFor(code);

  // The upstream accepts a comma-separated list and returns only the stations
  // that exist, so every candidate resolves in a single request.
  const url = `${UPSTREAM}?ids=${encodeURIComponent(ids.join(','))}&format=json`;
  const init = {
    headers: { accept: 'application/json', 'user-agent': 'citation-perf.pro TOLD calculator' },
    /* Cache successes briefly, never cache failures. Without this a single
     * transient upstream 5xx gets cached and that airport keeps failing for
     * everyone until the entry expires. */
    cf: { cacheTtlByStatus: { '200-299': 60, '400-499': 0, '500-599': 0 } },
  };

  let res = null;
  let transportError = false;
  // One retry, because a cached-or-transient upstream blip should not surface
  // to the pilot as "no weather available".
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(url, init);
      transportError = false;
    } catch {
      res = null;
      transportError = true;
    }
    if (res && res.status < 500) break;
  }

  if (transportError || !res) {
    return json({ error: 'upstream_unreachable', message: 'Weather service unreachable.' }, 502);
  }

  // 204 with an empty body means it recognised none of the candidates.
  if (res.status === 204) {
    return json(
      { error: 'not_found', message: `No report for ${code}. Tried ${ids.join(', ')}. Try the full ICAO code.` },
      404
    );
  }
  if (!res.ok) {
    return json({ error: 'upstream_error', message: `Weather service returned ${res.status}.` }, 502);
  }

  let rows;
  try {
    rows = await res.json();
  } catch {
    return json({ error: 'upstream_bad_json', message: 'Weather service sent an unreadable reply.' }, 502);
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return json(
      { error: 'not_found', message: `No report for ${code}. Tried ${ids.join(', ')}. Try the full ICAO code.` },
      404
    );
  }

  // Keep the newest report per station, in case the upstream returns several.
  const byStation = new Map();
  for (const m of rows) {
    const key = m.icaoId;
    const prev = byStation.get(key);
    if (!prev || (num(m.obsTime) || 0) > (num(prev.obsTime) || 0)) byStation.set(key, m);
  }
  const stations = [...byStation.values()];

  /* More than one real station means the code was genuinely ambiguous. Filling
   * a performance field from the wrong airport is worse than filling nothing,
   * so return the choices and let the pilot name the one they meant. */
  if (stations.length > 1) {
    return json(
      {
        error: 'ambiguous',
        message: `${code} matches ${stations.length} stations. Enter the ICAO code for the one you want.`,
        candidates: stations.map((m) => ({
          stationId: m.icaoId,
          name: m.name || null,
          elevationFt: num(m.elev) === null ? null : Math.round(m.elev * FT_PER_M),
        })),
      },
      409
    );
  }

  return json(normalise(stations[0], ids[0]), 200, 60);
}
