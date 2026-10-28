# metric-label-cardinality-limiter-tools

Caps the number of distinct label-value groups a collector records, discarding the least recently used group once the limit is reached.

## Usage

```js
import { CardinalityLimiter } from 'metric-label-cardinality-limiter-tools';

const lim = new CardinalityLimiter(1000);

const entry = lim.record({ route: '/checkout', method: 'POST' });
// entry.key is the canonical, sorted label key; entry.labels is a snapshot.

if (!lim.has({ route: '/checkout', method: 'POST' })) {
  // an evicted group — skip or re-initialise as needed
}

const live = lim.liveKeys(); // MRU first, as strings
```

Exports:

- `CardinalityLimiter` — class; constructor takes a positive integer `maxEntries`.
  - `record(labels)` — registers a label group, returns a `LabelEntry`. Duplicates bump the entry to most-recently-used and increment `touches`; when full, the least recently used entry is evicted.
  - `has(labels)` — whether the group is currently live.
  - `liveKeys()` — string keys of live groups, MRU first.
  - `clear()` — empties the limiter.
  - `size` — current number of live groups.
  - `maxEntries` — the configured limit.
- `LabelEntry` — class; fields `key` (string), `labels` (snapshot object), `touches` (number).
- `buildKey(labels)` — canonical key for a label set, label names sorted ascending, joined as `name=value` with `|`.

## Why this exists

A metrics collector that records every distinct label combination can blow up memory when a label carries high-cardinality values — request paths, user IDs, error strings. This library sits in front of the collector and caps the number of groups it ever sees. The trade-off is that once the cap is hit, the least recently used group is silently dropped; if that group is recorded again it re-enters as a fresh entry with `touches` reset to 1. This is an explicit choice over FIFO (which evicts the oldest insertion regardless of activity) and over random sampling (which is non-deterministic and hard to reason about in tests).

## Edge cases

- Label sets are compared by key, not by insertion order: `{a:'1',b:'2'}` and `{b:'2',a:'1'}` are the same group.
- `buildKey` joins label names and values with `=` and `|` without escaping. This is safe for Prometheus-style label names (restricted to `[a-zA-Z_][a-zA-Z0-9_]*`) but values containing `|` or `=` will produce keys that are still deterministic — just not human-parseable. If you need to distinguish `{a:'x|y'}` from `{a:'x',y:''}` at the key level, escape values before passing them in.
- `LabelEntry.labels` is a shallow copy. Nested objects are shared by reference; this library expects flat string-valued label maps.
