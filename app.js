"use strict";

/* Envoi des retours : colle ici l'URL d'un formulaire Formspree (https://formspree.io/f/xxxx).
   Laissé vide, les retours passent par la feuille de partage iOS. */
const FEEDBACK_ENDPOINT = "";

const STORE_KEY = "cycle.v1";
const DAY = 86400000;

/* ---------- Dates (en jours locaux, format AAAA-MM-JJ) ---------- */
const pad = n => String(n).padStart(2, "0");
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const todayISO = () => toISO(new Date());
const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const diffDays = (a, b) => Math.round((fromISO(b) - fromISO(a)) / DAY); // b - a
const fmtLong = iso => fromISO(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = iso => fromISO(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

/* ---------- Stockage ---------- */
const defaults = () => ({
  settings: { cycleLen: 28, periodLen: 5, pmsDays: 7, showEntourage: true },
  periods: [],
  feedback: [],
  lastExport: null,
});
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaults();
    const s = JSON.parse(raw);
    const d = defaults();
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  } catch { return defaults(); }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { toast("Impossible d'enregistrer sur ce téléphone"); }
  if (typeof schedulePushSync === "function") schedulePushSync();
}

/* ---------- Calcul du cycle ---------- */
function sortedPeriods() {
  return [...state.periods].sort((a, b) => a.start.localeCompare(b.start));
}
function cycleStats() {
  const ps = sortedPeriods();
  const gaps = [];
  for (let i = 1; i < ps.length; i++) {
    const g = diffDays(ps[i - 1].start, ps[i].start);
    if (g >= 15 && g <= 60) gaps.push(g);
  }
  const recent = gaps.slice(-6);
  const cycleLen = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : state.settings.cycleLen;
  const durations = ps.filter(p => p.end).map(p => diffDays(p.start, p.end) + 1).filter(d => d >= 1 && d <= 12).slice(-6);
  const periodLen = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : state.settings.periodLen;
  const spread = recent.length >= 2 ? Math.max(...recent) - Math.min(...recent) : 0;
  return { cycleLen, periodLen, spread, min: recent.length ? Math.min(...recent) : cycleLen, max: recent.length ? Math.max(...recent) : cycleLen };
}
// Fin effective d'une période (gère les règles en cours sans date de fin)
function periodEnd(p, periodLen) {
  if (p.end) return p.end;
  const t = todayISO();
  const auto = addDays(p.start, periodLen - 1);
  if (diffDays(p.start, t) > 10) return auto; // oubliée : on suppose la durée moyenne
  return t > auto ? t : auto;
}
function ongoingPeriod() {
  const ps = sortedPeriods();
  const last = ps[ps.length - 1];
  if (!last || last.end) return null;
  const d = diffDays(last.start, todayISO());
  return d >= 0 && d <= 10 ? last : null;
}
// Phase d'un jour donné dans un cycle de longueur L
function phaseFor(day, L, pLen, pms) {
  const ovu = L - 14;
  let phase;
  if (day <= pLen) phase = "menstruelle";
  else if (day < ovu - 1) phase = "folliculaire";
  else if (day <= ovu + 2) phase = "ovulatoire";
  else phase = "luteale";
  const isPms = phase === "luteale" && day > L - pms;
  return { phase, isPms };
}
// Infos complètes pour une date
function infoFor(iso) {
  const ps = sortedPeriods();
  if (!ps.length) return null;
  const { cycleLen: L, periodLen: pLen } = cycleStats();
  const pms = state.settings.pmsDays;
  // Période enregistrée la plus récente qui commence avant ou à cette date
  let base = null;
  for (const p of ps) if (p.start <= iso) base = p;
  if (!base) return null;
  const actual = ps.some(p => iso >= p.start && iso <= periodEnd(p, pLen));
  const last = ps[ps.length - 1];
  let start = base.start, predicted = false;
  if (base === last) {
    // Projection des cycles futurs
    const k = Math.floor(diffDays(last.start, iso) / L);
    if (k >= 1 && iso > todayISO()) { start = addDays(last.start, k * L); predicted = true; }
  }
  const day = diffDays(start, iso) + 1;
  const len = base === last ? L : diffDays(base.start, ps[ps.indexOf(base) + 1].start);
  let { phase, isPms } = phaseFor(day, len, pLen, pms);
  if (actual) { phase = "menstruelle"; isPms = false; }
  else if (phase === "menstruelle" && !predicted) phase = day <= pLen ? "folliculaire" : phase; // règles passées non saisies : pas de faux rouge
  const isPredictedPeriod = predicted && day <= pLen;
  return { day, len, phase, isPms, actual, predictedPeriod: isPredictedPeriod };
}
function todaySummary() {
  const ps = sortedPeriods();
  if (!ps.length) return null;
  const st = cycleStats();
  const last = ps[ps.length - 1];
  const t = todayISO();
  const day = diffDays(last.start, t) + 1;
  const next = addDays(last.start, st.cycleLen);
  const until = diffDays(t, next);
  const ongoing = ongoingPeriod();
  let { phase, isPms } = phaseFor(day, st.cycleLen, st.periodLen, state.settings.pmsDays);
  if (ongoing) { phase = "menstruelle"; isPms = false; }
  else if (phase === "menstruelle") phase = "folliculaire";
  if (until <= 0 && !ongoing) { phase = "luteale"; isPms = true; }
  let range = null;
  if (st.spread > 7) range = [addDays(last.start, st.min), addDays(last.start, st.max)];
  return { day, L: st.cycleLen, pLen: st.periodLen, next, until, phase, isPms, ongoing, range };
}

