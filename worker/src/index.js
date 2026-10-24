// Serveur de notifications de l'appli Cycle.
// Stocke, par abonnement, uniquement la liste des rappels à envoyer (date + texte).
import { sendPush, b64u } from "./webpush.js";

const SUBJECT = "https://fidelcastre44-dev.github.io/cycle/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

async function keyFor(endpoint) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return "sub:" + [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
}
const parisDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d); // AAAA-MM-JJ

function validSub(s) {
  return s && typeof s.endpoint === "string" && s.endpoint.startsWith("https://") && s.keys && s.keys.p256dh && s.keys.auth;
}
function cleanSchedule(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.at) && typeof x.title === "string")
    .slice(0, 30)
    .map(x => ({ at: x.at, title: x.title.slice(0, 80), body: String(x.body || "").slice(0, 200) }));
}

// Clé VAPID générée au premier usage et conservée dans KV
async function getVapid(env) {
  const saved = await env.SUBS.get("vapid", "json");
  if (saved) return saved;
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  delete privateJwk.key_ops; delete privateJwk.ext;
  const publicKey = b64u.encode(await crypto.subtle.exportKey("raw", kp.publicKey));
  const v = { privateJwk, publicKey };
  await env.SUBS.put("vapid", JSON.stringify(v));
  return v;
}

async function deliver(env, key, record, msg) {
  const { privateJwk } = await getVapid(env);
  const res = await sendPush(record.subscription, msg, privateJwk, SUBJECT);
  if (res.status === 404 || res.status === 410) { await env.SUBS.delete(key); return "gone"; }
  return res.ok ? "ok" : `error ${res.status}`;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") return json({ ok: true, service: "cycle-push" });
    if (request.method === "GET" && url.pathname === "/vapid") return json({ publicKey: (await getVapid(env)).publicKey });
    if (request.method !== "POST") return json({ error: "method" }, 405);
    let body;
    try { body = await request.json(); } catch { return json({ error: "json" }, 400); }

    if (url.pathname === "/subscribe") {
      if (!validSub(body.subscription)) return json({ error: "subscription" }, 400);
      const key = await keyFor(body.subscription.endpoint);
      await env.SUBS.put(key, JSON.stringify({ subscription: body.subscription, schedule: cleanSchedule(body.schedule), updated: Date.now() }));
      return json({ ok: true });
    }
    if (url.pathname === "/unsubscribe") {
      if (typeof body.endpoint !== "string") return json({ error: "endpoint" }, 400);
      await env.SUBS.delete(await keyFor(body.endpoint));
      return json({ ok: true });
    }
    if (url.pathname === "/test") {
      if (typeof body.endpoint !== "string") return json({ error: "endpoint" }, 400);
      const key = await keyFor(body.endpoint);
      const record = await env.SUBS.get(key, "json");
      if (!record) return json({ error: "unknown" }, 404);
      const r = await deliver(env, key, record, { title: "Cycle", body: "Les notifications fonctionnent." });
      return json({ result: r });
    }
    return json({ error: "not found" }, 404);
  },

  async scheduled(event, env) {
    const today = parisDate();
    let cursor;
    do {
      const page = await env.SUBS.list({ prefix: "sub:", cursor });
      for (const { name } of page.keys) {
        const record = await env.SUBS.get(name, "json");
        if (!record) continue;
        const due = record.schedule.filter(x => x.at === today);
        let status = "ok";
        for (const msg of due) {
          status = await deliver(env, name, record, { title: msg.title, body: msg.body });
          if (status === "gone") break;
        }
        if (status === "gone") continue;
        const rest = record.schedule.filter(x => x.at > today);
        if (rest.length !== record.schedule.length) await env.SUBS.put(name, JSON.stringify({ ...record, schedule: rest }));
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  },
};
