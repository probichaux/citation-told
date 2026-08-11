# Changelog

## v1.1.0 — 2026-08-11

The user can give a worldwide ICAO or IATA code to fill field elevation,
altimeter, and OAT from the latest METAR. A code that matches more than one
airport fills nothing.

## v1.0.1 — 2026-08-11

The service worker caches the root URL and does not cache `index.html`. The
application does not register a second service worker from a blob URL.

### Build

The deploy workflow uses a fixed Wrangler version. Wrangler 4.121.0 requires a
package that is not available.

## v1.0.0 — 2026-08-11

The application shows its version in the page header. A script sets the same
version in `index.html` and `sw.js`.