/* ---------- Rendu : Aujourd'hui ---------- */
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, html = "") => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; return e; };
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function renderOrbit(sum) {
  const svg = $("#orbit");
  const R = 128, C = 2 * Math.PI * R, cx = 150, cy = 150;
  const L = Math.max(sum.L, sum.day);
  const ovu = sum.L - 14;
  const segs = [
    ["menstruelle", 1, sum.pLen],
    ["folliculaire", sum.pLen + 1, ovu - 2],
    ["ovulatoire", ovu - 1, ovu + 2],
    ["luteale", ovu + 3, sum.L - state.settings.pmsDays],
    ["spm", sum.L - state.settings.pmsDays + 1, sum.L],
  ];
  const gap = 4;
  let out = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--line)" stroke-width="2"/>`;
  segs.forEach(([name, a, b]) => {
    if (b < a) return;
    const len = ((b - a + 1) / L) * C - gap;
    const off = ((a - 1) / L) * C;
    out += `<circle class="arc" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--${name})" stroke-width="${sum.phase === name || (name === "spm" && sum.isPms) ? 20 : 12}"
      stroke-linecap="round" stroke-dasharray="${len.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="0" style="--len:${len.toFixed(1)}"
      transform="rotate(${-90 + (off / C) * 360} ${cx} ${cy})"/>`;
  });
  const ang = ((Math.min(sum.day, L) - 0.5) / L) * 2 * Math.PI - Math.PI / 2;
  const x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
  out += `<circle class="today-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="var(--bg)" stroke="var(--ink)" stroke-width="3"/>
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="var(--ink)"/>`;
  svg.innerHTML = out;
}

function renderToday() {
  const sum = todaySummary();
  $("#today-date").textContent = fmtLong(todayISO()).replace(/^./, c => c.toUpperCase());
  if (!sum) return;
  renderOrbit(sum);
  $("#day-num").textContent = sum.day;
  $("#day-of").textContent = `sur ${sum.L} environ`;
  const P = PHASES[sum.phase];
  $("#phase-name").textContent = sum.isPms ? "Phase lutéale, fenêtre SPM" : P.long;

  let cd;
  if (sum.ongoing) {
    const d = diffDays(sum.ongoing.start, todayISO()) + 1;
    cd = `Jour ${d} des règles`;
  } else if (sum.until > 0) {
    if (sum.range) cd = `Règles prévues entre le ${fmtShort(sum.range[0])} et le ${fmtShort(sum.range[1])}`;
    else cd = sum.until === 1 ? "Règles prévues demain" : `Règles prévues dans ${sum.until} jours`;
  } else if (sum.until === 0) cd = "Règles prévues aujourd'hui";
  else {
    const late = -sum.until;
    cd = late === 1 ? "Règles en retard d'1 jour" : `Règles en retard de ${late} jours`;
    if (late > 7) cd += ". Si ça t'inquiète, un test ou un avis médical peut rassurer.";
  }
  $("#countdown").textContent = cd;

  const banner = $("#spm-banner");
  if (sum.isPms && !sum.ongoing) {
    banner.hidden = false;
    $("#spm-text").textContent = sum.until > 0
      ? `Les règles arrivent dans ${sum.until} jour${sum.until > 1 ? "s" : ""}. Douceur, eau, mouvement, sommeil.`
      : "Les règles peuvent arriver d'un jour à l'autre. Prends soin de toi.";
  } else banner.hidden = true;

  const btn = $("#period-btn");
  btn.textContent = sum.ongoing ? "Mes règles sont terminées" : "Mes règles ont commencé";

  const tips = sum.isPms && !sum.ongoing ? SPM.tips : P.tips;
  const color = sum.isPms && !sum.ongoing ? "var(--spm)" : P.color;
  const ul = $("#today-tips");
  ul.style.setProperty("--phase", color);
  ul.innerHTML = tips.slice(0, 3).map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join("");

  const needsBackup = state.periods.length >= 2 && (!state.lastExport || diffDays(state.lastExport, todayISO()) > 30);
  $("#backup-nudge").hidden = !needsBackup;
}

