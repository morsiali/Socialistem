/* Socialistem: AI social media management. Vanilla JS; pure logic lives in core.js (window.SocialistemCore).
   Two modes: "server" (socialistem.com, data and AI through the Node API) and "artifact" (preview inside Claude). */
(() => {
'use strict';
const C = window.SocialistemCore;
const APP_EL = document.getElementById('app');
const SERVER = !!(APP_EL && APP_EL.dataset.mode === 'server');
const APP_NAME = 'Socialistem';

/* ================================================================== */
/* Icons & tiny helpers                                                */
/* ================================================================== */
const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  queue: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  calendar: 'M3 5h18v16H3zM3 9.5h18M8 3v4M16 3v4',
  check: 'M8.5 12.5l2.5 2.5 5-5.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
  inbox: 'M3 13h5l1.5 3h5l1.5-3h5M5.5 5h13L21 13v6H3v-6z',
  chart: 'M4 20V11M10 20V5M16 20v-6M2 20h20',
  radar: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  settings: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M15 5v4M9 10v4M17 15v4',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  stop: 'M7 7h10v10H7z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  hash: 'M5 9h14M5 15h14M10 4L8 20M16 4l-2 16',
  bolt: 'M13 3L4 14h7l-1 7 9-11h-7z',
  info: 'M12 16v-5M12 8h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  done: 'M5 12.5l4.5 4.5L19 7.5'
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
const uid = p => (p || 'p') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const net = (id, lg) => { const n = C.getNetwork(id); return n ? `<span class="net net-${id}${lg ? ' lg' : ''}" title="${esc(n.name)}">${esc(n.short)}</span>` : ''; };
const nets = ids => (ids || []).map(id => net(id)).join('');
const fmtWhen = d => `${C.DAY_SHORT[d.getDay()]} ${d.getDate()} ${C.MONTH_SHORT[d.getMonth()]}, ${C.fmtTime(d)}`;
const fmtDate = d => `${d.getDate()} ${C.MONTH_SHORT[d.getMonth()]}`;
const toLocalInput = d => `${d.getFullYear()}-${C.pad2(d.getMonth() + 1)}-${C.pad2(d.getDate())}T${C.fmtTime(d)}`;
const minsAgo = m => new Date(Date.now() - m * 60000);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const firstText = p => (p.variants && (p.variants[p.networks[0]] || Object.values(p.variants).find(Boolean))) || p.idea || '';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };

/** Escape, then colour hashtags (lookbehind skips entities like &#39;). */
function richText(t) {
  return esc(t).replace(/(?<![&\p{L}\p{N}_#])#[\p{L}\p{N}_]+/gu, m => `<span class="tag">${m}</span>`);
}
/** Small, safe Markdown subset for AI answers: paragraphs, bullets, numbered lists, **bold**. */
function md(t) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^#{1,4}\s*(.+)$/, '<strong>$1</strong>');
  let out = '', list = null;
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  String(t || '').replace(/\r/g, '').split('\n').forEach(raw => {
    const l = raw.trimEnd();
    let m;
    if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else if (!l.trim()) close();
    else { close(); out += `<p>${inline(l)}</p>`; }
  });
  close();
  return out;
}

/* ================================================================== */
/* Demo workspace                                                      */
/* ================================================================== */
const DEFAULT_SCHEDULE = [
  ['09:00', '18:30'], ['09:00', '13:00', '18:30'], ['09:00', '13:00', '18:30'], ['09:00', '13:00', '18:30'],
  ['09:00', '13:00', '18:30'], ['10:00', '16:00'], ['11:00', '19:00']
];
const DEMO_VOICE = {
  brand: 'Marsa Coffee',
  about: 'Specialty coffee roastery and café in Dubai Marina. Direct-trade single origins, Emirati hospitality, signatures sweetened with local dates.',
  audience: 'Dubai residents aged 22 to 40: remote workers, coffee enthusiasts and the weekend brunch crowd.',
  tone: 'Warm, witty and knowledgeable, never snobby. Short sentences. Proudly local.',
  avoid: 'cheap, best in the world, guys, synergy',
  hashtags: '#MarsaCoffee #DubaiCoffee',
  lang: 'en'
};
const DEFAULT_VOICE = SERVER ? { brand: '', about: '', audience: '', tone: 'Clear, warm and confident. Short sentences.', avoid: '', hashtags: '', lang: 'en' } : DEMO_VOICE;
const DEFAULT_CONNECTED = SERVER
  ? { instagram: true, facebook: true, linkedin: true, x: true, tiktok: false, threads: false, youtube: false, pinterest: false }
  : { instagram: true, facebook: true, linkedin: true, x: true, tiktok: true, threads: true, youtube: false, pinterest: false };
const DEMO_HANDLES = { instagram: '@marsa.coffee', facebook: 'Marsa Coffee', linkedin: 'Marsa Coffee Roasters', x: '@marsacoffee', tiktok: '@marsa.coffee', threads: '@marsa.coffee', youtube: 'Marsa Coffee', pinterest: 'marsacoffee' };
function handleFor(id) {
  if (!SERVER) return DEMO_HANDLES[id] || '';
  const slug = String(S.ws.voice.brand || (S.me && S.me.name) || 'yourbrand').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'yourbrand';
  return ['facebook', 'linkedin', 'youtube'].includes(id) ? (S.ws.voice.brand || 'Your brand') : '@' + slug;
}
const TEAM = [
  { name: 'You', role: 'Owner · approves posts', initials: 'Y' },
  { name: 'Layla Haddad', role: 'Community manager · writes and replies', initials: 'LH' },
  { name: 'Omar Saeed', role: 'Café operations · handles bookings', initials: 'OS' }
];

function buildSamplePosts() {
  const t = new Date();
  const sl = C.nextSlots(S.ws.schedule, [], t, 8);
  const iso = d => (d ? d.toISOString() : null);
  const ago = (days, h, m) => { const d = C.addDays(C.startOfDay(t), -days); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const mk = (id, ids, text, o = {}) => ({
    id: 's-' + id, sample: true, networks: ids,
    variants: Object.fromEntries(ids.map(n => [n, typeof text === 'string' ? text : (text[n] || text.all)])),
    media: o.media || [], status: o.status || 'scheduled', scheduledAt: o.at || null, sentAt: o.sentAt || null,
    createdAt: ago(3, 10, 0), author: o.author || 'You', stats: o.stats || null, idea: '', format: 'post'
  });
  return [
    mk('p1', ['instagram', 'facebook', 'threads'], {
      instagram: 'Cold brew season never really ends in Dubai. ☀️\n\nOur new date-syrup cold brew steeps for 18 hours, is sweetened only with Khalas dates and poured over slow-melting ice.\n\nDairy-free, refined-sugar-free and very much worth the walk along the Marina.\n\nAt both bars from today.\n\n#MarsaCoffee #DubaiCoffee #ColdBrew #SpecialtyCoffee #DubaiMarina',
      facebook: 'New on the menu: date-syrup cold brew. ☀️ 18-hour steep, sweetened only with Khalas dates, dairy-free. What would you pair it with: pistachio croissant or saffron cake?',
      threads: 'We sweetened cold brew with Khalas dates and nothing else. 18-hour steep, zero refined sugar. Notes of caramel, cacao and a little bit of home. Trying it this week?'
    }, { at: iso(sl[0]), media: [{ swatch: 'brew' }] }),
    mk('p2', ['linkedin'], 'We roast about 120 kg of coffee a week in Dubai Marina.\n\nTwo years ago we started buying directly from three farms in Ethiopia\'s Guji zone. What changed:\n\n• We agree the price before harvest, well above the commodity rate\n• Our cupping scores rose by 3 points on average\n• Our baristas can tell guests the farmer\'s name\n\nDirect trade is slower and costs more. It is also the only way we have found to serve coffee we fully stand behind.\n\nRunning a café in the UAE and want to compare notes on sourcing? My inbox is open.\n\n#SpecialtyCoffee #DirectTrade #DubaiBusiness', { at: iso(sl[1]) }),
    mk('p3', ['x'], 'Friday brunch take: a cortado pairs better with saffron French toast than a latte does. We will not be taking questions. ☕', { at: iso(sl[2]) }),
    mk('p4', ['tiktok', 'instagram'], { all: 'POV: it\'s 6 am in the roastery and 4 kg of Colombian Huila hits first crack. Sound on. 🔥\n\nRoast date on every bag, always under 14 days old.\n\n#coffeetok #roastery #DubaiCoffee #specialtycoffee' }, { at: iso(sl[3]), media: [{ swatch: 'beans' }] }),
    mk('p5', ['instagram', 'facebook'], { all: 'قهوة الصباح على الواجهة البحرية ☕🌊\nاستمتعوا بقهوتنا المختصة مع إطلالة مرسى دبي، كل يوم من السابعة صباحاً.\n\n#قهوة_مختصة #دبي #مرسى_دبي #MarsaCoffee' }, { at: iso(sl[4]), media: [{ swatch: 'sea' }] }),
    mk('p6', ['linkedin', 'x'], {
      linkedin: 'We\'re hiring a head barista for our Marina flagship.\n\nYou\'ll lead a team of six, run our weekly cupping sessions and help shape a seasonal menu built around Gulf ingredients.\n\nSCA certification is a plus. Curiosity is a must.\n\nApply through the link in our profile or message me directly.\n\n#Hiring #Barista #DubaiJobs',
      x: 'We\'re hiring a head barista for our Marina flagship. Lead a team of six, run weekly cuppings, shape a menu built on Gulf ingredients. DMs open. #DubaiJobs'
    }, { at: iso(sl[5]), media: [{ swatch: 'team' }] }),
    mk('a1', ['instagram', 'tiktok'], { all: 'National Day is coming. 🇦🇪 Something with dates, cardamom and a lot of pride is brewing at Marsa. First sip on 2 December.\n\n#UAENationalDay #MarsaCoffee #DubaiCoffee' }, { status: 'approval', at: iso(sl[6]), author: 'Layla Haddad', media: [{ swatch: 'dates' }] }),
    mk('d1', ['instagram'], 'Latte art fails, a compilation. Swipe to see why we practise every morning before opening. 😅', { status: 'draft', media: [{ swatch: 'latte' }] }),
    mk('d2', ['linkedin', 'facebook'], 'Three things we learned running a café in a tower full of remote workers…', { status: 'draft' }),
    mk('x1', ['instagram', 'facebook'], { all: 'Saturday mornings look like this. ☕🌊 Doors open at 7 am.\n\n#MarsaCoffee #DubaiMarina' }, { status: 'sent', at: ago(1, 9, 0), sentAt: ago(1, 9, 0), media: [{ swatch: 'sea' }], stats: { reach: 6820, interactions: 412, clicks: 38 } }),
    mk('x2', ['tiktok'], 'How we dial in espresso every morning, in 30 seconds. #coffeetok #barista', { status: 'sent', at: ago(2, 18, 30), sentAt: ago(2, 18, 30), media: [{ swatch: 'beans' }], stats: { reach: 14250, interactions: 1180, clicks: 64 } }),
    mk('x3', ['linkedin'], 'What a single-origin menu taught us about pricing transparency.', { status: 'sent', at: ago(3, 9, 0), sentAt: ago(3, 9, 0), stats: { reach: 3910, interactions: 162, clicks: 71 } }),
    mk('x4', ['x', 'threads'], 'Hot take: oat milk is fine. Pistachio milk is better.', { status: 'sent', at: ago(4, 13, 0), sentAt: ago(4, 13, 0), stats: { reach: 2280, interactions: 96, clicks: 5 } })
  ];
}
const SAMPLE_IDEAS = [
  { id: 's-i1', sample: true, col: 'ideas', title: 'Meet the farmer: Guji, Ethiopia', note: 'Carousel with the farm\'s story and how we agree the price before harvest.', pillar: 'Sourcing', format: 'carousel' },
  { id: 's-i2', sample: true, col: 'ideas', title: 'Arabic coffee vs specialty coffee', note: 'Gahwa roast levels next to our filter menu. Curious and respectful.', pillar: 'Education', format: 'thread' },
  { id: 's-i3', sample: true, col: 'drafting', title: 'Customer of the week: the 6 am regulars', note: 'Short interview and three photos.', pillar: 'Community', format: 'post' },
  { id: 's-i4', sample: true, col: 'ready', title: 'Brew a V60 at home in 4 steps', note: '15 g coffee, 250 g water, 3 minutes. Vertical video.', pillar: 'Education', format: 'video' },
  { id: 's-i5', sample: true, col: 'ready', title: 'Weekend brunch pairing guide', note: 'Cortado with saffron French toast, flat white with pistachio croissant.', pillar: 'Menu', format: 'carousel' }
];
const SAMPLE_INBOX = [
  { id: 'c1', net: 'instagram', kind: 'Comment', name: 'Noura A.', handle: '@noura.eats', sentiment: 'neutral', status: 'open', assignee: 'Layla Haddad', context: 'On "Cold brew season never really ends in Dubai…"', msgs: [{ text: 'Is the date cold brew available unsweetened too? Want to try both side by side 😍', ago: 12 }] },
  { id: 'c2', net: 'facebook', kind: 'Review', name: 'Rashid M.', handle: '2 stars', sentiment: 'negative', status: 'open', assignee: '', msgs: [{ text: 'Waited 25 minutes for two flat whites on Friday. Coffee was excellent but service was slow and nobody told us about the wait.', ago: 95 }] },
  { id: 'c3', net: 'x', kind: 'Mention', name: 'Priya K.', handle: '@priyak', sentiment: 'positive', status: 'open', assignee: '', msgs: [{ text: '@marsacoffee best cortado in the Marina, no contest. The new barista really knows what she is doing.', ago: 140 }] },
  { id: 'c4', net: 'instagram', kind: 'Message', name: 'Hessa Events', handle: '@hessa.events', sentiment: 'neutral', status: 'open', assignee: '', tag: 'Sales lead', msgs: [{ text: 'Hi! Do you do coffee catering for 40 people at an office in JLT next Thursday morning? We would need oat milk options too.', ago: 210 }] },
  { id: 'c5', net: 'linkedin', kind: 'Comment', name: 'Daniel Ortiz', handle: 'Head of Ops, Bloom Hospitality', sentiment: 'positive', status: 'open', assignee: '', context: 'On "We roast about 120 kg of coffee a week…"', msgs: [{ text: 'Great insight on direct trade. Would love to visit the roastery and swap notes.', ago: 420 }] },
  { id: 'c6', net: 'tiktok', kind: 'Comment', name: 'brewnerd', handle: '@brewnerd', sentiment: 'neutral', status: 'open', assignee: '', msgs: [{ text: 'what grinder is that?? 👀', ago: 600 }] },
  { id: 'c7', net: 'facebook', kind: 'Message', name: 'Aisha R.', handle: 'Facebook Messenger', sentiment: 'positive', status: 'done', assignee: 'Omar Saeed', msgs: [{ text: 'Can I book the upstairs space for a birthday on the 24th?', ago: 1500 }, { me: true, text: 'Happy to host! The upstairs space seats 20. I have sent the booking form to your inbox.', ago: 1440 }] }
];
const LISTEN = {
  mentions: [
    { net: 'instagram', who: '@laila.loves.latte', text: 'Marsa\'s date cold brew is the only thing getting me through October.', sentiment: 'positive', ago: 35 },
    { net: 'x', who: '@dxbfoodie', text: 'Is it just me or are specialty coffee prices in Dubai getting out of hand? 32 AED for a pour-over.', sentiment: 'negative', ago: 80 },
    { net: 'tiktok', who: '@cafehopper.ae', text: 'Ranking 5 Marina cafés for remote work: Marsa wins on wifi and sockets, loses on noise.', sentiment: 'neutral', ago: 190 },
    { net: 'facebook', who: 'Dubai Coffee Lovers (group)', text: 'Anyone tried the Guji natural at Marsa? Worth it?', sentiment: 'neutral', ago: 300 },
    { net: 'linkedin', who: 'Sara Al Mansoori', text: 'Loved the cupping session at Marsa Coffee yesterday. A great example of transparent sourcing in the UAE.', sentiment: 'positive', ago: 520 },
    { net: 'instagram', who: '@morningrun.dxb', text: 'Post-run flat white at Marsa, as is tradition. 🏃‍♀️☕', sentiment: 'positive', ago: 700 },
    { net: 'x', who: '@ahmedtweets', text: 'Ordered delivery from Marsa and the coffee arrived lukewarm. Not great.', sentiment: 'negative', ago: 900 },
    { net: 'threads', who: '@nightowl.ae', text: 'Which Dubai cafés stay open past midnight? Marsa closes way too early.', sentiment: 'neutral', ago: 1100 }
  ],
  trends: [
    { topic: 'Iced Spanish latte', change: 148, volume: 12400, note: 'UAE, last 7 days' },
    { topic: 'Coffee festival season', change: 96, volume: 8100, note: 'Events and pop-ups' },
    { topic: 'Date-based desserts', change: 61, volume: 5300, note: 'Food creators, GCC' },
    { topic: 'Work-from-café etiquette', change: 38, volume: 3900, note: 'Remote workers' },
    { topic: 'Pistachio everything', change: -12, volume: 21000, note: 'Cooling after a summer peak' }
  ],
  competitors: [
    { name: 'Marsa Coffee', you: true, followers: 18400, ppw: 6, er: 4.1, mentions: 310 },
    { name: 'Dune Roasters', followers: 26900, ppw: 9, er: 2.6, mentions: 420 },
    { name: 'Kahwa House', followers: 12100, ppw: 4, er: 3.3, mentions: 190 },
    { name: 'Third Wave Bay', followers: 9800, ppw: 11, er: 1.9, mentions: 150 }
  ],
  volume: C.demoSeries(30, 11, { base: 38, growth: 0.3, noise: 0.3 })
};
const AN = (() => {
  const N = 180;
  const reach = C.demoSeries(N, 101, { base: 3400, growth: 0.45, weekly: 0.18, noise: 0.18 });
  const rate = C.demoSeries(N, 202, { base: 400, growth: 0.1, weekly: 0.1, noise: 0.12 }).map(v => v / 10000);
  return {
    N, reach,
    interactions: reach.map((r, i) => Math.round(r * rate[i])),
    followers: C.demoSeries(N, 303, { base: 32, growth: 0.6, weekly: 0.25, noise: 0.35 }),
    clicks: C.demoSeries(N, 404, { base: 110, growth: 0.3, weekly: 0.2, noise: 0.25 }),
    shares: { instagram: 0.39, tiktok: 0.24, facebook: 0.14, linkedin: 0.11, x: 0.08, threads: 0.04 },
    heat: C.demoHeatGrid(7)
  };
})();
function rangeStats(days) {
  const a = AN.N - days, b = AN.N - 2 * days;
  const cur = k => AN[k].slice(a), prv = k => AN[k].slice(b, a);
  const r = { days };
  ['reach', 'interactions', 'followers', 'clicks'].forEach(k => { r[k] = C.sum(cur(k)); r[k + 'P'] = C.sum(prv(k)); r[k + 'S'] = cur(k); r[k + 'PS'] = prv(k); });
  r.er = C.engagementRate(r.interactions, r.reach);
  r.erP = C.engagementRate(r.interactionsP, r.reachP);
  return r;
}
const seriesDate = (i, len) => C.addDays(C.startOfDay(new Date()), -(len - 1 - i));

/* ================================================================== */
/* State                                                               */
/* ================================================================== */
const S = {
  route: 'home',
  ws: { voice: { ...DEFAULT_VOICE }, schedule: DEFAULT_SCHEDULE.map(a => a.slice()), connected: { ...DEFAULT_CONNECTED }, requireApproval: false, hidden: [], hideSamples: SERVER, keywords: SERVER ? [] : ['Marsa Coffee', '#DubaiCoffee', 'specialty coffee Dubai'] },
  me: null, usage: null, announcement: '', acct: { msg: '', err: '' },
  posts: [], ideas: [], samplePosts: [],
  filter: 'all', queueTab: 'queue', confirm: null,
  cal: (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })(),
  range: 30,
  inbox: SAMPLE_INBOX.map(c => ({ ...c, msgs: c.msgs.map(m => ({ ...m, at: minsAgo(m.ago) })) })),
  convId: 'c1', inboxFilter: 'open', inboxDetail: false, replies: {}, replyBusy: false, replyErr: '', draftReply: {},
  aiOut: {}, aiBusy: {}, ideaBusy: false, ideaErr: '', pillars: 'Sourcing, Education, Community, Menu',
  chat: [], chatBusy: false, chatCtl: null, chatErr: '',
  cmp: null, menuOpen: false, dirty: false
};
S.samplePosts = buildSamplePosts();

const connectedNets = () => C.NETWORKS.map(n => n.id).filter(id => S.ws.connected[id]);
const defaultNets = () => { const c = connectedNets(); const pick = ['instagram', 'linkedin', 'x'].filter(n => c.includes(n)); return pick.length ? pick : c.slice(0, 1); };
const visibleSamples = list => (S.ws.hideSamples ? [] : list.filter(p => !S.ws.hidden.includes(p.id)));
const allPosts = () => [...S.posts, ...visibleSamples(S.samplePosts)];
const allIdeas = () => [...S.ideas, ...visibleSamples(SAMPLE_IDEAS)];
/** Scheduled posts whose time has passed count as published (the demo scheduler). */
const effStatus = p => (p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) <= new Date() ? 'sent' : p.status);
const byFilter = p => S.filter === 'all' || p.networks.includes(S.filter);
function nextFree(excludeId) {
  const taken = allPosts().filter(p => p.id !== excludeId && ['scheduled', 'approval'].includes(effStatus(p)) && p.scheduledAt).map(p => p.scheduledAt);
  return C.nextSlots(S.ws.schedule, taken, new Date(), 1)[0] || C.addDays(new Date(), 1);
}

/* ================================================================== */
/* Persistence: the Node API on socialistem.com; the db capability in the Claude preview */
/* ================================================================== */
async function api(method, path, body, signal) {
  let res;
  try {
    res = await fetch(path, {
      method, credentials: 'same-origin', signal,
      headers: { 'x-socialistem': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw { code: 'cancelled' };
    throw { code: 'offline', message: 'You appear to be offline. Check your connection and try again.' };
  }
  if (res.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); throw { code: 'unauthorized', message: 'Please log in again.' }; }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw (data && data.code ? data : { code: 'server_error', message: 'The server could not complete that request.' });
  return data;
}

const Store = {
  mode: 'pending', wsBusy: false, wsAgain: false, wsTimer: null, wsPending: false, wsLoaded: false,
  get saved() { return this.mode === 'db' || this.mode === 'server'; },
  async init() {
    if (SERVER) return this.initServer();
    const cl = window.claude;
    if (!cl || typeof cl.use !== 'function') return this.memory();
    let db = null, user = null, id = null;
    try { [db, user] = await Promise.all([cl.use('db'), cl.use('user')]); } catch (e) { /* unavailable */ }
    try { id = user ? await user.id() : null; } catch (e) { id = null; }
    if (!db || !id) return this.memory();
    try {
      this.ws = db.doc('data/users/' + id + '/workspace');
      this.postsRef = this.ws.collection('posts');
      this.ideasRef = this.ws.collection('ideas');
    } catch (e) { return this.memory(); }
    this.mode = 'db';
    this.ws.onSnapshot(snap => {
      if (this.wsPending || (snap.metadata && snap.metadata.hasPendingWrites)) return;
      if (snap.exists) { mergeWs(snap.data()); if (!this.wsLoaded) S.samplePosts = buildSamplePosts(); }
      this.wsLoaded = true; scheduleRender();
    }, e => this.fail(e));
    this.postsRef.onSnapshot(snap => { S.posts = snap.docs.map(d => ({ ...d.data(), id: d.id })); scheduleRender(); }, e => this.fail(e));
    this.ideasRef.onSnapshot(snap => { S.ideas = snap.docs.map(d => ({ ...d.data(), id: d.id })); scheduleRender(); }, e => this.fail(e));
    scheduleRender();
  },
  async initServer() {
    try {
      const d = await api('GET', '/api/workspace');
      S.me = d.user; S.usage = d.usage; S.announcement = d.announcement || '';
      mergeWs(d.workspace);
      S.posts = d.posts || []; S.ideas = d.ideas || [];
      S.samplePosts = buildSamplePosts();
      this.mode = 'server';
    } catch (e) {
      if (e && e.code === 'unauthorized') return;
      this.mode = 'memory';
      toast((e && e.message) || 'Could not load your workspace. Reload the page to try again.');
    }
    scheduleRender();
  },
  memory() { this.mode = 'memory'; scheduleRender(); },
  fail(e) { console.warn('Store:', e && e.code, e && e.message); if (e && ['revoked', 'not_granted', 'capability_disabled', 'capability_removed', 'invalid_argument'].includes(e.code)) { this.mode = 'memory'; scheduleRender(); } },
  writeFail(e) {
    if (e && e.code === 'unauthorized') return;
    if (e && (e.code === 'quota_exceeded' || e.code === 'limit')) toast((e.message && SERVER) ? e.message : 'Your workspace is full. Delete some posts or ideas to save new ones.');
    else if (e && e.code === 'invalid_argument' && !SERVER) { this.mode = 'memory'; toast('This view can\'t save changes, so they will last until you reload.'); }
    else toast((SERVER && e && e.message) || 'Saving failed. Your change is visible here but may not be stored.');
    scheduleRender();
  },
  clean(o) { const c = JSON.parse(JSON.stringify(o)); delete c.id; return c; },
  async putPost(p) {
    p.updatedAt = new Date().toISOString();
    S.posts = [...S.posts.filter(x => x.id !== p.id), p];
    try {
      if (this.mode === 'db') await this.postsRef.doc(p.id).set(this.clean(p));
      else if (this.mode === 'server') await api('PUT', '/api/posts/' + encodeURIComponent(p.id), { post: p });
    } catch (e) { this.writeFail(e); }
  },
  async delPost(id) {
    S.posts = S.posts.filter(x => x.id !== id);
    try {
      if (this.mode === 'db') await this.postsRef.doc(id).delete();
      else if (this.mode === 'server') await api('DELETE', '/api/posts/' + encodeURIComponent(id));
    } catch (e) { this.writeFail(e); }
  },
  async putIdea(i) {
    S.ideas = [...S.ideas.filter(x => x.id !== i.id), i];
    try {
      if (this.mode === 'db') await this.ideasRef.doc(i.id).set(this.clean(i));
      else if (this.mode === 'server') await api('PUT', '/api/ideas/' + encodeURIComponent(i.id), { idea: i });
    } catch (e) { this.writeFail(e); }
  },
  async delIdea(id) {
    S.ideas = S.ideas.filter(x => x.id !== id);
    try {
      if (this.mode === 'db') await this.ideasRef.doc(id).delete();
      else if (this.mode === 'server') await api('DELETE', '/api/ideas/' + encodeURIComponent(id));
    } catch (e) { this.writeFail(e); }
  },
  saveWs() { this.wsPending = true; clearTimeout(this.wsTimer); this.wsTimer = setTimeout(() => this.flushWs(), 450); },
  async flushWs() {
    if (!this.saved) { this.wsPending = false; return; }
    if (this.wsBusy) { this.wsAgain = true; return; }
    this.wsBusy = true;
    try {
      const body = JSON.parse(JSON.stringify(S.ws));
      if (this.mode === 'db') await this.ws.set(body);
      else await api('PUT', '/api/workspace', { workspace: body });
    } catch (e) { this.writeFail(e); }
    finally { this.wsBusy = false; if (this.wsAgain) { this.wsAgain = false; this.flushWs(); } else this.wsPending = false; }
  }
};
function mergeWs(d) {
  if (!d || typeof d !== 'object') return;
  const w = S.ws;
  if (d.voice && typeof d.voice === 'object') w.voice = { ...DEFAULT_VOICE, ...d.voice };
  if (Array.isArray(d.schedule) && d.schedule.length === 7) w.schedule = d.schedule.map(a => C.normalizeTimes(Array.isArray(a) ? a : []));
  if (d.connected && typeof d.connected === 'object') w.connected = { ...DEFAULT_CONNECTED, ...d.connected };
  if (Array.isArray(d.hidden)) w.hidden = d.hidden.map(String);
  if (Array.isArray(d.keywords)) w.keywords = d.keywords.map(String).slice(0, 12);
  w.requireApproval = !!d.requireApproval;
  w.hideSamples = !!d.hideSamples;
}
function hideSample(id) { if (!S.ws.hidden.includes(id)) { S.ws.hidden.push(id); Store.saveWs(); } }

/* ================================================================== */
/* AI engine (sample capability)                                       */
/* ================================================================== */
const AI = {
  state: 'pending', fn: null, images: false, tools: false,
  async init() {
    if (SERVER) {
      const u = S.usage || {};
      this.images = true; this.tools = true;
      this.state = u.aiEnabled && u.aiConfigured ? 'ready' : 'off';
      return scheduleRender();
    }
    const cl = window.claude;
    if (!cl || typeof cl.use !== 'function') { this.state = 'off'; return scheduleRender(); }
    let s = null;
    try { s = await cl.use('sample'); } catch (e) { s = null; }
    if (!s) { this.state = 'off'; return scheduleRender(); }
    this.fn = s; this.state = 'ready';
    try { const lim = await s.limits(); this.images = !!(lim && lim.images); this.tools = !!(lim && lim.tools); } catch (e) { /* limits unknown */ }
    scheduleRender(); if (S.cmp) renderComposer();
  },
  get ready() { return this.state === 'ready'; },
  call(input, opts) { return this.fn(input, opts || {}); },
  json(input, opts) { return this.fn.json(input, opts || {}); },
  handle(e) {
    if (e && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'not_configured', 'ai_disabled'].includes(e.code)) { this.state = 'off'; if (SERVER && S.usage) { if (e.code === 'ai_disabled') S.usage.aiEnabled = false; else S.usage.aiConfigured = false; } scheduleRender(); }
    return aiMessage(e);
  }
};

/** Reads the server's NDJSON stream: {"t":"d","v":...} chunks, then {"t":"end"} or {"t":"err"}. */
async function aiStream(path, body, { onText, signal } = {}) {
  let res;
  try {
    res = await fetch(path, { method: 'POST', credentials: 'same-origin', signal, headers: { 'content-type': 'application/json', 'x-socialistem': '1' }, body: JSON.stringify(body) });
  } catch (e) { throw { code: e && e.name === 'AbortError' ? 'cancelled' : 'offline', message: 'You appear to be offline. Check your connection and try again.' }; }
  if (res.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); throw { code: 'unauthorized' }; }
  if (!res.ok) { let d = null; try { d = await res.json(); } catch (e) { d = null; } throw (d && d.code ? d : { code: 'upstream_error' }); }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', truncated = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.t === 'd') { text += ev.v; if (onText) onText({ text, delta: ev.v }); }
        else if (ev.t === 'end') truncated = !!ev.truncated;
        else if (ev.t === 'err') throw { code: ev.code, message: ev.message, text };
      }
    }
  } catch (e) {
    if (e && e.code) throw e;
    throw { code: signal && signal.aborted ? 'cancelled' : 'upstream_error', text };
  }
  return { text, truncated };
}
function noteUsage() { if (S.usage) { S.usage.today += 1; S.usage.month += 1; } }

