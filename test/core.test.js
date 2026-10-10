// Run with: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/assets/core.js');

// A Gulf-style schedule indexed by Date#getDay() (0 = Sunday).
const SCHEDULE = [
  ['09:00', '18:30'],          // Sun
  ['09:00', '13:00', '18:30'], // Mon
  ['09:00', '13:00', '18:30'], // Tue
  ['09:00', '13:00', '18:30'], // Wed
  ['09:00', '13:00', '18:30'], // Thu
  ['10:00', '16:00'],          // Fri
  ['11:00', '19:00']           // Sat
];

test('charCount counts code points, not UTF-16 units', () => {
  assert.equal(C.charCount('héllo', 'instagram'), 5);
  assert.equal(C.charCount('قهوة', 'instagram'), 4);
  assert.equal(C.charCount('☕️', 'linkedin'), 2); // cup + variation selector
});

test('charCount weighs every link on X as 23 characters', () => {
  const t = 'New menu https://example.com/a-very-long-path/that-keeps-going';
  assert.equal(C.charCount(t, 'x'), 'New menu '.length + 23);
  assert.equal(C.charCount(t, 'linkedin'), t.length);
});

test('extractHashtags finds unique tags in order, ignores numbers and URL fragments', () => {
  const tags = C.extractHashtags('Fresh #ColdBrew and #coldbrew again #1 see https://x.com/#anchor #قهوة_مختصة');
  assert.deepEqual(tags, ['#ColdBrew', '#قهوة_مختصة']);
});

test('validatePost blocks posts over the channel limit', () => {
  const issues = C.validatePost({ network: 'x', text: 'a'.repeat(281) });
  assert.ok(issues.some(i => i.code === 'too_long' && i.level === 'error'));
  assert.ok(C.hasBlockingIssue(issues));
  assert.deepEqual(C.validatePost({ network: 'x', text: 'a'.repeat(280) }), []);
});

test('validatePost requires media on visual channels', () => {
  const noMedia = C.validatePost({ network: 'instagram', text: 'Hello' });
  assert.ok(noMedia.some(i => i.code === 'needs_media'));
  assert.deepEqual(C.validatePost({ network: 'instagram', text: 'Hello', mediaCount: 1 }), []);
});

test('validatePost: Instagram hard-caps 30 hashtags, others only warn', () => {
  const many = Array.from({ length: 31 }, (_, i) => '#tag' + i).join(' ');
  const ig = C.validatePost({ network: 'instagram', text: many, mediaCount: 1 });
  assert.ok(ig.some(i => i.code === 'too_many_hashtags' && i.level === 'error'));
  const li = C.validatePost({ network: 'linkedin', text: '#a #b #c #d #e #f' });
  assert.deepEqual(li.map(i => [i.code, i.level]), [['hashtag_heavy', 'warn']]);
  assert.equal(C.hasBlockingIssue(li), false);
});

test('validatePost flags empty posts and unknown channels', () => {
  assert.ok(C.validatePost({ network: 'facebook', text: '   ' }).some(i => i.code === 'empty'));
  assert.equal(C.validatePost({ network: 'myspace', text: 'hi' })[0].code, 'unknown_network');
});

test('normalizeTimes sorts, dedupes and drops invalid times', () => {
  assert.deepEqual(C.normalizeTimes(['18:30', '9:00', '09:00', '25:00', 'noon', '13:05']), ['09:00', '13:05', '18:30']);
});

test('nextSlots returns the next free slots after "from", skipping taken ones', () => {
  const from = new Date(2026, 9, 10, 15, 42); // Sat 10 Oct 2026, 15:42
  const slots = C.nextSlots(SCHEDULE, [new Date(2026, 9, 10, 19, 0)], from, 3);
  assert.deepEqual(slots.map(C.minuteKey), ['2026-10-11T09:00', '2026-10-11T18:30', '2026-10-12T09:00']);
});

