// Cloudflare Pages Function: GET /api/wa?url=<link de canal ou grupo do WhatsApp>
// Lê a página pública do WhatsApp e devolve nome, foto, descrição e seguidores.
const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", ...h } });
const ent = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function toNum(t) {
  if (!t) return 0;
  const m = String(t).match(/(\d[\d.,]*)\s*(mil\s+milh[oõ]es|milh[oõ]es|milh[aã]o|mil|mi|K|M|B)?/i);
  if (!m) return 0;
  const suf = (m[2] || "").toLowerCase();
  if (!suf) return parseInt(m[1].replace(/[.,]/g, ""), 10) || 0;
  const mult = /mil\s+milh/.test(suf) || suf === "b" ? 1e9 : /milh|^mi$|^m$/.test(suf) ? 1e6 : 1e3;
  return Math.round(parseFloat(m[1].replace(",", ".")) * mult) || 0;
}

function parseWa(html) {
  const meta = {};
  for (const m of html.matchAll(/<meta\s[^>]*>/gi)) {
    const a = m[0];
    const k = (a.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const v = (a.match(/content\s*=\s*"([^"]*)"/i) || a.match(/content\s*=\s*'([^']*)'/i) || [])[1];
    if (k && v !== undefined && !(k in meta)) meta[k] = ent(v);
  }
  const name = (meta["og:title"] || "").trim();
  const image = meta["og:image"] || "";
  const FOL = /(\d[\d.,]*\s*(?:mil\s+milh[oõ]es|milh[oõ]es|milh[aã]o|mil|mi|[KMB])?)\s*(?:seguidores?|followers?)/i;
  const fm = (meta["og:description"] || "").match(FOL);
  const followersText = fm ? fm[1].trim() + " seguidores" : "";
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "\n");
  const lines = text.split("\n").map((l) => ent(l).trim()).filter(Boolean);
  let description = "";
  const i = lines.findIndex((l) => l === name);
  if (i >= 0) {
    const out = [];
    for (let k = i + 1; k < lines.length && out.length < 6; k++) {
      const l = lines[k];
      if (/^(canal|channel)\b.*(seguidor|follower)/i.test(l) || /^(Looks like|Parece que|View in|Ver no|Download|Baixar)/i.test(l)) break;
      out.push(l);
    }
    description = out.join("\n");
  }
  return { name, image, description: description.slice(0, 300), followersText, followers: toNum(fm && fm[1]) };
}

export async function onRequestGet({ request }) {
  let t;
  try { t = new URL(new URL(request.url).searchParams.get("url") || ""); } catch { return J({ ok: false, error: "link_invalido" }, 400); }
  const host = t.hostname.toLowerCase().replace(/^www\./, "");
  let type = "", id = "", m;
  if (host === "whatsapp.com" && (m = t.pathname.match(/^\/channel\/([A-Za-z0-9_-]{10,60})\/?$/))) { type = "channel"; id = m[1]; }
  else if (host === "chat.whatsapp.com" && (m = t.pathname.match(/^\/([A-Za-z0-9]{10,40})\/?$/))) { type = "group"; id = m[1]; }
  if (!type) return J({ ok: false, error: "link_invalido" }, 400);
  const clean = type === "channel" ? "https://www.whatsapp.com/channel/" + id : "https://chat.whatsapp.com/" + id;

  const cache = caches.default, key = new Request("https://cache.invalid/wa/" + id);
  const hit = await cache.match(key);
  if (hit) return hit;

  let r;
  try {
    r = await fetch(clean + (type === "channel" ? "?lang=pt" : ""), { headers: { "user-agent": "Mozilla/5.0 (compatible; KiyoraHubLinkPreview/1.0)", "accept-language": "pt-BR,pt;q=0.9,en;q=0.5" }, redirect: "follow" });
  } catch { return J({ ok: false, error: "falha_rede" }, 502); }
  if (!r.ok) return J({ ok: false, error: "nao_encontrado" }, 404);
  const p = parseWa(await r.text());
  if (!p.name) return J({ ok: false, error: "sem_dados" }, 422);

  let image = "";
  try {
    const u = new URL(p.image);
    if (/(^|\.)(whatsapp\.net|fbcdn\.net|whatsapp\.com)$/i.test(u.hostname)) {
      const ir = await fetch(u.href);
      const ct = (ir.headers.get("content-type") || "").split(";")[0];
      if (ir.ok && /^image\//.test(ct) && (+ir.headers.get("content-length") || 0) <= 700000) {
        const buf = new Uint8Array(await ir.arrayBuffer());
        if (buf.length <= 700000) {
          let s = "";
          for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
          image = "data:" + ct + ";base64," + btoa(s);
        }
      }
    }
  } catch {}

  const res = J({ ok: true, type, id, url: clean, name: p.name, description: p.description, followers: p.followers, followersText: p.followersText, image }, 200, { "cache-control": "public, max-age=600" });
  await cache.put(key, res.clone());
  return res;
        }
        
