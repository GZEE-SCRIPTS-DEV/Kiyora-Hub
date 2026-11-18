#!/usr/bin/env python3
"""kh: envie e baixe arquivos dos seus repositórios do Kiyora Hub pelo terminal.

Instalação rápida (Termux): python kh.py install   (depois use apenas: kh ...)

Fluxo mais fácil: entre na pasta do projeto, ligue ela a um repositório e envie:
  cd minha-pasta
  kh link meu-repo
  kh push

Uso:
  kh install                        instala o comando "kh" (Termux: $PREFIX/bin; outros: ~/.local/bin)
  kh login [TOKEN]                  salva seu token (gere em Repositórios > Conectar pelo terminal);
                                    também aceita o token por entrada padrão (<< EOF ... EOF)
  kh link REPO                      liga a pasta atual a um repositório (cria o arquivo .kiyora-repo)
  kh unlink                         desliga a pasta atual
  kh whoami               mostra a conta conectada
  kh repos                lista seus repositórios
  kh new NOME [descrição] cria um repositório
  kh ls REPO              lista os arquivos do repositório
  kh push REPO [PASTA]    envia os arquivos de texto da pasta (padrão: pasta atual)
        --dry        só mostra o que seria enviado
        -m "texto"   mensagem do commit (padrão: automática)
  kh pull REPO [PASTA]    baixa o repositório (use -f para sobrescrever)
  kh rm REPO ARQUIVO      apaga um arquivo do repositório (aceita -m "texto")
  kh history REPO         mostra os últimos commits do repositório
  kh log                  mostra quem usou sua conta pelo terminal (últimos registros)
  kh doctor               testa se tudo funciona (inclusive nomes com espaço)

Com a pasta ligada (kh link), o nome do repositório pode ser omitido:
  kh push   |   kh push -m "texto"   |   kh pull   |   kh ls   |   kh history
  kh logout               remove o token salvo
"""
import fnmatch, getpass, json, os, pathlib, re, stat, sys, urllib.error, urllib.request

URL = os.environ.get("KH_URL", "https://kiyora-hub.pages.dev").rstrip("/")
CFG = pathlib.Path(os.environ.get("KH_CONFIG", str(pathlib.Path.home() / ".kiyora.json")))
UA = "kh-cli/1.1"
MAX_CHARS, BATCH_FILES, BATCH_CHARS = 200000, 25, 1500000
RE_PATH = re.compile(r"^[A-Za-z0-9._ -]+(/[A-Za-z0-9._ -]+){0,5}$")
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".idea", ".vscode", ".gradle", "dist", "build"}
SKIP_FILES = [".env", ".env.*", "*.pem", "*.key", "*.p12", "id_rsa*", ".kiyora.json", ".kiyora-repo", "kh.py", ".DS_Store", "*.pyc", "*.log"]
ERR = {
    "token_invalido": "Token inválido ou revogado. Gere outro no site e rode: kh login",
    "conta_suspensa": "Sua conta está suspensa.",
    "manutencao": "O Kiyora Hub está em manutenção. Tente mais tarde.",
    "repo_nao_encontrado": "Repositório não encontrado (confira o nome com: kh repos).",
    "nome_invalido": "Nome inválido. Use letras, números, ponto, hífen e sublinhado (até 60).",
    "repo_existe": "Você já tem um repositório com esse nome.",
    "limite_repos": "Limite de repositórios atingido.",
    "arquivo_nao_encontrado": "Arquivo não encontrado nesse repositório.",
    "servidor_nao_configurado": "O servidor ainda não foi configurado pelo administrador do site.",
    "muitas_requisicoes": "Muitas requisições. Aguarde um pouco e tente de novo.",
    "token_expirado": "Este token expirou. Gere outro no site (Repositórios > Conectar pelo terminal) e rode: kh login",
    "token_somente_leitura": "Este token é somente leitura e não pode alterar repositórios.",
    "token_outro_repo": "Este token só vale para outro repositório.",
}

def die(msg, code=1):
    print("erro: " + msg, file=sys.stderr)
    sys.exit(code)

def load():
    try:
        return json.loads(CFG.read_text()).get("token", "")
    except Exception:
        return ""

