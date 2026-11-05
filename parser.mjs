// БОТ БАЛІСТИКИ: розбір новин DIMAP (укр + рос, з помилками і змішаними розкладками).
// Подія: { kind:'ballistic', status:'launch'|'threat', key, region, regionId, missiles[] }

export const BOT_NAME = 'Балістика';

// ── Регіони (id збігаються з червоними квадратами на карті) ──
const REGIONS = [
  { id: 'kursk',     name: 'Курська область',       re: /курськ|курск/u },
  { id: 'bryansk',   name: 'Брянська область',      re: /брянськ|брянск|брянщин/u },
  { id: 'voronezh',  name: 'Воронезька область',    re: /воронеж/u },
  { id: 'belgorod',  name: 'Бєлгородська область',  re: /[бб][єе]лгород/u },
  { id: 'taganrog',  name: 'Ростовська область (Таганрог)', re: /таганрог/u },   // до загального «Ростов»
  { id: 'taganrog',  name: 'Ростовська область',    re: /ростов/u },
  { id: 'krasnodar', name: 'Краснодарський край',   re: /краснодар|[єе][йи]ськ|ейск|ахтарськ|ахтарск/u },
  { id: 'astrakhan', name: 'Астраханська область (Капустін Яр)', re: /астрахан|капуст[іи]н/u },
  { id: 'crimea',    name: 'Крим',                  re: /(?:^|[^\p{L}])крим|(?:^|[^\p{L}])крым/u },
  { id: 'smolensk',  name: 'Смоленська область',    re: /смоленськ|смоленск|шатал/u },
  { id: 'oryol',     name: 'Орловська область',     re: /орловськ|орловск|(?:^|[^\p{L}])орл|(?:^|[^\p{L}])орел|цимбулов/u },
  { id: 'donetsk',   name: 'Донеччина (окупована)', re: /донецьк|донецк/u },
];

const MISSILES = [
  ['Іскандер-М', /[іиi]скандер-?\s?м|[іиi]скандер/u],
  ['КН-23',      /[kк][нh]-?23/u],
  ['С-300',      /[cс]-?300/u],
  ['С-400',      /[cс]-?400/u],
  ['Кинджал',    /кинджал|кинжал/u],
  ['Циркон',     /циркон/u],
];

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[’`ʼ]/g, "'");

export function parseNews(rawText) {
  const text = String(rawText || '');
  const events = [];
  const clauses = text.split(/⚠️+|\n|\+|(?<=[.!?])\s+/u).map(s => s.trim()).filter(Boolean);
  for (const clause of clauses) {
    const t = norm(clause);
    const isThreat = /можлив|загроз|угроз/u.test(t);
    const isLaunch = /(?:відбул\p{L}*|зафіксов\p{L}*|зафиксир\p{L}*)\s+пуск|(?:^|[^\p{L}])пуски/u.test(t);
    const ball = /баліст|баллист|[іиi]скандер|[kк][нh]-?23|[cс]-?300|[cс]-?400|кинджал|кинжал|циркон/u.test(t);
    const drone = /бпла|шахед|shahed|герань|geran|дрон/u.test(t);
    if (!(isThreat || isLaunch) || !ball || drone) continue;        // клауз про БпЛА — справа іншого бота

    const missiles = MISSILES.filter(([, re]) => re.test(t)).map(([n]) => n);
    // регіон беремо після «з/із/с/из» — щоб «типу С-300» не плутати з місцем
    const after = /(?:^|\s)(?:з|із|с|со|из)\s+([^.!?,;()«»]+)/u.exec(t);
    const where = after ? after[1] : '';
    // «з Брянська та Курська» → по події на кожен регіон
    const ros = [];
    for (const r of REGIONS) if (r.re.test(where) && !ros.some(x => x.id === r.id)) ros.push(r);
    const status = (isLaunch && !isThreat) ? 'launch' : 'threat';
    if (!ros.length) events.push({ kind: 'ballistic', status, region: null, regionId: null, missiles });
    else for (const ro of ros) events.push({ kind: 'ballistic', status, region: ro.name, regionId: ro.id, missiles });
  }
  return events;
}

// ── Злиття (максимум ракет, «загальна» тривога без місця зникає, якщо є з регіоном) ──
export function mergeEvents(list) {
  const m = new Map();
  for (const e of list) {
    const key = `bal|${e.status}|${e.region || 'any'}`;
    const o = m.get(key);
    if (!o) { m.set(key, { ...e, key }); continue; }
    if (e.missiles) o.missiles = [...new Set([...(o.missiles || []), ...e.missiles])];
  }
  const out = [...m.values()];
  const located = out.filter(e => e.status === 'threat' && e.region);
  const generic = out.filter(e => e.status === 'threat' && !e.region);
  if (located.length && generic.length) {
    const mis = [...new Set(generic.flatMap(g => g.missiles || []))];
    located.forEach(e => { e.missiles = [...new Set([...(e.missiles || []), ...mis])]; });
    return out.filter(e => !generic.includes(e));
  }
  return out;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function formatEvents(events, footerHtml) {
  const blocks = [];
  for (const status of ['launch', 'threat']) {
    const bs = events.filter(e => e.status === status);
    if (!bs.length) continue;
    const head = status === 'launch' ? '🚀 Пуски балістики' : '🚨 Загроза застосування балістики';
    const lines = bs.map(b => {
      const mis = b.missiles && b.missiles.length ? b.missiles.join(' / ') : '';
      return '📍 ' + esc(b.region || 'місце не уточнено') + (mis ? ' — ' + esc(mis) : '');
    });
    blocks.push(head + '\n' + lines.join('\n'));
  }
  return blocks.length ? blocks.join('\n\n') + (footerHtml ? '\n\n' + footerHtml : '') : '';
}

// ── Що з новин варто публікувати зараз ──
// raw: [{ id, date, text }]; state.sent: { [key]: { t, g } }
const TTL_MIN = { launch: 45, threat: 60 };
export function pickNewEvents(raw, state, now, { maxAgeMin = 20 } = {}) {
  const sent = (state && state.sent) || {};
  const stats = { total: raw.length, fresh: 0, noDate: 0, parsed: 0 };
  const events = [];
  for (const n of raw) {
    const ts = Date.parse(n.date);
    if (!isFinite(ts)) { stats.noDate++; continue; }
    if (now - ts > maxAgeMin * 60000 || ts - now > 10 * 60000) continue;
    stats.fresh++;
    const ev = parseNews(n.text);
    stats.parsed += ev.length;
    events.push(...ev);
  }
  const merged = mergeEvents(events);
  const out = [], stamps = [];
  for (const e of merged) {
    const prev = sent[e.key];
    if (prev && now - prev.t <= TTL_MIN[e.status] * 60000) continue;   // уже публікували нещодавно
    out.push(e);
    stamps.push([e.key, { t: now, g: 0 }]);
  }
  return { events: out, stamps, stats };
}
