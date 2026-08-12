/* Same-origin runway data endpoint.
 *
 * Returns the runway list for an ICAO airport identifier from the embedded
 * OurAirports table. Runway data changes rarely, so responses are cached at
 * the edge for 24 hours.
 *
 * GET /api/runways?id=KHSV
 *
 * Response shape (200):
 *   { icao: "KHSV", runways: [
 *       { le: "18L", he: "36R", lengthFt: 12600, widthFt: 150, surface: "H" },
 *       ...
 *   ]}
 *
 * surface codes: H = hard/paved, G = gravel, S = soft/grass, U = unknown
 */

import { runwaysFor } from './_runways.js';

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    },
  });
}

export async function onRequestGet({ request }) {
  const icao = (new URL(request.url).searchParams.get('id') || '')
    .trim()
    .toUpperCase();

  if (!/^[A-Z][A-Z0-9]{3}$/.test(icao)) {
    return json({ error: 'invalid_code', message: 'Enter a 4-letter ICAO code.' }, 400);
  }

  const rows = runwaysFor(icao);
  if (!rows || rows.length === 0) {
    return json(
      { error: 'not_found', message: `No runway data for ${icao}.` },
      404
    );
  }

  const runways = rows.map(([le, he, lengthFt, widthFt, surface]) => ({
    le,
    he,
    lengthFt,
    widthFt,
    surface,
  }));

  return json({ icao, runways }, 200, 86400);
}