test('nextSlots accepts ISO strings for taken slots and never returns the current minute', () => {
  const from = new Date(2026, 9, 12, 9, 0); // Mon 09:00 exactly
  const slots = C.nextSlots(SCHEDULE, [new Date(2026, 9, 12, 13, 0).toISOString()], from, 1);
  assert.equal(C.minuteKey(slots[0]), '2026-10-12T18:30');
});

test('nextSlots gives up after the horizon on an empty schedule', () => {
  assert.deepEqual(C.nextSlots([[], [], [], [], [], [], []], [], new Date(2026, 0, 1), 2, 14), []);
});

test('slotsBetween lists every slot in a window', () => {
  const s = C.slotsBetween(SCHEDULE, new Date(2026, 9, 10, 12, 0), new Date(2026, 9, 12, 0, 0));
  assert.deepEqual(s.map(C.minuteKey), ['2026-10-10T19:00', '2026-10-11T09:00', '2026-10-11T18:30']);
});

test('dayLabel and relativeTime read naturally', () => {
  const now = new Date(2026, 9, 10, 15, 0);
  assert.equal(C.dayLabel(new Date(2026, 9, 10, 20), now), 'Today');
  assert.equal(C.dayLabel(new Date(2026, 9, 11, 9), now), 'Tomorrow');
  assert.equal(C.dayLabel(new Date(2026, 9, 12, 9), now), 'Monday 12 October');
  assert.equal(C.relativeTime(new Date(2026, 9, 10, 18, 0), now), 'in 3h');
  assert.equal(C.relativeTime(new Date(2026, 9, 8, 15, 0), now), '2d ago');
  assert.equal(C.relativeTime(new Date(2026, 9, 10, 15, 0, 20), now), 'now');
});

test('monthMatrix builds Monday-first weeks covering the whole month', () => {
  const m = C.monthMatrix(2026, 9, 1); // October 2026 starts on a Thursday
  assert.equal(m.length, 5);
  assert.equal(C.dayKey(m[0][0]), '2026-09-28');
  assert.equal(C.dayKey(m[0][3]), '2026-10-01');
  assert.equal(C.dayKey(m[4][6]), '2026-11-01');
  m.forEach(week => assert.equal(week.length, 7));
});

test('groupByDay groups and sorts by local day and time', () => {
  const g = C.groupByDay([
    { id: 'b', scheduledAt: new Date(2026, 9, 11, 18).toISOString() },
    { id: 'a', scheduledAt: new Date(2026, 9, 11, 9).toISOString() },
    { id: 'c', scheduledAt: new Date(2026, 9, 10, 19).toISOString() },
    { id: 'skip' }
  ]);
  assert.deepEqual(g.map(x => x.key), ['2026-10-10', '2026-10-11']);
  assert.deepEqual(g[1].items.map(x => x.id), ['a', 'b']);
});

test('fmtCompact, pctChange and engagementRate', () => {
  assert.equal(C.fmtCompact(999), '999');
  assert.equal(C.fmtCompact(12400), '12.4K');
  assert.equal(C.fmtCompact(3000), '3K');
  assert.equal(C.fmtCompact(2350000), '2.4M');
  assert.equal(C.pctChange(120, 100), 20);
  assert.equal(C.pctChange(5, 0), null);
  assert.equal(C.engagementRate(345, 10000), 3.45);
  assert.equal(C.engagementRate(1, 0), 0);
});

test('largestRemainder always sums to the total', () => {
  const p = C.largestRemainder([1, 1, 1]);
  assert.equal(C.sum(p), 100);
  assert.deepEqual(p, [34, 33, 33]);
  assert.deepEqual(C.largestRemainder([0, 0]), [0, 0]);
});

test('sentimentShare reports whole percents summing to 100', () => {
  const s = C.sentimentShare([{ sentiment: 'positive' }, { sentiment: 'positive' }, { sentiment: 'neutral' }, { sentiment: 'negative' }, { sentiment: 'other' }]);
  assert.deepEqual([s.positive, s.neutral, s.negative], [50, 25, 25]);
  assert.equal(s.counts.positive, 2);
});