/* ---------- Rendu : Calendrier ---------- */
let calMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();

function renderCalendar() {
  $("#cal-title").textContent = calMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const grid = $("#cal-grid");
  grid.innerHTML = "";
  const first = (calMonth.getDay() + 6) % 7;
  const days = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const t = todayISO();
  for (let i = 0; i < first; i++) grid.append(el("div", { className: "day empty" }));
  for (let d = 1; d <= days; d++) {
    const iso = toISO(new Date(calMonth.getFullYear(), calMonth.getMonth(), d));
    const info = infoFor(iso);
    const b = el("button", { type: "button", className: "day" }, `<span>${d}</span>`);
    b.dataset.iso = iso;
    if (info) {
      b.classList.add(info.isPms ? "p-spm" : `p-${info.phase}`);
      if (info.actual) b.classList.add("actual");
      else if (info.predictedPeriod) b.classList.add("predicted");
    }
    if (iso === t) b.classList.add("today");
    if (iso > t) { b.classList.add("future"); b.disabled = true; }
    let label = fmtLong(iso);
    if (info?.actual) label += ", règles";
    else if (info?.predictedPeriod) label += ", règles prévues";
    b.setAttribute("aria-label", label);
    grid.append(b);
  }
}

function toggleDay(iso) {
  const { periodLen } = cycleStats();
  const ps = state.periods;
  const hit = ps.find(p => iso >= p.start && iso <= periodEnd(p, periodLen));
  if (hit) {
    const end = periodEnd(hit, periodLen);
    if (hit.start === end) ps.splice(ps.indexOf(hit), 1);
    else if (iso === hit.start) hit.start = addDays(iso, 1);
    else hit.end = addDays(iso, -1);
    toast("Jour retiré");
  } else {
    const after = ps.find(p => addDays(periodEnd(p, periodLen), 1) === iso);
    const before = ps.find(p => addDays(p.start, -1) === iso);
    if (after) after.end = iso;
    else if (before) before.start = iso;
    else ps.push({ start: iso, end: iso === todayISO() ? null : iso });
    toast("Jour de règles ajouté");
  }
  save(); renderAll();
}

