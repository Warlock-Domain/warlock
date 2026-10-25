# Client resource telemetry

`GET /api/telemetry/resources` returns the latest 1,000 anonymous browser samples. The samples are stored in the lobby Durable Object's storage under `resource-samples`; round and economy telemetry remains under `telemetry` and is available at `GET /api/telemetry`.

During a live non-sandbox match, each browser reports at most once per minute. A sample contains the server timestamp, a random browser-session ID that changes on reload, client build identifier, mode, round, total player count, active projectile count, Three.js geometry and texture counts, and optionally the browser's JavaScript heap estimate.

Geometry and texture values are renderer object counts, not GPU memory in bytes. WebGL does not expose a portable VRAM usage counter through Three.js. The optional `performance.memory.usedJSHeapSize` value is a Chromium-specific estimate; other browsers omit it. Compare samples within the same session and similar game load (players and projectiles) to spot growth. Browser and game-version differences can affect the measurements.

The server validates each report, rejects reports outside live matches, rate-limits each connection, and retains only the most recent 1,000 samples. Samples contain no player name or stable player ID.