/** One interface for every AI feature. On the server the prompts are built server-side from this structured input. */
const AIX = {
  async generate(brief, media, { onText, signal, tier }) {
    if (SERVER) {
      const image = media ? (media.aiImage || media.thumb) : undefined;
      const r = await aiStream('/api/ai/generate', { brief, tier: tier === 'default' ? 'best' : 'fast', image }, { onText, signal });
      noteUsage(); return r;
    }
    const opts = { signal, cache: false, modelTier: tier, onText };
    if (media) opts.images = [media.file || dataUrlToBlob(media.thumb)];
    return AI.call(C.buildComposePrompt(brief, S.ws.voice), opts);
  },
  async enhance(action, text, network, { onText, signal }) {
    if (SERVER) { const r = await aiStream('/api/ai/enhance', { action, text, network }, { onText, signal }); noteUsage(); return r; }
    return AI.call(C.buildEnhancePrompt(action, text, network, S.ws.voice), { modelTier: 'quick', cache: false, signal, onText });
  },
  async brief(kind, data, { onText }) {
    if (SERVER) { const r = await aiStream('/api/ai/brief', { kind, data }, { onText }); noteUsage(); return r; }
    return AI.call(C.buildBriefPrompt(kind, data, S.ws.voice), { modelTier: 'quick', cache: false, onText });
  },
  async hashtags(text, network) {
    if (SERVER) { const r = await api('POST', '/api/ai/hashtags', { text, network }); noteUsage(); return r.tags; }
    return AI.json(C.buildHashtagPrompt(text, network, S.ws.voice), { modelTier: 'quick' });
  },
  async replies(conv) {
    if (SERVER) { const r = await api('POST', '/api/ai/replies', { conversation: conv }); noteUsage(); return r.replies; }
    return AI.json(C.buildRepliesPrompt(conv, S.ws.voice), { modelTier: 'quick', cache: false });
  },
  async ideas(pillars, existing) {
    if (SERVER) { const r = await api('POST', '/api/ai/ideas', { pillars, existing }); noteUsage(); return r.ideas; }
    return AI.json(C.buildIdeasPrompt({ pillars, existing, date: new Date() }, S.ws.voice), { modelTier: 'quick', cache: false });
  },
  async chat(turns, summary, { onText, signal, onDraft }) {
    if (SERVER) {
      const r = await api('POST', '/api/ai/chat', { turns, summary }, signal);
      noteUsage();
      (r.drafts || []).forEach(p => { S.posts = [...S.posts.filter(x => x.id !== p.id), p]; if (onDraft) onDraft(p); });
      if (onText) onText({ text: r.text, delta: r.text });
      return { text: r.text };
    }
    const opts = { signal, cache: false, modelTier: 'quick', onText };
    if (AI.tools) opts.tools = [{
      name: C.SAVE_DRAFT_TOOL.name, description: C.SAVE_DRAFT_TOOL.description, inputSchema: C.SAVE_DRAFT_TOOL.input_schema,
      execute: input => {
        const d = C.cleanDraftInput(input);
        const p = { id: uid('p'), networks: d.networks, variants: Object.fromEntries(d.networks.map(id => [id, d.text])), idea: '', format: 'post', media: [], status: 'draft', scheduledAt: null, sentAt: null, createdAt: new Date().toISOString(), author: 'AI assistant', aiWritten: true, sample: false };
        Store.putPost(p);
        if (onDraft) onDraft(p);
        return { saved: true, id: p.id };
      }
    }];
    return AI.call([{ role: 'user', content: C.buildChatSystem(summary, S.ws.voice, APP_NAME, AI.tools) }, ...turns], opts);
  }
};

