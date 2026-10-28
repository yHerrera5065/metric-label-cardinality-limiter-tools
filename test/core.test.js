import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CardinalityLimiter,
  LabelEntry,
  buildKey,
} from '../src/index.js';

test('buildKey sorts label names', () => {
  assert.equal(buildKey({ b: '2', a: '1' }), 'a=1|b=2');
  assert.equal(buildKey({ a: '1', b: '2' }), 'a=1|b=2');
});

test('buildKey handles empty labels', () => {
  assert.equal(buildKey({}), '');
});

test('buildKey preserves values containing pipes', () => {
  assert.equal(buildKey({ a: 'x|y' }), 'a=x|y');
});

test('constructor rejects non-positive integers', () => {
  assert.throws(() => new CardinalityLimiter(0), TypeError);
  assert.throws(() => new CardinalityLimiter(-1), TypeError);
  assert.throws(() => new CardinalityLimiter(1.5), TypeError);
  assert.throws(() => new CardinalityLimiter('5'), TypeError);
});

test('record accepts new groups up to the limit', () => {
  const lim = new CardinalityLimiter(3);
  lim.record({ a: '1' });
  lim.record({ a: '2' });
  lim.record({ a: '3' });
  assert.equal(lim.size, 3);
  assert.equal(lim.has({ a: '1' }), true);
});

test('record returns the same entry for duplicate labels', () => {
  const lim = new CardinalityLimiter(3);
  const first = lim.record({ a: '1' });
  const second = lim.record({ a: '1' });
  assert.equal(first, second);
  assert.equal(second.touches, 2);
});

test('record treats label order-independent sets as the same group', () => {
  const lim = new CardinalityLimiter(3);
  lim.record({ a: '1', b: '2' });
  assert.equal(lim.has({ b: '2', a: '1' }), true);
  assert.equal(lim.size, 1);
});

test('record evicts the least recently used entry when full', () => {
  const lim = new CardinalityLimiter(2);
  lim.record({ a: '1' });
  lim.record({ a: '2' });
  // Touch '1' so '2' is the LRU candidate.
  lim.record({ a: '1' });
  lim.record({ a: '3' });
  assert.equal(lim.has({ a: '1' }), true);
  assert.equal(lim.has({ a: '2' }), false);
  assert.equal(lim.has({ a: '3' }), true);
});

test('liveKeys lists MRU first', () => {
  const lim = new CardinalityLimiter(3);
  lim.record({ a: '1' });
  lim.record({ a: '2' });
  lim.record({ a: '3' });
  // Touch '1' → order becomes 1, 3, 2.
  lim.record({ a: '1' });
  assert.deepEqual(lim.liveKeys(), ['a=1', 'a=3', 'a=2']);
});

test('LabelEntry holds a copy of labels', () => {
  const lim = new CardinalityLimiter(2);
  const labels = { a: '1' };
  const entry = lim.record(labels);
  assert.ok(entry instanceof LabelEntry);
  labels.a = '999';
  assert.equal(entry.labels.a, '1');
});

test('record rejects non-object labels', () => {
  const lim = new CardinalityLimiter(2);
  assert.throws(() => lim.record(null), TypeError);
  assert.throws(() => lim.record('x'), TypeError);
  assert.throws(() => lim.record([['a', '1']]), TypeError);
});

test('clear empties the limiter', () => {
  const lim = new CardinalityLimiter(2);
  lim.record({ a: '1' });
  lim.record({ a: '2' });
  lim.clear();
  assert.equal(lim.size, 0);
  assert.deepEqual(lim.liveKeys(), []);
});

test('re-recording after eviction does not resurrect the evicted entry', () => {
  const lim = new CardinalityLimiter(2);
  lim.record({ a: '1' });
  lim.record({ a: '2' });
  lim.record({ a: '3' });
  assert.equal(lim.has({ a: '1' }), false);
  const re = lim.record({ a: '1' });
  assert.equal(re.touches, 1);
  assert.equal(lim.has({ a: '2' }), false);
});
