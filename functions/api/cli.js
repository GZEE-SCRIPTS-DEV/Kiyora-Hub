// Kiyora Hub: API usada pelo kh.py (terminal / Termux).
// Autentica por token pessoal (kh_...) guardado só como hash no Firestore e grava nos
// repositórios do dono do token, com as mesmas regras do site (validadas aqui, no servidor).
// Cada alteração vira um commit (histórico) e cada uso vira um registro privado (log).
// Segredo necessário no Cloudflare Pages: FIREBASE_SA (JSON da conta de serviço).

const MAXF = 100, MAXC = 200000, SNAP = 50000, MAXPUSH = 25, MAXBODY = 4000000, WIN = 60000, MAXREQ = 60, MAXREPOS = 50, LOGDAYS = 30;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const RE_TOKEN = /^kh_[a-f0-9]{48}$/, RE_NAME = /^[A-Za-z0-9._-]{1,60}$/;
const okPath = p => typeof p === "string" && /^[A-Za-z0-9._ -]+(\/[A-Za-z0-9._ -]+){0,5}$/.test(p) && p.length <= 200 && !p.split("/").some(s => s === "." || s === ".." || s !== s.trim());
const SECRET = /(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{24,}|xox[bap]-[A-Za-z0-9-]{20,}|kh_[a-f0-9]{48})/;
const MIMES = { md: "text/markdown", json: "application/json", html: "text/html", css: "text/css", js: "text/javascript", ts: "text/typescript", py: "text/x-python", java: "text/x-java", sh: "text/x-shellscript", csv: "text/csv", xml: "application/xml", yml: "text/yaml", yaml: "text/yaml" };
const mime = p => MIMES[(p.split(".").pop() || "").toLowerCase()] || "text/plain";
const rid = (repo, path) => repo + "__" + path.replace(/\//g, "~");
const enc = new TextEncoder();
const S = v => ({ stringValue: String(v) }), I = v => ({ integerValue: String(Math.trunc(v)) }), B = v => ({ booleanValue: !!v });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const un = f => { const o = {}; for (const k in f || {}) { const v = f[k]; o[k] = v.stringValue !== undefined ? v.stringValue : v.integerValue !== undefined ? Number(v.integerValue) : v.booleanValue !== undefined ? v.booleanValue : v.arrayValue ? (v.arrayValue.values || []).map(x => x.stringValue) : v.timestampValue !== undefined ? v.timestampValue : null } return o };
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: "EQUAL", value: { stringValue: v } } });
const b64u = b => { let s = ""; const u = new Uint8Array(b); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };
const rnd = n => { const a = crypto.getRandomValues(new Uint8Array(n)); return [...a].map(x => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join("") };
const rev = t => String(9999999999999 - t).padStart(13, "0");   // ids em ordem "mais novo primeiro"
const maskIp = ip => { ip = String(ip || ""); if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split(".").slice(0, 3).join(".") + ".0"; if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::"; return "" };

let CACHE = { tok: "", exp: 0, email: "" };
const FLAGS = new Map();   // cache curto (30 s) de banimento e manutenção: menos leituras no banco
async function flag(key, ttl, fn) { const c = FLAGS.get(key), now = Date.now(); if (c && c.exp > now) return c.v; const v = await fn(); FLAGS.set(key, { v, exp: now + ttl }); if (FLAGS.size > 500) FLAGS.clear(); return v }
export const _test = { FLAGS };

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (CACHE.tok && CACHE.email === sa.client_email && CACHE.exp - 60 > now) return CACHE.tok;
  const hdr = b64u(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const clm = b64u(enc.encode(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64u(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(hdr + "." + clm)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + hdr + "." + clm + "." + sig });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("auth_google");
  CACHE = { tok: j.access_token, exp: now + (j.expires_in || 3600), email: sa.client_email };
  return CACHE.tok;
}

function mk(sa, at) {
  const root = `projects/${sa.project_id}/databases/(default)/documents`, url = `https://firestore.googleapis.com/v1/${root}`;
  const call = async (method, path, body, qs = "") => {
    const r = await fetch(url + path + qs, { method, headers: { authorization: "Bearer " + at, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 404) return null;
    const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch {}
    if (!r.ok) { const e = new Error("firestore " + r.status); e.status = r.status; throw e }
    return j;
  };
  const E = encodeURIComponent;
  return {
    root, E,
    get: p => call("GET", p), del: p => call("DELETE", p),
    patch: (p, fields, mask) => call("PATCH", p, { fields }, mask ? "?" + mask.map(m => "updateMask.fieldPaths=" + E(m)).join("&") : ""),
    query: async q => ((await call("POST", ":runQuery", { structuredQuery: q })) || []).filter(x => x.document).map(x => x.document),
    count: async (q, upTo) => { const r = await call("POST", ":runAggregationQuery", { structuredAggregationQuery: { structuredQuery: q, aggregations: [{ alias: "n", count: { upTo: String(upTo) } }] } }); const v = r && r[0] && r[0].result && r[0].result.aggregateFields && r[0].result.aggregateFields.n; return v ? Number(v.integerValue) : 0 },
    commit: w => call("POST", ":commit", { writes: w }),
    batchGet: async names => ((await call("POST", ":batchGet", { documents: names })) || []).filter(x => x.found).map(x => x.found),
  };
}

// ---- commits: histórico de alterações (mesmo formato que o site grava) ----
// changes: [{ p: caminho, op: "a"|"m"|"d", size, text: conteúdo (novo, ou o antigo se "d"), bin }]
function commitWrites(db, { repoId, uid, msg, changes, now }) {
  const cid = repoId + "__" + rev(now) + "_" + rnd(5), w = [];
  const ch = changes.map(c => c.op + "|" + c.p + "|" + (c.size || 0));
  w.push({ update: { name: db.root + "/rcommits/" + cid, fields: { repo: S(repoId), uid: S(uid), msg: S(String(msg).slice(0, 200)), at: I(now), via: S("cli"), ch: { arrayValue: { values: ch.map(S) } } } } });
  for (const c of changes) {
    if (c.bin || typeof c.text !== "string") continue;
    const big = c.text.length > SNAP;
    w.push({ update: { name: db.root + "/rver/" + cid + "__" + c.p.replace(/\//g, "~"), fields: { repo: S(repoId), commit: S(cid), path: S(c.p), op: S(c.op), content: S(big ? "" : c.text), big: B(big), size: I(c.size || 0), at: I(now), uid: S(uid) } } });
  }
  return w;
}
const fileDoc = (db, repoId, uid, p, c, now) => ({ update: { name: db.root + "/rfiles/" + rid(repoId, p), fields: { repo: S(repoId), uid: S(uid), path: S(p), content: S(c), url: S(""), size: I(enc.encode(c).length), mime: S(mime(p)), at: I(now) } } });
const repoTouch = (db, repoId, now) => ({ update: { name: db.root + "/repos/" + repoId, fields: { upd: I(now) } }, updateMask: { fieldPaths: ["upd"] }, currentDocument: { exists: true } });

export const onRequest = () => J({ ok: false, error: "metodo_nao_permitido" }, 405);

export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const au = request.headers.get("authorization") || "", tok = au.startsWith("Bearer ") ? au.slice(7).trim() : "";
    if (!RE_TOKEN.test(tok)) return J({ ok: false, error: "token_invalido" }, 401);
    let sa; try { sa = JSON.parse(env.FIREBASE_SA) } catch {}
    if (!sa || !sa.client_email || !sa.private_key || !sa.project_id) return J({ ok: false, error: "servidor_nao_configurado" }, 500);
    if ((+request.headers.get("content-length") || 0) > MAXBODY) return J({ ok: false, error: "corpo_grande" }, 413);
    const raw = await request.text();
    if (raw.length > MAXBODY) return J({ ok: false, error: "corpo_grande" }, 413);
    let b; try { b = JSON.parse(raw || "{}") } catch { return J({ ok: false, error: "json_invalido" }, 400) }
    if (!b || typeof b !== "object") return J({ ok: false, error: "json_invalido" }, 400);

    const db = mk(sa, await accessToken(sa)), E = db.E;
    const h = hex(await crypto.subtle.digest("SHA-256", enc.encode(tok)));
    const td = await db.get("/tokens/" + h);
    if (!td) return J({ ok: false, error: "token_invalido" }, 401);
    const t = un(td.fields), uid = t.uid;
    if (typeof uid !== "string" || !/^[A-Za-z0-9]{6,128}$/.test(uid)) return J({ ok: false, error: "token_invalido" }, 401);
    if (await flag("ban:" + uid, 30000, async () => !!(await db.get("/bans/" + E(uid))))) return J({ ok: false, error: "conta_suspensa" }, 403);
    if (await flag("maint", 30000, async () => { const m = await db.get("/config/maintenance"); return !!(m && un(m.fields).on === true) })) return J({ ok: false, error: "manutencao" }, 503);

    // limite de taxa por usuário: 60 chamadas por minuto
    const now = Date.now(), rl = await db.get("/climeta/" + E(uid));
    let w = 0, n = 0; if (rl) { const x = un(rl.fields); w = x.w || 0; n = x.n || 0 }
    if (now - w > WIN) { w = now; n = 0 }
    if (n >= MAXREQ) return J({ ok: false, error: "muitas_requisicoes", retry_s: Math.max(1, Math.ceil((w + WIN - now) / 1000)) }, 429);
    await db.patch("/climeta/" + E(uid), { w: I(w), n: I(n + 1) });

    const ip = maskIp(request.headers.get("cf-connecting-ip")), cc = String(request.headers.get("cf-ipcountry") || "").slice(0, 2).toUpperCase();
    if (now - (t.last || 0) > 600000) await db.patch("/tokens/" + h, { last: I(now), lcc: S(cc), lip: S(ip) }, ["last", "lcc", "lip"]);

    const op = b.op, meta = { n: 0, repo: "" };
    const res = await handle(db, E, { b, op, uid, t, now, meta });

    // registro de uso (privado do dono): só operações relevantes; some sozinho em 30 dias se o TTL estiver ligado
    if (["whoami", "new", "push", "rm", "ls"].includes(op)) {
      const lid = rev(now) + "_" + rnd(5), fields = { uid: S(uid), op: S(op), repo: S(meta.repo || (typeof b.repo === "string" ? b.repo.slice(0, 60) : "")), tk: S(String(t.name || "").slice(0, 40)), tid: S(h.slice(0, 8)), ok: B(res.status < 400), ip: S(ip), cc: S(cc), n: I(meta.n || 0), at: I(now), exp: { timestampValue: new Date(now + LOGDAYS * 86400000).toISOString() } };
      const p = db.patch("/clilogs/" + lid, fields).catch(e => console.error("log", e && e.message));
      if (typeof waitUntil === "function") waitUntil(p); else await p;
    }
    return res;
  } catch (e) {
    console.error("cli", e && e.message);
    return J({ ok: false, error: "erro_interno" }, 500);
  }
}

async function handle(db, E, { b, op, uid, t, now, meta }) {
  const repoOf = async name => {
    if (typeof name !== "string" || !RE_NAME.test(name) || name === "." || name === "..") return null;
    const id = uid + "__" + name, d = await db.get("/repos/" + E(id));
    return d ? { id, name, d } : null;
  };
  const noRepo = () => J({ ok: false, error: "repo_nao_encontrado" }, 404);

  if (op === "whoami") {
    const p = await db.get("/profiles/" + E(uid));
    return J({ ok: true, uid, name: p ? un(p.fields).name || "" : "", token: t.name || "" });
  }
  if (op === "doctor") {
    // confere, no Firebase real, se nomes com espaço funcionam (gravar "cru" e ler/apagar "codificado")
    const id = "kh doctor " + uid, name = db.root + "/climeta/" + id;
    await db.commit([{ update: { name, fields: { w: I(0), n: I(0) } } }]);
    const viaGet = await db.get("/climeta/" + E(id)), viaBatch = await db.batchGet([name]);
    await db.del("/climeta/" + E(id));
    const gone = !(await db.get("/climeta/" + E(id)));
    return J({ ok: true, get: !!viaGet, batch: viaBatch.length === 1, del: gone });
  }
  if (op === "repos") {
    const ds = await db.query({ from: [{ collectionId: "repos" }], where: eq("uid", uid), limit: MAXREPOS + 1 });
    return J({ ok: true, repos: ds.map(d => { const x = un(d.fields); return { name: x.name, desc: x.desc || "", lang: x.lang || "", upd: x.upd || 0 } }).sort((a, c) => c.upd - a.upd) });
  }
  if (op === "logs") {
    const ds = await db.query({ from: [{ collectionId: "clilogs" }], where: eq("uid", uid), limit: 30 });
    return J({ ok: true, logs: ds.map(d => { const x = un(d.fields); return { at: x.at, op: x.op, repo: x.repo, tk: x.tk, ok: x.ok, cc: x.cc, ip: x.ip, n: x.n || 0 } }) });
  }
  if (op === "new") {
    const name = b.name;
    if (typeof name !== "string" || !RE_NAME.test(name) || name === "." || name === "..") return J({ ok: false, error: "nome_invalido" }, 400);
    const desc = typeof b.desc === "string" ? b.desc.slice(0, 200) : "", lang = typeof b.lang === "string" && b.lang.length <= 40 ? b.lang : "Outro";
    const mine = await db.count({ from: [{ collectionId: "repos" }], where: eq("uid", uid) }, MAXREPOS + 1);
    if (mine >= MAXREPOS) return J({ ok: false, error: "limite_repos" }, 403);
    const id = uid + "__" + name; meta.repo = name;
    if (await db.get("/repos/" + E(id))) return J({ ok: false, error: "repo_existe" }, 409);
    const w = [{ update: { name: db.root + "/repos/" + id, fields: { uid: S(uid), name: S(name), desc: S(desc), lang: S(lang), topics: { arrayValue: { values: [S(lang)] } }, at: I(now), upd: I(now) } }, currentDocument: { exists: false } }];
    const ch = [];
    if (b.readme !== false) { const rt = "# " + name + "\n\n" + (desc || "Descreva seu projeto aqui.") + "\n"; w.push(fileDoc(db, id, uid, "README.md", rt, now)); ch.push({ p: "README.md", op: "a", size: enc.encode(rt).length, text: rt }); meta.n = 1 }
    w.push(...commitWrites(db, { repoId: id, uid, msg: "Cria repositório", changes: ch, now }));
    await db.commit(w);
    return J({ ok: true, name });
  }

  const rp = await repoOf(b.repo);
  if (!rp) return noRepo();
  meta.repo = rp.name;

  if (op === "ls") {
    const ds = await db.query({ from: [{ collectionId: "rfiles" }], where: eq("repo", rp.id), select: { fields: ["path", "size", "mime", "url"].map(f => ({ fieldPath: f })) }, limit: MAXF + 5 });
    return J({ ok: true, files: ds.map(d => { const x = un(d.fields); return { path: x.path, size: x.size || 0, bin: !!x.url } }).sort((a, c) => a.path.localeCompare(c.path)) });
  }
  if (op === "history") {
    const ds = await db.query({ from: [{ collectionId: "rcommits" }], where: eq("repo", rp.id), limit: 30 });
    return J({ ok: true, commits: ds.map(d => { const x = un(d.fields); return { at: x.at, msg: x.msg, via: x.via, uid: x.uid, ch: x.ch || [] } }) });
  }
  if (op === "push") {
    const files = Array.isArray(b.files) ? b.files : [];
    if (!files.length || files.length > MAXPUSH) return J({ ok: false, error: "lote_invalido", max: MAXPUSH }, 400);
    const msg = typeof b.msg === "string" && b.msg.trim() ? b.msg.trim().slice(0, 200) : null;
    const bad = [], cand = [], seen = new Set();
    for (const f of files) {
      const p = f && f.path, c = f && f.content, sp = String(p).slice(0, 80);
      if (!okPath(p)) { bad.push({ path: sp, reason: "caminho inválido" }); continue }
      if (typeof c !== "string" || c.length > MAXC) { bad.push({ path: p, reason: "maior que 200000 caracteres" }); continue }
      if (SECRET.test(c)) { bad.push({ path: p, reason: "parece conter senha, chave ou token" }); continue }
      if (seen.has(p)) continue; seen.add(p); cand.push({ p, c });
    }
    // lê só os arquivos do lote (no máx. 25 leituras) e ignora os que não mudaram
    const cur = new Map();
    if (cand.length) for (const d of await db.batchGet(cand.map(x => db.root + "/rfiles/" + rid(rp.id, x.p)))) { const x = un(d.fields); cur.set(x.path, x) }
    const changes = [], writes = [], same = [];
    let newCount = 0;
    for (const { p, c } of cand) {
      const old = cur.get(p);
      if (old && !old.url && old.content === c) { same.push(p); continue }
      if (!old) newCount++;
      changes.push({ p, op: old ? "m" : "a", size: enc.encode(c).length, text: c });
    }
    if (newCount) {
      const total = await db.count({ from: [{ collectionId: "rfiles" }], where: eq("repo", rp.id) }, MAXF + 5);
      let room = Math.max(0, MAXF - total);
      for (let i = changes.length - 1; i >= 0; i--) if (changes[i].op === "a") { if (room > 0) room--; else { bad.push({ path: changes[i].p, reason: "limite de 100 arquivos por repositório" }); changes.splice(i, 1) } }
    }
    meta.n = changes.length;
    if (changes.length) {
      for (const c of changes) writes.push(fileDoc(db, rp.id, uid, c.p, c.text, now));
      const m = msg || (changes.length === 1 ? (changes[0].op === "a" ? "Adiciona " : "Atualiza ") + changes[0].p : "Envia " + changes.length + " arquivos pelo terminal");
      writes.push(...commitWrites(db, { repoId: rp.id, uid, msg: m, changes, now }));
      writes.push(repoTouch(db, rp.id, now));
      await db.commit(writes);
    }
    return J({ ok: true, sent: changes.map(c => c.p), same, rejected: bad });
  }
  if (op === "get") {
    const paths = Array.isArray(b.paths) ? b.paths.filter(okPath).slice(0, 10) : [];
    if (!paths.length) return J({ ok: false, error: "caminhos_invalidos" }, 400);
    const ds = await db.batchGet(paths.map(p => db.root + "/rfiles/" + rid(rp.id, p)));
    return J({ ok: true, files: ds.map(d => { const x = un(d.fields); return { path: x.path, content: x.content || "", url: x.url || "" } }) });
  }
  if (op === "rm") {
    if (!okPath(b.path)) return J({ ok: false, error: "caminho_invalido" }, 400);
    const fid = rid(rp.id, b.path), d = await db.get("/rfiles/" + E(fid));
    if (!d || un(d.fields).uid !== uid) return J({ ok: false, error: "arquivo_nao_encontrado" }, 404);
    const x = un(d.fields), msg = typeof b.msg === "string" && b.msg.trim() ? b.msg.trim().slice(0, 200) : "Remove " + b.path;
    const w = [{ delete: db.root + "/rfiles/" + fid }];
    w.push(...commitWrites(db, { repoId: rp.id, uid, msg, changes: [{ p: b.path, op: "d", size: x.size || 0, text: x.url ? null : x.content, bin: !!x.url }], now }));
    w.push(repoTouch(db, rp.id, now));
    await db.commit(w); meta.n = 1;
    return J({ ok: true });
  }
  return J({ ok: false, error: "operacao_invalida" }, 400);
}
