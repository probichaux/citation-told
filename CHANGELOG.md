# Changelog

## v1.3.1 — 2026-08-13

The airport weather comment now says the tool stores METAR wind first.
Runway selection fills the wind component later.

## v1.3.0 — 2026-08-12

The runway picker shows runway gradient for each runway end.
It fills the takeoff gradient field when the user selects a runway.

## v1.2.0 — 2026-08-12

After the user loads airport weather, a runway picker shows all runways. Selecting
a runway fills length, surface, and the head/tail wind component on both tabs.

## v1.1.1 — 2026-08-11

The service worker gets the page from the network first, and uses the cache only
when the device is offline. The page reloads once when a new version installs.

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
