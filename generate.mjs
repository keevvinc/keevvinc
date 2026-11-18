// Builds dark_mode.svg and light_mode.svg for the GitHub profile README.
// No dependencies: Node 20+. Data comes from the public contribution calendar,
// which counts private-repo work when "Include private contributions" is on.
//   node generate.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CONFIG = {
  user: "keevvinc",
  name: "Kevin",
  joined: "2015-11-13", // GitHub sign-up date (fixed, so no API call)
  intro: [
    "Software developer from Slovakia. Most of my work lives",
    "in private repos, but the door's open. Say hi.",
  ],
  rows: [
    ["based in", "Slovakia, EU"],
    ["by day", "software developer"],
    ["by evening", "building a real-time dungeon crawler"],
    ["into", "game dev, clean UI, good tooling"],
    ["joined GitHub", "{since} · {years} years and counting"],
  ],
};

// ---------------------------------------------------------------- data
async function fetchData() {
  const ua = { "User-Agent": "profile-card-generator" };
  const html = await (await fetch(`https://github.com/users/${CONFIG.user}/contributions`, { headers: ua })).text();
  const cells = new Map();
  const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  for (const [tag] of html.matchAll(/<td\b[^>]*>/g)) {
    const date = attr(tag, "data-date"), id = attr(tag, "id"), level = attr(tag, "data-level");
    const pos = id?.match(/^contribution-day-component-(\d+)-(\d+)$/);
    if (date && pos && level) cells.set(id, { date, row: +pos[1], col: +pos[2], level: +level, count: 0 });
  }
  for (const m of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const c = cells.get(m[1]);
    const n = m[2].match(/^([\d,]+) contribution/);
    if (c) c.count = n ? +n[1].replace(/,/g, "") : 0;
  }
  const days = [...cells.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (days.length < 300) throw new Error(`calendar parse failed (${days.length} cells)`);
  // Coloured squares but no counts means the tooltip format changed: fail rather than publish zeros.
  if (days.some((d) => d.level) && !days.some((d) => d.count)) throw new Error("tooltip parse failed: no counts");
  return { days, generatedAt: new Date().toISOString() };
}

function stats(data) {
  const d = data.days;
  const total = d.reduce((s, x) => s + x.count, 0);
  const last30 = d.slice(-30).reduce((s, x) => s + x.count, 0);
  const best = d.reduce((a, x) => (x.count > a.count ? x : a), d[0]);
  let longest = 0, run = 0;
  for (const x of d) { run = x.count ? run + 1 : 0; longest = Math.max(longest, run); }
  const active = d.filter((x) => x.count).length;
  const wd = Array(7).fill(0);
  for (const x of d) wd[new Date(`${x.date}T12:00:00Z`).getUTCDay()] += x.count;
  const peak = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][wd.indexOf(Math.max(...wd))];
  const now = new Date(data.generatedAt);
  const created = new Date(`${CONFIG.joined}T00:00:00Z`);
  const years = Math.floor((now - created) / (365.25 * 864e5));
  return { total, last30, best, longest, active, peak, years, since: created.getUTCFullYear() };
}

// ---------------------------------------------------------------- render
const THEMES = {
  dark: {
    bg: "#0d1117", panel: "#161b22", border: "#30363d", text: "#e6edf3", muted: "#7d8590", dim: "#3d444d",
    key: "#ffa657", accent1: "#ff6a3d", accent2: "#ffd166", ok: "#3fb950",
    heat: ["#1b2129", "#4a1f12", "#8c3415", "#e2581d", "#ffa040"], glow: "#ffd166",
  },
  light: {
    bg: "#ffffff", panel: "#f6f8fa", border: "#d0d7de", text: "#1f2328", muted: "#656d76", dim: "#c3cad2",
    key: "#bc4c00", accent1: "#d9480f", accent2: "#e8a317", ok: "#1a7f37",
    heat: ["#eef1f4", "#ffd8b5", "#fdac6c", "#f0762c", "#c2410c"], glow: "#e8a317",
  },
};
const ODO_SIZE = 24; // stat number size; the spin keyframes are generated for it
const MONO = `ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => n.toLocaleString("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso) => `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;

