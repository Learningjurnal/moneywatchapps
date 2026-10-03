// Kerangka bersama sapuan invarian: pelaporan temuan + fetch dengan retry saat kena rate limit aplikasi.
// ERROR = kontradiksi/mustahil (pasti bug). WARN = tidak lazim tapi bisa sah (split, ROE ekstrem), perlu dilihat manusia.

export class Reporter {
  constructor() { this.items = []; }

  add(severity, area, id, subject, message) {
    this.items.push({ severity, area, id, subject, message });
  }

  addAll(area, subject, violations) {
    for (const v of violations) this.add(v.sev, area, v.id, subject, v.msg);
  }

  count(severity) { return this.items.filter((i) => i.severity === severity).length; }

  groupById() {
    const groups = new Map();
    for (const item of this.items) {
      const key = `${item.severity} ${item.area} ${item.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return groups;
  }

  print(maxExamples = 6) {
    const groups = [...this.groupById().entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [key, items] of groups) {
      console.log(`\n[${key}] ${items.length} temuan`);
      for (const item of items.slice(0, maxExamples)) console.log(`  - ${item.subject}: ${item.message}`);
      if (items.length > maxExamples) console.log(`  ... dan ${items.length - maxExamples} lainnya`);
    }
    console.log(`\nRingkasan: ${this.count('ERROR')} ERROR, ${this.count('WARN')} WARN`);
  }
}

export async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// Aplikasi membatasi permintaan ("Coba lagi dalam N detik"); sapuan harus menunggu, bukan menganggapnya bug data.
export async function fetchJson(url, { retries = 5 } = {}) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      const json = await response.json();
      const limited = json && json.success === false && /Terlalu banyak permintaan/i.test(String(json.error || ''));
      if (!limited) return json;
      const wait = Number((String(json.error).match(/(\d+)\s*detik/) || [])[1] || 3);
      last = json;
      await sleep((wait + 1) * 1000);
    } catch (error) {
      last = { success: false, error: String(error && error.message ? error.message : error) };
      await sleep(1500 * (attempt + 1));
    }
  }
  return last;
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}

// PRNG deterministik supaya simulasi acak bisa diulang persis dengan --seed yang sama.
export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
