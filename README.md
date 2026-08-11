# Citation I/SP (Cessna Model 501) — TOLD Calculator

A single-file, offline HTML tool that reproduces the takeoff and landing (TOLD)
performance tables from the *Model 501 Citation I/SP Pilots' Abbreviated
Checklist*, Revision 28 (501CL-28).

Rudy Poussot shared this nifty tool he'd written on
[BeechTalk](https://www.beechtalk.com) and I volunteered to beef it up a little
and make it more cloud-friendly. His original tool was vibe coded using
performance data from the checklist he mentions above, and my changes are to make
it friendly to host on Cloudflare, plus a few new features.

## Disclaimer

**Not an operational or dispatch tool.** This calculator reproduces takeoff and
landing tables exactly as printed in the uploaded *Pilots' Abbreviated
Checklist* (Model 501 Citation I/SP, Rev. 28). It performs only linear
interpolation strictly *within* the printed weight / pressure-altitude /
temperature grids — it never extrapolates beyond a table's printed range, and it
flags any input that falls outside the source data instead of guessing. The
source charts assume a **dry, paved, level runway with zero wind** and provide
**no correction factors for wind, runway slope, or contaminated surfaces** — so
none are applied here. This abbreviated checklist also does not contain
accelerate-stop/accelerate-go, balanced-field, or obstacle-clearance
climb-gradient charts, so those are not available in this tool. Always verify
against the current, complete AFM/POH and company procedures before any real
flight.

## Usage

1. Select the airframe **Configuration** (AB or AC) — this determines which
   table set applies.
2. *Optional:* type an **Airport** code and press **Load Wx** to fill field
   elevation, altimeter setting, and OAT on both tabs from the latest METAR.
   See [Airport weather lookup](#airport-weather-lookup) for what it will and
   won't do.
3. Fill in the **Takeoff** or **Landing** tab: weight, field elevation,
   altimeter setting, OAT, runway length, surface, wind, and gradient.
4. Press **Calculate**. Every result cites the exact source page and table it
   came from.

The **Theme** button in the header cycles Auto → Light → Dark. Auto follows the
device's appearance setting and tracks changes live; an explicit choice is
remembered in `localStorage`. The theme resolves in an inline `<head>` script
before first paint, so the pinned app never flashes the wrong palette.

## Airport weather lookup

Enter a 4-letter ICAO code or a 3-letter IATA code — worldwide — and the tool
fills **field elevation**, **altimeter setting**, and **OAT** on both tabs from
that station's latest METAR. It reports the station name, the age of the
observation, and the raw METAR text so you can see exactly what it used.

It is advisory only. Confirm against your own altimeter and the current ATIS
before using any of it, and note these deliberate limits:

- **Wind is reported, not filled.** The wind inputs are a head/tail *component*
  in knots, and converting a METAR wind direction into a component needs the
  runway heading, which this tool never asks for. Rather than write an
  unverified number into a performance field, the observed wind is shown as text
  (`300° at 4 kt`) for you to resolve yourself.
- **An ambiguous code fills nothing.** Three-letter codes are not unique across
  namespaces: `HND` is Tokyo Haneda (16 ft) as an IATA code but Henderson,
  Nevada (2,428 ft) as an FAA local code, and `MDQ` is either Mar del Plata or
  Madison County, Alabama. When a code matches more than one reporting station
  the tool lists the matches and fills nothing, because filling from the wrong
  airport is worse than filling from none. Use the ICAO code to be certain.
- **Elevation is the reporting station's**, which can differ from published
  field elevation by a few feet (KHSV reports 623 ft against a published
  629 ft). Treat it as a starting point, not a source of truth.
- **The observation can be stale.** METARs are typically hourly, so the age is
  always shown and flagged once it passes 75 minutes.
- **It needs a network connection**, and it is never cached — see
  [How the lookup works](#how-the-lookup-works). Every field it touches stays
  editable by hand, and the calculator itself works with no connectivity at all.

### How the lookup works

Weather comes from the NOAA Aviation Weather Center API, which needs no API key
but sends no `Access-Control-Allow-Origin` header — so the browser cannot call it
directly. `functions/api/metar.js` is a Cloudflare Pages Function that proxies it
from our own origin and normalises the units in one place, because the upstream
units are not the ones the calculator wants and look plausible if taken at face
value: `altim` is hectopascals (1018 → 30.06 inHg) and `elev` is metres
(190 m → 623 ft).

`sw.js` skips `/api/` entirely. The cache is cache-first, so caching weather
would serve an old altimeter setting and temperature as though they were current.

The API accepts ICAO identifiers only, and outside North America nothing derives
one from an IATA code (`LHR` → `EGLL`), so `functions/api/_iata.js` holds a
generated IATA → ICAO table of 8,352 airports. It lives under `functions/`, which
Pages bundles into the Function and does **not** serve as a static asset, so the
browser downloads none of it. Regenerate it from
[OurAirports](https://ourairports.com/data/) data with:

```sh
python3 scripts/build-iata-map.py
```

## Running it

`index.html` is fully self-contained — styles, performance tables, and logic all
live in that one file, with no build step. The performance calculations need no
network; only the optional airport weather lookup does, and that runs through a
Pages Function in `functions/`. It works three ways:

- **Locally**: open `index.html` directly in any modern browser (`file://` is
  fine). Two things need a server and are skipped there: the offline service
  worker, and the airport weather lookup, which calls a server-side proxy. All
  the performance calculations work. To exercise those two, run
  `npx wrangler pages dev .` and use the URL it prints.
- **Cloudflare Pages**: deploy the repository root as-is. There is no build
  command and no output subdirectory — the deployed tree is the repository tree.
  `_headers` sets the security headers and keeps `index.html`, `sw.js`, and the
  manifest revalidating so a deployed change actually reaches pinned devices.
  `functions/` is picked up automatically and becomes the `/api/*` routes; it is
  bundled into the Function rather than served as static files.
  Live at [citation-perf.pro](https://citation-perf.pro).
- **Pinned on iOS/iPadOS**: open the deployed URL in Safari, then
  *Share → Add to Home Screen*. It launches standalone (no browser chrome),
  uses the `icons/` app icon, and `sw.js` precaches everything so it keeps
  working with no connectivity — which is the point, in a cockpit.

## Versioning and deployment

The version shows in the top-right of the app header and lives in exactly two
places: that label in `index.html` and `CACHE_VERSION` in `sw.js`. They must
match. `sw.js` serves cache-first, so if `CACHE_VERSION` doesn't change, an
already-pinned install keeps serving the previously cached build — the deploy
succeeds and never reaches the devices that matter.

Never edit either by hand. Bump both together:

```sh
scripts/bump-version.sh          # patch: 1.0.0 -> 1.0.1
scripts/bump-version.sh minor    # 1.0.0 -> 1.1.0
scripts/bump-version.sh major    # 1.0.0 -> 2.0.0
scripts/bump-version.sh 2.3.4    # explicit
scripts/bump-version.sh --check  # verify the two files agree
```

Two guards enforce this:

- A **pre-push hook** (`.githooks/pre-push`) rejects a push to `main` that
  changes `index.html`, `sw.js`, `manifest.webmanifest`, or `icons/` without a
  version bump, and rejects any commit where the two version strings disagree.
  Enable it once per clone with `git config core.hooksPath .githooks`.
- The **deploy workflow** re-runs `--check` before publishing, so a desync fails
  the build rather than shipping silently.

Pushing to `main` deploys automatically via
`.github/workflows/deploy.yml`, which uploads the repository root to the
`citation-perf` Cloudflare Pages project. It needs two repository secrets:
`CLOUDFLARE_API_TOKEN` (a token with the *Cloudflare Pages: Edit* permission)
and `CLOUDFLARE_ACCOUNT_ID`.

## Outputs

- Takeoff field length and climb data
- Takeoff V-speeds for flaps 15° (T.O. & APPR) and flaps UP
- Thrust setting (N1 %)
- Landing distance
- Landing reference speed
- Runway margin against the entered runway length

## Data source

Rudy's *Model 501 Citation I/SP Pilots' Abbreviated Checklist*, Revision 28
(501CL-28), Normal Procedures section, pages N-8 through N-23.1 (including the
N-8/N-8.1, N-11/N-11.1, and N-13/N-13.1 thrust setting tables).

Pressure altitude is computed as `elevation + (29.92 − altimeter) × 1000`, the
standard formula rather than aircraft-specific data. Anti-ice, wind, slope, and
dispatch factoring are applied only where the source itself provides a factor
(anti-ice ON ×1.25 on takeoff distance); wind, slope, and contaminated-runway
corrections are not published in this document and are therefore not computed.

The airport lookup uses two outside sources, neither of which affects any
performance table:

- Observations from the [NOAA Aviation Weather Center](https://aviationweather.gov/)
  METAR API.
- IATA → ICAO identifiers from [OurAirports](https://ourairports.com/data/),
  which is public domain.

## License

MIT — see [LICENSE](LICENSE).