test('bestTimes picks the highest cells; heatmapBlocks averages hours', () => {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(1));
  grid[2][20] = 9; grid[5][10] = 7;
  assert.deepEqual(C.bestTimes(grid, 2).map(c => [c.day, c.hour]), [[2, 20], [5, 10]]);
  const blocks = C.heatmapBlocks(grid, 3);
  assert.equal(blocks.length, 7);
  assert.equal(blocks[0].length, 8);
  assert.equal(blocks[2][6], (9 + 1 + 1) / 3);
});

test('demo data is deterministic', () => {
  assert.deepEqual(C.demoSeries(10, 42, { base: 500 }), C.demoSeries(10, 42, { base: 500 }));
  assert.notDeepEqual(C.demoSeries(10, 42), C.demoSeries(10, 43));
  assert.ok(C.demoSeries(30, 1, { base: 100 }).every(v => Number.isInteger(v) && v >= 0));
  const g = C.demoHeatGrid(7);
  assert.equal(g.length, 7);
  assert.ok(g.every(r => r.length === 24));
});

test('buildComposePrompt carries the brief, the voice and every channel limit', () => {
  const p = C.buildComposePrompt(
    { idea: 'Launch our date-syrup cold brew', networks: ['x', 'instagram'], lang: 'both', format: 'thread', hashtags: false, hasImage: true },
    { brand: 'Marsa Coffee', tone: 'warm, witty', avoid: 'cheap' }
  );
  assert.match(p, /Launch our date-syrup cold brew/);
  assert.match(p, /Brand: Marsa Coffee/);
  assert.match(p, /Never use: cheap/);
  assert.match(p, /x \(X\): max 280 characters \(each link counts as 23\)/);
  assert.match(p, /instagram \(Instagram\): max 2200 characters/);
  assert.match(p, /Bilingual: Arabic first/);
  assert.match(p, /Hashtags: none/);
  assert.match(p, /altText/);
  assert.match(p, /one JSON object per line/);
});

test('buildEnhancePrompt uses the action instruction and rejects unknown actions', () => {
  const p = C.buildEnhancePrompt('shorten', 'Our new roast is here.', 'linkedin', { brand: 'Marsa Coffee' });
  assert.match(p, /Cut the length by about 40%/);
  assert.match(p, /LinkedIn \(max 3000 characters\)/);
  assert.throws(() => C.buildEnhancePrompt('nope', 'x', 'x'));
});

test('parseVariantLine handles streamed JSON lines and rejects junk', () => {
  const v = C.parseVariantLine('{"network":"twitter","text":"Hi\\nthere #Coffee","hashtags":["#Coffee"]},');
  assert.deepEqual(v, { network: 'x', text: 'Hi\nthere #Coffee', hashtags: ['#Coffee'], altText: '' });
  assert.equal(C.parseVariantLine('Here are your posts:'), null);
  assert.equal(C.parseVariantLine('{"network":"myspace","text":"x"}'), null);
  assert.equal(C.parseVariantLine('{"network":"x","text":'), null);
});

test('parseVariants accepts JSON lines, arrays, wrapped objects and code fences', () => {
  const lines = '{"network":"x","text":"A"}\n{"network":"linkedin","text":"B"}';
  assert.deepEqual(C.parseVariants(lines).map(v => v.network), ['x', 'linkedin']);
  const arr = '```json\n[{"network":"instagram","text":"C"}]\n```';
  assert.equal(C.parseVariants(arr)[0].text, 'C');
  const wrapped = 'Sure: {"variants":[{"network":"facebook","text":"D"}]}';
  assert.equal(C.parseVariants(wrapped)[0].network, 'facebook');
  const dup = '{"network":"x","text":"old"}\n{"network":"x","text":"new"}';
  assert.equal(C.parseVariants(dup).length, 1);
  assert.equal(C.parseVariants(dup)[0].text, 'new');
  assert.deepEqual(C.parseVariants('no json here'), []);
});