def save(token):
    CFG.write_text(json.dumps({"token": token}))
    try:
        CFG.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except Exception:
        pass

def api(token, op, **kw):
    body = json.dumps(dict(op=op, **kw)).encode()
    req = urllib.request.Request(URL + "/api/cli", data=body, method="POST", headers={
        "authorization": "Bearer " + token, "content-type": "application/json", "user-agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            j = json.loads(e.read().decode())
        except Exception:
            j = {}
        key = j.get("error", "")
        msg = ERR.get(key) or ("falha (%s) %s" % (e.code, key))
        if key == "muitas_requisicoes" and j.get("retry_s"):
            msg += " (cerca de %ss)" % j["retry_s"]
        die(msg)
    except urllib.error.URLError as e:
        die("sem conexão com %s (%s)" % (URL, e.reason))

def take_msg(a):
    """tira '-m texto' da lista de argumentos e devolve (args, msg)"""
    if "-m" in a:
        i = a.index("-m")
        if i + 1 >= len(a):
            die('use: -m "mensagem"')
        return a[:i] + a[i + 2:], a[i + 1]
    return a, None

def when(ms):
    import datetime
    try:
        return datetime.datetime.fromtimestamp(ms / 1000).strftime("%d/%m/%Y %H:%M")
    except Exception:
        return "?"

LINK = ".kiyora-repo"

def linked(cwd=None):
    p = pathlib.Path(cwd or ".") / LINK
    try:
        r = json.loads(p.read_text()).get("repo", "")
        return r if re.match(r"^[A-Za-z0-9._-]{1,60}$", r or "") else ""
    except Exception:
        return ""

def repo_args(a, need_dir=False):
    """devolve (repo, resto). Se a pasta está ligada a um repositório, o nome pode ser omitido."""
    lk = linked()
    if lk and (not a or (need_dir and pathlib.Path(a[0]).is_dir())):
        return lk, a
    if not a:
        die("informe o repositório (ou use: kh link REPO nesta pasta)")
    return a[0], a[1:]

def need_token():
    t = os.environ.get("KH_TOKEN") or load()
    if not t:
        die("você ainda não fez login. Rode: kh login")
    return t

def ignored(rel, patterns):
    name = rel.split("/")[-1]
    return any(fnmatch.fnmatch(name, p) or fnmatch.fnmatch(rel, p) for p in patterns)

def collect(root):
    pats = list(SKIP_FILES)
    kh = root / ".khignore"
    if kh.is_file():
        pats += [l.strip() for l in kh.read_text(errors="ignore").splitlines() if l.strip() and not l.startswith("#")]
    files, skipped = [], []
    for dp, dns, fns in os.walk(root):
        dns[:] = sorted(d for d in dns if d not in SKIP_DIRS)
        for fn in sorted(fns):
            full = pathlib.Path(dp) / fn
            rel = full.relative_to(root).as_posix()
            if ignored(rel, pats):
                continue
            if not RE_PATH.match(rel) or len(rel) > 200 or any(s in (".", "..") or s != s.strip() for s in rel.split("/")):
                skipped.append((rel, "nome ou caminho não permitido (letras, números, . _ - e espaço; até 6 pastas)"))
                continue
            try:
                data = full.read_bytes()
            except Exception:
                skipped.append((rel, "não foi possível ler"))
                continue
            if b"\x00" in data[:8000]:
                skipped.append((rel, "arquivo binário (envie pelo site)"))
                continue
            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError:
                skipped.append((rel, "não é texto UTF-8"))
                continue
            if len(text) > MAX_CHARS:
                skipped.append((rel, "maior que 200000 caracteres"))
                continue
            files.append((rel, text))
    return files, skipped

def cmd_login(a):
    if a:
        t = a[0].strip()
    elif not sys.stdin.isatty():
        t = ""
        for line in sys.stdin:
            if line.strip():
                t = line.strip()
                break
    else:
        t = getpass.getpass("Cole seu token (kh_...): ").strip()
    if not re.match(r"^kh_[a-f0-9]{48}$", t):
        die("token com formato inválido.")
    j = api(t, "whoami")
    save(t)
    print("Conectado como %s (token: %s)." % (j.get("name") or j.get("uid"), j.get("token") or "sem nome"))

def cmd_whoami(a):
    j = api(need_token(), "whoami")
    print("%s (id %s), token: %s" % (j.get("name") or "sem nome", j["uid"], j.get("token") or "sem nome"))

def cmd_repos(a):
    j = api(need_token(), "repos")
    if not j["repos"]:
        return print("Nenhum repositório. Crie com: kh new NOME")
    for r in j["repos"]:
        print("%-30s %-12s %s" % (r["name"], r["lang"], r["desc"]))

def cmd_new(a):
    if not a:
        die("uso: kh new NOME [descrição]")
    j = api(need_token(), "new", name=a[0], desc=" ".join(a[1:]))
    print("Repositório criado: " + j["name"])

def cmd_ls(a):
    repo, _ = repo_args(a)
    j = api(need_token(), "ls", repo=repo)
    if not j["files"]:
        return print("(vazio)")
    for f in j["files"]:
        print("%8d  %s%s" % (f["size"], f["path"], "  [binário]" if f["bin"] else ""))

def cmd_push(a):
    dry = "--dry" in a
    a = [x for x in a if x != "--dry"]
    a, msg = take_msg(a)
    repo, rest = repo_args(a, need_dir=True)
    root = pathlib.Path(rest[0] if rest else ".").resolve()
    if not root.is_dir():
        die("pasta não encontrada: %s" % root)
    files, skipped = collect(root)
    print("%d arquivo(s) de texto para enviar de %s" % (len(files), root))
    for rel, why in skipped:
        print("  ignorado: %s (%s)" % (rel, why))
    if dry or not files:
        for rel, _ in files:
            print("  " + rel)
        return
    t = need_token()
    sent = 0
    same = 0
    rejected = []
    batch, size = [], 0
    def flush():
        nonlocal batch, size, sent, same
        if not batch:
            return
        kw = {"msg": msg} if msg else {}
        j = api(t, "push", repo=repo, files=[{"path": p, "content": c} for p, c in batch], **kw)
        sent += len(j.get("sent", []))
        same += len(j.get("same", []))
        rejected.extend(j.get("rejected", []))
        for p in j.get("sent", []):
            print("  enviado: " + p)
        batch, size = [], 0
    for rel, text in files:
        if batch and (len(batch) >= BATCH_FILES or size + len(text) > BATCH_CHARS):
            flush()
        batch.append((rel, text))
        size += len(text)
    flush()
    for r in rejected:
        print("  recusado pelo servidor: %s (%s)" % (r["path"], r["reason"]))
    print("Pronto: %d enviado(s), %d já estavam iguais, %d recusado(s)." % (sent, same, len(rejected)))

def cmd_pull(a):
    force = "-f" in a
    a = [x for x in a if x != "-f"]
    repo, rest = repo_args(a, need_dir=True)
    t = need_token()
    dest = pathlib.Path(rest[0] if rest else ("." if linked() else repo)).resolve()
    ls = api(t, "ls", repo=repo)["files"]
    done = 0
    for i in range(0, len(ls), 10):
        chunk = ls[i:i + 10]
        got = api(t, "get", repo=repo, paths=[f["path"] for f in chunk])["files"]
        for f in got:
            rel = f["path"]
            if rel.startswith("/") or any(s in ("", ".", "..") for s in rel.split("/")):
                print("  ignorado (caminho suspeito): " + rel)
                continue
            out = (dest / rel).resolve()
            if dest not in out.parents:
                print("  ignorado (fora da pasta): " + rel)
                continue
            if out.exists() and not force:
                print("  já existe (use -f para sobrescrever): " + rel)
                continue
            out.parent.mkdir(parents=True, exist_ok=True)
            if f.get("url"):
                if not f["url"].startswith("https://"):
                    continue
                try:
                    req = urllib.request.Request(f["url"], headers={"user-agent": UA})
                    with urllib.request.urlopen(req, timeout=60) as r:
                        out.write_bytes(r.read())
                except Exception as e:
                    print("  falhou o download de %s (%s)" % (rel, e))
                    continue
            else:
                out.write_text(f["content"], encoding="utf-8")
            done += 1
            print("  baixado: " + rel)
    print("Pronto: %d arquivo(s) em %s" % (done, dest))

def cmd_rm(a):
    a, msg = take_msg(a)
    if len(a) < 2:
        die('uso: kh rm REPO ARQUIVO [-m "mensagem"]')
    kw = {"msg": msg} if msg else {}
    api(need_token(), "rm", repo=a[0], path=a[1], **kw)
    print("Apagado: " + a[1])

def cmd_history(a):
    repo, _ = repo_args(a)
    j = api(need_token(), "history", repo=repo)
    if not j["commits"]:
        return print("(sem commits)")
    for c in j["commits"]:
        n = len(c.get("ch", []))
        print("%s  %-8s %2d arquivo(s)  %s" % (when(c["at"]), "terminal" if c.get("via") == "cli" else "site", n, c.get("msg", "")))

def cmd_log(a):
    j = api(need_token(), "logs")
    if not j["logs"]:
        return print("(sem registros ainda)")
    print("Registros de uso da sua conta pelo terminal (privados, só você vê):")
    for l in j["logs"]:
        print("%s  %-6s %-22s token %-12s %s %s  %s" % (when(l["at"]), l["op"], l.get("repo") or "-", l.get("tk") or "-",
              l.get("cc") or "??", l.get("ip") or "", "ok" if l.get("ok") else "FALHOU"))

def cmd_doctor(a):
    t = need_token()
    j = api(t, "whoami")
    print("conexão e token: ok (%s)" % (j.get("name") or j["uid"]))
    d = api(t, "doctor")
    print("nomes com espaço: gravar/ler/apagar ->", "ok" if d.get("get") and d.get("batch") and d.get("del") else "PROBLEMA %s" % d)
    if not (d.get("get") and d.get("batch") and d.get("del")):
        print("Avise o administrador do site: arquivos com espaço no nome podem não funcionar pelo terminal.")

def cmd_link(a):
    if not a or not re.match(r"^[A-Za-z0-9._-]{1,60}$", a[0]):
        die("uso: kh link REPO   (nome do repositório, ex.: meu-repo)")
    pathlib.Path(LINK).write_text(json.dumps({"repo": a[0]}))
    print("Pasta ligada ao repositório %s. Agora use: kh push" % a[0])

def cmd_unlink(a):
    try:
        pathlib.Path(LINK).unlink()
        print("Pasta desligada.")
    except FileNotFoundError:
        print("Esta pasta não estava ligada.")

def cmd_install(a):
    import shutil
    me = pathlib.Path(__file__).resolve()
    prefix = os.environ.get("PREFIX", "")
    if prefix and (pathlib.Path(prefix) / "bin").is_dir():
        dest_dir = pathlib.Path(prefix) / "bin"
    else:
        dest_dir = pathlib.Path.home() / ".local" / "bin"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "kh"
    shutil.copyfile(str(me), str(dest))
    dest.chmod(0o755)
    print("Instalado em %s. Agora use o comando: kh help" % dest)
    if str(dest_dir) not in os.environ.get("PATH", "").split(os.pathsep):
        print('Atenção: %s não está no seu PATH. Adicione com:\n  export PATH="%s:$PATH"' % (dest_dir, dest_dir))

def cmd_logout(a):
    try:
        CFG.unlink()
    except FileNotFoundError:
        pass
    print("Token removido deste aparelho. Para revogar de vez, use o site.")

CMDS = {"link": cmd_link, "unlink": cmd_unlink, "install": cmd_install, "history": cmd_history, "log": cmd_log, "doctor": cmd_doctor, "login": cmd_login, "whoami": cmd_whoami, "repos": cmd_repos, "new": cmd_new, "ls": cmd_ls,
        "push": cmd_push, "pull": cmd_pull, "rm": cmd_rm, "logout": cmd_logout}

def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help", "help"):
        return print(__doc__)
    f = CMDS.get(sys.argv[1])
    if not f:
        die("comando desconhecido: %s. Rode: kh help" % sys.argv[1])
    f(sys.argv[2:])

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        die("cancelado", 130)
