#!/usr/bin/env python3
"""Regenerate functions/api/_iata.js -- the IATA -> ICAO lookup used by the
METAR proxy.

The upstream weather API only accepts ICAO identifiers, and there is no rule
that turns an IATA code into an ICAO one outside North America (LHR -> EGLL,
CDG -> LFPG). So the mapping has to be a table. It lives in functions/, which
Cloudflare Pages bundles into the Function and does NOT serve as a static
asset, so it costs the browser nothing.

Source: OurAirports (public domain). Run with no arguments to fetch the current
data, or pass a path to a local airports.csv.

    python3 scripts/build-iata-map.py [path/to/airports.csv]
"""

import csv
import io
import os
import re
import sys
import urllib.request

SOURCE_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
OUT = os.path.join(os.path.dirname(__file__), "..", "functions", "api", "_iata.js")

ICAOISH = re.compile(r"^[A-Z][A-Z0-9]{3}$")
IATAISH = re.compile(r"^[A-Z]{3}$")
# Heliports, seaplane bases, balloonports and closed fields are not places this
# aircraft goes, and including them would only add ambiguity.
TYPES = {"large_airport", "medium_airport", "small_airport"}


def icao_of(row):
    """OurAirports leaves icao_code blank for most US fields; the identifier is
    then in ident or gps_code (KMDQ is a real example)."""
    for candidate in (row["icao_code"], row["ident"], row["gps_code"]):
        if candidate and ICAOISH.match(candidate):
            return candidate
    return None


def load(path):
    if path:
        with open(path, encoding="utf-8") as fh:
            return list(csv.DictReader(fh))
    print(f"fetching {SOURCE_URL}", file=sys.stderr)
    with urllib.request.urlopen(SOURCE_URL) as resp:
        text = resp.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def main():
    rows = load(sys.argv[1] if len(sys.argv) > 1 else None)

    mapping = {}
    collisions = 0
    for row in rows:
        if row["type"] not in TYPES:
            continue
        iata = row["iata_code"]
        if not iata or not IATAISH.match(iata):
            continue
        icao = icao_of(row)
        if not icao:
            continue
        if iata in mapping:
            collisions += 1
            continue
        mapping[iata] = icao

    # Fixed 7 characters per record (3 IATA + 4 ICAO) with no separators, so the
    # reader can slice it without splitting.
    packed = "".join(f"{iata}{icao}" for iata, icao in sorted(mapping.items()))
    assert len(packed) == 7 * len(mapping), "record width is not uniform"

    out_path = os.path.normpath(OUT)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(
            f"""/* GENERATED FILE -- do not edit by hand.
 *
 * Regenerate with:  python3 scripts/build-iata-map.py
 *
 * IATA -> ICAO for {len(mapping)} airports, from OurAirports (public domain).
 * The upstream weather API takes ICAO identifiers only, and outside North
 * America there is no rule that derives one from an IATA code.
 *
 * Packed as fixed-width 7-character records (3 IATA + 4 ICAO), sorted by IATA,
 * so this stays one string literal instead of {len(mapping)} object keys.
 *
 * The leading underscore keeps Pages from routing this file as an endpoint.
 */
const PACKED =
  '{packed}';

const WIDTH = 7;
let index = null;

/** Resolve a 3-letter IATA code to its ICAO identifier, or null. */
export function iataToIcao(code) {{
  if (!/^[A-Z]{{3}}$/.test(code)) return null;
  if (index === null) {{
    index = new Map();
    for (let i = 0; i < PACKED.length; i += WIDTH) {{
      index.set(PACKED.slice(i, i + 3), PACKED.slice(i + 3, i + WIDTH));
    }}
  }}
  return index.get(code) || null;
}}

export const IATA_COUNT = {len(mapping)};
"""
        )

    print(f"wrote {out_path}")
    print(f"  {len(mapping)} pairs, {len(packed)} chars packed, {collisions} collisions skipped")


if __name__ == "__main__":
    main()