function aiMessage(e) {
  switch (e && e.code) {
    case 'cancelled': return '';
    case 'not_granted': return 'AI is not allowed for this page. You can still write and schedule posts yourself.';
    case 'sampling_disabled': return 'AI is not available on this account.';
    case 'not_configured': return 'AI isn\'t set up on this server yet. An admin needs to add the API key.';
    case 'ai_disabled': return 'AI features are turned off by your admin.';
    case 'quota_exceeded': return (e && e.message) || 'You have used today\'s AI requests. They reset at midnight UTC.';
    case 'rate_limited': return 'Too many AI requests right now. Wait a moment, then try again.';
    case 'refused': return 'The AI declined this request. Try rewording it.';
    case 'session_expired': case 'unauthorized': return 'Your session expired. Log in again to use AI.';
    case 'invalid_json': return 'The AI answer came back in an unexpected format. Try again.';
    case 'prompt_too_large': case 'too_large': return 'That request is too long. Shorten it or use a smaller image.';
    case 'image_rejected': return 'That image could not be read. Use a JPEG or PNG under 4 MB.';
    case 'empty_completion': return 'The AI returned nothing. Add more detail and try again.';
    case 'offline': return e.message;
    default: return SERVER && e && e.message ? e.message : 'The AI request failed. Try again.';
  }
}
const aiOffNote = () => {
  if (AI.state !== 'off') return '';
  if (SERVER) {
    const u = S.usage || {};
    return `<p class="ai-note">${u.aiEnabled === false ? 'AI features are turned off by your admin.' : 'AI isn\'t set up on this server yet. An admin needs to add the API key.'} Everything else works without it.</p>`;
  }
  return '<p class="ai-note">AI writing runs when this page is open in Claude. Everything else works without it.</p>';
};
const thinking = (label = 'Thinking…') => `<span class="thinking"><span class="ripple"></span>${esc(label)}</span>`;

/* ================================================================== */
/* Rendering core                                                      */
/* ================================================================== */
const ROUTES = {
  home: { label: 'Home', icon: 'home' },
  queue: { label: 'Queue', icon: 'queue', group: 'Publish' },
  calendar: { label: 'Calendar', icon: 'calendar', group: 'Publish' },
  approvals: { label: 'Approvals', icon: 'check', group: 'Publish' },
  ideas: { label: 'Ideas', icon: 'bulb', group: 'Create' },
  assistant: { label: 'AI assistant', icon: 'spark', group: 'Create' },
  inbox: { label: 'Inbox', icon: 'inbox', group: 'Engage' },
  analytics: { label: 'Analytics', icon: 'chart', group: 'Analyze' },
  listening: { label: 'Listening', icon: 'radar', group: 'Analyze' },
  settings: { label: 'Settings', icon: 'settings', group: 'Workspace' },
  account: { label: 'Account', icon: 'users', group: 'Workspace' }
};
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
function editingInView() {
  const a = document.activeElement;
  return a && $('#view').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
}
function render(force) {
  if (!force && editingInView()) { S.dirty = true; renderRail(); return; }
  S.dirty = false;
  renderRail();
  const fn = VIEWS[S.route] || VIEWS.home;
  $('#view').innerHTML = banner() + fn();
  mountCharts();
}
function setRoute(r) {
  if (!ROUTES[r] || (r === 'account' && !SERVER)) r = 'home';
  if (r === 'account') { S.acct = { msg: '', err: '' }; loadUsage(); }
  S.route = r;
  if (r === 'approvals') S.queueTab = 'approvals';
  else if (r === 'queue' && S.queueTab === 'approvals') S.queueTab = 'queue';
  S.confirm = null; S.menuOpen = false;
  $('#app').classList.remove('menu-open'); $('#scrim').hidden = true;
  render(true);
  window.scrollTo(0, 0);
}

function renderRail() {
  const counts = {
    queue: allPosts().filter(p => effStatus(p) === 'scheduled').length,
    approvals: allPosts().filter(p => p.status === 'approval').length,
    inbox: S.inbox.filter(c => c.status === 'open').length
  };
  let html = '', group = null;
  Object.entries(ROUTES).forEach(([id, r]) => {
    if (id === 'settings' || id === 'account') return;
    if (r.group && r.group !== group) { group = r.group; html += `<div class="nav-label">${esc(group)}</div>`; }
    const n = counts[id];
    const cur = S.route === id ? ' aria-current="page"' : '';
    html += `<a href="#${id}" data-act="go" data-to="${id}"${cur}>${ic(r.icon)}<span>${esc(r.label)}</span>${n ? `<span class="count${id === 'inbox' || id === 'approvals' ? ' hot' : ''}">${n}</span>` : ''}</a>`;
  });
  $('#nav').innerHTML = html;
  const storeNote = Store.mode === 'server' ? ['good', 'Saved to your account'] : Store.mode === 'db' ? ['good', 'Saved to your private workspace'] : Store.mode === 'pending' ? ['', 'Loading your workspace…'] : ['warn', 'Not saved: changes last until reload'];
  const aiNote = AI.state === 'ready' ? ['good', 'AI engine ready'] : AI.state === 'pending' ? ['', 'Starting AI engine…'] : ['warn', SERVER ? 'AI not available' : 'AI available inside Claude'];
  const me = SERVER && S.me ? S.me : null;
  const initials = me ? String(me.name || me.email).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() : '';
  $('#rail-foot').innerHTML = `
    <a href="#settings" data-act="go" data-to="settings" class="btn ghost" style="justify-content:flex-start${S.route === 'settings' ? ';color:var(--accent);background:var(--accent-soft)' : ''}">${ic('settings')}Settings &amp; channels</a>
    <div class="rail-channels" aria-label="Connected channels">${connectedNets().map(id => net(id)).join('')}</div>
    <div class="storage"><span class="dot ${aiNote[0]}"></span>${esc(aiNote[1])}</div>
    <div class="storage"><span class="dot ${storeNote[0]}"></span>${esc(storeNote[1])}</div>
    ${me ? `<div class="me"><span class="avatar">${esc(initials)}</span><div class="grow"><b>${esc(me.name)}</b><small>${esc(me.email)}</small></div></div>
    <div class="me-links"><a href="#account" class="btn ghost sm" data-act="go" data-to="account"${S.route === 'account' ? ' aria-current="page"' : ''}>${ic('users', 'sm')}Account</a>${me.role === 'admin' ? `<a href="/admin" class="btn ghost sm">${ic('bolt', 'sm')}Admin</a>` : ''}<button class="btn ghost sm" data-act="logout">Log out</button></div>` : ''}`;
}

function banner() {
  const ann = SERVER && S.announcement ? `<div class="banner announce">${ic('info')}<div class="grow"><b>Announcement:</b> ${esc(S.announcement)}</div></div>` : '';
  if (lsGet('socialistem.banner') === 'off') return ann;
  if (SERVER) return ann + `<div class="banner">${ic('info')}<div class="grow"><b>Preview modules.</b> Inbox, analytics and listening show sample data until channel integrations are switched on. Your posts, ideas and settings are saved to your account.</div><button class="iconbtn" data-act="banner-off" aria-label="Dismiss notice">${ic('x', 'sm')}</button></div>`;
  const saved = Store.mode === 'db' ? 'saved to your private workspace' : 'kept for this session only';
  return `<div class="banner">${ic('info')}<div class="grow"><b>Demo workspace for “Marsa Coffee”.</b> Channel connections, inbox, analytics and listening use sample data. Posts, ideas and settings you create are ${saved}. AI writing runs live.</div><button class="iconbtn" data-act="banner-off" aria-label="Dismiss notice">${ic('x', 'sm')}</button></div>`;
}

/* ================================================================== */
/* Views                                                               */
/* ================================================================== */
const VIEWS = {};

/* ---------------- Home ---------------- */
VIEWS.home = () => {
  const now = new Date();
  const h = now.getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const upcoming = allPosts().filter(p => effStatus(p) === 'scheduled').sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).slice(0, 4);
  const open = S.inbox.filter(c => c.status === 'open');
  const wk = rangeStats(7);
  const todayRow = AN.heat[now.getDay()];
  const bestToday = todayRow.map((v, hr) => ({ v, hr })).filter(x => x.hr > h).sort((a, b) => b.v - a.v).slice(0, 2).sort((a, b) => a.hr - b.hr);
  const sel = S.heroNets || defaultNets();
  const suggestions = ['Launch our date-syrup cold brew this weekend', 'Thank our 6 am regulars', 'Behind the scenes: Monday roast day', 'Hiring a weekend barista'];
  return `
  <section class="hero" aria-labelledby="hero-h">
    <p class="eyebrow">${greet}${SERVER && S.me ? ', ' + esc(String(S.me.name).split(' ')[0]) : ''} · ${C.DAY_NAMES[now.getDay()]} ${now.getDate()} ${C.MONTH_NAMES[now.getMonth()]}</p>
    <h1 id="hero-h">Say it once. <span>Post it everywhere.</span></h1>
    <p class="lede">Describe a post in your own words. Socialistem writes a native version for each channel, checks every limit, and books the next good time to publish.</p>
    <form class="prompt" data-form="hero">
      <label class="sr" for="hero-idea">What do you want to post?</label>
      <textarea id="hero-idea" rows="3" placeholder="e.g. Announce our new date-syrup cold brew for the weekend. Playful, mention it's dairy-free.">${esc(S.heroIdea || '')}</textarea>
      <div class="prompt-bar">
        <div class="chips" role="group" aria-label="Channels">${connectedNets().map(id => `<button type="button" class="chip" data-act="hero-net" data-net="${id}" aria-pressed="${sel.includes(id)}">${net(id)}${esc(C.getNetwork(id).name)}</button>`).join('')}</div>
        <div class="prompt-actions">
          <label class="sr" for="hero-lang">Language</label>
          <select id="hero-lang"><option value="en">English</option><option value="ar"${S.heroLang === 'ar' ? ' selected' : ''}>العربية</option><option value="both"${S.heroLang === 'both' ? ' selected' : ''}>Bilingual</option></select>
          <button class="btn ai" type="submit">${ic('spark')}${AI.ready || AI.state === 'pending' ? 'Write posts' : 'Open composer'}</button>
        </div>
      </div>
    </form>
    <div class="suggest"><span class="lbl">Try</span>${suggestions.map(s => `<button type="button" class="chip plain" data-act="hero-suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <ol class="flow" aria-label="How Socialistem works">
      <li><b>Idea</b><span>Type it, pick a trend, or pull from your Ideas board</span></li>
      <li><b>Write</b><span>AI drafts a native post for every channel</span></li>
      <li><b>Polish</b><span>Hooks, length, tone, hashtags, Arabic or English</span></li>
      <li><b>Schedule</b><span>Next free slot, a set time, or team approval</span></li>
      <li><b>Engage</b><span>One inbox with AI-suggested replies</span></li>
      <li><b>Learn</b><span>Analytics and listening feed the next idea</span></li>
    </ol>
  </section>

  <section class="bento" aria-label="Today at a glance">
    <article class="card c-next">
      <div class="card-head"><div><h2>Up next</h2><p class="sub">${plural(allPosts().filter(p => effStatus(p) === 'scheduled').length, 'post')} in the queue</p></div><a class="btn sm" href="#queue" data-act="go" data-to="queue">Open queue ${ic('arrow', 'sm')}</a></div>
      <div class="mini-list">${upcoming.length ? upcoming.map(p => { const d = new Date(p.scheduledAt); return `
        <div class="mini-item"><div class="when">${C.fmtTime(d)}<small>${esc(C.dayLabel(d, now).replace(/ \d+ \w+$/, ''))}</small></div><div class="txt" dir="auto">${esc(firstText(p))}</div><div class="chips">${nets(p.networks)}</div></div>`; }).join('') : `<div class="empty"><h3>Nothing scheduled</h3><p>Write a post above and it goes into your next free slot.</p></div>`}</div>
    </article>
    <article class="card c-inbox">
      <div class="card-head"><div><h2>Needs a reply</h2><p class="sub">${plural(open.length, 'conversation')} open across channels</p></div><a class="btn sm" href="#inbox" data-act="go" data-to="inbox">Inbox ${ic('arrow', 'sm')}</a></div>
      <div class="mini-list">${open.slice(0, 3).map(c => `
        <div class="mini-item"><div class="chips">${net(c.net)}</div><div class="txt"><b>${esc(c.name)}</b> · ${esc(c.msgs[c.msgs.length - 1].text)}</div>${sentBadge(c.sentiment)}</div>`).join('')}</div>
    </article>
    <article class="card c-week">
      <div class="card-head"><div><h2>Last 7 days</h2><p class="sub">Compared with the 7 days before</p></div><a class="btn sm" href="#analytics" data-act="go" data-to="analytics">Analytics ${ic('arrow', 'sm')}</a></div>
      <div class="kpis">
        ${kpiMini('Reach', C.fmtCompact(wk.reach), C.pctChange(wk.reach, wk.reachP), wk.reachS)}
        ${kpiMini('Engagement', wk.er.toFixed(1) + '%', C.pctChange(wk.er, wk.erP), wk.interactionsS)}
        ${kpiMini('New followers', '+' + C.fmtCompact(wk.followers), C.pctChange(wk.followers, wk.followersP), wk.followersS)}
      </div>
    </article>
    <article class="card c-trend">
      <div class="card-head"><div><h2>Trending near you</h2><p class="sub">From Listening, ready to draft</p></div></div>
      ${LISTEN.trends.slice(0, 3).map((t, i) => `<div class="trend-row"><div class="t">${esc(t.topic)}<small>${esc(t.note)} · <span class="delta ${t.change >= 0 ? 'up' : 'down'}">${t.change >= 0 ? '▲' : '▼'} ${Math.abs(t.change)}%</span></small></div><button class="btn sm" data-act="trend-draft" data-i="${i}">${ic('spark', 'sm')}Draft</button></div>`).join('')}
    </article>
    <article class="card c-best">
      <div class="card-head"><div><h2>Best times today</h2><p class="sub">When your audience engages most</p></div></div>
      <div class="best-list">${bestToday.length ? bestToday.map(b => `<div class="best-slot"><b>${C.pad2(b.hr)}:00</b><span>engagement index ${Math.round(b.v)}</span></div>`).join('') : '<p class="sub">Today\'s peak hours have passed. Tomorrow opens at 08:00.</p>'}</div>
    </article>
  </section>`;
};
function kpiMini(k, v, d, series) {
  return `<div class="kpi"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span>${deltaHtml(d)}${sparkline(series)}</div>`;
}
const deltaHtml = d => (d == null ? '' : `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}%</span>`);
function sparkline(vals) {
  const max = Math.max(...vals), min = Math.min(...vals);
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * 100).toFixed(2)},${(28 - ((v - min) / ((max - min) || 1)) * 24).toFixed(2)}`);
  const last = pts[pts.length - 1].split(',');
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" style="fill:none;stroke:var(--accent);stroke-width:2;vector-effect:non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" style="fill:var(--accent)"/></svg>`;
}
const sentBadge = s => `<span class="badge ${s === 'positive' ? 'pos' : s === 'negative' ? 'neg' : 'neu'}">${esc(s)}</span>`;

