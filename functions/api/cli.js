// Kiyora Hub: API usada pelo kh.py (terminal / Termux).
// Autentica por token pessoal (kh_...) guardado só como hash no Firestore e grava nos
// repositórios do dono do token, com as mesmas regras do site (validadas aqui, no servidor).
// Segredo necessário no Cloudflare Pages: FIREBASE_SA (JSON da conta de serviço).

const MAXF = 100, MAXC = 200000, MAXPUSH = 25, MAXBODY = 4000000, WIN = 60000, MAXREQ = 60, MAXREPOS = 50;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const RE_TOKEN = /^kh_[a-f0-9]{48}$/, RE_NAME = /^[A-Za-z0-9._-]{1,60}$/;
const okPath = p => typeof p === "string" && /^[A-Za-z0-9._ -]+(\/[A-Za-z0-9._ -]+){0,5}$/.test(p) && p.length <= 200 && !p.split("/").some(s => s === "." || s === ".." || s !== s.trim());
const SECRET = /(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{24,}|xox[bap]-[A-Za-z0-9-]{20,}|kh_[a-f0-9]{48})/;
const MIMES = { md: "text/markdown", json: "application/json", html: "text/html", css: "text/css", js: "text/javascript", ts: "text/typescript", py: "text/x-python", java: "text/x-java", sh: "text/x-shellscript", csv: "text/csv", xml: "application/xml", yml: "text/yaml", yaml: "text/yaml" };
const mime = p => MIMES[(p.split(".").pop() || "").toLowerCase()] || "text/plain";
const rid = (repo, path) => repo + "__" + path.replace(/\//g, "~");
const enc = new TextEncoder();
const S = v => ({ stringValue: String(v) }), I = v => ({ integerValue: String(Math.trunc(v)) });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const un = f => { const o = {}; for (const k in f || {}) { const v = f[k]; o[k] = v.stringValue !== undefined ? v.stringValue : v.integerValue !== undefined ? Number(v.integerValue) : v.booleanValue !== undefined ? v.booleanValue : v.arrayValue ? (v.arrayValue.values || []).map(x => x.stringValue) : null } return o };
const idOf = d => d.name.split("/").slice(6).join("/");
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: "EQUAL", value: { stringValue: v } } });
const b64u = b => { let s = ""; const u = new Uint8Array(b); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };

let CACHE = { tok: "", exp: 0, email: "" };
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
    commit: w => call("POST", ":commit", { writes: w }),
    batchGet: async names => ((await call("POST", ":batchGet", { documents: names })) || []).filter(x => x.found).map(x => x.found),
  };
}

export const onRequest = () => J({ ok: false, error: "metodo_nao_permitido" }, 405);

