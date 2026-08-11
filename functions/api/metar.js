/* Same-origin METAR proxy.
 *
 * The NOAA Aviation Weather Center API needs no key, but sends no
 * Access-Control-Allow-Origin header, so the browser cannot call it directly.
 * This Cloudflare Pages Function fetches it server-side and returns normalised
 * JSON from our own origin.
 *
 * It also does the unit conversion in one place, because the upstream units are
 * not the ones the calculator wants and are easy to get wrong:
 *   altim -> hectopascals, NOT inHg   (1018 hPa == 30.06 inHg)
 *   elev  -> metres, NOT feet         (190 m == 623 ft)
 *   temp  -> degrees C                (used as-is)
 *
 * GET /api/metar?id=KHSV
 */

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

/* A 3-character code is IATA; ICAO is always 4. There is no general
 * IATA->ICAO rule, but K+code covers the contiguous US and P+code covers
 * Alaska and Hawaii, which is the operating area for this aircraft. Anything
 * else must be entered as a full ICAO code. */
function candidates(code) {
  if (code.length === 4) return [code];
  return [`K${code}`, `P${code}`];
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
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

  const tried = [];
  for (const id of candidates(code)) {
    tried.push(id);
    let res;
    try {
      res = await fetch(`${UPSTREAM}?ids=${encodeURIComponent(id)}&format=json`, {
        headers: { accept: 'application/json', 'user-agent': 'citation-perf.pro TOLD calculator' },
      });
    } catch {
      return json({ error: 'upstream_unreachable', message: 'Weather service unreachable.' }, 502);
    }

    // The API answers 204 with an empty body for a station it does not know.
    if (res.status === 204) continue;
    if (!res.ok) {
      return json(
        { error: 'upstream_error', message: `Weather service returned ${res.status}.` },
        502
      );
    }

    let rows;
    try {
      rows = await res.json();
    } catch {
      return json({ error: 'upstream_bad_json', message: 'Weather service sent an unreadable reply.' }, 502);
    }
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const m = rows[0];
    const elevM = num(m.elev);
    const altimHpa = num(m.altim);
    const obsMs = num(m.obsTime) !== null ? m.obsTime * 1000 : null;

    return json(
      {
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
      },
      200,
      60
    );
  }

  return json(
    {
      error: 'not_found',
      message: `No report for ${code}. Tried ${tried.join(', ')}. Try the full ICAO code.`,
    },
    404
  );
}