/* ---------------- Queue / Drafts / Approvals / Sent ---------------- */
VIEWS.queue = () => {
  const list = allPosts();
  const cnt = st => list.filter(p => effStatus(p) === st && byFilter(p)).length;
  const tabs = [['queue', 'Queue', cnt('scheduled')], ['drafts', 'Drafts', cnt('draft')], ['approvals', 'Approvals', cnt('approval')], ['sent', 'Sent', cnt('sent')]];
  const titles = { queue: ['Queue', 'Posts go out at your schedule times. Empty slots show where there is room for more.'], drafts: ['Drafts', 'Work in progress. Nothing here is scheduled yet.'], approvals: ['Approvals', 'Posts your team wants to publish. Approve them to put them in the queue.'], sent: ['Sent', 'Published posts and how they performed.'] };
  const t = titles[S.queueTab];
  let body;
  if (S.queueTab === 'queue') body = queueList(list);
  else {
    const st = { drafts: 'draft', approvals: 'approval', sent: 'sent' }[S.queueTab];
    const items = list.filter(p => effStatus(p) === st && byFilter(p)).sort((a, b) => st === 'sent' ? new Date(b.sentAt || b.scheduledAt) - new Date(a.sentAt || a.scheduledAt) : new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    body = items.length ? `<div class="qitems">${items.map(p => postCard(p, { showDate: true })).join('')}</div>` : `<div class="empty"><h3>Nothing here</h3><p>${st === 'approval' ? 'When someone sends a post for approval it shows up here.' : st === 'draft' ? 'Save a post as a draft from the composer to keep working on it later.' : 'Published posts appear here.'}</p></div>`;
  }
  return `
  <header class="vh"><div><h1>${t[0]}</h1><p class="sub">${t[1]}</p></div><div class="vh-actions"><button class="btn primary" data-act="compose">${ic('plus')}Create post</button></div></header>
  <div class="toolbar">
    <div class="seg" role="group" aria-label="Post status">${tabs.map(([id, l, n]) => `<button data-act="qtab" data-tab="${id}" aria-pressed="${S.queueTab === id}">${l}<span class="n">${n}</span></button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Filter by channel"><button class="chip plain" data-act="filter" data-net="all" aria-pressed="${S.filter === 'all'}">All channels</button>${connectedNets().map(id => `<button class="chip" data-act="filter" data-net="${id}" aria-pressed="${S.filter === id}">${net(id)}${esc(C.getNetwork(id).name)}</button>`).join('')}</div>
  </div>
  ${body}`;
};
function queueList(list) {
  const now = new Date();
  const horizon = C.addDays(C.startOfDay(now), 8);
  const scheduled = list.filter(p => ['scheduled', 'approval'].includes(effStatus(p)) && p.scheduledAt && byFilter(p));
  const takenAll = new Set(list.filter(p => ['scheduled', 'approval'].includes(effStatus(p)) && p.scheduledAt).map(p => C.minuteKey(new Date(p.scheduledAt))));
  const slots = C.slotsBetween(S.ws.schedule, now, horizon).filter(d => !takenAll.has(C.minuteKey(d)));
  const rows = [
    ...scheduled.filter(p => new Date(p.scheduledAt) < horizon).map(p => ({ t: new Date(p.scheduledAt), p })),
    ...slots.map(d => ({ t: d, slot: true }))
  ].sort((a, b) => a.t - b.t);
  const days = C.groupByDay(rows.map(r => ({ ...r, at: r.t.toISOString() })), 'at');
  const later = scheduled.filter(p => new Date(p.scheduledAt) >= horizon).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  if (!days.length && !later.length) return `<div class="empty"><h3>Your queue is empty</h3><p>Add posting times in Settings, then create a post.</p><button class="btn primary" data-act="compose">${ic('plus')}Create post</button></div>`;
  return days.map(g => {
    const n = g.items.filter(x => !x.slot).length;
    return `<section class="qday"><h3>${esc(C.dayLabel(g.date, now))}<small>${g.key === C.dayKey(now) ? `${C.DAY_NAMES[now.getDay()]} ${fmtDate(now)} · ` : ''}${plural(n, 'post')}</small></h3><div class="qitems">${g.items.map(x => x.slot ? slotRow(x.t) : postCard(x.p)).join('')}</div></section>`;
  }).join('') + (later.length ? `<section class="qday"><h3>Later</h3><div class="qitems">${later.map(p => postCard(p, { showDate: true })).join('')}</div></section>` : '');
}
function slotRow(d) {
  const iso = d.toISOString();
  return `<div class="slot"><div class="ptime">${C.fmtTime(d)}</div><div class="slot-actions"><span class="label">Empty slot</span><button class="btn sm" data-act="compose" data-at="${iso}">${ic('plus', 'sm')}Add post</button><button class="btn sm ai" data-act="fill-slot" data-at="${iso}">${ic('spark', 'sm')}Fill with AI</button></div></div>`;
}
function mediaHtml(p, lg) {
  const m = (p.media || [])[0];
  if (!m) return '';
  return m.thumb ? `<img class="thumb${lg ? ' lg' : ''}" src="${esc(m.thumb)}" alt="${esc(p.altText || 'Attached image')}">` : `<div class="thumb sw-${esc(m.swatch)}${lg ? ' lg' : ''}" role="img" aria-label="Sample photo"></div>`;
}
function postCard(p, o = {}) {
  const st = effStatus(p);
  const d = p.scheduledAt ? new Date(p.scheduledAt) : null;
  const sentD = p.sentAt ? new Date(p.sentAt) : d;
  const armed = S.confirm === 'del:' + p.id;
  const timeCol = st === 'draft' ? `<div class="ptime">Draft<small>${p.updatedAt || p.createdAt ? esc(C.relativeTime(new Date(p.updatedAt || p.createdAt), new Date())) : ''}</small></div>`
    : st === 'sent' && sentD ? `<div class="ptime">${C.fmtTime(sentD)}<small>${esc(fmtDate(sentD))}</small></div>`
    : d ? `<div class="ptime">${C.fmtTime(d)}${o.showDate ? `<small>${esc(fmtDate(d))}</small>` : ''}</div>` : '<div class="ptime">—</div>';
  const badges = [
    p.sample ? '<span class="badge sample">Sample</span>' : '',
    st === 'approval' ? `<span class="badge approval">Awaiting approval · ${esc(p.author || 'Team')}</span>` : '',
    st === 'sent' ? '<span class="badge sent">Published</span>' : '',
    p.aiWritten ? '<span class="badge ai">AI</span>' : ''
  ].join('');
  const stats = st === 'sent' ? (p.stats ? `<div class="pmeta"><span><b>${C.fmtCompact(p.stats.reach)}</b> reach</span><span><b>${C.engagementRate(p.stats.interactions, p.stats.reach)}%</b> engagement</span><span><b>${C.fmtCompact(p.stats.clicks)}</b> clicks</span></div>` : '<div class="pmeta">Metrics arrive after the first sync with the channel.</div>') : '';
  const acts = [];
  if (st === 'approval') acts.push(`<button class="btn sm primary" data-act="approve" data-id="${p.id}">${ic('done', 'sm')}Approve</button>`, `<button class="btn sm" data-act="changes" data-id="${p.id}">Request changes</button>`);
  if (st !== 'sent') acts.push(`<button class="btn ghost sm" data-act="edit" data-id="${p.id}">${ic('edit', 'sm')}Edit</button>`);
  if (st === 'draft') acts.push(`<button class="btn ghost sm" data-act="to-queue" data-id="${p.id}">${ic('queue', 'sm')}Add to queue</button>`);
  if (st === 'scheduled') acts.push(`<button class="btn ghost sm" data-act="share-now" data-id="${p.id}">${ic('send', 'sm')}Share now</button>`);
  acts.push(`<button class="btn ghost sm" data-act="dup" data-id="${p.id}">${ic('copy', 'sm')}Duplicate</button>`);
  acts.push(`<button class="btn ghost sm danger${armed ? ' armed' : ''}" data-act="del" data-id="${p.id}">${ic('trash', 'sm')}${armed ? 'Click again to delete' : 'Delete'}</button>`);
  return `<article class="post${st === 'approval' ? ' is-approval' : ''}${st === 'sent' ? ' is-sent' : ''}">${timeCol}
    <div class="pbody"><div class="ptop">${nets(p.networks)}${badges}</div>
      <div style="display:flex;gap:12px;align-items:flex-start"><p class="ptext" dir="auto" style="flex:1">${esc(firstText(p))}</p>${mediaHtml(p)}</div>
      ${stats}<div class="pactions">${acts.join('')}</div></div></article>`;
}

VIEWS.approvals = VIEWS.queue;

/* ---------------- Calendar ---------------- */
VIEWS.calendar = () => {
  const { y, m } = S.cal;
  const now = new Date();
  const weeks = C.monthMatrix(y, m, 1);
  const posts = allPosts().filter(p => effStatus(p) !== 'draft' && (p.scheduledAt || p.sentAt) && byFilter(p));
  const byDay = {};
  posts.forEach(p => { const d = new Date(p.sentAt || p.scheduledAt); (byDay[C.dayKey(d)] = byDay[C.dayKey(d)] || []).push({ p, d }); });
  Object.values(byDay).forEach(a => a.sort((x, z) => x.d - z.d));
  const head = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return `
  <header class="vh"><div><h1>Calendar</h1><p class="sub">Every scheduled and published post by day. Click a day to plan a post for it.</p></div><div class="vh-actions"><button class="btn primary" data-act="compose">${ic('plus')}Create post</button></div></header>
  <div class="toolbar">
    <div class="cal-nav"><button class="iconbtn" data-act="cal" data-d="-1" aria-label="Previous month">${ic('left')}</button><h2>${C.MONTH_NAMES[m]} ${y}</h2><button class="iconbtn" data-act="cal" data-d="1" aria-label="Next month">${ic('right')}</button><button class="btn sm" data-act="cal" data-d="0">Today</button></div>
    <div class="chips" role="group" aria-label="Filter by channel"><button class="chip plain" data-act="filter" data-net="all" aria-pressed="${S.filter === 'all'}">All</button>${connectedNets().map(id => `<button class="chip" data-act="filter" data-net="${id}" aria-pressed="${S.filter === id}">${net(id)}</button>`).join('')}</div>
  </div>
  <div class="cal" role="grid" aria-label="${C.MONTH_NAMES[m]} ${y}">
    <div class="cal-head" role="row">${head.map(d => `<div role="columnheader">${d}</div>`).join('')}</div>
    ${weeks.map(w => `<div class="cal-week" role="row">${w.map(d => {
      const k = C.dayKey(d), items = byDay[k] || [];
      const past = C.startOfDay(d) < C.startOfDay(now);
      const cls = ['cal-day', d.getMonth() !== m ? 'out' : '', k === C.dayKey(now) ? 'today' : '', past ? 'past' : ''].join(' ');
      return `<div class="${cls}" role="gridcell"><span class="dnum">${d.getDate()}</span><div class="items">${items.slice(0, 3).map(({ p, d: t }) => `<button class="cal-item ${effStatus(p)}" data-act="${effStatus(p) === 'sent' ? 'dup' : 'edit'}" data-id="${p.id}" title="${esc(C.fmtTime(t) + ' · ' + firstText(p).slice(0, 80))}">${net(p.networks[0])}<span class="tm">${C.fmtTime(t)}</span><span class="tt">${esc(firstText(p))}</span></button>`).join('')}</div>${items.length > 3 ? `<span class="cal-more">+${items.length - 3} more</span>` : ''}${!past ? `<button class="cal-add" data-act="cal-add" data-day="${k}">+ Add</button>` : ''}</div>`;
    }).join('')}</div>`).join('')}
  </div>`;
};

/* ---------------- Ideas ---------------- */
VIEWS.ideas = () => {
  const cols = [['ideas', 'Ideas'], ['drafting', 'In progress'], ['ready', 'Ready to write']];
  const ideas = allIdeas();
  return `
  <header class="vh"><div><h1>Ideas</h1><p class="sub">Capture ideas, move them along, and turn any card into posts with one click.</p></div></header>
  <div class="grid-2e">
    <form class="card" data-form="idea-add">
      <div class="card-head"><h2>New idea</h2></div>
      <div class="field"><label class="lbl" for="idea-title">Idea</label><input class="input" id="idea-title" placeholder="e.g. Ramadan late-night menu teaser" maxlength="120" required></div>
      <div class="field" style="margin-top:10px"><label class="lbl" for="idea-note">Notes (optional)</label><input class="input" id="idea-note" placeholder="Angle, format, links…" maxlength="300"></div>
      <div style="margin-top:12px"><button class="btn primary" type="submit">${ic('plus')}Add idea</button></div>
    </form>
    <form class="card ai-card" data-form="idea-gen">
      <div class="card-head"><div><h2>Generate ideas</h2><p class="sub">Six fresh ideas spread across your content pillars</p></div><span class="badge ai">AI</span></div>
      <div class="gen-ideas"><div class="field"><label class="lbl" for="pillars">Content pillars</label><input class="input" id="pillars" value="${esc(S.pillars)}"></div>
      <button class="btn ai" type="submit"${S.ideaBusy || !AI.ready ? ' disabled' : ''}>${S.ideaBusy ? thinking('Generating') : ic('spark') + 'Generate'}</button></div>
      ${S.ideaErr ? `<p class="ai-note err" style="margin-top:8px">${esc(S.ideaErr)}</p>` : ''}${aiOffNote()}
    </form>
  </div>
  <div class="board">${cols.map(([id, label], ci) => {
    const items = ideas.filter(i => (i.col || 'ideas') === id);
    return `<section class="col" aria-label="${label}"><h3>${label}<span>${items.length}</span></h3>${items.map(i => `
      <article class="idea"><div class="row">${i.sample ? '<span class="badge sample">Sample</span>' : ''}${i.ai ? '<span class="badge ai">AI</span>' : ''}${i.pillar ? `<span class="badge">${esc(i.pillar)}</span>` : ''}${i.format ? `<span class="badge draft">${esc(i.format)}</span>` : ''}</div>
      <h4>${esc(i.title)}</h4>${i.note ? `<p>${esc(i.note)}</p>` : ''}
      <div class="acts">${ci > 0 ? `<button class="btn ghost sm" data-act="idea-move" data-id="${i.id}" data-dir="-1" aria-label="Move back">${ic('left', 'sm')}</button>` : ''}${ci < 2 ? `<button class="btn ghost sm" data-act="idea-move" data-id="${i.id}" data-dir="1" aria-label="Move forward">${ic('right', 'sm')}</button>` : ''}
      <button class="btn sm ai" data-act="idea-write" data-id="${i.id}">${ic('spark', 'sm')}Write posts</button>
      <button class="btn ghost sm danger${S.confirm === 'idel:' + i.id ? ' armed' : ''}" data-act="idea-del" data-id="${i.id}" aria-label="Delete idea">${ic('trash', 'sm')}${S.confirm === 'idel:' + i.id ? 'Delete?' : ''}</button></div></article>`).join('') || '<p class="sub" style="padding:4px">No cards yet.</p>'}</section>`;
  }).join('')}</div>`;
};

/* ---------------- Inbox ---------------- */
VIEWS.inbox = () => {
  const f = S.inboxFilter;
  const list = S.inbox.filter(c => f === 'all' || (f === 'open' && c.status === 'open') || (f === 'mine' && c.assignee === 'You' && c.status === 'open') || (f === 'done' && c.status === 'done'));
  const c = S.inbox.find(x => x.id === S.convId) || list[0];
  const last = x => x.msgs[x.msgs.length - 1];
  const ops = c && S.replies[c.id];
  return `
  <header class="vh"><div><h1>Inbox</h1><p class="sub">Comments, messages, mentions and reviews from every channel in one place, with AI-suggested replies in your brand voice.</p></div></header>
  <div class="inbox${S.inboxDetail ? ' detail' : ''}">
    <div class="conv-list">
      <div class="seg" role="group" aria-label="Filter conversations">${[['open', 'Open'], ['mine', 'Mine'], ['done', 'Done'], ['all', 'All']].map(([id, l]) => `<button data-act="ifilter" data-f="${id}" aria-pressed="${f === id}">${l}</button>`).join('')}</div>
      ${list.map(x => `<button class="conv${x.status === 'done' ? ' done' : ''}" data-act="conv" data-id="${x.id}" aria-current="${c && x.id === c.id}">${net(x.net)}<div class="grow"><div class="who"><span>${esc(x.name)}</span><small>${esc(C.relativeTime(last(x).at, new Date()))}</small></div><div class="snip" dir="auto">${esc(last(x).text)}</div><div class="meta"><span class="badge">${esc(x.kind)}</span>${sentBadge(x.sentiment)}${x.tag ? `<span class="badge approval">${esc(x.tag)}</span>` : ''}</div></div></button>`).join('') || '<p class="sub" style="padding:16px">No conversations here.</p>'}
    </div>
    ${c ? `<div class="thread">
      <div class="thread-head"><div style="display:flex;gap:10px;align-items:center;min-width:0"><button class="iconbtn back-btn" data-act="conv-back" aria-label="Back to conversations">${ic('left')}</button>${net(c.net, true)}<div style="min-width:0"><h2>${esc(c.name)}</h2><p class="sub">${esc(c.kind)} on ${esc(C.getNetwork(c.net).name)}${c.handle ? ' · ' + esc(c.handle) : ''}</p></div></div>
        <div class="thread-tools"><label class="sr" for="assign">Assign to</label><select id="assign" data-change="assign">${['', ...TEAM.map(t => t.name)].map(n => `<option value="${esc(n)}"${c.assignee === n ? ' selected' : ''}>${n ? 'Assigned: ' + esc(n) : 'Unassigned'}</option>`).join('')}</select>
        <button class="btn sm" data-act="conv-done">${c.status === 'done' ? 'Reopen' : ic('done', 'sm') + 'Mark done'}</button></div></div>
      <div class="msgs">${c.context ? `<p class="ctx">${esc(c.context)}</p>` : ''}${c.msgs.map(mg => `<div class="msg${mg.me ? ' me' : ''}" dir="auto">${esc(mg.text)}<small>${mg.me ? 'You · ' : ''}${esc(C.relativeTime(mg.at, new Date()))}</small></div>`).join('')}</div>
      <div class="reply">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn sm ai" data-act="suggest" ${S.replyBusy || !AI.ready ? 'disabled' : ''}>${S.replyBusy ? thinking('Writing replies') : ic('spark', 'sm') + 'Suggest replies'}</button>
        <label class="sr" for="saved-reply">Saved replies</label><select id="saved-reply" class="btn sm" data-change="saved-reply"><option value="">Saved replies…</option><option>Thank you so much! We'll pass this on to the team. ☕</option><option>Sorry about this. Could you send us a DM with your visit time so we can make it right?</option><option>We're open daily 7 am to 11 pm at Dubai Marina Walk. See you soon!</option></select></div>
        ${S.replyErr ? `<p class="ai-note err">${esc(S.replyErr)}</p>` : ''}
        ${ops ? `<div class="reply-ops">${ops.map((o, i) => `<button class="reply-op" data-act="use-reply" data-i="${i}" dir="auto"><b>${esc(o.label)}</b>${esc(o.text)}</button>`).join('')}</div>` : ''}
        <form class="reply-row" data-form="reply"><label class="sr" for="reply-box">Your reply</label><textarea id="reply-box" class="input" dir="auto" placeholder="Write a reply…">${esc(S.draftReply[c.id] || '')}</textarea><button class="btn primary" type="submit">${ic('send', 'sm')}Send</button></form>
      </div></div>` : '<div class="thread"><div class="empty" style="margin:20px">Pick a conversation.</div></div>'}
  </div>`;
};

/* ---------------- Analytics ---------------- */
VIEWS.analytics = () => {
  const r = rangeStats(S.range);
  const top = allPosts().filter(p => effStatus(p) === 'sent' && p.stats).sort((a, b) => b.stats.reach - a.stats.reach).slice(0, 6);
  const shares = Object.entries(AN.shares).filter(([id]) => S.ws.connected[id]).sort((a, b) => b[1] - a[1]);
  const shareSum = shares.reduce((s, [, v]) => s + v, 0) || 1;
  const pcts = C.largestRemainder(shares.map(([, v]) => v));
  const best = C.bestTimes(AN.heat, 3);
  const out = S.aiOut.analytics;
  return `
  <header class="vh"><div><h1>Analytics</h1><p class="sub">Performance across every connected channel. Demo numbers for Marsa Coffee.</p></div>
    <div class="vh-actions"><div class="seg" role="group" aria-label="Date range">${[7, 30, 90].map(d => `<button data-act="range" data-r="${d}" aria-pressed="${S.range === d}">${d} days</button>`).join('')}</div></div></header>
  <div class="kpi-row">
    ${kpiCard('Reach', C.fmtCompact(r.reach), C.pctChange(r.reach, r.reachP), 'people who saw a post')}
    ${kpiCard('Engagement rate', r.er.toFixed(2) + '%', C.pctChange(r.er, r.erP), C.fmtCompact(r.interactions) + ' interactions')}
    ${kpiCard('New followers', '+' + C.fmtInt(r.followers), C.pctChange(r.followers, r.followersP), 'net gain')}
    ${kpiCard('Link clicks', C.fmtCompact(r.clicks), C.pctChange(r.clicks, r.clicksP), 'to site and menu')}
  </div>
  <div class="grid-2">
    <article class="card"><div class="card-head"><div><h2>Daily reach</h2><p class="sub">Last ${S.range} days against the ${S.range} days before</p></div><div class="legend"><span><i></i>This period</span><span><i class="prev"></i>Previous period</span></div></div>
      <div class="chart" data-chart="reach" role="img" aria-label="Daily reach line chart"></div></article>
    <article class="card ai-card"><div class="card-head"><div><h2>AI performance brief</h2><p class="sub">What happened and what to do next</p></div><span class="badge ai">AI</span></div>
      ${out ? `<div class="ai-out">${md(out)}</div>` : '<p class="sub">The AI reads these numbers and writes a short brief with recommendations for next week.</p>'}
      ${S.aiBusy.analytics ? `<p style="margin-top:10px">${thinking()}</p>` : ''}
      <div style="margin-top:12px;display:flex;gap:8px"><button class="btn ai sm" data-act="ai-brief" data-kind="analytics" ${S.aiBusy.analytics || !AI.ready ? 'disabled' : ''}>${ic('spark', 'sm')}${out ? 'Write a new brief' : 'Write my brief'}</button></div>
      ${S.aiOut.analyticsErr ? `<p class="ai-note err">${esc(S.aiOut.analyticsErr)}</p>` : ''}${aiOffNote()}</article>
  </div>
  <div class="grid-2e">
    <article class="card"><div class="card-head"><div><h2>Reach by channel</h2><p class="sub">Share of total reach, last ${S.range} days</p></div></div>
      <div class="bars">${shares.map(([id, v], i) => { const val = Math.round(r.reach * v / shareSum); return `<div class="bar-row" data-tip="${esc(C.getNetwork(id).name)}: ${C.fmtInt(val)} reach (${pcts[i]}%)"><span class="name">${net(id)}${esc(C.getNetwork(id).name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / shares[0][1] * 100).toFixed(1)}%"></div></div><span class="val">${C.fmtCompact(val)}<small>${pcts[i]}%</small></span></div>`; }).join('')}</div></article>
    <article class="card"><div class="card-head"><div><h2>Best time to post</h2><p class="sub">Average engagement by day and 3-hour block (Dubai time)</p></div></div>
      ${heatmap()}
      <p class="sub" style="margin-top:10px">Top slots: ${best.map(b => `<b style="color:var(--ink)">${C.DAY_SHORT[b.day]} ${C.pad2(b.hour)}:00</b>`).join(', ')}. <button class="btn ghost sm" data-act="apply-best">Use these in my schedule</button></p></article>
  </div>
  <article class="card"><div class="card-head"><div><h2>Top posts</h2><p class="sub">Published posts ranked by reach</p></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Post</th><th>Channels</th><th class="num">Reach</th><th class="num">Engagement</th><th class="num">Clicks</th></tr></thead>
    <tbody>${top.map(p => `<tr><td><span class="clip" dir="auto">${esc(firstText(p))}</span></td><td><span class="chips">${nets(p.networks)}</span></td><td class="num">${C.fmtInt(p.stats.reach)}</td><td class="num">${C.engagementRate(p.stats.interactions, p.stats.reach)}%</td><td class="num">${C.fmtInt(p.stats.clicks)}</td></tr>`).join('') || '<tr><td colspan="5" class="sub">No published posts with metrics yet.</td></tr>'}</tbody></table></div></article>`;
};
function kpiCard(k, v, d, p) { return `<div class="kpi-card"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span><span>${deltaHtml(d)} <span class="p">vs previous ${S.range} days</span></span><span class="p">${esc(p)}</span></div>`; }
function heatmap() {
  const blocks = C.heatmapBlocks(AN.heat, 3);
  const flat = blocks.flat(), max = Math.max(...flat), min = Math.min(...flat);
  const order = [1, 2, 3, 4, 5, 6, 0];
  let h = '<div class="heat" role="table" aria-label="Engagement by day and time"><span></span>';
  for (let b = 0; b < 8; b++) h += `<span class="hh">${C.pad2(b * 3)}</span>`;
  order.forEach(d => {
    h += `<span class="hl">${C.DAY_SHORT[d]}</span>`;
    blocks[d].forEach((v, b) => {
      const t = (v - min) / ((max - min) || 1);
      const pct = Math.round(8 + t * 92);
      h += `<span class="cell" style="background:color-mix(in oklab,var(--accent) ${pct}%,var(--surface-2))" data-tip="${C.DAY_NAMES[d]} ${C.pad2(b * 3)}:00 to ${C.pad2(b * 3 + 3)}:00 · engagement index ${Math.round(v)}"></span>`;
    });
  });
  return h + '</div><div class="heat-scale"><span>Low</span><span class="ramp"></span><span>High</span></div>';
}

/* ---------------- Listening ---------------- */
VIEWS.listening = () => {
  const s = C.sentimentShare(LISTEN.mentions);
  const comp = LISTEN.competitors;
  const sov = C.largestRemainder(comp.map(c => c.mentions));
  const out = S.aiOut.listening;
  return `
  <header class="vh"><div><h1>Listening</h1><p class="sub">What people say about you, your competitors and your category, across channels. Demo data.</p></div></header>
  <article class="card"><div class="card-head"><div><h2>Tracked keywords</h2><p class="sub">Brand names, hashtags and phrases to watch for</p></div></div>
    <div class="chips" style="align-items:center">${S.ws.keywords.map((k, i) => `<span class="kw">${esc(k)}<button data-act="kw-del" data-i="${i}" aria-label="Stop tracking ${esc(k)}">${ic('x', 'sm')}</button></span>`).join('')}
    <form class="kw-form" data-form="kw"><label class="sr" for="kw-in">Add keyword</label><input class="input" id="kw-in" placeholder="Add a keyword or #hashtag" maxlength="60"><button class="btn sm" type="submit">${ic('plus', 'sm')}Track</button></form></div></article>
  <div class="grid-2">
    <article class="card"><div class="card-head"><div><h2>Mentions</h2><p class="sub">${LISTEN.mentions.length} in the last 24 hours</p></div></div>
      <div>${LISTEN.mentions.map(mn => `<div class="mention">${net(mn.net)}<div class="grow"><div class="who">${esc(mn.who)} <small>${esc(C.relativeTime(minsAgo(mn.ago), new Date()))}</small>${sentBadge(mn.sentiment)}</div><p dir="auto">${esc(mn.text)}</p></div></div>`).join('')}</div></article>
    <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
      <article class="card"><div class="card-head"><div><h2>Sentiment</h2><p class="sub">Share of mentions</p></div></div>
        <div class="sent-bar" role="img" aria-label="Positive ${s.positive}%, neutral ${s.neutral}%, negative ${s.negative}%">
          <span style="width:${s.positive}%;background:var(--good)" data-tip="Positive: ${s.counts.positive} mentions (${s.positive}%)"></span><span style="width:${s.neutral}%;background:var(--neutral)" data-tip="Neutral: ${s.counts.neutral} mentions (${s.neutral}%)"></span><span style="width:${s.negative}%;background:var(--bad)" data-tip="Negative: ${s.counts.negative} mentions (${s.negative}%)"></span></div>
        <div class="sent-legend"><span><i style="background:var(--good)"></i>Positive ${s.positive}%</span><span><i style="background:var(--neutral)"></i>Neutral ${s.neutral}%</span><span><i style="background:var(--bad)"></i>Negative ${s.negative}%</span></div>
        <p class="sub" style="margin-top:12px">Mention volume, last 30 days</p>${sparkline(LISTEN.volume)}</article>
      <article class="card ai-card"><div class="card-head"><div><h2>AI conversation brief</h2><p class="sub">Themes, risks and opportunities</p></div><span class="badge ai">AI</span></div>
        ${out ? `<div class="ai-out">${md(out)}</div>` : '<p class="sub">The AI reads every mention and trend and tells you what matters.</p>'}
        ${S.aiBusy.listening ? `<p style="margin-top:10px">${thinking()}</p>` : ''}
        <div style="margin-top:12px"><button class="btn ai sm" data-act="ai-brief" data-kind="listening" ${S.aiBusy.listening || !AI.ready ? 'disabled' : ''}>${ic('spark', 'sm')}${out ? 'Refresh brief' : 'Brief me'}</button></div>
        ${S.aiOut.listeningErr ? `<p class="ai-note err">${esc(S.aiOut.listeningErr)}</p>` : ''}${aiOffNote()}</article>
    </div>
  </div>
  <div class="grid-2e">
    <article class="card"><div class="card-head"><div><h2>Trending topics</h2><p class="sub">Rising conversations in your category</p></div></div>
      ${LISTEN.trends.map((t, i) => `<div class="trend-row"><div class="t">${esc(t.topic)}<small>${C.fmtCompact(t.volume)} posts · ${esc(t.note)} · <span class="delta ${t.change >= 0 ? 'up' : 'down'}">${t.change >= 0 ? '▲' : '▼'} ${Math.abs(t.change)}%</span></small></div><button class="btn sm" data-act="trend-draft" data-i="${i}">${ic('spark', 'sm')}Draft post</button></div>`).join('')}</article>
    <article class="card"><div class="card-head"><div><h2>Competitors</h2><p class="sub">Benchmarks and share of voice, last 30 days</p></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>Brand</th><th class="num">Followers</th><th class="num">Posts/wk</th><th class="num">Eng. rate</th><th>Share of voice</th></tr></thead><tbody>
      ${comp.map((c, i) => `<tr class="${c.you ? 'you' : ''}"><td><b>${esc(c.name)}</b>${c.you ? ' <span class="badge">You</span>' : ''}</td><td class="num">${C.fmtCompact(c.followers)}</td><td class="num">${c.ppw}</td><td class="num">${c.er}%</td><td style="min-width:120px"><div class="bar-row" style="grid-template-columns:minmax(0,1fr) 40px" data-tip="${esc(c.name)}: ${c.mentions} mentions (${sov[i]}%)"><div class="bar-track"><div class="bar-fill${c.you ? '' : ' muted'}" style="width:${sov[i] / Math.max(...sov) * 100}%"></div></div><span class="val">${sov[i]}%</span></div></td></tr>`).join('')}
      </tbody></table></div></article>
  </div>`;
};

/* ---------------- AI assistant ---------------- */
VIEWS.assistant = () => {
  const qs = ['What should I post this week, and when?', 'Which channel is growing fastest, and why?', 'Draft 3 posts for UAE National Day and save them as drafts', 'How should we answer the slow-service review?'];
  return `
  <header class="vh"><div><h1>AI assistant</h1><p class="sub">Your AI teammate. It knows this workspace: queue, drafts, analytics, inbox and trends. Ask it to plan, write or explain.</p></div>${S.chat.length ? `<div class="vh-actions"><button class="btn sm" data-act="chat-clear">New chat</button></div>` : ''}</header>
  <section class="chat">
    <div class="chat-log" id="chat-log" aria-live="polite">${S.chat.length ? S.chat.map((m, i) => `<div class="bubble ${m.role === 'user' ? 'user' : 'bot'}" ${m.role === 'user' ? 'dir="auto"' : ''} data-i="${i}">${m.role === 'user' ? esc(m.content) : (m.tools && m.tools.length ? m.tools.map(t => `<div class="tool">${ic('done', 'sm')} ${esc(t)}</div>`).join('') : '') + (m.content ? `<div class="ai-out">${md(m.content)}</div>` : thinking())}</div>`).join('') : `
      <div class="chat-start"><span class="badge ai">${ic('spark', 'sm')} AI teammate</span><h2>What are we working on?</h2><p class="sub">Answers use your workspace data. Ask for drafts and they are saved to Drafts for review.</p><div class="chips">${qs.map(q => `<button class="chip plain" data-act="chat-q" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>${aiOffNote()}</div>`}
    ${S.chatErr ? `<p class="ai-note err">${esc(S.chatErr)}</p>` : ''}</div>
    <form class="chat-form" data-form="chat"><label class="sr" for="chat-in">Message the assistant</label><textarea id="chat-in" class="input" rows="1" dir="auto" placeholder="Ask about your content, audience or schedule…"></textarea>
      ${S.chatBusy ? `<button class="btn" type="button" data-act="chat-stop">${ic('stop', 'sm')}Stop</button>` : `<button class="btn primary" type="submit" ${AI.ready ? '' : 'disabled'}>${ic('send', 'sm')}Send</button>`}</form>
  </section>`;
};

/* ---------------- Settings ---------------- */
VIEWS.settings = () => {
  const v = S.ws.voice;
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `
  <header class="vh"><div><h1>Settings</h1><p class="sub">Channels, posting schedule, brand voice and team rules. Changes save automatically.</p></div></header>
  <div class="settings">
    <article class="card span2"><div class="card-head"><div><h2>Channels</h2><p class="sub">Channel connections are simulated for now. When integrations go live, each switch runs the network's sign-in flow.</p></div></div>
      <div class="chan-grid">${C.NETWORKS.map(n => `<div class="chan">${net(n.id, true)}<div class="grow"><b>${esc(n.name)}</b><small>${S.ws.connected[n.id] ? esc(handleFor(n.id)) : 'Not connected'}</small></div><button class="switch" role="switch" aria-checked="${!!S.ws.connected[n.id]}" aria-label="Connect ${esc(n.name)}" data-act="connect" data-net="${n.id}"></button></div>`).join('')}</div></article>
    <article class="card"><div class="card-head"><div><h2>Posting schedule</h2><p class="sub">Queue times per day, Dubai time. "Add to queue" uses the next free one.</p></div></div>
      <div class="sched">${order.map(d => `<div class="sched-row"><b>${C.DAY_NAMES[d]}</b><div class="times">${S.ws.schedule[d].map(t => `<span class="time">${t}<button data-act="time-del" data-d="${d}" data-t="${t}" aria-label="Remove ${t} on ${C.DAY_NAMES[d]}">${ic('x', 'sm')}</button></span>`).join('')}<span class="time-add"><label class="sr" for="t-${d}">Add time on ${C.DAY_NAMES[d]}</label><input type="time" id="t-${d}" data-change="time-add" data-d="${d}"></span></div></div>`).join('')}</div></article>
    <article class="card"><div class="card-head"><div><h2>Brand voice</h2><p class="sub">The AI engine writes, rewrites and replies with this profile.</p></div><span class="badge ai">AI</span></div>
      <div class="form-grid">
        <div class="field"><label class="lbl" for="v-brand">Brand name</label><input class="input" id="v-brand" data-voice="brand" value="${esc(v.brand)}"></div>
        <div class="field"><label class="lbl" for="v-lang">Default language</label><select class="input" id="v-lang" data-voice="lang"><option value="en"${v.lang === 'en' ? ' selected' : ''}>English</option><option value="ar"${v.lang === 'ar' ? ' selected' : ''}>Arabic</option><option value="both"${v.lang === 'both' ? ' selected' : ''}>Bilingual</option></select></div>
        <div class="field full"><label class="lbl" for="v-about">What the brand does</label><textarea class="input" id="v-about" data-voice="about" rows="2">${esc(v.about)}</textarea></div>
        <div class="field full"><label class="lbl" for="v-aud">Audience</label><input class="input" id="v-aud" data-voice="audience" value="${esc(v.audience)}"></div>
        <div class="field full"><label class="lbl" for="v-tone">Voice and tone</label><input class="input" id="v-tone" data-voice="tone" value="${esc(v.tone)}"></div>
        <div class="field"><label class="lbl" for="v-avoid">Words to avoid</label><input class="input" id="v-avoid" data-voice="avoid" value="${esc(v.avoid)}"></div>
        <div class="field"><label class="lbl" for="v-tags">Brand hashtags</label><input class="input" id="v-tags" data-voice="hashtags" value="${esc(v.hashtags)}"></div>
      </div></article>
    <article class="card"><div class="card-head"><div><h2>Team &amp; approvals</h2><p class="sub">${SERVER ? 'Shared team workspaces are on the roadmap' : 'Who works in this workspace (demo team)'}</p></div></div>
      <div class="team">${(SERVER && S.me ? [{ name: S.me.name, role: S.me.role === 'admin' ? 'Admin · approves posts' : 'Owner of this workspace', initials: String(S.me.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() }] : TEAM).map(t => `<div class="member"><span class="avatar">${esc(t.initials)}</span><div class="grow"><b>${esc(t.name)}</b><small>${esc(t.role)}</small></div></div>`).join('')}</div>
      <div class="chan" style="margin-top:12px"><div class="grow"><b>Require approval before publishing</b><small>New posts go to Approvals instead of the queue</small></div><button class="switch" role="switch" aria-checked="${S.ws.requireApproval}" aria-label="Require approval" data-act="ws-toggle" data-k="requireApproval"></button></div></article>
    <article class="card"><div class="card-head"><div><h2>Workspace</h2><p class="sub">Sample content and storage</p></div></div>
      <div class="chan"><div class="grow"><b>Show sample posts and ideas</b><small>${SERVER ? 'Example posts from a demo café, marked “Sample”' : 'Marsa Coffee examples marked “Sample”'}</small></div><button class="switch" role="switch" aria-checked="${!S.ws.hideSamples}" aria-label="Show samples" data-act="ws-toggle" data-k="hideSamples"></button></div>
      <p class="sub" style="margin-top:12px">${Store.saved ? 'Your posts, ideas and settings are saved to a private workspace that only you can see.' : 'Storage is not available in this view, so changes last until you reload.'}</p></article>
  </div>`;
};

/* ---------------- Account (socialistem.com only) ---------------- */
VIEWS.account = () => {
  const me = S.me;
  if (!SERVER || !me) return '<div class="empty"><h3>Loading your account…</h3></div>';
  const u = S.usage || {};
  const pct = u.unlimited || !u.limit ? 0 : Math.min(100, Math.round((u.today / u.limit) * 100));
  const a = S.acct || {};
  const armed = S.confirm === 'delacct';
  return `
  <header class="vh"><div><h1>Account</h1><p class="sub">Your profile, password, plan and AI usage.</p></div><div class="vh-actions"><button class="btn" data-act="logout">Log out</button></div></header>
  ${a.msg ? `<div class="banner ok" role="status">${ic('done')}<div class="grow">${esc(a.msg)}</div></div>` : ''}
  ${a.err ? `<div class="banner err" role="alert">${ic('info')}<div class="grow">${esc(a.err)}</div></div>` : ''}
  <div class="settings">
    <form class="card" data-form="profile">
      <div class="card-head"><div><h2>Profile</h2><p class="sub">Member since ${esc(fmtDate(new Date(me.createdAt)))} ${new Date(me.createdAt).getFullYear()}</p></div><span class="badge">${esc(me.role)}</span></div>
      <div class="form-grid">
        <div class="field"><label class="lbl" for="p-name">Name</label><input class="input" id="p-name" value="${esc(me.name)}" maxlength="80" required autocomplete="name"></div>
        <div class="field"><label class="lbl" for="p-brand">Brand or company</label><input class="input" id="p-brand" value="${esc(me.brand)}" maxlength="80" autocomplete="organization"></div>
        <div class="field full"><label class="lbl" for="p-email">Email</label><input class="input" id="p-email" value="${esc(me.email)}" disabled></div>
      </div>
      <div style="margin-top:12px"><button class="btn primary" type="submit">Save profile</button></div>
    </form>
    <article class="card">
      <div class="card-head"><div><h2>Plan &amp; AI usage</h2><p class="sub">Daily requests reset at midnight UTC</p></div><span class="badge ai">${esc((u.plan || me.plan || 'free').toUpperCase())}</span></div>
      <div class="kpis">
        <div class="kpi"><span class="k">Today</span><span class="v">${C.fmtInt(u.today || 0)}</span><span class="p sub">${u.unlimited ? 'no limit' : 'of ' + C.fmtInt(u.limit || 0)}</span></div>
        <div class="kpi"><span class="k">This month</span><span class="v">${C.fmtInt(u.month || 0)}</span><span class="p sub">requests</span></div>
        <div class="kpi"><span class="k">Tokens</span><span class="v">${C.fmtCompact(u.monthTokens || 0)}</span><span class="p sub">this month</span></div>
      </div>
      ${u.unlimited ? '<p class="sub" style="margin-top:12px">Admins have no daily limit.</p>' : `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${u.limit || 0}" aria-valuenow="${u.today || 0}" aria-label="AI requests used today"><span style="width:${pct}%"></span></div><p class="sub">${C.fmtInt(u.today || 0)} of ${C.fmtInt(u.limit || 0)} AI requests used today.</p>`}
      ${aiOffNote()}
    </article>
    <form class="card" data-form="password">
      <div class="card-head"><div><h2>Password</h2><p class="sub">Your other devices will be signed out</p></div></div>
      <div class="form-grid">
        <div class="field full"><label class="lbl" for="pw-cur">Current password</label><input class="input" id="pw-cur" type="password" autocomplete="current-password" required></div>
        <div class="field"><label class="lbl" for="pw-new">New password</label><input class="input" id="pw-new" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="field"><label class="lbl" for="pw-new2">Repeat new password</label><input class="input" id="pw-new2" type="password" autocomplete="new-password" minlength="8" required></div>
      </div>
      <p class="sub" style="margin-top:8px">At least 8 characters, with a letter and a number.</p>
      <div style="margin-top:12px"><button class="btn primary" type="submit">Change password</button></div>
    </form>
    <article class="card">
      <div class="card-head"><div><h2>Sessions</h2><p class="sub">Signed in somewhere you don't recognise?</p></div></div>
      <button class="btn" data-act="signout-others">Sign out of other devices</button>
      <form data-form="delete-account" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line)">
        <h3 style="font-size:15px;color:var(--bad)">Delete account</h3>
        <p class="sub" style="margin:4px 0 10px">Removes your posts, ideas and settings for good.</p>
        <div class="field"><label class="lbl" for="del-pw">Password</label><input class="input" id="del-pw" type="password" autocomplete="current-password" required></div>
        <div style="margin-top:10px"><button class="btn danger${armed ? ' armed' : ''}" type="submit">${armed ? 'Click again to delete everything' : 'Delete my account'}</button></div>
      </form>
    </article>
  </div>`;
};
async function loadUsage() {
  if (!SERVER) return;
  try { S.usage = await api('GET', '/api/account/usage'); if (S.route === 'account') render(true); } catch (e) { /* keep the last numbers */ }
}
async function accountSubmit(kind) {
  S.acct = { msg: '', err: '' };
  try {
    if (kind === 'profile') {
      const r = await api('PATCH', '/api/account', { name: $('#p-name').value, brand: $('#p-brand').value });
      S.me = r.user; S.acct.msg = 'Profile saved.';
    } else if (kind === 'password') {
      const next = $('#pw-new').value;
      if (next !== $('#pw-new2').value) { S.acct.err = 'The new passwords do not match.'; return render(true); }
      await api('POST', '/api/account/password', { current: $('#pw-cur').value, next });
      S.acct.msg = 'Password changed. Other devices have been signed out.';
    } else if (kind === 'delete-account') {
      if (S.confirm !== 'delacct') { S.confirm = 'delacct'; const pw = $('#del-pw').value; render(true); $('#del-pw').value = pw; return; }
      await api('DELETE', '/api/account', { password: $('#del-pw').value });
      location.href = '/?deleted=1';
      return;
    }
  } catch (e) { S.acct.err = (e && e.message) || 'That did not work. Try again.'; }
  S.confirm = null;
  render(true);
}
function startFromLanding() {
  let idea = '';
  try { idea = sessionStorage.getItem('socialistem.idea') || ''; sessionStorage.removeItem('socialistem.idea'); } catch (e) { idea = ''; }
  if (idea.trim()) openComposer({ idea, autogen: true });
}

/* ================================================================== */
/* Charts (measured SVG + shared tooltip)                              */
/* ================================================================== */
function niceMax(v) { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))); const m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; }
function mountCharts() { $$('[data-chart="reach"]').forEach(drawReach); }
function drawReach(el) {
  const w = el.clientWidth, h = el.clientHeight || 240;
  if (!w) return;
  const r = rangeStats(S.range);
  const cur = r.reachS, prev = r.reachPS;
  const pad = { l: 44, r: 12, t: 10, b: 26 };
  const max = niceMax(Math.max(...cur, ...prev));
  const X = i => pad.l + (i * (w - pad.l - pad.r)) / (cur.length - 1);
  const Y = v => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const path = s => s.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = (max / 4) * k, y = Y(v).toFixed(1);
    g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y}" y2="${y}" style="stroke:var(--line);stroke-width:1"/><text x="${pad.l - 8}" y="${+y + 4}" text-anchor="end" style="fill:var(--muted);font-size:11px;font-weight:700">${C.fmtCompact(v)}</text>`;
  }
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * (cur.length - 1)));
  ticks.forEach((i, k) => { g += `<text x="${X(i).toFixed(1)}" y="${h - 6}" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}" style="fill:var(--muted);font-size:11px;font-weight:700">${fmtDate(seriesDate(i, cur.length))}</text>`; });
  const area = path(cur) + `L${X(cur.length - 1).toFixed(1)},${Y(0)}L${X(0)},${Y(0)}Z`;
  const li = cur.length - 1;
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${g}
    <path d="${area}" style="fill:var(--accent);opacity:.1"/>
    <path d="${path(prev)}" style="fill:none;stroke:var(--neutral);stroke-width:1.5;stroke-dasharray:4 4"/>
    <path d="${path(cur)}" style="fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round"/>
    <circle cx="${X(li)}" cy="${Y(cur[li])}" r="4.5" style="fill:var(--accent);stroke:var(--surface);stroke-width:2"/>
    <line class="xh" x1="0" x2="0" y1="${pad.t}" y2="${h - pad.b}" style="stroke:var(--ink-2);stroke-width:1;opacity:0"/>
    <circle class="xd" r="5" style="fill:var(--accent);stroke:var(--surface);stroke-width:2;opacity:0"/>
    <rect x="${pad.l}" y="0" width="${w - pad.l - pad.r}" height="${h}" style="fill:transparent" class="hit"/></svg>`;
  const svg = $('svg', el), xh = $('.xh', el), xd = $('.xd', el), hit = $('.hit', el);
  const move = e => {
    const bx = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(cur.length - 1, Math.round(((e.clientX - bx.left - pad.l) / (w - pad.l - pad.r)) * (cur.length - 1))));
    xh.setAttribute('x1', X(i)); xh.setAttribute('x2', X(i)); xh.style.opacity = 0.4;
    xd.setAttribute('cx', X(i)); xd.setAttribute('cy', Y(cur[i])); xd.style.opacity = 1;
    const d = seriesDate(i, cur.length);
    showTip(`<b>${C.DAY_SHORT[d.getDay()]} ${fmtDate(d)}</b><br>Reach ${C.fmtInt(cur[i])}<br><span style="opacity:.75">Previous period ${C.fmtInt(prev[i])}</span>`, bx.left + X(i), bx.top + Y(cur[i]));
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { xh.style.opacity = 0; xd.style.opacity = 0; hideTip(); });
}
function showTip(html, x, y) {
  const t = $('#tip');
  t.innerHTML = html; t.hidden = false;
  const r = t.getBoundingClientRect();
  let left = x + 14, top = y - r.height - 12;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
  if (top < 8) top = y + 14;
  t.style.left = Math.max(8, left) + 'px'; t.style.top = top + 'px';
}
function hideTip() { $('#tip').hidden = true; }
document.addEventListener('pointerover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (!el) return; const r = el.getBoundingClientRect(); showTip(esc(el.dataset.tip), r.left + r.width / 2, r.top); });
document.addEventListener('pointerout', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hideTip(); });
let roTimer;
new ResizeObserver(() => { clearTimeout(roTimer); roTimer = setTimeout(mountCharts, 120); }).observe(document.documentElement);

/* ================================================================== */
/* Composer                                                            */
/* ================================================================== */
function openComposer(o = {}) {
  const base = o.post || null;
  const conn = connectedNets();
  const at = o.at ? new Date(o.at) : (base && base.scheduledAt && ['scheduled', 'approval'].includes(effStatus(base)) ? new Date(base.scheduledAt) : null);
  S.cmp = {
    editingId: base && !o.dup ? base.id : null, editingSample: !!(base && base.sample && !o.dup), origStatus: base && !o.dup ? base.status : null,
    createdAt: base && !o.dup ? base.createdAt : null,
    idea: o.idea != null ? o.idea : (base && base.idea) || '',
    networks: (o.networks || (base ? base.networks : defaultNets())).filter(n => conn.includes(n) || (base && base.networks.includes(n))),
    format: o.format || (base && base.format) || 'post', tone: 'voice', lang: o.lang || S.ws.voice.lang || 'en', length: 'medium',
    hashtags: true, cta: true, emoji: true, tier: 'quick',
    variants: base ? { ...base.variants } : {}, altText: (base && base.altText) || '',
    media: base ? (base.media || []).map(m => ({ ...m })) : [], useImage: true,
    when: at ? 'custom' : 'queue', customAt: toLocalInput(at || nextFree(base && base.id)),
    busy: null, ctl: null, aiError: '', saveError: '', tagSug: {}, got: {}, undo: null, dirty: false, confirmClose: false,
    slotLabel: o.at ? fmtWhen(new Date(o.at)) : '', aiWritten: !!(base && base.aiWritten)
  };
  S.cmp.active = S.cmp.networks[0] || null;
  $('#composer').hidden = false;
  document.documentElement.style.overflow = 'hidden';
  renderComposer();
  if (o.autogen && S.cmp.idea.trim() && AI.ready) cmpGenerate();
  else setTimeout(() => { const el = $(base ? '#cmp-text' : '#cmp-idea'); if (el) el.focus(); }, 30);
}
function closeComposer(force) {
  const c = S.cmp;
  if (!c) return;
  if (!force && c.dirty && !c.confirmClose) { c.confirmClose = true; renderComposer(); return; }
  if (c.ctl) c.ctl.abort();
  S.cmp = null;
  $('#composer').hidden = true; $('#composer').innerHTML = '';
  document.documentElement.style.overflow = '';
  render(true);
}
function variantIssues(id) { const c = S.cmp; return C.validatePost({ network: id, text: c.variants[id] || '', mediaCount: c.media.length }); }
function tabState(id) {
  const c = S.cmp;
  if (c.busy === 'generate' && !c.got[id]) return 'pending';
  const iss = variantIssues(id);
  if (!(c.variants[id] || '').trim() && !c.media.length) return '';
  return C.hasBlockingIssue(iss) ? 'bad' : iss.length ? 'warn' : 'good';
}
function counterHtml(id) {
  const n = C.getNetwork(id), c = S.cmp;
  const count = C.charCount(c.variants[id] || '', id), ratio = Math.min(1, count / n.limit);
  const col = count > n.limit ? 'var(--bad)' : ratio > 0.9 ? 'var(--warn)' : 'var(--accent)';
  const circ = 2 * Math.PI * 8;
  return `<span class="counter${count > n.limit ? ' over' : ''}"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" style="fill:none;stroke:var(--surface-3);stroke-width:2.5"/><circle cx="10" cy="10" r="8" transform="rotate(-90 10 10)" style="fill:none;stroke:${col};stroke-width:2.5;stroke-dasharray:${(ratio * circ).toFixed(1)} ${circ.toFixed(1)};stroke-linecap:round"/></svg>${C.fmtInt(count)} / ${C.fmtInt(n.limit)}</span>`;
}
function previewHtml(id) {
  const c = S.cmp, n = C.getNetwork(id);
  const text = c.variants[id] || '';
  const fold = { instagram: 125, linkedin: 210, facebook: 480 }[id];
  const body = fold && text.length > fold ? richText(text.slice(0, fold)) + '<span class="fold">… more</span>' : richText(text);
  const m = c.media[0];
  return `<article class="pv" aria-label="${esc(n.name)} preview"><header><span class="av">${esc((S.ws.voice.brand || 'S')[0])}</span><div><b>${esc(S.ws.voice.brand)}</b><small>${esc(handleFor(id))} · ${esc(n.name)} preview</small></div></header>
    ${text ? `<div class="pv-text" dir="auto">${body}</div>` : '<div class="pv-text" style="color:var(--muted)">Your post preview appears here.</div>'}
    ${m ? (m.thumb ? `<img class="thumb lg" src="${esc(m.thumb)}" alt="${esc(c.altText || 'Attached image')}">` : `<div class="thumb lg sw-${esc(m.swatch)}" role="img" aria-label="Sample photo"></div>`) : ''}</article>`;
}
function renderComposer() {
  const c = S.cmp;
  if (!c) return;
  const conn = connectedNets();
  const id = c.active;
  const busy = c.busy;
  const tabHtml = c.networks.map(n => { const st = tabState(n); return `<button class="vtab${st === 'pending' ? ' pending' : ''}" role="tab" aria-selected="${n === id}" data-act="cmp-tab" data-net="${n}">${net(n)}${esc(C.getNetwork(n).name)}<span class="dot ${st === 'pending' ? '' : st}"></span></button>`; }).join('');
  const sel = (name, label, opts, val) => `<div class="field"><label class="lbl" for="cmp-${name}">${label}</label><select class="input" id="cmp-${name}" data-cmp="${name}">${opts.map(([v, l]) => `<option value="${v}"${v === val ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
  const issues = id ? variantIssues(id) : [];
  const req = S.ws.requireApproval;
  const primaryLabel = req ? 'Send for approval' : c.when === 'now' ? 'Publish now' : c.when === 'queue' ? 'Add to queue' : 'Schedule';
  const nextSlot = nextFree(c.editingId);
  const hasImgForAI = c.media.some(m => m.thumb);
  $('#composer').innerHTML = `
  <div class="cmp" role="dialog" aria-modal="true" aria-labelledby="cmp-title">
    <header class="cmp-head"><h2 id="cmp-title">${c.editingId ? 'Edit post' : 'Create post'}</h2>${c.slotLabel ? `<span class="badge">${ic('clock', 'sm')}${esc(c.slotLabel)}</span>` : ''}
      <button class="btn ${c.confirmClose ? 'danger armed' : 'ghost'} sm" data-act="cmp-close">${c.confirmClose ? 'Discard changes?' : ic('x') + '<span class="sr">Close</span>'}</button></header>
    <div class="cmp-body">
      <section class="cmp-brief" aria-label="Brief">
        <div class="field"><label class="lbl" for="cmp-idea">Idea or brief</label><textarea class="input" id="cmp-idea" data-cmp-in="idea" rows="4" dir="auto" placeholder="What is the post about? Add details: offer, dates, tone, audience…">${esc(c.idea)}</textarea></div>
        <div class="field"><span class="lbl">Channels</span><div class="chips" role="group" aria-label="Channels">${conn.map(n => `<button type="button" class="chip" data-act="cmp-net" data-net="${n}" aria-pressed="${c.networks.includes(n)}">${net(n)}${esc(C.getNetwork(n).name)}</button>`).join('')}</div></div>
        <div class="cmp-opts">
          ${sel('format', 'Format', [['post', 'Single post'], ['thread', 'Thread'], ['carousel', 'Carousel copy'], ['video', 'Video script']], c.format)}
          ${sel('tone', 'Tone', [['voice', 'Brand voice'], ['friendly', 'Friendly'], ['professional', 'Professional'], ['playful', 'Playful'], ['bold', 'Bold'], ['inspiring', 'Inspiring']], c.tone)}
          ${sel('lang', 'Language', [['en', 'English'], ['ar', 'العربية'], ['both', 'Bilingual']], c.lang)}
          ${sel('length', 'Length', [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']], c.length)}
        </div>
        <div class="cmp-toggles">${[['hashtags', 'Hashtags'], ['cta', 'Call to action'], ['emoji', 'Emoji']].map(([k, l]) => `<label class="check"><input type="checkbox" data-cmp-chk="${k}"${c[k] ? ' checked' : ''}>${l}</label>`).join('')}</div>
        <div class="field"><span class="lbl">Media</span><div class="cmp-media">${c.media.map((m, i) => `<div class="m">${m.thumb ? `<img class="thumb" src="${esc(m.thumb)}" alt="${esc(m.name || 'Attached image')}">` : `<div class="thumb sw-${esc(m.swatch)}" role="img" aria-label="Sample photo"></div>`}<button data-act="cmp-media-del" data-i="${i}" aria-label="Remove image">${ic('x', 'sm')}</button></div>`).join('')}
          ${c.media.length < 4 ? `<label class="upload">${ic('image')}Add image<input type="file" accept="image/*" multiple data-cmp-file></label>` : ''}</div>
          ${hasImgForAI && AI.images ? `<label class="check"><input type="checkbox" data-cmp-chk="useImage"${c.useImage ? ' checked' : ''}>Let AI read the image and write alt text</label>` : ''}</div>
        <div class="field"><label class="lbl" for="cmp-tier">AI model</label><select class="input" id="cmp-tier" data-cmp="tier"><option value="quick"${c.tier === 'quick' ? ' selected' : ''}>Fast: drafts in seconds</option><option value="default"${c.tier === 'default' ? ' selected' : ''}>Best: more considered, slower</option></select></div>
        <div class="gen">
          ${busy === 'generate' ? `<button class="btn" data-act="cmp-stop">${ic('stop')}Stop writing</button><p class="ai-note">${thinking(Object.keys(c.got).length ? `Writing… ${Object.keys(c.got).length} of ${c.networks.length} done` : 'Thinking…')}</p>`
            : `<button class="btn ai" data-act="cmp-generate" ${!AI.ready || !c.networks.length || busy ? 'disabled' : ''}>${ic('spark')}${Object.keys(c.got).length || Object.values(c.variants).some(Boolean) ? 'Rewrite' : 'Write'} for ${plural(c.networks.length, 'channel')}</button>`}
          ${c.aiError ? `<p class="ai-note err">${esc(c.aiError)}</p>` : ''}${aiOffNote()}
        </div>
      </section>
      <section class="cmp-out" aria-label="Posts">
        ${c.networks.length ? `<div class="vtabs" role="tablist" aria-label="Channel versions">${tabHtml}</div>
        <div class="editor"><label class="sr" for="cmp-text">${esc(C.getNetwork(id).name)} post</label><textarea id="cmp-text" data-cmp-in="variant" dir="auto" placeholder="Write your ${esc(C.getNetwork(id).name)} post, or press Write to let the AI draft it.">${esc(c.variants[id] || '')}</textarea>
          <div class="editor-bar"><span id="cmp-counter">${counterHtml(id)}</span><button class="btn ghost sm" data-act="cmp-copyall" ${!(c.variants[id] || '').trim() || c.networks.length < 2 ? 'disabled' : ''}>${ic('copy', 'sm')}Use this text on all channels</button></div></div>
        <div class="issues" id="cmp-issues">${issuesHtml(issues)}</div>
        <div class="field"><span class="lbl">Improve with AI</span><div class="enh">${Object.entries(C.ENHANCE_ACTIONS).map(([k, a]) => `<button class="btn sm" data-act="cmp-enh" data-a="${k}" ${!AI.ready || busy || !(c.variants[id] || '').trim() ? 'disabled' : ''}>${esc(a.label)}</button>`).join('')}${c.undo && c.undo.net === id && !busy ? `<button class="btn ghost sm" data-act="cmp-undo">${ic('undo', 'sm')}Undo</button>` : ''}${busy === 'enhance' ? `<button class="btn ghost sm" data-act="cmp-stop">${ic('stop', 'sm')}Stop</button>` : ''}</div></div>
        <div class="field"><span class="lbl">Hashtags</span><div class="tags-row"><button class="btn sm" data-act="cmp-tags" ${!AI.ready || busy || !(c.variants[id] || c.idea).trim() ? 'disabled' : ''}>${busy === 'tags' ? thinking('Finding') : ic('hash', 'sm') + 'Suggest hashtags'}</button>${(c.tagSug[id] || []).map(t => `<button class="tagbtn" data-act="cmp-addtag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
        <div class="preview-wrap"><span class="lbl">Preview</span><div id="cmp-preview">${previewHtml(id)}</div></div>`
        : '<div class="empty"><h3>Pick at least one channel</h3><p>Choose where this post goes on the left.</p></div>'}
      </section>
    </div>
    <footer class="cmp-foot">
      <div class="when" role="group" aria-label="When to publish"><span class="lbl">When</span>
        <div class="seg"><button data-act="cmp-when" data-w="queue" aria-pressed="${c.when === 'queue'}">Next slot · ${esc(fmtWhen(nextSlot))}</button><button data-act="cmp-when" data-w="custom" aria-pressed="${c.when === 'custom'}">Pick a time</button><button data-act="cmp-when" data-w="now" aria-pressed="${c.when === 'now'}">Now</button></div>
        ${c.when === 'custom' ? `<label class="sr" for="cmp-at">Date and time</label><input type="datetime-local" id="cmp-at" data-cmp="customAt" value="${esc(c.customAt)}">` : ''}</div>
      <div class="foot-actions"><button class="btn" data-act="cmp-save" data-mode="draft">Save draft</button>${req ? '' : `<button class="btn" data-act="cmp-save" data-mode="approval">Send for approval</button>`}<button class="btn primary" data-act="cmp-save" data-mode="${req ? 'approval' : 'schedule'}">${esc(primaryLabel)}</button></div>
      ${c.saveError ? `<p class="save-err" role="alert">${esc(c.saveError)}</p>` : ''}
    </footer>
  </div>`;
}
const issuesHtml = list => list.map(i => `<div class="issue ${i.level}">${ic(i.level === 'error' ? 'x' : 'info', 'sm')}${esc(i.message)}</div>`).join('');
function updateEditorMeta() {
  const c = S.cmp; if (!c || !c.active) return;
  const id = c.active;
  const ctr = $('#cmp-counter'); if (ctr) ctr.innerHTML = counterHtml(id);
  const iss = $('#cmp-issues'); if (iss) iss.innerHTML = issuesHtml(variantIssues(id));
  const pv = $('#cmp-preview'); if (pv) pv.innerHTML = previewHtml(id);
  $$('.vtab').forEach(t => { const st = tabState(t.dataset.net); const d = $('.dot', t); if (d) d.className = 'dot ' + (st === 'pending' ? '' : st); t.classList.toggle('pending', st === 'pending'); });
}

async function cmpGenerate() {
  const c = S.cmp;
  if (!c || c.busy) return;
  if (!c.idea.trim()) { c.aiError = 'Describe the post idea first.'; renderComposer(); $('#cmp-idea') && $('#cmp-idea').focus(); return; }
  if (!c.networks.length) { c.aiError = 'Pick at least one channel.'; renderComposer(); return; }
  const img = c.useImage && AI.images ? c.media.find(m => m.file || m.thumb) : null;
  c.busy = 'generate'; c.aiError = ''; c.got = {}; c.ctl = new AbortController(); c.dirty = true; c.confirmClose = false;
  renderComposer();
  const brief = {
    idea: c.idea, networks: c.networks, tone: c.tone, lang: c.lang, format: c.format, length: c.length,
    hashtags: c.hashtags, cta: c.cta, emoji: c.emoji, hasImage: !!img, slot: c.slotLabel ? 'on ' + c.slotLabel : ''
  };
  const mine = c;
  const apply = v => {
    if (!v || S.cmp !== mine || !mine.networks.includes(v.network)) return;
    mine.variants[v.network] = v.text; mine.got[v.network] = true; mine.aiWritten = true;
    if (v.altText) mine.altText = v.altText;
    renderComposer();
  };
  let pending = '';
  const onText = ({ delta }) => { const lines = (pending + delta).split('\n'); pending = lines.pop(); lines.forEach(l => apply(C.parseVariantLine(l))); };
  try {
    const res = await AIX.generate(brief, img, { onText, signal: c.ctl.signal, tier: c.tier });
    apply(C.parseVariantLine(pending));
    if (!Object.keys(mine.got).length) C.parseVariants(res.text).forEach(apply);
    if (!Object.keys(mine.got).length) mine.aiError = 'The AI answer could not be read. Try again.';
    else if (res.truncated) mine.aiError = 'The answer was cut short. Try fewer channels or a shorter length.';
  } catch (e) {
    if (e && e.text && !Object.keys(mine.got).length) C.parseVariants(e.text).forEach(apply);
    mine.aiError = AI.handle(e);
  } finally {
    mine.busy = null; mine.ctl = null;
    if (S.cmp === mine) renderComposer();
  }
}
async function cmpEnhance(action) {
  const c = S.cmp, id = c.active, text = c.variants[id] || '';
  if (!text.trim() || c.busy) return;
  c.busy = 'enhance'; c.aiError = ''; c.undo = { net: id, text }; c.ctl = new AbortController(); c.dirty = true;
  renderComposer();
  const mine = c;
  try {
    const res = await AIX.enhance(action, text, id, {
      signal: c.ctl.signal,
      onText: ({ text: t }) => { mine.variants[id] = t; const ta = $('#cmp-text'); if (ta && mine.active === id) ta.value = t; updateEditorMeta(); }
    });
    mine.variants[id] = res.text.trim().replace(/^"([\s\S]*)"$/, '$1');
    mine.aiWritten = true;
  } catch (e) {
    mine.aiError = AI.handle(e);
    if (!e || !e.text || e.code === 'refused') mine.variants[id] = text;
  } finally {
    mine.busy = null; mine.ctl = null;
    if (S.cmp === mine) renderComposer();
  }
}
async function cmpTags() {
  const c = S.cmp, id = c.active;
  const text = c.variants[id] || c.idea;
  c.busy = 'tags'; c.aiError = ''; renderComposer();
  const mine = c;
  try {
    const arr = await AIX.hashtags(text, id);
    const have = new Set(C.extractHashtags(text).map(t => t.toLowerCase()));
    mine.tagSug[id] = (Array.isArray(arr) ? arr : []).map(String).map(t => t.trim()).filter(t => /^#[\p{L}\p{N}_]+$/u.test(t) && !have.has(t.toLowerCase())).slice(0, 10);
    if (!mine.tagSug[id].length) mine.aiError = 'No new hashtags to suggest for this post.';
  } catch (e) { mine.aiError = AI.handle(e); }
  finally { mine.busy = null; if (S.cmp === mine) renderComposer(); }
}
function dataUrlToBlob(u) {
  const [head, b64] = String(u).split(',');
  const mime = (/data:([^;]+)/.exec(head) || [])[1] || 'image/jpeg';
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function makeThumb(file, max) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * s)); cv.height = Math.max(1, Math.round(img.naturalHeight * s));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}
async function cmpFiles(files) {
  const c = S.cmp;
  for (const f of Array.from(files || [])) {
    if (c.media.length >= 4) break;
    if (!/^image\//.test(f.type)) { c.saveError = `${f.name} is not an image.`; continue; }
    try { c.media.push({ thumb: await makeThumb(f, 480), aiImage: SERVER ? await makeThumb(f, 1280) : undefined, name: f.name, file: f }); c.dirty = true; }
    catch (e) { c.saveError = `${f.name} could not be read.`; }
  }
  if (S.cmp === c) renderComposer();
}
function cmpSave(mode) {
  const c = S.cmp;
  c.saveError = '';
  if (!c.networks.length) { c.saveError = 'Pick at least one channel.'; return renderComposer(); }
  const nowD = new Date();
  if (mode !== 'draft') {
    const bad = c.networks.map(n => ({ n, i: variantIssues(n).find(x => x.level === 'error') })).filter(x => x.i);
    if (bad.length) { c.active = bad[0].n; c.saveError = `Fix before scheduling: ${bad.map(b => b.i.message).join(' ')}`; return renderComposer(); }
  }
  let when = null;
  const now = mode === 'schedule' && c.when === 'now';
  if (mode !== 'draft' && !now) {
    if (c.when === 'custom') {
      when = new Date(c.customAt);
      if (isNaN(when)) { c.saveError = 'Pick a date and time.'; return renderComposer(); }
      if (when <= nowD) { c.saveError = 'That time has passed. Pick a time in the future.'; return renderComposer(); }
    } else when = nextFree(c.editingId);
  }
  const status = mode === 'draft' ? 'draft' : mode === 'approval' ? 'approval' : now ? 'sent' : 'scheduled';
  const post = {
    id: c.editingId && !c.editingSample ? c.editingId : uid('p'),
    networks: c.networks.slice(),
    variants: Object.fromEntries(c.networks.map(n => [n, c.variants[n] || ''])),
    idea: c.idea, format: c.format, altText: c.altText,
    media: c.media.map(m => (m.thumb ? { thumb: m.thumb, name: m.name || '' } : { swatch: m.swatch })),
    status, scheduledAt: when ? when.toISOString() : (now ? nowD.toISOString() : null), sentAt: now ? nowD.toISOString() : null,
    createdAt: c.createdAt || nowD.toISOString(), author: 'You', aiWritten: !!c.aiWritten, sample: false
  };
  if (c.editingSample) hideSample(c.editingId);
  Store.putPost(post);
  const chanNames = c.networks.map(n => C.getNetwork(n).name).join(', ');
  closeComposer(true);
  toast(status === 'draft' ? 'Saved to Drafts.' : status === 'approval' ? 'Sent for approval.' : status === 'sent' ? `Marked as published on ${chanNames}. Live publishing needs real channel connections.` : `Scheduled for ${fmtWhen(when)} on ${chanNames}.`);
}

/* ================================================================== */
/* Other AI features                                                   */
/* ================================================================== */
function workspaceSummary() {
  const r30 = rangeStats(30), r7 = rangeStats(7);
  const posts = allPosts();
  const brief = p => ({ channels: p.networks, text: firstText(p).slice(0, 220), at: p.scheduledAt || p.sentAt || null });
  return {
    today: new Date().toString().slice(0, 21),
    brand: S.ws.voice,
    connectedChannels: connectedNets(),
    postingSchedule: Object.fromEntries(S.ws.schedule.map((t, i) => [C.DAY_NAMES[i], t])),
    queue: posts.filter(p => effStatus(p) === 'scheduled').sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).slice(0, 12).map(brief),
    drafts: posts.filter(p => effStatus(p) === 'draft').slice(0, 8).map(brief),
    awaitingApproval: posts.filter(p => p.status === 'approval').map(brief),
    recentPublished: posts.filter(p => effStatus(p) === 'sent' && p.stats).map(p => ({ ...brief(p), reach: p.stats.reach, engagementRate: C.engagementRate(p.stats.interactions, p.stats.reach), clicks: p.stats.clicks })),
    last30Days: { reach: r30.reach, reachChangePct: C.pctChange(r30.reach, r30.reachP), engagementRatePct: r30.er, previousEngagementRatePct: r30.erP, newFollowers: r30.followers, linkClicks: r30.clicks },
    last7Days: { reach: r7.reach, reachChangePct: C.pctChange(r7.reach, r7.reachP), engagementRatePct: r7.er, newFollowers: r7.followers },
    reachShareByChannel: AN.shares,
    bestTimes: C.bestTimes(AN.heat, 5).map(b => `${C.DAY_NAMES[b.day]} ${C.pad2(b.hour)}:00`),
    openInbox: S.inbox.filter(c => c.status === 'open').map(c => ({ channel: c.net, kind: c.kind, from: c.name, sentiment: c.sentiment, text: c.msgs[c.msgs.length - 1].text })),
    trends: LISTEN.trends, competitors: LISTEN.competitors,
    mentionSentiment: C.sentimentShare(LISTEN.mentions),
    note: SERVER ? 'Analytics, inbox, listening, trends and competitors are sample preview data for a demo café until channels are connected. Say so if you use them.' : undefined
  };
}
async function aiBrief(kind) {
  if (S.aiBusy[kind]) return;
  S.aiBusy[kind] = true; S.aiOut[kind + 'Err'] = ''; render(true);
  const ws = workspaceSummary();
  const data = kind === 'analytics'
    ? { range: S.range + ' days', stats: rangeStats(S.range), reachShareByChannel: AN.shares, bestTimes: ws.bestTimes, topPosts: ws.recentPublished }
    : { keywords: S.ws.keywords, mentions: LISTEN.mentions, sentiment: ws.mentionSentiment, trends: LISTEN.trends, competitors: LISTEN.competitors };
  if (data.stats) ['reachS', 'reachPS', 'interactionsS', 'interactionsPS', 'followersS', 'followersPS', 'clicksS', 'clicksPS'].forEach(k => delete data.stats[k]);
  try {
    await AIX.brief(kind, data, { onText: ({ text }) => { S.aiOut[kind] = text; scheduleRender(); } });
  } catch (e) { S.aiOut[kind + 'Err'] = AI.handle(e); }
  finally { S.aiBusy[kind] = false; render(true); }
}
async function suggestReplies() {
  const c = S.inbox.find(x => x.id === S.convId);
  if (!c || S.replyBusy) return;
  S.replyBusy = true; S.replyErr = ''; render(true);
  try {
    const arr = await AIX.replies({ kind: c.kind, network: c.net, sentiment: c.sentiment, context: c.context || '', name: c.name, msgs: c.msgs.map(m => ({ me: !!m.me, text: m.text })) });
    S.replies[c.id] = (Array.isArray(arr) ? arr : []).filter(o => o && typeof o.text === 'string').slice(0, 3).map(o => ({ label: String(o.label || 'Reply'), text: o.text }));
    if (!S.replies[c.id].length) S.replyErr = 'No replies came back. Try again.';
  } catch (e) { S.replyErr = AI.handle(e); }
  finally { S.replyBusy = false; render(true); }
}
async function generateIdeas() {
  if (S.ideaBusy) return;
  S.ideaBusy = true; S.ideaErr = ''; render(true);
  try {
    const arr = await AIX.ideas(S.pillars, allIdeas().map(i => i.title));
    const list = (Array.isArray(arr) ? arr : []).filter(o => o && o.title).slice(0, 8);
    if (!list.length) S.ideaErr = 'No ideas came back. Try again.';
    for (const o of list) {
      await Store.putIdea({ id: uid('i'), col: 'ideas', title: String(o.title).slice(0, 120), note: String(o.note || '').slice(0, 300), pillar: String(o.pillar || '').slice(0, 40), format: ['post', 'carousel', 'video', 'thread'].includes(o.format) ? o.format : 'post', ai: true, createdAt: new Date().toISOString() });
    }
  } catch (e) { S.ideaErr = AI.handle(e); }
  finally { S.ideaBusy = false; render(true); }
}
async function chatSend(q) {
  q = String(q || '').trim();
  if (!q || S.chatBusy || !AI.ready) return;
  S.chat.push({ role: 'user', content: q });
  const bot = { role: 'assistant', content: '', tools: [] };
  S.chat.push(bot);
  S.chatBusy = true; S.chatErr = ''; S.chatCtl = new AbortController();
  render(true); scrollChat();
  const turns = S.chat.slice(0, -1).filter(m => m.content).slice(-10).map(m => ({ role: m.role, content: m.content }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  try {
    const res = await AIX.chat(turns, workspaceSummary(), {
      signal: S.chatCtl.signal,
      onText: ({ text }) => { bot.content = text; updateBotBubble(bot); },
      onDraft: p => { bot.tools.push(`Saved a draft for ${p.networks.map(id => C.getNetwork(id).name).join(', ')}`); updateBotBubble(bot); renderRail(); }
    });
    bot.content = res.text;
  } catch (e) {
    bot.content = e && e.text ? e.text : '';
    S.chatErr = AI.handle(e);
    if (!bot.content && !bot.tools.length) S.chat.splice(S.chat.indexOf(bot), 1);
  } finally {
    S.chatBusy = false; S.chatCtl = null;
    if (S.route === 'assistant') { render(true); scrollChat(); }
  }
}
function updateBotBubble(bot) {
  if (S.route !== 'assistant') return;
  const el = $(`.bubble[data-i="${S.chat.indexOf(bot)}"]`);
  if (!el) return;
  el.innerHTML = (bot.tools.length ? bot.tools.map(t => `<div class="tool">${ic('done', 'sm')} ${esc(t)}</div>`).join('') : '') + (bot.content ? `<div class="ai-out">${md(bot.content)}</div>` : thinking());
  scrollChat();
}
function scrollChat() { const l = $('#chat-log'); if (l) l.scrollTop = l.scrollHeight; }

/* ================================================================== */
/* Events                                                              */
/* ================================================================== */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}
const findPost = id => allPosts().find(p => p.id === id);
function updatePost(p, patch) {
  if (p.sample) { hideSample(p.id); Store.putPost({ ...p, ...patch, id: uid('p'), sample: false }); }
  else Store.putPost({ ...p, ...patch });
}

const ACT = {
  go: (el, e) => { e.preventDefault(); location.hash = el.dataset.to; if (location.hash.slice(1) === S.route) setRoute(el.dataset.to); },
  menu: () => { S.menuOpen = !S.menuOpen; $('#app').classList.toggle('menu-open', S.menuOpen); $('#scrim').hidden = !S.menuOpen; },
  'banner-off': () => { lsSet('socialistem.banner', 'off'); render(true); },
  logout: async () => { try { await api('POST', '/api/auth/logout', {}); } catch (e) { /* leave anyway */ } location.href = '/'; },
  'signout-others': async () => { try { await api('POST', '/api/account/signout-others', {}); S.acct = { msg: 'Signed out of every other device.', err: '' }; } catch (e) { S.acct = { msg: '', err: e.message || 'That did not work. Try again.' }; } render(true); },
  compose: el => openComposer({ at: el.dataset.at }),
  'hero-net': el => { const id = el.dataset.net; const cur = S.heroNets || defaultNets(); S.heroNets = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]; S.heroIdea = $('#hero-idea').value; render(true); },
  'hero-suggest': el => { const ta = $('#hero-idea'); ta.value = el.dataset.text; S.heroIdea = ta.value; ta.focus(); },
  'trend-draft': el => { const t = LISTEN.trends[+el.dataset.i]; openComposer({ idea: `A post that joins the "${t.topic}" conversation (${t.note}). Tie it to our menu and audience naturally; no forced trend-jacking.`, autogen: true }); },
  qtab: el => { S.queueTab = el.dataset.tab; S.confirm = null; if (S.route === 'approvals' && S.queueTab !== 'approvals') { location.hash = 'queue'; } else if (S.queueTab === 'approvals' && S.route !== 'approvals') { location.hash = 'approvals'; } else render(true); },
  filter: el => { S.filter = el.dataset.net; render(true); },
  'fill-slot': el => {
    const d = new Date(el.dataset.at);
    const idea = allIdeas().find(i => i.col === 'ready') || allIdeas().find(i => i.col === 'ideas');
    openComposer({ at: el.dataset.at, idea: idea ? `${idea.title}. ${idea.note || ''}` : `A timely post for ${C.DAY_NAMES[d.getDay()]} at ${C.fmtTime(d)} that fits our content mix and what our audience cares about this week.`, format: idea && idea.format, autogen: true });
  },
  edit: el => { const p = findPost(el.dataset.id); if (p) openComposer({ post: p }); },
  dup: el => { const p = findPost(el.dataset.id); if (p) openComposer({ post: p, dup: true }); },
  del: el => {
    const id = el.dataset.id;
    if (S.confirm !== 'del:' + id) { S.confirm = 'del:' + id; return render(true); }
    S.confirm = null;
    const p = findPost(id);
    if (p && p.sample) hideSample(id); else Store.delPost(id);
    render(true); toast('Post deleted.');
  },
  'share-now': el => { const p = findPost(el.dataset.id); if (!p) return; const n = new Date().toISOString(); updatePost(p, { status: 'sent', sentAt: n, scheduledAt: n }); render(true); toast('Marked as published. Live publishing needs real channel connections.'); },
  'to-queue': el => {
    const p = findPost(el.dataset.id); if (!p) return;
    const bad = p.networks.map(n => C.validatePost({ network: n, text: p.variants[n], mediaCount: (p.media || []).length }).find(i => i.level === 'error')).filter(Boolean);
    if (bad.length) { toast(`Fix this draft first: ${bad[0].message}`); return openComposer({ post: p }); }
    const at = nextFree(p.id); updatePost(p, { status: S.ws.requireApproval ? 'approval' : 'scheduled', scheduledAt: at.toISOString() }); render(true);
    toast(S.ws.requireApproval ? 'Sent for approval.' : `Scheduled for ${fmtWhen(at)}.`);
  },
  approve: el => { const p = findPost(el.dataset.id); if (!p) return; let at = p.scheduledAt ? new Date(p.scheduledAt) : null; if (!at || at <= new Date()) at = nextFree(p.id); updatePost(p, { status: 'scheduled', scheduledAt: at.toISOString() }); render(true); toast(`Approved and scheduled for ${fmtWhen(at)}.`); },
  changes: el => { const p = findPost(el.dataset.id); if (!p) return; updatePost(p, { status: 'draft' }); render(true); toast('Moved back to Drafts for changes.'); },
  cal: el => { const d = +el.dataset.d; if (!d) { const n = new Date(); S.cal = { y: n.getFullYear(), m: n.getMonth() }; } else { const n = new Date(S.cal.y, S.cal.m + d, 1); S.cal = { y: n.getFullYear(), m: n.getMonth() }; } render(true); },
  'cal-add': el => {
    const [y, m, d] = el.dataset.day.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    const now = new Date();
    const slot = C.slotsBetween(S.ws.schedule, day < now ? now : day, C.addDays(day, 1))[0];
    const at = slot || (C.dayKey(day) === C.dayKey(now) ? new Date(now.getTime() + 3600000) : new Date(y, m - 1, d, 9, 0));
    openComposer({ at: at.toISOString() });
  },
  'idea-move': el => {
    const i = allIdeas().find(x => x.id === el.dataset.id); if (!i) return;
    const cols = ['ideas', 'drafting', 'ready'];
    const col = cols[Math.max(0, Math.min(2, cols.indexOf(i.col || 'ideas') + +el.dataset.dir))];
    if (i.sample) { hideSample(i.id); Store.putIdea({ ...i, id: uid('i'), sample: false, col }); } else Store.putIdea({ ...i, col });
    render(true);
  },
  'idea-write': el => { const i = allIdeas().find(x => x.id === el.dataset.id); if (!i) return; openComposer({ idea: `${i.title}. ${i.note || ''}`, format: i.format, autogen: true }); },
  'idea-del': el => {
    const id = el.dataset.id;
    if (S.confirm !== 'idel:' + id) { S.confirm = 'idel:' + id; return render(true); }
    S.confirm = null;
    if (id.startsWith('s-')) hideSample(id); else Store.delIdea(id);
    render(true);
  },
  ifilter: el => { S.inboxFilter = el.dataset.f; render(true); },
  conv: el => { S.convId = el.dataset.id; S.inboxDetail = true; S.replyErr = ''; render(true); },
  'conv-back': () => { S.inboxDetail = false; render(true); },
  'conv-done': () => { const c = S.inbox.find(x => x.id === S.convId); if (!c) return; c.status = c.status === 'done' ? 'open' : 'done'; render(true); toast(c.status === 'done' ? 'Marked done.' : 'Reopened.'); },
  suggest: () => suggestReplies(),
  'use-reply': el => { const o = (S.replies[S.convId] || [])[+el.dataset.i]; if (!o) return; S.draftReply[S.convId] = o.text; const box = $('#reply-box'); box.value = o.text; box.focus(); },
  range: el => { S.range = +el.dataset.r; render(true); },
  'ai-brief': el => aiBrief(el.dataset.kind),
  'apply-best': () => {
    const best = C.bestTimes(AN.heat, 12);
    best.forEach(b => { const t = C.pad2(b.hour) + ':00'; S.ws.schedule[b.day] = C.normalizeTimes([...S.ws.schedule[b.day], t]); });
    Store.saveWs(); render(true); toast('Added your 12 best engagement hours to the posting schedule.');
  },
  'kw-del': el => { S.ws.keywords.splice(+el.dataset.i, 1); Store.saveWs(); render(true); },
  'chat-q': el => chatSend(el.dataset.q),
  'chat-stop': () => { if (S.chatCtl) S.chatCtl.abort(); },
  'chat-clear': () => { if (S.chatCtl) S.chatCtl.abort(); S.chat = []; S.chatErr = ''; render(true); },
  connect: el => { const id = el.dataset.net; S.ws.connected[id] = !S.ws.connected[id]; if (!connectedNets().length) S.ws.connected[id] = true; Store.saveWs(); render(true); },
  'time-del': el => { const d = +el.dataset.d; S.ws.schedule[d] = S.ws.schedule[d].filter(t => t !== el.dataset.t); Store.saveWs(); render(true); },
  'ws-toggle': el => { const k = el.dataset.k; S.ws[k] = !S.ws[k]; Store.saveWs(); render(true); },
  /* composer */
  'cmp-close': () => closeComposer(),
  'cmp-net': el => {
    const c = S.cmp, id = el.dataset.net;
    c.networks = c.networks.includes(id) ? c.networks.filter(n => n !== id) : C.NETWORKS.map(n => n.id).filter(n => n === id || c.networks.includes(n));
    if (!c.networks.includes(c.active)) c.active = c.networks[0] || null;
    c.confirmClose = false; renderComposer();
  },
  'cmp-tab': el => { S.cmp.active = el.dataset.net; renderComposer(); },
  'cmp-generate': () => cmpGenerate(),
  'cmp-stop': () => { if (S.cmp && S.cmp.ctl) S.cmp.ctl.abort(); },
  'cmp-enh': el => cmpEnhance(el.dataset.a),
  'cmp-undo': () => { const c = S.cmp; if (!c.undo) return; c.variants[c.undo.net] = c.undo.text; c.undo = null; renderComposer(); },
  'cmp-tags': () => cmpTags(),
  'cmp-addtag': el => { const c = S.cmp, id = c.active; const t = c.variants[id] || ''; c.variants[id] = (t.replace(/\s+$/, '') + (/(^|\s)#\S+$/.test(t.trim()) ? ' ' : '\n\n') + el.dataset.tag).trim(); c.tagSug[id] = (c.tagSug[id] || []).filter(x => x !== el.dataset.tag); c.dirty = true; renderComposer(); },
  'cmp-copyall': () => { const c = S.cmp, t = c.variants[c.active]; c.networks.forEach(n => { c.variants[n] = t; }); c.dirty = true; renderComposer(); toast('Copied to every selected channel. Check the limits on each tab.'); },
  'cmp-media-del': el => { S.cmp.media.splice(+el.dataset.i, 1); S.cmp.dirty = true; renderComposer(); },
  'cmp-when': el => { S.cmp.when = el.dataset.w; S.cmp.saveError = ''; renderComposer(); },
  'cmp-save': el => cmpSave(el.dataset.mode)
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  fn(el, e);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const kind = f.dataset.form;
  if (kind === 'hero') {
    const idea = $('#hero-idea').value.trim();
    S.heroIdea = idea; S.heroLang = $('#hero-lang').value;
    openComposer({ idea, networks: S.heroNets || defaultNets(), lang: S.heroLang, autogen: !!idea });
  } else if (kind === 'idea-add') {
    const title = $('#idea-title').value.trim(); if (!title) return;
    Store.putIdea({ id: uid('i'), col: 'ideas', title, note: $('#idea-note').value.trim(), pillar: '', format: '', createdAt: new Date().toISOString() });
    render(true); toast('Idea added.');
  } else if (kind === 'idea-gen') {
    S.pillars = $('#pillars').value.trim() || S.pillars; generateIdeas();
  } else if (kind === 'reply') {
    const box = $('#reply-box'); const text = box.value.trim(); if (!text) return;
    const c = S.inbox.find(x => x.id === S.convId);
    if (!c) return;
    c.msgs.push({ me: true, text, at: new Date() }); c.status = 'done'; S.draftReply[c.id] = ''; delete S.replies[c.id];
    render(true); toast('Reply sent and conversation marked done (demo).');
  } else if (kind === 'kw') {
    const v = $('#kw-in').value.trim(); if (!v) return;
    if (!S.ws.keywords.some(k => k.toLowerCase() === v.toLowerCase())) { S.ws.keywords.push(v); Store.saveWs(); }
    render(true); setTimeout(() => $('#kw-in') && $('#kw-in').focus(), 0);
  } else if (kind === 'profile' || kind === 'password' || kind === 'delete-account') {
    accountSubmit(kind);
  } else if (kind === 'chat') {
    const box = $('#chat-in'); const q = box.value; box.value = ''; chatSend(q);
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'hero-idea') S.heroIdea = t.value;
  else if (t.id === 'reply-box') S.draftReply[S.convId] = t.value;
  else if (t.dataset.cmpIn === 'idea' && S.cmp) { S.cmp.idea = t.value; S.cmp.dirty = true; S.cmp.confirmClose = false; }
  else if (t.dataset.cmpIn === 'variant' && S.cmp) { S.cmp.variants[S.cmp.active] = t.value; S.cmp.dirty = true; S.cmp.confirmClose = false; updateEditorMeta(); }
  else if (t.id === 'chat-in') { t.style.height = 'auto'; t.style.height = Math.min(180, t.scrollHeight) + 'px'; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.cmp && S.cmp) { S.cmp[t.dataset.cmp] = t.value; if (t.dataset.cmp !== 'customAt') renderComposer(); return; }
  if (t.dataset.cmpChk && S.cmp) { S.cmp[t.dataset.cmpChk] = t.checked; return; }
  if (t.matches('[data-cmp-file]') && S.cmp) { cmpFiles(t.files); return; }
  if (t.dataset.voice) { S.ws.voice[t.dataset.voice] = t.value.trim(); Store.saveWs(); return; }
  if (t.dataset.change === 'time-add') { const d = +t.dataset.d; if (t.value) { S.ws.schedule[d] = C.normalizeTimes([...S.ws.schedule[d], t.value]); Store.saveWs(); render(true); } return; }
  if (t.dataset.change === 'assign') { const c = S.inbox.find(x => x.id === S.convId); if (c) { c.assignee = t.value; toast(t.value ? `Assigned to ${t.value}.` : 'Unassigned.'); } return; }
  if (t.dataset.change === 'saved-reply') { if (t.value) { const box = $('#reply-box'); box.value = t.value; S.draftReply[S.convId] = t.value; box.focus(); } t.value = ''; }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (S.cmp) { if (S.cmp.busy && S.cmp.ctl) S.cmp.ctl.abort(); else closeComposer(); }
    else if (S.menuOpen) ACT.menu();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    if (e.target.id === 'cmp-idea') { e.preventDefault(); cmpGenerate(); }
    else if (e.target.id === 'hero-idea' || e.target.id === 'chat-in' || e.target.id === 'reply-box') { e.preventDefault(); e.target.form.requestSubmit(); }
  }
  if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'chat-in') { e.preventDefault(); e.target.form.requestSubmit(); }
});
document.addEventListener('focusout', () => { setTimeout(() => { if (S.dirty && !editingInView()) render(); }, 0); });
document.addEventListener('dragover', e => { if (S.cmp) e.preventDefault(); });
document.addEventListener('drop', e => { if (!S.cmp) return; e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) cmpFiles(e.dataTransfer.files); });
$('#scrim').addEventListener('click', () => ACT.menu());
window.addEventListener('hashchange', () => setRoute(location.hash.slice(1)));

/* Boot */
setRoute(location.hash.slice(1) || 'home');
if (SERVER) Store.init().then(() => { AI.init(); startFromLanding(); });
else { Store.init(); AI.init(); }
setInterval(() => { if (!S.cmp && !editingInView() && !S.chatBusy) render(); }, 60000);
})();
