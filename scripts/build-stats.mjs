// Builds the self-hosted stats card and repo cards into dist/.
// Runs daily from .github/workflows/profile.yml; needs GITHUB_TOKEN (or GH_TOKEN).
import { mkdirSync, writeFileSync } from 'node:fs';

const LOGIN = process.env.PROFILE_LOGIN || 'ArdaKaanOzturk';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const OUT = process.argv[2] || 'dist';

const FEATURED = {
  derwise_app: 'Study-partner app with video calls — Flutter + Firebase.',
  'react-native-jobs-search-app': 'Job search app built with React Native and Expo Router.',
  flutter_finance_app_ui: 'Personal finance app UI with charts and smooth animations.',
  'notes-app-with-react-native': 'Notes app with React Native — create, edit and organise notes.',
};

const LANG_COLORS = { Dart: '#00B4AB', JavaScript: '#f1e05a', TypeScript: '#3178c6', Swift: '#F05138', 'C++': '#f34b7d', Kotlin: '#A97BFF' };

const SANS = `'Segoe UI', Inter, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif`;
const MONO = `'JetBrains Mono', 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => n.toLocaleString('en-US');

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': LOGIN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function loadDays() {
  const { user } = await gql(`query($l:String!){user(login:$l){createdAt contributionsCollection{contributionYears}}}`, { l: LOGIN });
  const days = [];
  for (const year of user.contributionsCollection.contributionYears) {
    const data = await gql(
      `query($l:String!,$f:DateTime!,$t:DateTime!){user(login:$l){contributionsCollection(from:$f,to:$t){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`,
      { l: LOGIN, f: `${year}-01-01T00:00:00Z`, t: `${year}-12-31T23:59:59Z` },
    );
    for (const w of data.user.contributionsCollection.contributionCalendar.weeks) days.push(...w.contributionDays);
  }
  const today = new Date().toISOString().slice(0, 10);
  const map = new Map(days.filter((d) => d.date <= today).map((d) => [d.date, d.contributionCount]));
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, count]) => ({ date, count }));
}

function summarize(days) {
  const total = days.reduce((s, d) => s + d.count, 0);
  const year = new Date().getUTCFullYear();
  const thisYear = days.filter((d) => d.date.startsWith(String(year))).reduce((s, d) => s + d.count, 0);

  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--; // today may still be empty
  for (; i >= 0 && days[i].count > 0; i--) current++;

  const best = days.reduce((b, d) => (d.count > b.count ? d : b), { count: 0, date: '' });
  const activeDays = days.filter((d) => d.count > 0).length;

  const byWeekday = Array(7).fill(0);
  for (const d of days) byWeekday[new Date(`${d.date}T00:00:00Z`).getUTCDay()] += d.count;
  const topWeekday = byWeekday.indexOf(Math.max(...byWeekday));

  const now = new Date();
  const months = [];
  for (let k = 11; k >= 0; k--) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    const key = dt.toISOString().slice(0, 7);
    months.push({ label: MONTHS[dt.getUTCMonth()], key, count: days.filter((d) => d.date.startsWith(key)).reduce((s, d) => s + d.count, 0) });
  }
  return { total, thisYear, year, longest, current, best, activeDays, topWeekday, months };
}

function statsCard(s) {
  const W = 1200;
  const H = 330;
  const tiles = [
    ['Total contributions', fmt(s.total), 'all time', '#67e8f9'],
    [`Contributions in ${s.year}`, fmt(s.thisYear), 'so far this year', '#a78bfa'],
    ['Current streak', `${s.current}d`, s.current > 0 ? 'and counting' : 'starts today', '#f472b6'],
    ['Longest streak', `${s.longest}d`, 'consecutive days', '#fb923c'],
    ['Best day', fmt(s.best.count), s.best.date ? new Date(`${s.best.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—', '#a3e635'],
    ['Most active on', WEEKDAYS[s.topWeekday].slice(0, 3), `${fmt(s.activeDays)} active days`, '#38bdf8'],
  ];
  const tileW = 178;
  const tileH = 112;
  const gap = 14;
  const tx = 32;
  const ty = 82;
  const tileSvg = tiles
    .map(([label, value, sub, color], i) => {
      const x = tx + (i % 3) * (tileW + gap);
      const y = ty + Math.floor(i / 3) * (tileH + gap);
      return `  <g transform="translate(${x},${y})"><g class="tile" style="animation-delay:${0.1 + i * 0.08}s">
    <rect width="${tileW}" height="${tileH}" rx="14" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.08"/>
    <rect x="16" y="18" width="22" height="4" rx="2" fill="${color}"/>
    <text x="16" y="44" font-family="${SANS}" font-size="13" fill="#94a3b8">${esc(label)}</text>
    <text x="16" y="80" font-family="${SANS}" font-size="30" font-weight="800" fill="#f8fafc">${esc(value)}</text>
    <text x="16" y="99" font-family="${SANS}" font-size="12" fill="${color}" fill-opacity="0.85">${esc(sub)}</text>
  </g></g>`;
    })
    .join('\n');

  const cx = 640;
  const cw = W - cx - 32;
  const baseY = 270;
  const chartH = 150;
  const max = Math.max(1, ...s.months.map((m) => m.count));
  const slot = cw / s.months.length;
  const bw = slot * 0.56;
  const bars = s.months
    .map((m, i) => {
      const h = Math.max(3, (m.count / max) * chartH);
      const x = cx + i * slot + (slot - bw) / 2;
      const last = i === s.months.length - 1;
      return `  <g>
    <rect class="bar" style="animation-delay:${0.2 + i * 0.05}s" x="${x.toFixed(1)}" y="${(baseY - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="url(#barg)"${last ? ' opacity="0.65"' : ''}/>
    <text class="val" style="animation-delay:${0.7 + i * 0.05}s" x="${(x + bw / 2).toFixed(1)}" y="${(baseY - h - 8).toFixed(1)}" text-anchor="middle" font-family="${MONO}" font-size="11" fill="#cbd5e1">${m.count}</text>
    <text x="${(x + bw / 2).toFixed(1)}" y="${baseY + 22}" text-anchor="middle" font-family="${SANS}" font-size="12" fill="#64748b">${m.label}</text>
  </g>`;
    })
    .join('\n');

  const updated = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fmt(s.total)} total contributions, ${s.current}-day current streak, ${s.longest}-day longest streak">
  <title>GitHub activity of ${LOGIN}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#121b36"/></linearGradient>
    <linearGradient id="barg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="50"/></filter>
    <clipPath id="c"><rect width="${W}" height="${H}" rx="20"/></clipPath>
  </defs>
  <style>
    .tile { opacity: 0; animation: rise .8s cubic-bezier(.2,.8,.2,1) forwards; }
    @keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
    .bar { transform-box: fill-box; transform-origin: bottom; animation: grow 1s cubic-bezier(.2,.8,.2,1) both; }
    @keyframes grow { from { transform: scaleY(0); } }
    .val { opacity: 0; animation: fade .5s ease forwards; }
    @keyframes fade { to { opacity: 1; } }
    .live { transform-box: fill-box; transform-origin: center; animation: pulse 2s ease-out infinite; }
    @keyframes pulse { 0% { opacity: .7; transform: scale(1); } 100% { opacity: 0; transform: scale(2.6); } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } .tile, .val { opacity: 1; } }
  </style>
  <g clip-path="url(#c)">
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="${W - 120}" cy="20" r="140" fill="#7c3aed" opacity="0.28" filter="url(#blur)"/>
    <circle cx="80" cy="${H}" r="120" fill="#0891b2" opacity="0.25" filter="url(#blur)"/>
  </g>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20" fill="none" stroke="#ffffff" stroke-opacity="0.09"/>
  <text x="32" y="50" font-family="${SANS}" font-size="20" font-weight="800" fill="#f8fafc">Contribution activity</text>
  <circle cx="${W - 168}" cy="44" r="4" fill="#22c55e"/><circle class="live" cx="${W - 168}" cy="44" r="4" fill="#22c55e"/>
  <text x="${W - 32}" y="49" text-anchor="end" font-family="${SANS}" font-size="12" fill="#64748b">Updated ${updated}</text>
  <text x="${cx}" y="94" font-family="${SANS}" font-size="13" fill="#94a3b8">Last 12 months</text>
  <line x1="${cx}" y1="${baseY + 0.5}" x2="${W - 32}" y2="${baseY + 0.5}" stroke="#ffffff" stroke-opacity="0.08"/>
${tileSvg}
${bars}
</svg>
`;
}

async function repoCards() {
  const res = await fetch(`https://api.github.com/users/${LOGIN}/repos?per_page=100`, {
    headers: { Authorization: `bearer ${TOKEN}`, 'User-Agent': LOGIN },
  });
  const repos = await res.json();
  const cards = {};
  for (const [name, fallback] of Object.entries(FEATURED)) {
    const r = repos.find((x) => x.name === name);
    if (!r) continue;
    const lang = r.language || 'Dart';
    const desc = r.description || fallback;
    const words = desc.split(' ');
    const lines = [''];
    for (const w of words) {
      if ((lines[lines.length - 1] + ' ' + w).trim().length > 62) lines.push(w);
      else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
    }
    const color = LANG_COLORS[lang] || '#94a3b8';
    cards[name] = `<svg xmlns="http://www.w3.org/2000/svg" width="580" height="150" viewBox="0 0 580 150" role="img" aria-label="${esc(r.name)}: ${esc(desc)}">
  <title>${esc(r.name)}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#121b36"/></linearGradient>
  </defs>
  <style>
    .in { opacity: 0; animation: rise .8s cubic-bezier(.2,.8,.2,1) forwards .1s; }
    @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } .in { opacity: 1; } }
  </style>
  <rect x="0.5" y="0.5" width="579" height="149" rx="16" fill="url(#bg)" stroke="#ffffff" stroke-opacity="0.09"/>
  <rect x="0" y="22" width="4" height="34" rx="2" fill="${color}"/>
  <g class="in">
    <path transform="translate(26,26) scale(1.1)" fill="#94a3b8" d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>
    <text x="52" y="42" font-family="${SANS}" font-size="18" font-weight="700" fill="#f8fafc">${esc(r.name)}</text>
${lines.slice(0, 2).map((l, i) => `    <text x="26" y="${76 + i * 21}" font-family="${SANS}" font-size="14" fill="#cbd5e1">${esc(l)}</text>`).join('\n')}
    <circle cx="32" cy="124" r="6" fill="${color}"/>
    <text x="44" y="129" font-family="${SANS}" font-size="13" fill="#94a3b8">${esc(lang)}</text>
    <path transform="translate(${60 + lang.length * 7.5},117) scale(.9)" fill="#94a3b8" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
    <text x="${80 + lang.length * 7.5}" y="129" font-family="${SANS}" font-size="13" fill="#94a3b8">${r.stargazers_count}</text>
    <text x="554" y="129" text-anchor="end" font-family="${SANS}" font-size="13" font-weight="600" fill="#67e8f9">View repository →</text>
  </g>
</svg>
`;
  }
  return cards;
}

if (!TOKEN) throw new Error('GITHUB_TOKEN is required');
mkdirSync(OUT, { recursive: true });
const summary = summarize(await loadDays());
writeFileSync(`${OUT}/stats.svg`, statsCard(summary));
for (const [name, svg] of Object.entries(await repoCards())) writeFileSync(`${OUT}/repo-${name}.svg`, svg);
console.log(JSON.stringify({ ...summary, months: summary.months.map((m) => `${m.key}:${m.count}`).join(' ') }));
