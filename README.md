# Citation I/SP (Cessna Model 501) — TOLD Calculator

A single-file, offline HTML tool that reproduces the takeoff and landing (TOLD)
performance tables from the *Model 501 Citation I/SP Pilots' Abbreviated
Checklist*, Revision 28 (501CL-28).

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
2. Fill in the **Takeoff** or **Landing** tab: weight, field elevation,
   altimeter setting, OAT, runway length, surface, wind, and gradient.
3. Press **Calculate**. Every result cites the exact source page and table it
   came from.

The **Theme** button in the header cycles Auto → Light → Dark. Auto follows the
device's appearance setting and tracks changes live; an explicit choice is
remembered in `localStorage`. The theme resolves in an inline `<head>` script
before first paint, so the pinned app never flashes the wrong palette.

## Running it

`index.html` is fully self-contained — styles, performance tables, and logic all
live in that one file, with no build step and no network dependency. It works
three ways:

- **Locally**: open `index.html` directly in any modern browser (`file://` is
  fine; only the offline service worker is skipped).
- **Cloudflare Pages**: deploy the repository root as-is. There is no build
  command and no output subdirectory — the deployed tree is the repository tree.
  `_headers` sets the security headers and keeps `index.html`, `sw.js`, and the
  manifest revalidating so a deployed change actually reaches pinned devices.
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

## License

MIT — see [LICENSE](LICENSE).