export async function onRequestPost({ request, env }) {
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
    if (await db.get("/bans/" + E(uid))) return J({ ok: false, error: "conta_suspensa" }, 403);
    const mt = await db.get("/config/maintenance");
    if (mt && un(mt.fields).on === true) return J({ ok: false, error: "manutencao" }, 503);

    // limite de taxa por usuário: 60 chamadas por minuto
    const now = Date.now(), rl = await db.get("/climeta/" + E(uid));
    let w = 0, n = 0; if (rl) { const x = un(rl.fields); w = x.w || 0; n = x.n || 0 }
    if (now - w > WIN) { w = now; n = 0 }
    if (n >= MAXREQ) return J({ ok: false, error: "muitas_requisicoes", retry_s: Math.max(1, Math.ceil((w + WIN - now) / 1000)) }, 429);
    await db.patch("/climeta/" + E(uid), { w: I(w), n: I(n + 1) });
    if (now - (t.last || 0) > 600000) await db.patch("/tokens/" + h, { last: I(now) }, ["last"]);

    const op = b.op;
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
    if (op === "repos") {
      const ds = await db.query({ from: [{ collectionId: "repos" }], where: eq("uid", uid), limit: MAXREPOS + 1 });
      return J({ ok: true, repos: ds.map(d => { const x = un(d.fields); return { name: x.name, desc: x.desc || "", lang: x.lang || "", upd: x.upd || 0 } }).sort((a, c) => c.upd - a.upd) });
    }
    if (op === "new") {
      const name = b.name;
      if (typeof name !== "string" || !RE_NAME.test(name) || name === "." || name === "..") return J({ ok: false, error: "nome_invalido" }, 400);
      const desc = typeof b.desc === "string" ? b.desc.slice(0, 200) : "", lang = typeof b.lang === "string" && b.lang.length <= 40 ? b.lang : "Outro";
      const mine = await db.query({ from: [{ collectionId: "repos" }], where: eq("uid", uid), select: { fields: [{ fieldPath: "name" }] }, limit: MAXREPOS + 1 });
      if (mine.length >= MAXREPOS) return J({ ok: false, error: "limite_repos" }, 403);
      const id = uid + "__" + name;
      if (await db.get("/repos/" + E(id))) return J({ ok: false, error: "repo_existe" }, 409);
      const w = [{ update: { name: db.root + "/repos/" + id, fields: { uid: S(uid), name: S(name), desc: S(desc), lang: S(lang), topics: { arrayValue: { values: [S(lang)] } }, at: I(now), upd: I(now) } }, currentDocument: { exists: false } }];
      if (b.readme !== false) { const rt = "# " + name + "\n\n" + (desc || "Descreva seu projeto aqui.") + "\n"; w.push({ update: { name: db.root + "/rfiles/" + rid(id, "README.md"), fields: { repo: S(id), uid: S(uid), path: S("README.md"), content: S(rt), url: S(""), size: I(enc.encode(rt).length), mime: S("text/markdown"), at: I(now) } } }) }
      await db.commit(w);
      return J({ ok: true, name });
    }

    const rp = await repoOf(b.repo);
    if (!rp) return noRepo();
    const filesQ = sel => ({ from: [{ collectionId: "rfiles" }], where: eq("repo", rp.id), select: { fields: sel.map(f => ({ fieldPath: f })) }, limit: MAXF + 5 });

    if (op === "ls") {
      const ds = await db.query(filesQ(["path", "size", "mime", "url", "at"]));
      return J({ ok: true, files: ds.map(d => { const x = un(d.fields); return { path: x.path, size: x.size || 0, bin: !!x.url } }).sort((a, c) => a.path.localeCompare(c.path)) });
    }
    if (op === "push") {
      const files = Array.isArray(b.files) ? b.files : [];
      if (!files.length || files.length > MAXPUSH) return J({ ok: false, error: "lote_invalido", max: MAXPUSH }, 400);
      const have = new Set((await db.query(filesQ(["path"]))).map(d => un(d.fields).path));
      const okp = [], bad = [], writes = [], seen = new Set(); let cnt = have.size;
      for (const f of files) {
        const p = f && f.path, c = f && f.content, sp = String(p).slice(0, 80);
        if (!okPath(p)) { bad.push({ path: sp, reason: "caminho inválido" }); continue }
        if (typeof c !== "string" || c.length > MAXC) { bad.push({ path: p, reason: "maior que 200000 caracteres" }); continue }
        if (SECRET.test(c)) { bad.push({ path: p, reason: "parece conter senha, chave ou token" }); continue }
        if (seen.has(p)) continue; seen.add(p);
        if (!have.has(p)) { if (cnt >= MAXF) { bad.push({ path: p, reason: "limite de 100 arquivos por repositório" }); continue } cnt++ }
        writes.push({ update: { name: db.root + "/rfiles/" + rid(rp.id, p), fields: { repo: S(rp.id), uid: S(uid), path: S(p), content: S(c), url: S(""), size: I(enc.encode(c).length), mime: S(mime(p)), at: I(now) } } });
        okp.push(p);
      }
      if (writes.length) {
        writes.push({ update: { name: db.root + "/repos/" + rp.id, fields: { upd: I(now) } }, updateMask: { fieldPaths: ["upd"] }, currentDocument: { exists: true } });
        await db.commit(writes);
      }
      return J({ ok: true, sent: okp, rejected: bad });
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
      await db.del("/rfiles/" + E(fid));
      await db.patch("/repos/" + E(rp.id), { upd: I(now) }, ["upd"]);
      return J({ ok: true });
    }
    return J({ ok: false, error: "operacao_invalida" }, 400);
  } catch (e) {
    console.error("cli", e && e.message);
    return J({ ok: false, error: "erro_interno" }, 500);
  }
}