// Rolling-digit counter: each digit is a 0..9 strip that scrolls into place.
function odometer(value, x, y, size, color, delay, id) {
  const s = fmt(value), cw = size * 0.62, lh = size * 1.15;
  let out = `<g clip-path="url(#${id})">`, cx = x;
  [...s].forEach((ch, i) => {
    if (!/\d/.test(ch)) { out += `<text x="${cx}" y="${y}" fill="${color}" font-size="${size}" font-weight="700">${ch}</text>`; cx += cw; return; }
    const d = +ch, spins = 10 + d; // spin through one full turn before landing
    let strip = "";
    for (let k = 0; k <= spins; k++) strip += `<tspan x="${cx}" y="${y - (spins - k) * lh}">${k % 10}</tspan>`;
    out += `<text class="odo" style="animation-name:spin${spins};animation-delay:${(delay + i * 0.09).toFixed(2)}s" fill="${color}" font-size="${size}" font-weight="700">${strip}</text>`;
    cx += cw;
  });
  return { svg: `${out}</g>`, clip: `<clipPath id="${id}"><rect x="${x - 2}" y="${y - size}" width="${cx - x + 4}" height="${lh}"/></clipPath>`, width: cx - x };
}

function render(data, avatars, theme) {
  const t = THEMES[theme], st = stats(data);
  const W = 1000, H = 712;
  const defs = [], body = [];

  // window chrome
  body.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${t.bg}" stroke="${t.border}"/>`);
  body.push(`<path d="M0.5 36 V14.5 a14 14 0 0 1 14 -14 H${W - 14.5} a14 14 0 0 1 14 14 V36 Z" fill="${t.panel}"/><line x1="0" y1="36" x2="${W}" y2="36" stroke="${t.border}"/>`);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => body.push(`<circle cx="${22 + i * 20}" cy="18" r="6" fill="${c}"/>`));
  body.push(`<text x="${W / 2}" y="23" text-anchor="middle" fill="${t.muted}" font-size="13">${CONFIG.user} — ~</text>`);

  // portrait (left): avatar_*.jpg are the GitHub avatar with the ember duotone + scanlines baked in once
  // (not done here, to keep the image cheap to animate); re-bake them when the profile photo changes.
  const cx = 205, cy = 268, r = 138;
  defs.push(`<clipPath id="face"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`);
  defs.push(`<radialGradient id="halo"><stop offset="0.6" stop-color="${t.accent1}" stop-opacity="0.35"/><stop offset="1" stop-color="${t.accent1}" stop-opacity="0"/></radialGradient>`);
  defs.push(`<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.accent2}"/><stop offset="1" stop-color="${t.accent1}"/></linearGradient>`);
  defs.push(`<path id="orbit" d="M ${cx - r - 22} ${cy} a ${r + 22} ${r + 22} 0 1 1 ${2 * (r + 22)} 0 a ${r + 22} ${r + 22} 0 1 1 ${-2 * (r + 22)} 0"/>`);
  body.push(`<circle class="breathe" cx="${cx}" cy="${cy}" r="${r + 44}" fill="url(#halo)"/>`);
  body.push(`<g class="art"><g clip-path="url(#face)"><image href="data:image/jpeg;base64,${avatars[theme]}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" preserveAspectRatio="xMidYMid slice"/>`);
  body.push(`<rect class="scan" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="3" fill="${t.accent2}"/></g>`);
  body.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#ring)" stroke-width="2.5"/></g>`);
  body.push(`<g class="motto"><circle class="ring" cx="${cx}" cy="${cy}" r="${r + 10}" fill="none" stroke="${t.dim}" stroke-dasharray="2 6"/>`);
  // Each word is placed at its own offset (centred), so it spreads evenly in every browser and font.
  const words = Array(4).fill(["CODE", "·", "SHIP", "·", "REPEAT", "·"]).flat();
  const weight = (w) => w.length + 2.2, sum = words.reduce((a, w) => a + weight(w), 0);
  let acc = 0, motto = "";
  for (const w of words) {
    const mid = ((acc + weight(w) / 2) / sum) * 100;
    acc += weight(w);
    motto += `<textPath href="#orbit" startOffset="${mid.toFixed(2)}%" text-anchor="middle">${esc(w)}</textPath>`;
  }
  body.push(`<text font-size="13" font-weight="700" letter-spacing="2" fill="${t.key}">${motto}</text></g>`);

  // intro + about rows (right)
  const rx = 412;
  body.push(`<text x="${rx}" y="70" font-size="14"><tspan fill="${t.ok}">➜</tspan><tspan fill="${t.accent2}" dx="8">~</tspan></text>`);
  defs.push(`<clipPath id="typed"><rect class="typer" x="${rx + 36}" y="56" width="60" height="20"/></clipPath>`);
  body.push(`<text x="${rx + 36}" y="70" font-size="14" fill="${t.text}" clip-path="url(#typed)">whoami</text>`);
  body.push(`<rect class="cursor" x="${rx + 36}" y="58" width="8" height="15" fill="${t.text}"/>`);

  body.push(`<g class="in" style="animation-delay:.95s"><text x="${rx}" y="112" font-size="28" font-weight="800" fill="${t.text}">Hey, I'm <tspan fill="url(#name)">${esc(CONFIG.name)}</tspan>.</text>`);
  CONFIG.intro.forEach((l, i) => body.push(`<text x="${rx}" y="${142 + i * 21}" font-size="14" fill="${t.muted}">${esc(l)}</text>`));
  body.push(`<line x1="${rx}" y1="180" x2="${W - 28}" y2="180" stroke="${t.border}" stroke-dasharray="2 4"/></g>`);
  defs.push(`<linearGradient id="name" x1="0" x2="1"><stop offset="0" stop-color="${t.accent1}"/><stop offset="1" stop-color="${t.accent2}"/></linearGradient>`);

  const vals = { years: st.years, since: st.since };
  CONFIG.rows.forEach(([k, v], i) => {
    const y = 207 + i * 23, value = v.replace(/\{(\w+)\}/g, (_, n) => vals[n]);
    const vx = rx + 132;
    let row = `<g class="in" style="animation-delay:${(1.15 + i * 0.08).toFixed(2)}s" font-size="14">`;
    row += `<text x="${rx}" y="${y}" fill="${t.key}" font-weight="700">${esc(k)}</text>`;
    row += `<line x1="${rx + k.length * 8.6 + 8}" y1="${y - 4}" x2="${vx - 10}" y2="${y - 4}" stroke="${t.dim}" stroke-dasharray="1 4" stroke-linecap="round"/>`;
    row += `<text x="${vx}" y="${y}" fill="${t.text}" xml:space="preserve">${esc(value)}</text>`;
    body.push(`${row}</g>`);
  });

  // stats panel: one soft card, 3×2 grid split by hairlines
  const stats6 = [
    [st.total, "", "in the past year"],
    [st.last30, "", "in the past 30 days"],
    [st.best.count, "", st.best.count ? `best day · ${shortDate(st.best.date)}` : "best day"],
    [st.longest, "days", "longest streak"],
    [st.active, "days", "active, past year"],
    [null, st.total ? st.peak : "—", "most productive day"],
  ];
  const px = rx, py = 328, pw = W - 28 - rx, ph = 144, cwid = pw / 3, rh = ph / 2;
  defs.push(`<linearGradient id="tint" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.accent1}" stop-opacity="${theme === "dark" ? 0.13 : 0.08}"/><stop offset="0.55" stop-color="${t.accent1}" stop-opacity="0"/></linearGradient>`);
  defs.push(`<linearGradient id="sheen" x1="0" x2="1"><stop offset="0" stop-color="${t.accent2}" stop-opacity="0"/><stop offset="0.5" stop-color="${t.accent2}" stop-opacity="${theme === "dark" ? 0.12 : 0.18}"/><stop offset="1" stop-color="${t.accent2}" stop-opacity="0"/></linearGradient>`);
  defs.push(`<clipPath id="panel"><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="14"/></clipPath>`);
  body.push(`<g class="in" style="animation-delay:1.6s"><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="14" fill="${t.panel}"/><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="14" fill="url(#tint)"/>`);
  body.push(`<g clip-path="url(#panel)"><rect class="sheen" x="${px - 160}" y="${py}" width="160" height="${ph}" fill="url(#sheen)"/></g>`);
  for (const c of [1, 2]) body.push(`<line x1="${px + c * cwid}" y1="${py + 18}" x2="${px + c * cwid}" y2="${py + ph - 18}" stroke="${t.border}" stroke-opacity="0.7"/>`);
  body.push(`<line x1="${px + 20}" y1="${py + rh}" x2="${px + pw - 20}" y2="${py + rh}" stroke="${t.border}" stroke-opacity="0.7"/></g>`);
  stats6.forEach(([n, unit, label], i) => {
    const x = px + (i % 3) * cwid + 20, y = py + Math.floor(i / 3) * rh, delay = 1.8 + i * 0.1;
    let g = `<g class="in" style="animation-delay:${delay.toFixed(2)}s">`;
    if (n === null) {
      g += `<text x="${x}" y="${y + 38}" fill="${t.text}" font-size="${ODO_SIZE}" font-weight="800">${esc(unit)}</text>`;
    } else {
      const o = odometer(n, x, y + 38, ODO_SIZE, t.text, delay + 0.1, `odo${i}`);
      defs.push(o.clip);
      g += o.svg;
      if (unit) g += `<text x="${x + o.width + 6}" y="${y + 38}" fill="${t.muted}" font-size="14">${esc(unit)}</text>`;
    }
    g += `<circle cx="${x + 3}" cy="${y + 54}" r="2.5" fill="url(#bar)"/><text x="${x + 11}" y="${y + 59}" fill="${t.muted}" font-size="13">${esc(label)}</text>`;
    body.push(`${g}</g>`);
  });
  defs.push(`<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent2}"/><stop offset="1" stop-color="${t.accent1}"/></linearGradient>`);

  // heatmap (bottom)
  const hy = 528, cs = 13, gap = 3, step = cs + gap;
  const ncol = Math.max(...data.days.map((d) => d.col)) + 1;
  const hx = Math.round((W - (30 + ncol * step)) / 2) + 30;
  const labels = [];
  for (const d of data.days) {
    const m = +d.date.slice(5, 7) - 1;
    if (d.row === 0 && d.col < ncol - 1 && m !== labels.at(-1)?.m) labels.push({ col: d.col, m });
  }
  if (labels[1]?.col - labels[0].col < 3) labels.shift(); // first month too short to fit its name, as on GitHub
  for (const { col, m } of labels) body.push(`<text class="in" style="animation-delay:2.3s" x="${hx + col * step}" y="${hy - 4}" fill="${t.muted}" font-size="13">${MONTHS[m]}</text>`);
  ["Mon", "Wed", "Fri"].forEach((n, i) => body.push(`<text class="in" style="animation-delay:2.3s" x="${hx - 8}" y="${hy + 10 + (1 + i * 2) * step + 10}" text-anchor="end" fill="${t.muted}" font-size="13">${n}</text>`));
  for (const d of data.days) {
    const x = hx + d.col * step, y = hy + 6 + d.row * step, isBest = d === st.best;
    const t0 = 2.4 + d.col * 0.022 + d.row * 0.012, cellDelay = `animation-delay:${t0.toFixed(3)}s`;
    body.push(`<rect class="cell" style="${cellDelay}" x="${x}" y="${y}" width="${cs}" height="${cs}" rx="3" fill="${t.heat[d.level]}"></rect>`);
    if (isBest && d.count) {
      defs.push(`<radialGradient id="glow"><stop offset="0.35" stop-color="${t.glow}" stop-opacity="0.9"/><stop offset="1" stop-color="${t.glow}" stop-opacity="0"/></radialGradient>`);
      body.push(`<circle class="glow" style="animation-delay:${(t0 + 0.25).toFixed(2)}s,${(t0 + 0.7).toFixed(2)}s" cx="${x + cs / 2}" cy="${y + cs / 2}" r="${cs * 1.1}" fill="url(#glow)"/>`);
      body.push(`<rect class="cell" style="${cellDelay}" x="${x}" y="${y}" width="${cs}" height="${cs}" rx="3" fill="${t.glow}"/>`);
    }
  }
  const fy = hy + 6 + 7 * step + 28;
  const lx = hx + ncol * step - 5 * step - 34;
  body.push(`<g class="in" style="animation-delay:3.6s"><text x="${lx - 8}" y="${fy}" text-anchor="end" font-size="13" fill="${t.muted}">less</text>`);
  t.heat.forEach((c, i) => body.push(`<rect x="${lx + i * step}" y="${fy - 11}" width="${cs}" height="${cs}" rx="3" fill="${c}"/>`));
  body.push(`<text x="${lx + 5 * step + 4}" y="${fy}" font-size="13" fill="${t.muted}">more</text></g>`);
  body.push(`<text class="in" style="animation-delay:3.6s" x="${W - 28}" y="${H - 14}" text-anchor="end" font-size="12" fill="${t.muted}" opacity="0.7">updated ${data.generatedAt.slice(0, 10)}</text>`);

  const css = `
text,tspan{white-space:pre}
.art{animation:zoom .9s cubic-bezier(.2,.8,.2,1) .1s both;transform-box:fill-box;transform-origin:center}
/* every loop is finite and ends on its resting frame: once settled the image stops repainting */
.motto{animation:fade 1s .6s both}
.ring{transform-origin:${cx}px ${cy}px;animation:rot 30s linear .6s}
.breathe{animation:halo 4s ease-in-out 4}
.in{animation:rise .55s cubic-bezier(.2,.8,.2,1) both}
.cell{transform-box:fill-box;transform-origin:center;animation:pop .45s cubic-bezier(.3,1.6,.5,1) both}
.odo{animation-duration:1.5s;animation-timing-function:cubic-bezier(.15,.75,.2,1);animation-fill-mode:both}
.typer{animation:type .6s steps(6,end) .35s both}
.cursor{animation:move .6s steps(6,end) .35s both,blink 1s step-end 1.2s 12}
.scan{opacity:0;animation:scan 4.5s linear 1s 3}
.sheen{animation:sweep 1.6s ease-in-out 2.6s both}
.glow{opacity:.55;transform-box:fill-box;transform-origin:center;animation:pop .45s both,breathe 2.2s ease-in-out 6}
@keyframes fade{from{opacity:0}}
@keyframes sweep{from{transform:translateX(0)}to{transform:translateX(${pw + 160}px)}}
@keyframes zoom{from{opacity:0;transform:scale(.85)}}
@keyframes rot{to{transform:rotate(360deg)}}
@keyframes halo{50%{opacity:.55}}
@keyframes rise{from{opacity:0;transform:translateY(6px)}}
@keyframes pop{from{opacity:0;transform:scale(0)}}
${Array.from({ length: 10 }, (_, d) => `@keyframes spin${10 + d}{from{transform:translateY(${((10 + d) * ODO_SIZE * 1.15).toFixed(1)}px)}}`).join("\n")}
@keyframes type{from{width:0}}
@keyframes move{from{transform:translateX(0)}to{transform:translateX(54px)}}
@keyframes blink{50%{opacity:0}}
@keyframes scan{0%{opacity:0;transform:translateY(0)}5%{opacity:.35}95%{opacity:.35}100%{opacity:0;transform:translateY(${2 * r}px)}}
@keyframes breathe{50%{opacity:1}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.cursor{transform:translateX(54px)}}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${MONO}" role="img" aria-labelledby="ttl">
<title id="ttl">${CONFIG.name} (${CONFIG.user}) — ${fmt(st.total)} contributions in the last year, mostly in private repositories</title>
<style>${css}</style>
<defs>${defs.join("")}</defs>
${body.join("\n")}
</svg>
`;
}

// ---------------------------------------------------------------- main
const data = await fetchData();
const avatars = Object.fromEntries(["dark", "light"].map((th) => [th, readFileSync(join(here, `avatar_${th}.jpg`)).toString("base64")]));
for (const theme of ["dark", "light"]) writeFileSync(join(here, `${theme}_mode.svg`), render(data, avatars, theme));
const s = stats(data);
console.log(`ok: ${s.total} contributions, best ${s.best.count} on ${s.best.date}, longest streak ${s.longest}`);
