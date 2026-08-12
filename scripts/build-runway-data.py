#!/usr/bin/env python3
"""Regenerate functions/api/_runways.js -- runway data for the airport picker.

For each ICAO airport (large/medium/small, open runways only) this emits a
compact JSON table keyed by ICAO identifier. Each entry is a list of runway
records: [le_ident, he_ident, length_ft, width_ft, surface_code] where
surface_code is H (hard/paved), G (gravel), S (soft/grass), or U (unknown).

Run with no arguments to fetch current data, or supply local CSV paths:

    python3 scripts/build-runway-data.py [airports.csv [runways.csv]]

Source: OurAirports (public domain).
"""

import csv
import io
import json
import os
import re
import subprocess
import sys

AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
RUNWAYS_URL  = "https://davidmegginson.github.io/ourairports-data/runways.csv"
OUT = os.path.join(os.path.dirname(__file__), "..", "functions", "api", "_runways.js")

ICAOISH = re.compile(r"^[A-Z][A-Z0-9]{3}$")
TYPES   = {"large_airport", "medium_airport", "small_airport"}

# Surface codes that indicate a hard/paved surface.
HARD_SURFACES = {
    "ASP","ASPH","ASPHALT","BIT","BITUMINOUS","TAR","MAC","MACADAM",
    "PEM","CEM","CON","CONC","CONCRETE","BRI","BRK","BRICK",
    "BLT","BELT","PVD","PAVED","PCT",
}
GRAVEL_SURFACES = {
    "GVL","GRAVEL","GRVL","GRV","CINDER","COR","CORAL","LATERITE","LAT",
    "CALICHE","SHELL","SHEL","DIRT","CLA","CLAY","SAN","SAND","DRT",
}
SOFT_SURFACES = {
    "GRS","GRASS","GRE","GRN","TURF","SOD","LAWN","GREEN",
    "WATER","SNOW","ICE",
}

def surface_code(raw):
    s = (raw or "").upper().strip()
    # Some entries have compound values like "ASPH-G" -- take the first token.
    s = re.split(r"[-/]", s)[0].strip()
    if s in HARD_SURFACES:   return "H"
    if s in GRAVEL_SURFACES: return "G"
    if s in SOFT_SURFACES:   return "S"
    return "U"

def icao_of(row):
    for c in (row.get("icao_code",""), row.get("ident",""), row.get("gps_code","")):
        if c and ICAOISH.match(c):
            return c
    return None

def fetch(url):
    print(f"fetching {url}", file=sys.stderr)
    result = subprocess.run(["curl", "-s", "--fail", url], capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(f"curl failed for {url}: {result.stderr.decode()}")
    return result.stdout.decode("utf-8")

def load_csv(path_or_none, url):
    if path_or_none:
        with open(path_or_none, encoding="utf-8") as fh:
            return list(csv.DictReader(fh))
    return list(csv.DictReader(io.StringIO(fetch(url))))

def main():
    apt_path = sys.argv[1] if len(sys.argv) > 1 else None
    rwy_path = sys.argv[2] if len(sys.argv) > 2 else None

    apt_rows = load_csv(apt_path, AIRPORTS_URL)
    rwy_rows = load_csv(rwy_path, RUNWAYS_URL)

    # Build set of valid ICAO identifiers.
    valid_icao = set()
    for row in apt_rows:
        if row.get("type") not in TYPES:
            continue
        icao = icao_of(row)
        if icao:
            valid_icao.add(icao)

    print(f"  {len(valid_icao)} valid ICAO airports", file=sys.stderr)

    # Group open runways by airport ICAO.
    by_airport = {}
    skipped_closed = 0
    skipped_no_icao = 0
    skipped_no_ident = 0

    for row in rwy_rows:
        if row.get("closed","0").strip() == "1":
            skipped_closed += 1
            continue

        ident = row.get("airport_ident","").strip().upper()
        if ident not in valid_icao:
            skipped_no_icao += 1
            continue

        le = row.get("le_ident","").strip()
        he = row.get("he_ident","").strip()
        if not le and not he:
            skipped_no_ident += 1
            continue

        try:
            length = int(float(row.get("length_ft","") or 0))
        except ValueError:
            length = 0

        try:
            width = int(float(row.get("width_ft","") or 0))
        except ValueError:
            width = 0

        sfc = surface_code(row.get("surface",""))

        # Gradient: positive = HE end is higher than LE end (uphill le→he).
        # Stored from the LE perspective; the UI negates it for the HE end.
        gradient = None
        try:
            le_elev = float(row.get("le_elevation_ft","") or "nan")
            he_elev = float(row.get("he_elevation_ft","") or "nan")
            if length > 0 and le_elev == le_elev and he_elev == he_elev:  # NaN check
                gradient = round((he_elev - le_elev) / length * 100, 1)
        except (ValueError, ZeroDivisionError):
            pass

        record = [le, he, length, width, sfc, gradient]
        by_airport.setdefault(ident, []).append(record)

    print(f"  {sum(len(v) for v in by_airport.values())} runway records for "
          f"{len(by_airport)} airports", file=sys.stderr)
    print(f"  skipped: {skipped_closed} closed, {skipped_no_icao} no valid ICAO, "
          f"{skipped_no_ident} no ident", file=sys.stderr)

    # Serialise: compact JSON (no spaces in values) sorted by ICAO.
    packed = json.dumps(
        dict(sorted(by_airport.items())),
        separators=(",", ":"),
        ensure_ascii=True,
    )

    out_path = os.path.normpath(OUT)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(
            f"""/* GENERATED FILE -- do not edit by hand.
 *
 * Regenerate with:  python3 scripts/build-runway-data.py
 *
 * Runway data for {len(by_airport)} airports, from OurAirports (public domain).
 * Each entry: [le_ident, he_ident, length_ft, width_ft, surface_code, gradient_pct]
 *   surface_code: H = hard/paved, G = gravel, S = soft/grass, U = unknown
 *   gradient_pct: (he_elev - le_elev) / length * 100, positive = uphill le→he, or null
 *
 * The leading underscore keeps Pages from routing this file as an endpoint.
 */
const DATA = {packed};

/** Return the runway list for an ICAO code, or null if not found. */
export function runwaysFor(icao) {{
  return DATA[icao] || null;
}}
"""
        )

    kb = os.path.getsize(out_path) / 1024
    print(f"wrote {out_path} ({kb:.0f} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
