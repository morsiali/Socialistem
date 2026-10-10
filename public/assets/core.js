/*
 * Socialistem core — pure, dependency-free logic shared by the web app and the test suite.
 * Works in the browser (window.SocialistemCore) and in Node (module.exports).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SocialistemCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Channels                                                            */
  /* ------------------------------------------------------------------ */

  var NETWORKS = [
    { id: 'instagram', name: 'Instagram', short: 'IG', limit: 2200, maxHashtags: 30, idealHashtags: [3, 8], needsMedia: true,
      tip: 'Hook in the first line (about 125 characters show before "more"). Short lines for scanning. 3 to 8 hashtags at the end.' },
    { id: 'facebook', name: 'Facebook', short: 'FB', limit: 63206, maxHashtags: null, idealHashtags: [0, 3], needsMedia: false,
      tip: 'Conversational, 40 to 80 words. End with a question to invite comments. 0 to 3 hashtags.' },
    { id: 'linkedin', name: 'LinkedIn', short: 'in', limit: 3000, maxHashtags: null, idealHashtags: [0, 5], needsMedia: false,
      tip: 'Professional insight or a short story. The first two lines (about 210 characters) must earn the "see more" click. Short paragraphs, up to 5 hashtags.' },
    { id: 'x', name: 'X', short: 'X', limit: 280, urlWeight: 23, maxHashtags: null, idealHashtags: [0, 2], needsMedia: false,
      tip: 'Punchy and specific. Hard limit 280 characters, every link counts as 23. 0 to 2 hashtags.' },
    { id: 'tiktok', name: 'TikTok', short: 'TT', limit: 4000, maxHashtags: null, idealHashtags: [3, 6], needsMedia: true,
      tip: 'The caption supports a video: short hook, words people search for, 3 to 6 hashtags.' },
    { id: 'threads', name: 'Threads', short: 'Th', limit: 500, maxHashtags: null, idealHashtags: [0, 1], needsMedia: false,
      tip: 'Casual and conversational, max 500 characters. Threads shows one topic tag per post.' },
    { id: 'youtube', name: 'YouTube Shorts', short: 'YT', limit: 5000, maxHashtags: 15, idealHashtags: [1, 3], needsMedia: true,
      tip: 'Description for a Short: hook and keywords in the first line, 1 to 3 hashtags.' },
    { id: 'pinterest', name: 'Pinterest', short: 'Pin', limit: 500, maxHashtags: null, idealHashtags: [0, 3], needsMedia: true,
      tip: 'Descriptive and keyword rich, max 500 characters, written for search.' }
  ];

  var NETWORK_BY_ID = {};
  NETWORKS.forEach(function (n) { NETWORK_BY_ID[n.id] = n; });

  function getNetwork(id) { return NETWORK_BY_ID[id] || null; }

  /* ------------------------------------------------------------------ */
  /* Text measurement & validation                                       */
  /* ------------------------------------------------------------------ */

  var URL_RE = /https?:\/\/[^\s]+/g;
  var TAG_RE = /(?<![\p{L}\p{N}_&#])#([\p{L}\p{N}_]+)/gu;

  function graphemeLength(s) { return Array.from(String(s)).length; }

  /** Characters as the network counts them (X weighs every link as 23). */
  function charCount(text, networkId) {
    text = String(text == null ? '' : text);
    var n = getNetwork(networkId);
    if (n && n.urlWeight) {
      var urls = text.match(URL_RE) || [];
      return graphemeLength(text.replace(URL_RE, '')) + urls.length * n.urlWeight;
    }
    return graphemeLength(text);
  }

  /** Unique hashtags in order of appearance, case-insensitive. Pure numbers (#1) are ignored. */
  function extractHashtags(text) {
    var out = [], seen = {}, m;
    var re = new RegExp(TAG_RE.source, TAG_RE.flags);
    text = String(text == null ? '' : text).replace(URL_RE, ' ');
    while ((m = re.exec(text))) {
      var tag = m[1];
      if (/^\d+$/.test(tag)) continue;
      var key = tag.toLowerCase();
      if (!seen[key]) { seen[key] = true; out.push('#' + tag); }
    }
    return out;
  }

  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /**
   * Check a post against a channel's rules.
   * Returns [{level: 'error'|'warn', code, message}]; errors block scheduling.
   */
  function validatePost(input) {
    var n = getNetwork(input && input.network);
    if (!n) return [{ level: 'error', code: 'unknown_network', message: 'Unknown channel.' }];
    var text = String(input.text == null ? '' : input.text);
    var media = input.mediaCount || 0;
    var issues = [];
    var count = charCount(text, n.id);
    if (!text.trim() && !media) issues.push({ level: 'error', code: 'empty', message: 'Write something or add media.' });
    if (count > n.limit) {
      issues.push({ level: 'error', code: 'too_long', message: n.name + ' allows ' + fmtInt(n.limit) + ' characters. This post has ' + fmtInt(count) + '.' });
    }
    var tags = extractHashtags(text).length;
    if (n.maxHashtags != null && tags > n.maxHashtags) {
      issues.push({ level: 'error', code: 'too_many_hashtags', message: n.name + ' allows ' + n.maxHashtags + ' hashtags. This post has ' + tags + '.' });
    } else if (n.idealHashtags && tags > n.idealHashtags[1]) {
      issues.push({ level: 'warn', code: 'hashtag_heavy', message: tags + ' hashtags. ' + n.name + ' posts usually do best with ' + n.idealHashtags[0] + ' to ' + n.idealHashtags[1] + '.' });
    }
    if (n.needsMedia && !media) issues.push({ level: 'error', code: 'needs_media', message: n.name + ' needs an image or video.' });
    return issues;
  }

  function hasBlockingIssue(issues) {
    return (issues || []).some(function (i) { return i.level === 'error'; });
  }

  /* ------------------------------------------------------------------ */
  /* Dates & the posting schedule                                        */
  /* ------------------------------------------------------------------ */

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function minuteKey(d) { return dayKey(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()); }

  /** "HH:MM" -> [h, m] or null. */
  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return [h, mi];
  }

  /** Sorted, de-duplicated, valid "HH:MM" list. */
  function normalizeTimes(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (t) {
      var hm = parseHM(t);
      if (!hm) return;
      var k = pad2(hm[0]) + ':' + pad2(hm[1]);
      if (!seen[k]) { seen[k] = true; out.push(k); }
    });
    return out.sort();
  }

  /**
   * All schedule slot times in [from, to). schedule is an array of 7 lists of "HH:MM",
   * indexed by Date#getDay() (0 = Sunday).
   */
  function slotsBetween(schedule, from, to) {
    var out = [];
    for (var day = startOfDay(from); day < to; day = addDays(day, 1)) {
      var times = normalizeTimes((schedule || [])[day.getDay()]);
      for (var i = 0; i < times.length; i++) {
        var hm = parseHM(times[i]);
        var d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hm[0], hm[1]);
        if (d >= from && d < to) out.push(d);
      }
    }
    return out;
  }

  /**
   * The next `count` free queue slots strictly after `from`.
   * `taken` is a list of dates (or ISO strings) already holding a post; matched to the minute.
   */
  function nextSlots(schedule, taken, from, count, horizonDays) {
    count = count || 1;
    horizonDays = horizonDays || 60;
    var takenSet = {};
    (taken || []).forEach(function (t) { var d = new Date(t); if (!isNaN(d)) takenSet[minuteKey(d)] = true; });
    var out = [];
    var start = startOfDay(from);
    for (var i = 0; i < horizonDays && out.length < count; i++) {
      var day = addDays(start, i);
      var times = normalizeTimes((schedule || [])[day.getDay()]);
      for (var j = 0; j < times.length && out.length < count; j++) {
        var hm = parseHM(times[j]);
        var d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hm[0], hm[1]);
        if (d <= from || takenSet[minuteKey(d)]) continue;
        out.push(d);
      }
    }
    return out;
  }

  /** "Today" / "Tomorrow" / "Yesterday" / "Monday 12 October". */
  function dayLabel(date, now) {
    var diff = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return DAY_NAMES[date.getDay()] + ' ' + date.getDate() + ' ' + MONTH_NAMES[date.getMonth()];
  }

  /** Short relative time: "now", "in 3h", "2d ago". */
  function relativeTime(date, now) {
    var s = Math.round((date - now) / 1000);
    var abs = Math.abs(s), v, u;
    if (abs < 45) return 'now';
    if (abs < 3600) { v = Math.round(abs / 60); u = 'm'; }
    else if (abs < 86400) { v = Math.round(abs / 3600); u = 'h'; }
    else { v = Math.round(abs / 86400); u = 'd'; }
    return s > 0 ? 'in ' + v + u : v + u + ' ago';
  }

  /** Weeks of a month for a calendar grid. weekStartsOn: 0 = Sunday, 1 = Monday. */
  function monthMatrix(year, month, weekStartsOn) {
    weekStartsOn = weekStartsOn == null ? 1 : weekStartsOn;
    var first = new Date(year, month, 1);
    var offset = (first.getDay() - weekStartsOn + 7) % 7;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var weeks = Math.ceil((offset + daysInMonth) / 7);
    var out = [];
    for (var w = 0; w < weeks; w++) {
      var row = [];
      for (var d = 0; d < 7; d++) row.push(new Date(year, month, 1 - offset + w * 7 + d));
      out.push(row);
    }
    return out;
  }

  /** Group items by local day of item[field]; returns [{key, date, items}] sorted by date. */
  function groupByDay(items, field) {
    field = field || 'scheduledAt';
    var map = {};
    (items || []).forEach(function (it) {
      if (!it || !it[field]) return;
      var d = new Date(it[field]);
      if (isNaN(d)) return;
      var k = dayKey(d);
      if (!map[k]) map[k] = { key: k, date: startOfDay(d), items: [] };
      map[k].items.push(it);
    });
    return Object.keys(map).sort().map(function (k) {
      map[k].items.sort(function (a, b) { return new Date(a[field]) - new Date(b[field]); });
      return map[k];
    });
  }

  /* ------------------------------------------------------------------ */
  /* Numbers & analytics                                                 */
  /* ------------------------------------------------------------------ */

  function fmtCompact(n) {
    n = Number(n) || 0;
    var sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n < 1000) return sign + String(Math.round(n));
    if (n < 1e6) return sign + trim1(n / 1000) + 'K';
    return sign + trim1(n / 1e6) + 'M';
  }
  function trim1(x) { var s = (Math.round(x * 10) / 10).toFixed(1); return s.slice(-2) === '.0' ? s.slice(0, -2) : s; }

  /** Percentage change, one decimal. null when the previous value is 0. */
  function pctChange(curr, prev) {
    if (!prev) return null;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
  }

  /** Engagement rate in percent (interactions / reach), two decimals. */
  function engagementRate(interactions, reach) {
    if (!reach) return 0;
    return Math.round((interactions / reach) * 10000) / 100;
  }

  function sum(arr) { return (arr || []).reduce(function (a, b) { return a + (Number(b) || 0); }, 0); }

  /** Integer percentages that always add up to `total` (largest remainder method). */
  function largestRemainder(values, total) {
    total = total == null ? 100 : total;
    var s = sum(values);
    if (!s) return values.map(function () { return 0; });
    var raw = values.map(function (v) { return (v / s) * total; });
    var floors = raw.map(Math.floor);
    var left = total - sum(floors);
    var order = raw.map(function (v, i) { return { i: i, r: v - Math.floor(v) }; })
      .sort(function (a, b) { return b.r - a.r || a.i - b.i; });
    for (var k = 0; k < left; k++) floors[order[k % order.length].i] += 1;
    return floors;
  }

  /** Share of positive / neutral / negative in whole percents. */
  function sentimentShare(items) {
    var c = { positive: 0, neutral: 0, negative: 0 };
    (items || []).forEach(function (it) { if (c.hasOwnProperty(it.sentiment)) c[it.sentiment] += 1; });
    var p = largestRemainder([c.positive, c.neutral, c.negative], 100);
    return { positive: p[0], neutral: p[1], negative: p[2], counts: c };
  }

  /** Top n cells of a 7x24 engagement grid: [{day, hour, value}] best first. */
  function bestTimes(grid, n) {
    var cells = [];
    for (var d = 0; d < 7; d++) for (var h = 0; h < 24; h++) cells.push({ day: d, hour: h, value: (grid[d] || [])[h] || 0 });
    cells.sort(function (a, b) { return b.value - a.value || a.day - b.day || a.hour - b.hour; });
    return cells.slice(0, n || 3);
  }

  /** Average a 7x24 grid into blocks of `size` hours: 7 x (24/size). */
  function heatmapBlocks(grid, size) {
    size = size || 3;
    return grid.map(function (row) {
      var out = [];
      for (var b = 0; b < 24; b += size) {
        var s = 0;
        for (var h = b; h < b + size; h++) s += row[h] || 0;
        out.push(s / size);
      }
      return out;
    });
  }

  /** Deterministic PRNG (mulberry32) so demo data is stable across loads and testable. */
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Demo daily series: base level, linear growth, weekly rhythm and noise. Integers >= 0. */
  function demoSeries(days, seed, opts) {
    opts = opts || {};
    var rnd = seeded(seed);
    var base = opts.base || 1000, growth = opts.growth || 0, noise = opts.noise == null ? 0.15 : opts.noise;
    var weekly = opts.weekly == null ? 0.2 : opts.weekly;
    var out = [];
    for (var i = 0; i < days; i++) {
      var level = base * (1 + growth * (i / Math.max(1, days - 1)));
      var wave = 1 + weekly * Math.sin((i / 7) * Math.PI * 2);
      var jitter = 1 + (rnd() * 2 - 1) * noise;
      out.push(Math.max(0, Math.round(level * wave * jitter)));
    }
    return out;
  }

  /** A plausible 7x24 engagement grid with breakfast, lunch and evening peaks. */
  function demoHeatGrid(seed) {
    var rnd = seeded(seed || 7);
    var grid = [];
    for (var d = 0; d < 7; d++) {
      var row = [];
      var weekend = d === 5 || d === 6;
      for (var h = 0; h < 24; h++) {
        var v = 4;
        v += 22 * Math.exp(-Math.pow(h - (weekend ? 10.5 : 8.5), 2) / 3);
        v += 16 * Math.exp(-Math.pow(h - 13, 2) / 2);
        v += 30 * Math.exp(-Math.pow(h - (weekend ? 21 : 20), 2) / 4);
        if (h < 6) v *= 0.25;
        v *= 0.85 + rnd() * 0.3;
        row.push(Math.round(v * 10) / 10);
      }
      grid.push(row);
    }
    return grid;
  }

  /* ------------------------------------------------------------------ */
  /* AI prompt building & response parsing                              */
  /* ------------------------------------------------------------------ */

  var FORMATS = {
    post: 'A single native post per channel.',
    thread: 'A thread: 3 to 6 numbered parts. Put each part on its own paragraph, separated by a blank line. For channels without threads, write one condensed post.',
    carousel: 'Carousel copy: label each slide "Slide 1:", "Slide 2:" (5 to 7 slides, one idea each), then the caption after a blank line.',
    video: 'Short video script: a 2-second hook, 3 to 5 scene lines with on-screen text, then the caption after a blank line.'
  };

  var LANGUAGES = {
    en: 'English.',
    ar: 'Modern Standard Arabic written naturally for a UAE and GCC audience (not a literal translation).',
    both: 'Bilingual: Arabic first, then a blank line, then the English version. Both must fit the character limit together.'
  };

  var LENGTHS = { short: 'Short: as brief as the channel allows.', medium: 'Medium.', long: 'Long: use the room the channel gives, without filler.' };

  function voiceBlock(voice) {
    voice = voice || {};
    var lines = [];
    if (voice.brand) lines.push('Brand: ' + voice.brand);
    if (voice.about) lines.push('About: ' + voice.about);
    if (voice.audience) lines.push('Audience: ' + voice.audience);
    if (voice.tone) lines.push('Voice: ' + voice.tone);
    if (voice.avoid) lines.push('Never use: ' + voice.avoid);
    if (voice.hashtags) lines.push('Brand hashtags to use where they fit: ' + voice.hashtags);
    return lines.join('\n');
  }

  /**
   * Prompt for generating per-channel variants. The model answers with one JSON object per line
   * so the app can show each channel's post as soon as it is written.
   */
  function buildComposePrompt(brief, voice) {
    brief = brief || {};
    var nets = (brief.networks || []).map(getNetwork).filter(Boolean);
    var channelLines = nets.map(function (n) {
      return '- ' + n.id + ' (' + n.name + '): max ' + n.limit + ' characters' + (n.urlWeight ? ' (each link counts as ' + n.urlWeight + ')' : '') + '. ' + n.tip;
    }).join('\n');
    var tone = !brief.tone || brief.tone === 'voice' ? 'Use the brand voice above.' : 'Tone: ' + brief.tone + ', while staying true to the brand.';
    var parts = [
      'You are the writing engine of the Socialistem social media management platform. Write ready-to-publish social posts.',
      '',
      'BRAND',
      voiceBlock(voice) || 'No brand profile given. Write in a clear, warm, professional voice.',
      '',
      'BRIEF',
      'Idea: ' + String(brief.idea || '').trim(),
      'Format: ' + (FORMATS[brief.format] || FORMATS.post),
      tone,
      'Language: ' + (LANGUAGES[brief.lang] || LANGUAGES.en),
      'Length: ' + (LENGTHS[brief.length] || LENGTHS.medium),
      'Hashtags: ' + (brief.hashtags === false ? 'none.' : 'follow each channel\'s guidance below and put them inside the text.'),
      'Call to action: ' + (brief.cta === false ? 'none.' : 'end with one clear, natural call to action.'),
      'Emoji: ' + (brief.emoji === false ? 'none.' : 'a few, only where they add meaning.')
    ];
    if (brief.hasImage) parts.push('An image is attached. Base the post on what is actually in it, and add "altText": a factual one-sentence description for screen readers.');
    if (brief.slot) parts.push('It will be published ' + brief.slot + '.');
    parts.push(
      '',
      'CHANNELS (write one variant for each, native to that channel and within its limit)',
      channelLines,
      '',
      'OUTPUT',
      'Reply with one JSON object per line and nothing else, in the channel order above:',
      '{"network":"<channel id>","text":"<the full post, newlines escaped as \\n>","hashtags":["#tag"]' + (brief.hasImage ? ',"altText":"..."' : '') + '}'
    );
    return parts.join('\n');
  }

  var ENHANCE_ACTIONS = {
    hook: { label: 'Stronger hook', instruction: 'Rewrite only the opening line into a scroll-stopping hook. Keep the rest.' },
    shorten: { label: 'Shorten', instruction: 'Cut the length by about 40% and keep the key message and call to action.' },
    expand: { label: 'Expand', instruction: 'Add one concrete detail or example. Stay within the limit.' },
    professional: { label: 'More professional', instruction: 'Make the tone more polished and professional.' },
    casual: { label: 'More casual', instruction: 'Make the tone warmer and more conversational.' },
    cta: { label: 'Add call to action', instruction: 'End with one clear call to action. Change nothing else.' },
    fix: { label: 'Fix grammar', instruction: 'Fix grammar, spelling and punctuation only. Change nothing else.' },
    to_ar: { label: 'Translate to Arabic', instruction: 'Rewrite it in natural Modern Standard Arabic for a UAE audience. Keep hashtags that are brand names; translate the rest only if a common Arabic hashtag exists.' },
    to_en: { label: 'Translate to English', instruction: 'Rewrite it in natural English. Keep brand hashtags.' }
  };

  function buildEnhancePrompt(action, text, networkId, voice) {
    var a = ENHANCE_ACTIONS[action];
    if (!a) throw new Error('Unknown action: ' + action);
    var n = getNetwork(networkId) || NETWORKS[0];
    return [
      'You edit social media posts for the brand below.',
      voiceBlock(voice),
      '',
      'Channel: ' + n.name + ' (max ' + n.limit + ' characters). ' + n.tip,
      'Task: ' + a.instruction,
      '',
      'POST',
      String(text || ''),
      '',
      'Reply with only the edited post text. No quotes, no notes.'
    ].join('\n');
  }

  function cleanVariant(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var id = String(obj.network || obj.channel || '').toLowerCase().trim();
    if (id === 'twitter') id = 'x';
    if (!getNetwork(id)) return null;
    var text = typeof obj.text === 'string' ? obj.text : (typeof obj.post === 'string' ? obj.post : '');
    var tags = Array.isArray(obj.hashtags) ? obj.hashtags.map(String) : extractHashtags(text);
    return { network: id, text: text.replace(/\r\n/g, '\n').trim(), hashtags: tags, altText: typeof obj.altText === 'string' ? obj.altText : '' };
  }

  /** Parse one streamed line. Returns a clean variant or null. */
  function parseVariantLine(line) {
    line = String(line || '').trim().replace(/,$/, '');
    if (line.charAt(0) !== '{') return null;
    try { return cleanVariant(JSON.parse(line)); } catch (e) { return null; }
  }

  /**
   * Tolerant parse of a whole reply: JSON lines, a JSON array, {"variants": [...]},
   * or any of these inside a Markdown code fence. Later duplicates of a channel win.
   */
  function parseVariants(text) {
    text = String(text || '');
    var fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    if (fence) text = fence[1];
    var byNet = {}, order = [];
    function add(v) { if (!v) return; if (!byNet[v.network]) order.push(v.network); byNet[v.network] = v; }
    text.split('\n').forEach(function (l) { add(parseVariantLine(l)); });
    if (!order.length) {
      var start = text.search(/[\[{]/), end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
      if (start >= 0 && end > start) {
        try {
          var val = JSON.parse(text.slice(start, end + 1));
          var list = Array.isArray(val) ? val : (val && Array.isArray(val.variants) ? val.variants : [val]);
          list.forEach(function (v) { add(cleanVariant(v)); });
        } catch (e) { /* not JSON */ }
      }
    }
    return order.map(function (k) { return byNet[k]; });
  }

  /** Parse the first JSON value in a reply: whole text, a code fence, or first [ or { to the last ] or }. */
  function parseJsonLoose(text) {
    text = String(text || '').trim();
    try { return JSON.parse(text); } catch (e) { /* keep looking */ }
    var fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    if (fence) { try { return JSON.parse(fence[1]); } catch (e) { /* keep looking */ } }
    var start = text.search(/[\[{]/), end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
    if (start >= 0 && end > start) { try { return JSON.parse(text.slice(start, end + 1)); } catch (e) { /* not JSON */ } }
    return null;
  }

  function brandName(voice) { return (voice && voice.brand) || 'the brand'; }

  function buildHashtagPrompt(text, networkId, voice) {
    var n = getNetwork(networkId) || NETWORKS[0];
    return 'Suggest 8 hashtags for this ' + n.name + ' post by ' + brandName(voice) + (voice && voice.about ? ' (' + voice.about + ')' : '') +
      '. Mix broad and niche tags; include local tags (for example UAE or Dubai) only where they fit. Skip tags already in the post.\n\nPOST\n' +
      String(text || '') + '\n\nReply with only a JSON array of 8 strings, each starting with #.';
  }

  /** conv: {kind, network, sentiment, context, name, msgs:[{me, text}]} */
  function buildRepliesPrompt(conv, voice) {
    voice = voice || {};
    var n = getNetwork(conv.network) || NETWORKS[0];
    var convo = (conv.msgs || []).map(function (m) { return (m.me ? 'Us: ' : (conv.name || 'Customer') + ': ') + m.text; }).join('\n');
    return 'You manage the community for ' + brandName(voice) + (voice.about ? ' (' + voice.about + ')' : '') + '.' +
      (voice.tone ? ' Voice: ' + voice.tone + '.' : '') + (voice.avoid ? ' Avoid: ' + voice.avoid + '.' : '') +
      '\nWrite 3 alternative replies to this ' + String(conv.kind || 'message').toLowerCase() + ' on ' + n.name + '. Detected sentiment: ' + (conv.sentiment || 'unknown') + '.' +
      (conv.context ? ' Context: ' + conv.context : '') +
      '\n\nCONVERSATION\n' + convo +
      '\n\nRules: each under 60 words, human and specific to what they said. For complaints: acknowledge, take ownership, offer one concrete next step, and move to private messages if personal details are needed. For leads: answer what you can and ask the one question needed to quote. Reply in the language the customer used.' +
      '\nReply with only a JSON array of 3 objects: {"label": "2 to 4 word approach", "text": "the reply"}.';
  }

  /** opts: {pillars, existing: [titles], date: Date} */
  function buildIdeasPrompt(opts, voice) {
    voice = voice || {};
    var d = opts.date || new Date();
    return 'Generate 6 social media content ideas for ' + brandName(voice) + (voice.about ? ': ' + voice.about : '.') +
      (voice.audience ? ' Audience: ' + voice.audience : '') +
      '\nContent pillars: ' + (opts.pillars || 'Education, Community, Product, Behind the scenes') + '. Spread the ideas across the pillars and mix formats.' +
      '\nToday is ' + DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear() + '; use upcoming seasonal and local moments where they fit.' +
      ((opts.existing || []).length ? '\nAvoid repeating these existing ideas: ' + opts.existing.join('; ') + '.' : '') +
      '\nReply with only a JSON array of 6 objects: {"title": "at most 8 words", "note": "one-sentence angle", "pillar": "one of the pillars", "format": "post|carousel|video|thread"}.';
  }

  var BRIEF_ASKS = {
    analytics: 'Write a performance brief for the owner. First 3 bullets: what happened, each with one number in **bold**. Then 3 bullets: specific actions for next week (what to post, on which channel, at what time).',
    listening: 'Write a listening brief. 3 bullets on the main themes in the conversation (with **bold** key phrases), 1 bullet on the biggest risk and how to respond, 2 bullets on content opportunities from the trends and competitor gaps.'
  };

  function buildBriefPrompt(kind, data, voice) {
    if (!BRIEF_ASKS[kind]) throw new Error('Unknown brief: ' + kind);
    return 'You are the analyst inside a social media platform, working for ' + brandName(voice) + '. ' + BRIEF_ASKS[kind] +
      ' Under 170 words. Bullets only, starting with "- ". No preamble, no headings.\n\nDATA\n' + JSON.stringify(data);
  }

  function buildChatSystem(summary, voice, appName, canSaveDrafts) {
    return 'You are the AI teammate inside the ' + (appName || 'Socialistem') + ' social media management platform, working for the team behind ' + brandName(voice) +
      '. Answer from the workspace data below and be concrete: name channels, days, times and numbers. Keep answers under 220 words unless asked for more, and use short bullets where they help. Write posts in the brand voice and within each channel\'s limits.' +
      (canSaveDrafts ? ' When the user asks you to draft or write posts, call save_draft once per post so it lands in Drafts, then tell the user which drafts you saved.' : '') +
      '\n\nWORKSPACE DATA\n' + JSON.stringify(summary || {});
  }

  var SAVE_DRAFT_TOOL = {
    name: 'save_draft',
    description: 'Save one social media post as a draft in the workspace for the team to review and schedule. Returns {"saved": true, "id": "..."}.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The full ready-to-publish post text' },
        networks: { type: 'array', items: { type: 'string', enum: NETWORKS.map(function (n) { return n.id; }) }, description: 'Channel ids for this post' }
      },
      required: ['text', 'networks']
    }
  };

  /** Validate save_draft input; returns {text, networks} or throws. */
  function cleanDraftInput(input) {
    input = input || {};
    var ids = (Array.isArray(input.networks) ? input.networks : []).map(String).filter(function (id) { return getNetwork(id); });
    var text = String(input.text || '').trim();
    if (!ids.length) throw new Error('Give at least one valid channel id.');
    if (!text) throw new Error('The post text is empty.');
    return { text: text.slice(0, 63206), networks: ids };
  }

  return {
    parseJsonLoose: parseJsonLoose, buildHashtagPrompt: buildHashtagPrompt, buildRepliesPrompt: buildRepliesPrompt,
    buildIdeasPrompt: buildIdeasPrompt, buildBriefPrompt: buildBriefPrompt, buildChatSystem: buildChatSystem,
    SAVE_DRAFT_TOOL: SAVE_DRAFT_TOOL, cleanDraftInput: cleanDraftInput,
    NETWORKS: NETWORKS, getNetwork: getNetwork,
    charCount: charCount, extractHashtags: extractHashtags, validatePost: validatePost, hasBlockingIssue: hasBlockingIssue,
    DAY_NAMES: DAY_NAMES, DAY_SHORT: DAY_SHORT, MONTH_NAMES: MONTH_NAMES, MONTH_SHORT: MONTH_SHORT,
    pad2: pad2, dayKey: dayKey, minuteKey: minuteKey, fmtTime: fmtTime, startOfDay: startOfDay, addDays: addDays,
    parseHM: parseHM, normalizeTimes: normalizeTimes, slotsBetween: slotsBetween, nextSlots: nextSlots,
    dayLabel: dayLabel, relativeTime: relativeTime, monthMatrix: monthMatrix, groupByDay: groupByDay,
    fmtCompact: fmtCompact, fmtInt: fmtInt, pctChange: pctChange, engagementRate: engagementRate, sum: sum,
    largestRemainder: largestRemainder, sentimentShare: sentimentShare, bestTimes: bestTimes, heatmapBlocks: heatmapBlocks,
    seeded: seeded, demoSeries: demoSeries, demoHeatGrid: demoHeatGrid,
    FORMATS: FORMATS, LANGUAGES: LANGUAGES, ENHANCE_ACTIONS: ENHANCE_ACTIONS,
    buildComposePrompt: buildComposePrompt, buildEnhancePrompt: buildEnhancePrompt,
    parseVariantLine: parseVariantLine, parseVariants: parseVariants
  };
});
