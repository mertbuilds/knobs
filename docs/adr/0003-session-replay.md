# ADR-0003: Light session replay

Date: 2026-10-27. Status: accepted.

## Decision

| Area            | Decision                                                                                           | Why                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample rate     | 2% of sessions (`REPLAY_SAMPLE_RATE`)                                                              | Enough visits to watch, little load on the self-hosted OpenPanel. The same rate as our other product landings                                                                                   |
| Masking         | `maskAllInputs: true`, `maskAllText: false`                                                        | Page text is the same for every visitor; only what a visitor types is theirs                                                                                                                    |
| Blocked parts   | `blockSelector: '[data-replay-block]'`, on the clock face                                          | The clock redraws every frame: 882 events in 25 seconds with it recorded, 34 without                                                                                                            |
| Flush           | `flushIntervalMs: 60000`                                                                           | The recorder takes a full page snapshot on every flush, about 400 KB on this page; the default 10 seconds was about 37 KB per second. It still flushes on `pagehide` and when the tab is hidden |
| Chunk size      | `maxEventsPerChunk: 50`                                                                            | Chunks go out without keepalive, so the flush on leaving can be lost; small chunks send a visit's start while it lasts                                                                          |
| Recorder origin | `/api/op/op1-replay.js`, proxied from `@openpanel/web@1.4.1/dist/src/replay.global.js` on jsdelivr | The self-hosted OpenPanel serves `op1.js` but not the recorder (it answers 307 to `/login`). openpanel.dev tracks the latest SDK, so the pinned npm file matches the server                     |

## Consequences

- When the self-hosted OpenPanel is upgraded, bump the recorder's version in `src/routes/api.op.$.ts` with it.
- A new part that animates on its own gets `data-replay-block`.
