/**
 * Caches label-value groups up to a limit, then evicts the least recently
 * used entry so the collector downstream never sees unbounded cardinality.
 *
 * The map stores entries by their flattened key; the doubly-linked list
 * mirrors the same order, MRU at head, LRU at tail. Touching or inserting
 * an entry moves it to the head; once over the limit we drop the tail.
 */
export class CardinalityLimiter {
  #max = 0;
  #head = null;
  #tail = null;
  #map = new Map();

  /**
   * @param {number} maxEntries Maximum number of distinct label groups kept.
   */
  constructor(maxEntries) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new TypeError('maxEntries must be a positive integer');
    }
    this.#max = maxEntries;
  }

  get maxEntries() {
    return this.#max;
  }

  get size() {
    return this.#map.size;
  }

  /**
   * Records a label group. If the group is new and we are at the limit, the
   * least recently used group is evicted. Returns the entry that won the slot.
   *
   * @param {Object<string, string>} labels Map of label name to value.
   * @returns {LabelEntry}
   */
  record(labels) {
    if (labels === null || typeof labels !== 'object' || Array.isArray(labels)) {
      throw new TypeError('labels must be a plain object');
    }
    const key = buildKey(labels);
    const existing = this.#map.get(key);
    if (existing !== undefined) {
      this.#moveToHead(existing);
      existing.touches++;
      return existing;
    }
    const entry = new LabelEntry(key, labels);
    this.#insertAtHead(entry);
    this.#map.set(key, entry);
    if (this.#map.size > this.#max) {
      const victim = this.#tail;
      this.#unlink(victim);
      this.#map.delete(victim.key);
    }
    return entry;
  }

  has(labels) {
    return this.#map.has(buildKey(labels));
  }

  clear() {
    this.#map.clear();
    this.#head = null;
    this.#tail = null;
  }

  /**
   * Returns the keys of live label groups, MRU first. This is the order a
   * collector should iterate when flushing, so the freshest groups go out
   * first and the about-to-be-evicted ones go last.
   *
   * @returns {string[]}
   */
  liveKeys() {
    const out = [];
    for (let e = this.#head; e !== null; e = e.next) out.push(e.key);
    return out;
  }

  #insertAtHead(node) {
    node.prev = null;
    node.next = this.#head;
    if (this.#head) this.#head.prev = node;
    this.#head = node;
    if (!this.#tail) this.#tail = node;
  }

  #unlink(node) {
    if (node.prev) node.prev.next = node.next;
    else this.#head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.#tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  #moveToHead(node) {
    if (this.#head === node) return;
    this.#unlink(node);
    this.#insertAtHead(node);
  }
}

/**
 * A single label group entry. `labels` is a shallow copy of what was passed
 * in, so later mutation by the caller does not corrupt the cached entry.
 */
export class LabelEntry {
  /**
   * @param {string} key
   * @param {Object<string, string>} labels
   */
  constructor(key, labels) {
    this.key = key;
    this.labels = Object.assign({}, labels);
    this.touches = 1;
  }
}

/**
 * Produces a canonical, ordered key for a label set. Keys are sorted by
 * label name so {a:1,b:2} and {b:2,a:1} collapse to the same group.
 *
 * We use a single pipe separator. Label names in Prometheus-style metrics
 * are restricted to `[a-zA-Z_][a-zA-Z0-9_]*`, so a pipe never appears in a
 * valid name; values are left as-is because a duplicate set of values still
 * produces the same key regardless of internal separators.
 *
 * @param {Object<string, string>} labels
 * @returns {string}
 */
export function buildKey(labels) {
  const names = Object.keys(labels).sort();
  let out = '';
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    if (i > 0) out += '|';
    out += n + '=' + labels[n];
  }
  return out;
}