/* ---------- Rendu : Conseils ---------- */
function phaseCard(key, data, color, isNow) {
  const d = el("details", { className: "phase-card" });
  d.style.setProperty("--phase", color);
  if (isNow) d.open = true;
  d.innerHTML = `
    <summary><i class="dot"></i><span class="serif">${data.long || data.name}</span>${isNow ? '<span class="now-tag">Maintenant</span>' : ""}
      <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></summary>
    <div class="phase-body">
      <p>${data.what}</p>
      <p class="muted small">${data.feel}</p>
      <ul class="tips">${data.tips.map(([t, x]) => `<li><b>${t}</b><span>${x}</span></li>`).join("")}</ul>
      ${state.settings.showEntourage ? `<p class="entourage"><b>Pour l'entourage.</b> ${data.entourage}</p>` : ""}
    </div>`;
  return d;
}
function renderAdvice() {
  const sum = todaySummary();
  const list = $("#advice-list");
  list.innerHTML = "";
  const nowKey = sum ? (sum.isPms && !sum.ongoing ? "spm" : sum.phase) : null;
  for (const k of ["menstruelle", "folliculaire", "ovulatoire", "luteale"]) {
    list.append(phaseCard(k, PHASES[k], PHASES[k].color, nowKey === k));
  }
  list.append(phaseCard("spm", { ...SPM, long: "Prévenir le SPM" }, "var(--spm)", nowKey === "spm"));
  $("#consult-list").innerHTML = WHEN_TO_CONSULT.map(x => `<li>${x}</li>`).join("");
}

/* ---------- Retours ---------- */
const STATUS_LABEL = { local: "Enregistré", sent: "Envoyé", shared: "Partagé" };
function renderFeedback() {
  const ul = $("#fb-list");
  if (!state.feedback.length) { ul.innerHTML = `<li class="fb-empty">Aucun retour pour l'instant.</li>`; return; }
  ul.innerHTML = [...state.feedback].reverse().map(f => `
    <li><div class="fb-meta"><span>${fmtShort(f.date)}</span><span>${esc(f.cat)}</span><span class="status">${f.status.startsWith("v") ? "Pris en compte " + f.status : STATUS_LABEL[f.status] || ""}</span></div>
    <p class="fb-text">${esc(f.text)}</p></li>`).join("");
}
async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return true; }
    catch (e) { if (e.name === "AbortError") return false; }
  }
  try { await navigator.clipboard.writeText(text); toast("Copié, tu peux le coller où tu veux"); return true; }
  catch { location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`; return true; }
}
async function sendFeedback(item) {
  if (FEEDBACK_ENDPOINT && navigator.onLine) {
    try {
      const r = await fetch(FEEDBACK_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ categorie: item.cat, message: item.text, date: item.date, version: APP_VERSION }),
      });
      if (r.ok) { item.status = "sent"; return "Retour envoyé, merci"; }
    } catch {}
  }
  const ok = await shareText(`Retour Cycle (${item.cat})`, `[${item.cat}] ${item.text}\n— ${fmtShort(item.date)}, v${APP_VERSION}`);
  if (ok) { item.status = "shared"; return "Retour partagé, merci"; }
  return "Retour enregistré";
}

/* ---------- Réglages ---------- */
function renderSettings() {
  document.querySelectorAll("#view-settings .stepper").forEach(s => { s.querySelector("output").textContent = state.settings[s.dataset.key]; });
  document.querySelectorAll('#pms-seg input').forEach(i => { i.checked = Number(i.value) === state.settings.pmsDays; });
  $("#entourage-toggle").checked = state.settings.showEntourage;
  $("#changelog").innerHTML = CHANGELOG.map(c => `<div class="changelog-item"><b>Version ${c.version}</b> <span class="muted">${fmtShort(c.date)}</span><ul>${c.items.map(i => `<li>${i}</li>`).join("")}</ul></div>`).join("");
  $("#version").textContent = `Version ${APP_VERSION}. Données stockées sur ce téléphone ; seuls les rappels de notification sont envoyés au serveur.`;
  renderPush();
}

/* ---------- Navigation ---------- */
let current = "today";
function go(view) {
  current = view;
  document.querySelectorAll(".view").forEach(v => { v.hidden = v.dataset.view !== view; });
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.go === view));
  window.scrollTo(0, 0);
  renderAll();
}
function renderAll() {
  const onboarded = state.periods.length > 0;
  $("#onboarding").hidden = onboarded;
  $("#app").hidden = !onboarded;
  if (!onboarded) return;
  if (current === "today") renderToday();
  if (current === "calendar") renderCalendar();
  if (current === "advice") renderAdvice();
  if (current === "feedback") renderFeedback();
  if (current === "settings") renderSettings();
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ---------- Événements ---------- */
function bindSteppers(root, onChange) {
  root.querySelectorAll(".stepper").forEach(s => {
    s.addEventListener("click", e => {
      const b = e.target.closest(".step"); if (!b) return;
      e.preventDefault();
      const out = s.querySelector("output");
      const v = Math.min(Number(s.dataset.max), Math.max(Number(s.dataset.min), Number(out.textContent) + Number(b.dataset.d)));
      out.textContent = v;
      onChange && onChange(s, v);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Onboarding
  $("#ob-start").value = todayISO();
  $("#ob-start").max = todayISO();
  bindSteppers($("#onboarding"));
  const standalone = window.navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  $("#install-hint").hidden = standalone || !/iPhone|iPad|iPod/.test(navigator.userAgent);
  $("#ob-form").addEventListener("submit", e => {
    e.preventDefault();
    const start = $("#ob-start").value;
    if (!start || start > todayISO()) return toast("Choisis une date passée");
    state.settings.cycleLen = Number($("#ob-cycle").textContent);
    state.settings.periodLen = Number($("#ob-period").textContent);
    const end = addDays(start, state.settings.periodLen - 1);
    state.periods = [{ start, end: end < todayISO() ? end : null }];
    save(); go("today");
  });

  // Navigation
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-go]"); if (g) go(g.dataset.go);
  });
  $("#open-settings").addEventListener("click", () => go("settings"));

  // Bouton règles
  const dlg = $("#period-dialog");
  $("#period-btn").addEventListener("click", () => {
    const on = ongoingPeriod();
    $("#pd-title").textContent = on ? "Fin des règles" : "Début des règles";
    $("#pd-label").textContent = on ? "Dernier jour" : "Premier jour";
    $("#pd-date").value = todayISO();
    $("#pd-date").max = todayISO();
    $("#pd-date").min = on ? on.start : "";
    dlg.showModal();
  });
  dlg.addEventListener("close", () => {
    if (dlg.returnValue !== "ok") return;
    const v = $("#pd-date").value; if (!v) return;
    const on = ongoingPeriod();
    if (on) { on.end = v; toast("Fin des règles enregistrée"); }
    else {
      const last = sortedPeriods().at(-1);
      if (last && !last.end) last.end = periodEnd(last, cycleStats().periodLen);
      if (state.periods.some(p => p.start === v)) return toast("Ce jour est déjà enregistré");
      state.periods.push({ start: v, end: null });
      toast("Début des règles enregistré");
    }
    save(); renderAll();
  });

  // Calendrier
  $("#cal-prev").addEventListener("click", () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(); });
  $("#cal-next").addEventListener("click", () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); });
  $("#cal-grid").addEventListener("click", e => { const b = e.target.closest(".day[data-iso]"); if (b && !b.disabled) toggleDay(b.dataset.iso); });
  let tx = null;
  $("#view-calendar").addEventListener("touchstart", e => { tx = e.touches[0].clientX; }, { passive: true });
  $("#view-calendar").addEventListener("touchend", e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 60) { calMonth.setMonth(calMonth.getMonth() + (dx < 0 ? 1 : -1)); renderCalendar(); }
  });

  // Retours
  $("#fb-form").addEventListener("submit", async e => {
    e.preventDefault();
    const text = $("#fb-text").value.trim(); if (!text) return;
    const cat = document.querySelector('input[name="cat"]:checked').value;
    const item = { id: Date.now(), date: todayISO(), cat, text, status: "local" };
    state.feedback.push(item); save();
    $("#fb-text").value = "";
    renderFeedback();
    const msg = await sendFeedback(item);
    save(); renderFeedback(); toast(msg);
  });
  $("#fb-share-all").addEventListener("click", async () => {
    if (!state.feedback.length) return toast("Aucun retour à partager");
    const txt = state.feedback.map(f => `• [${f.cat}] ${f.text} (${fmtShort(f.date)})`).join("\n");
    if (await shareText("Mes retours Cycle", `Retours Cycle v${APP_VERSION}\n\n${txt}`)) {
      state.feedback.forEach(f => { if (f.status === "local") f.status = "shared"; });
      save(); renderFeedback();
    }
  });

  // Réglages
  bindSteppers($("#view-settings"), (s, v) => { state.settings[s.dataset.key] = v; save(); });
  $("#pms-seg").addEventListener("change", e => { state.settings.pmsDays = Number(e.target.value); save(); });
  $("#entourage-toggle").addEventListener("change", e => { state.settings.showEntourage = e.target.checked; save(); });
  $("#export-btn").addEventListener("click", async () => {
    const json = JSON.stringify({ app: "cycle", version: APP_VERSION, exportedAt: new Date().toISOString(), data: state }, null, 2);
    const name = `cycle-sauvegarde-${todayISO()}.json`;
    const file = new File([json], name, { type: "application/json" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: name });
      else { const a = el("a", { href: URL.createObjectURL(file), download: name }); a.click(); }
      state.lastExport = todayISO(); save(); toast("Sauvegarde exportée");
    } catch (e) { if (e.name !== "AbortError") toast("Export impossible"); }
  });
  $("#import-input").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const data = obj.data || obj;
      if (!Array.isArray(data.periods)) throw new Error();
      if (!confirm("Remplacer les données actuelles par cette sauvegarde ?")) return;
      state = { ...defaults(), ...data, settings: { ...defaults().settings, ...(data.settings || {}) } };
      save(); toast("Sauvegarde importée"); renderAll();
    } catch { toast("Ce fichier n'est pas une sauvegarde valide"); }
    e.target.value = "";
  });
  $("#reset-btn").addEventListener("click", () => {
    if (!confirm("Effacer toutes les données de l'appli ? Pense à exporter avant.")) return;
    state = defaults(); save(); current = "today"; renderAll();
  });

  $("#push-btn").addEventListener("click", togglePush);
  $("#push-test").addEventListener("click", testPush);

  // Rafraîchir au retour dans l'appli (changement de jour)
  document.addEventListener("visibilitychange", () => { if (!document.hidden) renderAll(); });

  renderAll();
  registerSW();
  syncPush();
});

/* ---------- Notifications push (serveur Cloudflare) ---------- */
let pushServer = null;
async function getPushServer() {
  if (pushServer) return pushServer;
  try {
    const r = await fetch("push-server.json", { cache: "no-store" });
    const j = await r.json();
    pushServer = j.url ? j.url.replace(/\/$/, "") : null;
  } catch { pushServer = null; }
  return pushServer;
}
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isStandalone = () => window.navigator.standalone || matchMedia("(display-mode: standalone)").matches;
function urlB64ToBytes(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
// Rappels des 3 prochains cycles, calculés sur le téléphone
function buildSchedule() {
  const sum = todaySummary(); if (!sum) return [];
  const last = sortedPeriods().at(-1);
  const t = todayISO(), pms = state.settings.pmsDays, out = [];
  for (let k = 1; k <= 3; k++) {
    const next = addDays(last.start, k * sum.L);
    const spmStart = addDays(next, -pms);
    const eve = addDays(next, -1);
    if (spmStart > t) out.push({ at: spmStart, title: "Fenêtre SPM", body: "Elle commence aujourd'hui. Douceur, eau, mouvement, sommeil." });
    if (eve > t) out.push({ at: eve, title: "Règles prévues demain", body: "Prépare ce qu'il te faut, et prends soin de toi." });
  }
  return out;
}
async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
let syncTimer;
function schedulePushSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncPush, 800);
}
async function syncPush() {
  try {
    const sub = await currentSubscription(); const srv = await getPushServer();
    if (!sub || !srv) return;
    await fetch(`${srv}/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), schedule: buildSchedule() }) });
  } catch {}
}
async function renderPush() {
  const btn = $("#push-btn"), test = $("#push-test"), status = $("#push-status");
  const base = "Un rappel le matin au début de la fenêtre SPM et la veille des règles prévues.";
  if (!isStandalone()) { status.textContent = base + " Installe d'abord l'appli sur l'écran d'accueil pour les activer."; btn.hidden = true; test.hidden = true; return; }
  if (!pushSupported()) { status.textContent = "Ce téléphone ne permet pas les notifications web. Il faut iOS 16.4 ou plus récent."; btn.hidden = true; test.hidden = true; return; }
  const srv = await getPushServer();
  if (!srv) { status.textContent = base + " Le serveur n'est pas encore en ligne."; btn.hidden = true; test.hidden = true; return; }
  const sub = await currentSubscription();
  btn.hidden = false;
  if (sub && Notification.permission === "granted") {
    status.textContent = "Activées. " + base; btn.textContent = "Désactiver"; btn.classList.remove("primary"); test.hidden = false;
  } else if (Notification.permission === "denied") {
    status.textContent = "Notifications refusées. Réactive-les dans Réglages iPhone › Notifications › Cycle."; btn.hidden = true; test.hidden = true;
  } else {
    status.textContent = base; btn.textContent = "Activer les notifications"; btn.classList.add("primary"); test.hidden = true;
  }
}
async function togglePush() {
  const srv = await getPushServer(); if (!srv) return;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  try {
    if (sub) {
      await fetch(`${srv}/unsubscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe();
      toast("Notifications désactivées");
    } else {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Notifications non autorisées"); return renderPush(); }
      const { publicKey } = await (await fetch(`${srv}/vapid`)).json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(publicKey) });
      const r = await fetch(`${srv}/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), schedule: buildSchedule() }) });
      toast(r.ok ? "Notifications activées" : "Le serveur ne répond pas, réessaie plus tard");
    }
  } catch { toast("Activation impossible, réessaie"); }
  renderPush();
}
async function testPush() {
  const sub = await currentSubscription(); const srv = await getPushServer();
  if (!sub || !srv) return;
  try {
    const r = await fetch(`${srv}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    const j = await r.json();
    toast(j.result === "ok" ? "Notification envoyée" : "Échec de l'envoi");
  } catch { toast("Le serveur ne répond pas"); }
}

/* ---------- Service worker et mises à jour ---------- */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then(reg => {
    const show = w => {
      $("#update-banner").hidden = false;
      $("#update-btn").onclick = () => w.postMessage("skipWaiting");
    };
    if (reg.waiting && navigator.serviceWorker.controller) show(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) show(w); });
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
