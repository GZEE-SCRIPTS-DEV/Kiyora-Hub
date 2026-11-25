import fs from 'fs'; import http from 'http'; import crypto from 'crypto'; import { spawn } from 'child_process'; import os from 'os'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const PROJ=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), KH=path.join(PROJ,'kh.py'), PY=process.env.PYTHON||'python3';
const { privateKey: priv, publicKey: pub } = crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const SA=JSON.stringify({project_id:'proj-x',client_email:'sa@proj-x.iam.gserviceaccount.com',private_key:priv});
// ---------- Firestore + OAuth simulados ----------
const DB=new Map(); // "coll/id" -> fields
let calls=0, tokenCalls=0;
const ROOT='projects/proj-x/databases/(default)/documents';
const j=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
function applyUpdate(w){if(w.delete){const k=w.delete.slice(ROOT.length+1);DB.delete(k);return null}const name=w.update.name; if(!name.startsWith(ROOT+'/'))throw new Error('nome fora da raiz '+name); const key=name.slice(ROOT.length+1);
  const ex=DB.has(key); if(w.currentDocument&&w.currentDocument.exists===false&&ex)return 'exists'; if(w.currentDocument&&w.currentDocument.exists===true&&!ex)return 'missing';
  if(w.updateMask){const cur=DB.get(key)||{};for(const f of w.updateMask.fieldPaths)cur[f]=w.update.fields[f];DB.set(key,cur)}else DB.set(key,w.update.fields);return null}
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,opt={})=>{
  const u=new URL(url);
  if(u.host==='oauth2.googleapis.com'){const body=new URLSearchParams(opt.body);const [h,c,s]=body.get('assertion').split('.');
    const ok=crypto.verify('RSA-SHA256',Buffer.from(h+'.'+c),pub,Buffer.from(s,'base64url'));const claims=JSON.parse(Buffer.from(c,'base64url'));
    if(!ok||claims.scope!=='https://www.googleapis.com/auth/datastore'||claims.iss!==JSON.parse(SA).client_email)return j({error:'bad jwt'},400);tokenCalls++;return j({access_token:'AT123',expires_in:3600})}
  if(u.host==='firestore.googleapis.com'){calls++;if(FS_FORBIDDEN)return j({error:{code:403}},403);if(opt.headers.authorization!=='Bearer AT123')return j({error:'unauth'},401);
    const p=decodeURIComponent(u.pathname).replace('/v1/'+ROOT,''); const body=opt.body?JSON.parse(opt.body):null; const m=opt.method||'GET';
    if(p===':runQuery'){const q=body.structuredQuery,coll=q.from[0].collectionId;const f=q.where&&q.where.fieldFilter;let out=[];
      for(const [k,v] of [...DB].sort((a,b)=>a[0]<b[0]?-1:1)){if(!k.startsWith(coll+'/'))continue;if(f&&(v[f.field.fieldPath]||{}).stringValue!==f.value.stringValue)continue;
        let fields=v;if(q.select){fields={};for(const s of q.select.fields)if(v[s.fieldPath])fields[s.fieldPath]=v[s.fieldPath]}out.push({document:{name:ROOT+'/'+k,fields}})}
      return j(out.slice(0,q.limit||1e9).length?out.slice(0,q.limit||1e9):[{}])}
    if(p===':runAggregationQuery'){const q=body.structuredAggregationQuery.structuredQuery,coll=q.from[0].collectionId,f=q.where&&q.where.fieldFilter;let n=0;
      for(const [k,v] of DB){if(!k.startsWith(coll+'/'))continue;if(f&&(v[f.field.fieldPath]||{}).stringValue!==f.value.stringValue)continue;n++}
      const up=Number(body.structuredAggregationQuery.aggregations[0].count.upTo);return j([{result:{aggregateFields:{n:{integerValue:String(Math.min(n,up))}}}}])}
    if(p===':commit'){const bad=[];for(const w of body.writes){const r=applyUpdate(w);if(r)bad.push(r)}return bad.length?j({error:{message:'precondition '+bad}},409):j({writeResults:[]})}
    if(p===':batchGet')return j(body.documents.map(n=>{const k=n.slice(ROOT.length+1);return DB.has(k)?{found:{name:n,fields:DB.get(k)}}:{missing:n}}));
    const key=p.slice(1);
    if(m==='GET')return DB.has(key)?j({name:ROOT+'/'+key,fields:DB.get(key)}):j({error:{code:404}},404);
    if(m==='DELETE'){DB.delete(key);return j({})}
    if(m==='PATCH'){const mask=[...u.searchParams.getAll('updateMask.fieldPaths')];const cur=mask.length?(DB.get(key)||{}):{};for(const f in body.fields)if(!mask.length||mask.includes(f))cur[f]=body.fields[f];DB.set(key,cur);return j({name:ROOT+'/'+key,fields:cur})}
    return j({error:'rota'},400)}
  return realFetch(url,opt)};
const { onRequestPost, onRequest, _test } = await import(pathToFileURL(path.join(PROJ,'functions/api/cli.js')).href);
const pending=[];let SRV_ENV={FIREBASE_SA:SA};let FS_FORBIDDEN=false;
const srv=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);
  const request=new Request('http://x'+req.url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined});
  const r=await (req.method==='POST'?onRequestPost({request,env:SRV_ENV,waitUntil:p=>pending.push(p)}):onRequest());res.writeHead(r.status,{'content-type':'application/json'});res.end(await r.text())});
await new Promise(r=>srv.listen(0,'127.0.0.1',r)); const PORT=srv.address().port;
// ---------- helpers de teste ----------
const sha=t=>crypto.createHash('sha256').update(t).digest('hex'); const S=v=>({stringValue:v}),I=v=>({integerValue:String(v)});
const mkTok=(uid,name)=>{const t='kh_'+crypto.randomBytes(24).toString('hex');DB.set('tokens/'+sha(t),{uid:S(uid),name:S(name),at:I(1)});return t};
const T1=mkTok('Uaaa111','celular'),T2=mkTok('Ubbb222','outro');DB.set('profiles/Uaaa111',{name:S('Gzee')});
const home=fs.mkdtempSync(path.join(os.tmpdir(),'khh-'));
const khRun=(cmd,args,env={},opt={})=>new Promise(res=>{const p=spawn(cmd,args,{cwd:opt.cwd,env:{...process.env,KH_URL:'http://127.0.0.1:'+PORT,KH_CONFIG:path.join(home,'cfg.json'),...env}});let o='',e='';p.stdout.on('data',d=>o+=d);p.stderr.on('data',d=>e+=d);p.on('close',c=>res({c,o,e}));if(opt.input!==undefined)p.stdin.end(opt.input);else p.stdin.end()});
const kh=(args,env={},opt={})=>khRun(PY,[KH,...args],env,opt);
const flush=async()=>{await Promise.all(pending.splice(0))};let pass=0,fail=0;const t=(n,c,x='')=>{c?pass++:fail++;console.log((c?'ok   ':'FALHOU')+' '+n+(c?'':'  -> '+x))};
// ---------- cenários ----------
let r=await kh(['whoami'],{KH_TOKEN:'kh_'+'0'.repeat(48)}); t('token inexistente é recusado',r.c!==0&&/inválido/.test(r.e),r.e);
r=await kh(['login','abc']); t('login com formato errado',r.c!==0);
r=await kh(['login',T1]); t('login válido',r.c===0&&/Gzee/.test(r.o),r.o+r.e);
t('config salva com permissão 600',(fs.statSync(path.join(home,'cfg.json')).mode&0o777)===0o600);
r=await kh(['new','meu-repo','Teste de descrição']); t('criar repositório',r.c===0,r.e);
t('repo gravado com campos corretos',DB.get('repos/Uaaa111__meu-repo')?.uid?.stringValue==='Uaaa111'&&DB.get('repos/Uaaa111__meu-repo')?.topics?.arrayValue?.values?.[0]?.stringValue==='Outro');
t('README criado',DB.has('rfiles/Uaaa111__meu-repo__README.md'));
r=await kh(['new','meu-repo']); t('repo duplicado recusado',r.c!==0&&/já tem/.test(r.e),r.e);
r=await kh(['new','../x']); t('nome inválido recusado',r.c!==0);
r=await kh(['repos']); t('lista repos',/meu-repo/.test(r.o),r.o);
// pasta de teste
const d=fs.mkdtempSync(path.join(os.tmpdir(),'khp-'));
const w=(p,c)=>{fs.mkdirSync(path.dirname(path.join(d,p)),{recursive:true});fs.writeFileSync(path.join(d,p),c)};
w('main.py','print("oi")\n');w('src/util.js','export const a=1;\n');w('docs/guia final.md','# guia\n');w('.env','SENHA=1');w('node_modules/x/i.js','x');w('.git/config','x');
w('chave.txt','token ghp_'+'a'.repeat(36));w('seg.pem','x');w('longo.txt','a'.repeat(200001));w('acentuação.txt','x');
fs.writeFileSync(path.join(d,'img.png'),Buffer.from([137,80,78,71,0,0,0,1]));w('a/b/c/d/e/f/g/h.txt','fundo');
r=await kh(['push','meu-repo',d,'--dry']); t('dry-run não grava',!DB.has('rfiles/Uaaa111__meu-repo__main.py')&&/main\.py/.test(r.o),r.o+r.e);
r=await kh(['push','meu-repo',d]); console.log(r.o.split('\n').map(x=>'    | '+x).join('\n'),r.e);
t('push ok',r.c===0&&/Pronto/.test(r.o));
const has=k=>DB.has('rfiles/Uaaa111__meu-repo__'+k);
t('main.py enviado',has('main.py'));t('subpasta usa ~ no id',has('src~util.js'));t('nome com espaço enviado',has('docs~guia final.md'));
t('.env NÃO enviado',![...DB.keys()].some(k=>k.includes('.env')));t('node_modules/.git NÃO enviados',![...DB.keys()].some(k=>/node_modules|\.git/.test(k)));
t('chave pem NÃO enviada',![...DB.keys()].some(k=>k.includes('seg.pem')));
t('arquivo com token recusado pelo servidor',!has('chave.txt')&&/recusado pelo servidor: chave\.txt/.test(r.o),r.o);
t('arquivo >200k ignorado no cliente',!has('longo.txt')&&/longo\.txt/.test(r.o));t('acentuação ignorada (nome inválido)',!has('acentuação.txt')&&/acentua/.test(r.o));
t('binário ignorado',!has('img.png')&&/img\.png/.test(r.o));t('6 níveis de pasta enviados?',!has('a~b~c~d~e~f~g~h.txt')&&/a\/b\/c\/d\/e\/f\/g\/h\.txt/.test(r.o),'(7 níveis deve ser ignorado)');
const f=DB.get('rfiles/Uaaa111__meu-repo__main.py');
t('campos do arquivo iguais aos do site',f.repo.stringValue==='Uaaa111__meu-repo'&&f.uid.stringValue==='Uaaa111'&&f.path.stringValue==='main.py'&&f.content.stringValue==='print("oi")\n'&&f.url.stringValue===''&&f.size.integerValue==='12'&&f.mime.stringValue==='text/x-python'&&Object.keys(f).sort().join()==='at,content,mime,path,repo,size,uid,url',JSON.stringify(f));
t('upd do repo atualizado',Number(DB.get('repos/Uaaa111__meu-repo').upd.integerValue)>Number(DB.get('repos/Uaaa111__meu-repo').at.integerValue)-1);
r=await kh(['ls','meu-repo']); t('ls lista arquivos',/main\.py/.test(r.o)&&/README\.md/.test(r.o),r.o);
// outro usuário não acessa o repo
r=await kh(['ls','meu-repo'],{KH_TOKEN:T2}); t('outro usuário não enxerga o repo',r.c!==0&&/não encontrado/.test(r.e),r.e+r.o);
r=await kh(['push','meu-repo',d],{KH_TOKEN:T2}); t('outro usuário não consegue enviar',r.c!==0);
// pull
const out=fs.mkdtempSync(path.join(os.tmpdir(),'khl-'));
r=await kh(['pull','meu-repo',out]); t('pull baixa arquivos',fs.readFileSync(path.join(out,'main.py'),'utf8')==='print("oi")\n'&&fs.existsSync(path.join(out,'src/util.js'))&&fs.existsSync(path.join(out,'docs/guia final.md')),r.o+r.e);
r=await kh(['pull','meu-repo',out]); t('pull não sobrescreve sem -f',/já existe/.test(r.o));
// pull com caminho malicioso gravado no banco
DB.set('rfiles/Uaaa111__meu-repo__evil',{repo:S('Uaaa111__meu-repo'),uid:S('Uaaa111'),path:S('../../evil.txt'),content:S('x'),url:S(''),size:I(1),mime:S('text/plain'),at:I(1)});
const out2=fs.mkdtempSync(path.join(os.tmpdir(),'khl2-'));r=await kh(['pull','meu-repo',path.join(out2,'dest')]);
t('pull ignora caminho com ..',!fs.existsSync(path.join(out2,'evil.txt'))&&!fs.existsSync(path.join(out2,'..','evil.txt')),r.o);DB.delete('rfiles/Uaaa111__meu-repo__evil');
// rm
r=await kh(['rm','meu-repo','main.py']);t('rm apaga',r.c===0&&!has('main.py'),r.e);
r=await kh(['rm','meu-repo','main.py']);t('rm de inexistente falha',r.c!==0);
r=await kh(['rm','meu-repo','src/util.js'],{KH_TOKEN:T2});t('rm por outro usuário falha',r.c!==0&&has('src~util.js'));
// limite de 100 arquivos
const big=fs.mkdtempSync(path.join(os.tmpdir(),'khb-'));for(let i=0;i<120;i++)fs.writeFileSync(path.join(big,'f'+i+'.txt'),'n'+i);
await kh(['new','cheio','x']);r=await kh(['push','cheio',big]);
const cnt=[...DB.keys()].filter(k=>k.startsWith('rfiles/Uaaa111__cheio__')).length;
t('limite de 100 arquivos (README conta)',cnt===100&&/limite de 100/.test(r.o),'arquivos='+cnt);
// secret check do servidor com o formato do site
// manutenção, banimento
_test.FLAGS.clear();DB.set('config/maintenance',{on:{booleanValue:true}});r=await kh(['repos']);t('manutenção bloqueia (503)',r.c!==0&&/manuten/.test(r.e),r.e);DB.delete('config/maintenance');_test.FLAGS.clear();
DB.set('bans/Uaaa111',{at:I(1)});_test.FLAGS.clear();r=await kh(['repos']);t('conta banida bloqueada (403)',r.c!==0&&/suspensa/.test(r.e),r.e);DB.delete('bans/Uaaa111');_test.FLAGS.clear();
DB.set('tokens/'+sha(T2)+'_x',{});r=await kh(['whoami']);t('depois de remover ban volta a funcionar',r.c===0,r.e);
// revogar token
DB.delete('tokens/'+sha(T1));r=await kh(['whoami']);t('token revogado deixa de funcionar',r.c!==0&&/inválido/.test(r.e),r.e);DB.set('tokens/'+sha(T1),{uid:S('Uaaa111'),name:S('celular'),at:I(1)});

// ================= NOVO: commits, versões, logs, qualidade =================
await flush();
const keys=pre=>[...DB.keys()].filter(k=>k.startsWith(pre)).sort();
const commits=()=>keys('rcommits/Uaaa111__meu-repo__').map(k=>({id:k,f:DB.get(k)}));
const cm=commits();
t('commit inicial do repo criado (new)',cm.some(c=>c.f.msg.stringValue==='Cria repositório'&&c.f.via.stringValue==='cli'));
t('commits do push gravados',cm.length>=2,'n='+cm.length);
const last=cm[0]; // ids em ordem "mais novo primeiro"
t('id do commit: repo__13dígitos_rand',/^rcommits\/Uaaa111__meu-repo__\d{13}_[a-z0-9]{5}$/.test(last.id),last.id);
t('commit mais novo vem primeiro na ordem de id',Number(last.f.at.integerValue)>=Number(cm[cm.length-1].f.at.integerValue));
const pushC=cm.find(c=>c.f.ch.arrayValue.values.some(v=>v.stringValue.startsWith('a|main.py|')));
t('commit lista as mudanças a|caminho|tamanho',!!pushC&&pushC.f.ch.arrayValue.values.some(v=>v.stringValue==='a|src/util.js|18'),JSON.stringify(pushC&&pushC.f.ch));
t('commit tem uid/repo/at e só campos conhecidos',Object.keys(pushC.f).sort().join()==='at,ch,msg,repo,uid,via',Object.keys(pushC.f).join());
const cid=pushC.id.slice('rcommits/'.length);
const vk=keys('rver/'+cid+'__');
t('versões gravadas (uma por arquivo de texto)',vk.length>=3,vk.join(' | '));
const vmain=DB.get('rver/'+cid+'__main.py');
t('versão tem conteúdo, op=a e campos corretos',vmain&&vmain.content.stringValue==='print("oi")\n'&&vmain.op.stringValue==='a'&&vmain.big.booleanValue===false&&Object.keys(vmain).sort().join()==='at,big,commit,content,op,path,repo,size,uid',JSON.stringify(vmain));
t('versão de arquivo em subpasta usa ~',!!DB.get('rver/'+cid+'__src~util.js'));
// push sem mudanças -> nada novo
r=await kh(['push','meu-repo',d]);await flush();const afterFirst=commits().length;
r=await kh(['push','meu-repo',d]);await flush();
t('push repetido ignora iguais e não cria commit',/já estavam iguais/.test(r.o)&&commits().length===afterFirst&&!/enviado: /.test(r.o),r.o);
// modificar um arquivo -> op m e versão nova
fs.writeFileSync(path.join(d,'src/util.js'),'export const a=2;\nexport const b=3;\n');
r=await kh(['push','meu-repo',d,'-m','Muda util: a=2 e b']);await flush();
const cm2=commits();const mod=cm2.find(c=>c.f.msg.stringValue==='Muda util: a=2 e b');
t('mensagem -m usada no commit',!!mod);
t('op m registrada para arquivo existente',mod&&mod.f.ch.arrayValue.values.length===1&&/^m\|src\/util\.js\|/.test(mod.f.ch.arrayValue.values[0].stringValue),JSON.stringify(mod&&mod.f.ch));
const vm=DB.get('rver/'+mod.id.slice(9)+'__src~util.js');t('versão nova guardada (op m)',vm&&vm.content.stringValue==='export const a=2;\nexport const b=3;\n'&&vm.op.stringValue==='m');
t('versão antiga continua guardada',DB.get('rver/'+cid+'__src~util.js').content.stringValue==='export const a=1;\n');
// rm cria commit com op d e guarda conteúdo apagado
r=await kh(['rm','meu-repo','src/util.js','-m','Apaga util']);await flush();
const del=commits().find(c=>c.f.msg.stringValue==='Apaga util');t('rm cria commit',!!del&&/^d\|src\/util\.js\|/.test(del.f.ch.arrayValue.values[0].stringValue));
const vd=DB.get('rver/'+del.id.slice(9)+'__src~util.js');t('rm guarda o conteúdo apagado (para restaurar)',vd&&vd.op.stringValue==='d'&&vd.content.stringValue==='export const a=2;\nexport const b=3;\n',JSON.stringify(vd));
t('arquivo de fato removido',!DB.has('rfiles/Uaaa111__meu-repo__src~util.js'));
// arquivo grande: sem snapshot de conteúdo
fs.writeFileSync(path.join(d,'grande.txt'),'x'.repeat(60000));
r=await kh(['push','meu-repo',d]);await flush();
const gk=keys('rver/').find(k=>k.endsWith('__grande.txt'));const gv=DB.get(gk);
t('arquivo >50000 chars: versão marcada big e sem conteúdo',gv&&gv.big.booleanValue===true&&gv.content.stringValue==='',JSON.stringify(gv&&{big:gv.big,len:gv.content.stringValue.length}));
t('arquivo grande continua inteiro em rfiles',DB.get('rfiles/Uaaa111__meu-repo__grande.txt').content.stringValue.length===60000);
// history / logs via CLI
r=await kh(['history','meu-repo']);t('history lista commits',/Muda util/.test(r.o)&&/terminal/.test(r.o),r.o);
r=await kh(['log']);t('log mostra usos (push/rm/new)',/push/.test(r.o)&&/rm/.test(r.o)&&/new/.test(r.o)&&/celular/.test(r.o),r.o);
const lk=keys('clilogs/');const l0=DB.get(lk[0]);
t('registro tem campos esperados e sem IP completo',Object.keys(l0).sort().join()==='at,cc,exp,ip,n,ok,op,repo,tid,tk,uid',Object.keys(l0).join());
t('ids de log em ordem mais-novo-primeiro',/^clilogs\/\d{13}_[a-z0-9]{5}$/.test(lk[0]));
t('log guarda token (nome) e uid certos',l0.tk.stringValue==='celular'&&l0.uid.stringValue==='Uaaa111');
t('exp do log é um timestamp ~30 dias',(new Date(l0.exp.timestampValue)-Date.now())>29*86400000&&(new Date(l0.exp.timestampValue)-Date.now())<31*86400000);
// IP mascarado e país vêm dos cabeçalhos
{const t3=mkTok('Uccc333','teste-ip');DB.set('profiles/Uccc333',{name:S('Zed')});
 const rr=await realFetch('http://127.0.0.1:'+PORT+'/api/cli',{method:'POST',headers:{authorization:'Bearer '+t3,'content-type':'application/json','cf-connecting-ip':'203.0.113.77','cf-ipcountry':'br'},body:JSON.stringify({op:'whoami'})});await flush();
 const mine=keys('clilogs/').map(k=>DB.get(k)).filter(x=>x.uid.stringValue==='Uccc333');
 t('IPv4 mascarado (último octeto 0) e país em maiúsculas',mine.length===1&&mine[0].ip.stringValue==='203.0.113.0'&&mine[0].cc.stringValue==='BR',JSON.stringify(mine[0]));
 const tk3=DB.get('tokens/'+sha(t3));t('token guarda último uso com país e IP mascarado',tk3.lcc.stringValue==='BR'&&tk3.lip.stringValue==='203.0.113.0'&&Number(tk3.last.integerValue)>0,JSON.stringify(tk3));
 const rr2=await realFetch('http://127.0.0.1:'+PORT+'/api/cli',{method:'POST',headers:{authorization:'Bearer '+t3,'content-type':'application/json','cf-connecting-ip':'2001:db8:abcd:12::1'},body:JSON.stringify({op:'ls',repo:'nao-existe'})});await flush();
 const m2=keys('clilogs/').map(k=>DB.get(k)).filter(x=>x.uid.stringValue==='Uccc333'&&x.op.stringValue==='ls');
 t('IPv6 mascarado e falha registrada com ok=false',m2.length===1&&m2[0].ip.stringValue==='2001:db8:abcd::'&&m2[0].ok.booleanValue===false,JSON.stringify(m2[0]));}
// só dono vê os próprios logs
r=await kh(['log'],{KH_TOKEN:T2});t('outro usuário só vê os próprios logs (nenhum do token celular/new)',!/celular/.test(r.o)&&!/ new /.test(r.o)&&/outro/.test(r.o),r.o);
// doctor
r=await kh(['doctor']);t('doctor confirma nomes com espaço (gravar cru, ler/apagar codificado)',/nomes com espaço.*ok/.test(r.o),r.o+r.e);
t('doctor não deixa lixo',![...DB.keys()].some(k=>k.includes('kh doctor')));
// economia de leituras: contar chamadas ao Firestore por operação
{const c0=calls;await realFetch('http://127.0.0.1:'+PORT+'/api/cli',{method:'POST',headers:{authorization:'Bearer '+T1,'content-type':'application/json'},body:JSON.stringify({op:'push',repo:'meu-repo',files:[{path:'main.py',content:'print("oi")\n'},{path:'novo.txt',content:'n'}]})});await flush();
 const used=calls-c0;t('push de 2 arquivos usa poucas chamadas ao Firestore (<=12)',used<=12,'chamadas='+used);}
{_test.FLAGS.clear();const c0=calls;await realFetch('http://127.0.0.1:'+PORT+'/api/cli',{method:'POST',headers:{authorization:'Bearer '+T1,'content-type':'application/json'},body:JSON.stringify({op:'whoami'})});await realFetch('http://127.0.0.1:'+PORT+'/api/cli',{method:'POST',headers:{authorization:'Bearer '+T1,'content-type':'application/json'},body:JSON.stringify({op:'whoami'})});await flush();
 t('cache de banimento/manutenção evita leituras repetidas',(calls-c0)<=2*7-2,'chamadas='+(calls-c0));}
// 100 arquivos: contagem por agregação inclui commits? (só rfiles)

// ================= NOVO: validade, permissão, repositório único, Termux =================
const mkTok2=(uid,name,extra)=>{const t='kh_'+crypto.randomBytes(24).toString('hex');DB.set('tokens/'+sha(t),{uid:S(uid),name:S(name),at:I(1),...extra});return t};
const TEXP=mkTok2('Uaaa111','vencido',{ex:I(Date.now()-1000)});
r=await kh(['whoami'],{KH_TOKEN:TEXP});t('token vencido é recusado com mensagem clara',r.c!==0&&/expirou/.test(r.e),r.e);
const TOK=mkTok2('Uaaa111','valido',{ex:I(Date.now()+86400000),sc:S('rw')});
r=await kh(['whoami'],{KH_TOKEN:TOK});t('token dentro da validade funciona',r.c===0,r.e);
const TRO=mkTok2('Uaaa111','leitura',{ex:I(Date.now()+86400000),sc:S('r')});
r=await kh(['ls','meu-repo'],{KH_TOKEN:TRO});t('token somente leitura pode ler',r.c===0,r.e);
r=await kh(['push','meu-repo',d],{KH_TOKEN:TRO});t('token somente leitura NÃO consegue enviar',r.c!==0&&/somente leitura/.test(r.e),r.e);
r=await kh(['rm','meu-repo','README.md'],{KH_TOKEN:TRO});t('token somente leitura NÃO consegue apagar',r.c!==0&&has('README.md'));
r=await kh(['new','x-ro'],{KH_TOKEN:TRO});t('token somente leitura NÃO consegue criar repo',r.c!==0&&!DB.has('repos/Uaaa111__x-ro'));
await kh(['new','outro-repo','x']);
const TRP=mkTok2('Uaaa111','so-um',{ex:I(Date.now()+86400000),sc:S('rw'),rp:S('meu-repo')});
r=await kh(['ls','meu-repo'],{KH_TOKEN:TRP});t('token de um repositório acessa esse repositório',r.c===0,r.e);
r=await kh(['ls','outro-repo'],{KH_TOKEN:TRP});t('token de um repositório NÃO acessa outro',r.c!==0&&/outro repositório/.test(r.e),r.e);
r=await kh(['new','z-novo'],{KH_TOKEN:TRP});t('token de um repositório NÃO cria repositório',r.c!==0&&!DB.has('repos/Uaaa111__z-novo'));
r=await kh(['repos'],{KH_TOKEN:TRP});t('token de um repositório só lista esse repositório',/meu-repo/.test(r.o)&&!/outro-repo/.test(r.o),r.o);
r=await kh(['push','outro-repo',d],{KH_TOKEN:TRP});t('token de um repositório NÃO envia para outro',r.c!==0);
r=await kh(['whoami'],{KH_TOKEN:TRP});t('whoami funciona para token restrito',r.c===0);
{const rr=await realFetch('http://127.0.0.1:'+PORT+'/api/cli',{method:'POST',headers:{authorization:'Bearer '+TRP,'content-type':'application/json'},body:JSON.stringify({op:'whoami'})});const jj=await rr.json();
 t('whoami informa permissão, repositório e validade',jj.sc==='rw'&&jj.rp==='meu-repo'&&jj.ex>Date.now(),JSON.stringify(jj))}
// token antigo (sem campos novos) continua valendo como leitura+escrita
r=await kh(['whoami'],{KH_TOKEN:T1});t('token sem ex/sc/rp (antigo) continua válido',r.c===0);
// ---- Termux: login por entrada padrão, link, push sem argumentos, instalar comando ----
const home2=fs.mkdtempSync(path.join(os.tmpdir(),'khh2-'));const cfg2={KH_CONFIG:path.join(home2,'cfg.json')};
const tok3=mkTok2('Uaaa111','termux',{ex:I(Date.now()+86400000),sc:S('rw')});
r=await kh(['login'],cfg2,{input:'\n'+tok3+'\n'});t('login lendo o token da entrada padrão (<< EOF)',r.c===0&&/Conectado/.test(r.o),r.o+r.e);
t('token salvo e config 600',JSON.parse(fs.readFileSync(cfg2.KH_CONFIG,'utf8')).token===tok3&&(fs.statSync(cfg2.KH_CONFIG).mode&0o777)===0o600);
r=await kh(['login','kh_abc'],cfg2);t('login com token malformado falha',r.c!==0);
const proj=fs.mkdtempSync(path.join(os.tmpdir(),'khproj-'));fs.writeFileSync(path.join(proj,'app.py'),'print(1)\n');fs.mkdirSync(path.join(proj,'lib'));fs.writeFileSync(path.join(proj,'lib/x.js'),'x\n');
fs.copyFileSync(KH,path.join(proj,'kh.py'));
r=await kh(['push'],cfg2,{cwd:proj});t('push sem repositório e sem link pede o nome',r.c!==0&&/informe o repositório|link/.test(r.e),r.e);
r=await kh(['link','meu-repo'],cfg2,{cwd:proj});const linksF=path.join(home2,'kiyora-links.json');
t('link grava na configuração (e NÃO dentro da pasta do projeto)',r.c===0&&JSON.parse(fs.readFileSync(linksF,'utf8'))[fs.realpathSync(proj)]==='meu-repo'&&!fs.existsSync(path.join(proj,'.kiyora-repo')),r.o+r.e);
r=await kh(['link','../x'],cfg2,{cwd:proj});t('link com nome inválido falha',r.c!==0);
r=await kh(['push'],cfg2,{cwd:proj});await flush();t('push sem argumentos envia a pasta atual para o repo ligado',r.c===0&&has('app.py')&&has('lib~x.js'),r.o+r.e);
t('kh.py e .kiyora-repo NÃO são enviados',!has('kh.py')&&!has('.kiyora-repo')&&!/enviado: kh\.py/.test(r.o),r.o);
r=await kh(['ls'],cfg2,{cwd:path.join(proj,'lib')});t('subpasta herda a ligação da pasta acima',/app\.py/.test(r.o),r.o+r.e);
fs.writeFileSync(path.join(proj,'app.py'),'print(2)\n');
r=await kh(['push','-m','pelo termux'],cfg2,{cwd:proj});await flush();t('push -m sem repo usa o link e a mensagem',r.c===0&&commits().some(c=>c.f.msg.stringValue==='pelo termux'),r.o+r.e);
r=await kh(['ls'],cfg2,{cwd:proj});t('ls sem argumentos usa o repo ligado',/app\.py/.test(r.o),r.o);
r=await kh(['history'],cfg2,{cwd:proj});t('history sem argumentos usa o repo ligado',/pelo termux/.test(r.o),r.o);
const sub=path.join(proj,'lib');fs.writeFileSync(path.join(sub,'y.js'),'y\n');
r=await kh(['push','lib'],cfg2,{cwd:proj});await flush();t('push com link e pasta como argumento',r.c===0&&has('y.js'),r.o+r.e);
const pull2=fs.mkdtempSync(path.join(os.tmpdir(),'khpull-'));fs.writeFileSync(path.join(pull2,'.kiyora-repo'),JSON.stringify({repo:'meu-repo'}));
r=await kh(['pull'],cfg2,{cwd:pull2});t('arquivo .kiyora-repo do formato antigo ainda é entendido (pull sem argumentos)',fs.existsSync(path.join(pull2,'app.py')),r.o+r.e);
r=await kh(['unlink'],cfg2,{cwd:proj});t('unlink remove a ligação',r.c===0&&JSON.parse(fs.readFileSync(linksF,'utf8'))[fs.realpathSync(proj)]===undefined&&/desligada/.test(r.o),r.o);
r=await kh(['push'],cfg2,{cwd:proj});t('depois do unlink o push volta a pedir o repositório',r.c!==0&&/informe o repositório/.test(r.e));
await kh(['link','meu-repo'],cfg2,{cwd:proj});
// instalar o comando kh
const fakePrefix=fs.mkdtempSync(path.join(os.tmpdir(),'khpre-'));fs.mkdirSync(path.join(fakePrefix,'bin'));
r=await kh(['install'],{PREFIX:fakePrefix,...cfg2});const inst=path.join(fakePrefix,'bin','kh');
t('install copia para $PREFIX/bin/kh executável',r.c===0&&fs.existsSync(inst)&&(fs.statSync(inst).mode&0o111)!==0,r.o+r.e);
r=await khRun(inst,['help'],{...cfg2});t('comando kh instalado funciona direto (shebang)',r.c===0&&/Fluxo mais fácil/.test(r.o),r.o+r.e);
r=await khRun(inst,['whoami'],{...cfg2});t('kh instalado fala com o servidor',r.c===0&&/termux/.test(r.o),r.o+r.e);
// o fluxo exato pedido: heredoc + cd + push
fs.rmSync(cfg2.KH_CONFIG,{force:true});
r=await khRun(inst,['login'],{...cfg2},{input:tok3+'\n'});t('heredoc com o comando instalado',r.c===0);
await khRun(inst,['link','meu-repo'],{...cfg2},{cwd:proj});
r=await khRun(inst,['push','--dry'],{...cfg2},{cwd:proj});t('kh push --dry na pasta ligada lista arquivos',r.c===0&&/app\.py/.test(r.o)&&!/kh\.py/.test(r.o.split('\n').filter(l=>l.startsWith('  ')).join('\n')),r.o);

// ================= NOVO: diagnóstico de configuração e pastas sem permissão =================
{const callRaw=async(envv,tok)=>{const request=new Request('http://x/api/cli',{method:'POST',headers:{authorization:'Bearer '+tok,'content-type':'application/json'},body:JSON.stringify({op:'whoami'})});const res=await onRequestPost({request,env:envv,waitUntil:p=>pending.push(p)});return{s:res.status,j:await res.json()}};
 let x=await callRaw({},T1);t('sem FIREBASE_SA -> servidor_nao_configurado',x.s===500&&x.j.error==='servidor_nao_configurado',JSON.stringify(x));
 x=await callRaw({FIREBASE_SA:'{nao é json'},T1);t('FIREBASE_SA com JSON quebrado -> servidor_chave_invalida',x.j.error==='servidor_chave_invalida',JSON.stringify(x));
 x=await callRaw({FIREBASE_SA:JSON.stringify({project_id:'p'})},T1);t('FIREBASE_SA sem private_key -> servidor_chave_invalida',x.j.error==='servidor_chave_invalida');
 const other=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 x=await callRaw({FIREBASE_SA:JSON.stringify({project_id:'proj-x',client_email:'outra@proj-x.iam.gserviceaccount.com',private_key:other.privateKey})},T1);
 t('chave que o Google não aceita -> servidor_chave_recusada',x.j.error==='servidor_chave_recusada',JSON.stringify(x));
 x=await callRaw({FIREBASE_SA:JSON.stringify({project_id:'proj-x',client_email:'ruim@proj-x.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----\nlixo\n-----END PRIVATE KEY-----'})},T1);
 t('chave PEM malformada -> servidor_chave_recusada (não erro interno)',x.j.error==='servidor_chave_recusada',JSON.stringify(x));
 FS_FORBIDDEN=true;x=await callRaw({FIREBASE_SA:SA},T1);FS_FORBIDDEN=false;t('Firestore negando acesso -> servidor_sem_permissao_banco',x.s===500&&x.j.error==='servidor_sem_permissao_banco',JSON.stringify(x));
 
 // formatos aceitos para a chave (celular costuma estragar a colagem)
 const okVar=async(envv,nome)=>{DB.delete('climeta/Uaaa111');const y=await callRaw(envv,T1);t('chave aceita: '+nome,y.s===200&&y.j.ok===true,JSON.stringify(y))};
 await okVar({FIREBASE_SA:SA},'JSON inteiro');
 await okVar({FIREBASE_SA:'  \n'+SA+'\n  '},'JSON com espaços e quebras nas pontas');
 await okVar({FIREBASE_SA:Buffer.from(SA).toString('base64')},'JSON em base64');
 await okVar({FIREBASE_SA:JSON.stringify(SA)},'JSON dentro de aspas (texto duplamente escapado)');
 await okVar({FIREBASE_SA:SA.replace(/"/g,'\u201c')},'JSON com aspas curvas (colado do celular)');
 const sj=JSON.parse(SA);
 await okVar({FIREBASE_PROJECT_ID:sj.project_id,FIREBASE_CLIENT_EMAIL:sj.client_email,FIREBASE_PRIVATE_KEY:sj.private_key},'3 campos separados (chave com quebras reais)');
 await okVar({FIREBASE_PROJECT_ID:sj.project_id,FIREBASE_CLIENT_EMAIL:sj.client_email,FIREBASE_PRIVATE_KEY:sj.private_key.replace(/\n/g,'\\n')},'3 campos separados (chave com \\n literal)');
 await okVar({FIREBASE_PROJECT_ID:sj.project_id,FIREBASE_CLIENT_EMAIL:sj.client_email,FIREBASE_PRIVATE_KEY:'"'+sj.private_key.replace(/\n/g,'\\n')+'"'},'3 campos separados (chave entre aspas)');
 await okVar({FIREBASE_SA:'{lixo',FIREBASE_PROJECT_ID:sj.project_id,FIREBASE_CLIENT_EMAIL:sj.client_email,FIREBASE_PRIVATE_KEY:sj.private_key},'FIREBASE_SA quebrado, mas campos separados corretos');
 // diagnóstico claro
 x=await callRaw({FIREBASE_SA:'isto não é json'},T1);t('detalhe: texto sem nenhum dos 3 valores',x.j.error==='servidor_chave_invalida'&&/encontrei: nada; não encontrei: project_id, client_email, private_key/.test(x.j.detalhe),JSON.stringify(x));
 x=await callRaw({FIREBASE_SA:JSON.stringify({project_id:'p'})},T1);t('detalhe: diz o que achou e o que falta',/encontrei: project_id; não encontrei: client_email, private_key/.test(x.j.detalhe),x.j.detalhe);
 x=await callRaw({FIREBASE_SA:JSON.stringify({project_id:'p',client_email:'a@b.c',private_key:'MIIEvQIBADANBgkq'})},T1);t('detalhe: private_key sem cabeçalho',/BEGIN PRIVATE KEY/.test(x.j.detalhe),x.j.detalhe);
 x=await callRaw({FIREBASE_PROJECT_ID:'p'},T1);t('detalhe: campos separados incompletos',/client_email/.test(x.j.detalhe)&&/private_key/.test(x.j.detalhe),x.j.detalhe);
 t('o detalhe nunca devolve o conteúdo do segredo',!JSON.stringify(x).includes(sj.private_key.slice(40,80)));
 // colagens estragadas no celular
 const compact=JSON.stringify(sj);
 await okVar({FIREBASE_SA:'{"type":"service_account","project_id":"'+sj.project_id+'","client_email":"'+sj.client_email+'","private_key":"'+sj.private_key+'"}'},'JSON com quebras de linha REAIS dentro da chave');
 await okVar({FIREBASE_SA:'{"type":"service_account",\r\n"project_id":"'+sj.project_id+'",\r\n"client_email":"'+sj.client_email+'",\r\n"private_key":"'+sj.private_key.replace(/\n/g,'\r\n')+'"\r\n}'},'JSON com quebras CRLF');
 await okVar({FIREBASE_SA:compact.slice(0,-1)},'JSON cortado sem a chave final }');
 await okVar({FIREBASE_SA:compact.replace('"project_id"','project_id').replace('"client_email"','client_email')},'JSON sem aspas nos nomes dos campos');
 await okVar({FIREBASE_SA:sj.private_key,FIREBASE_PROJECT_ID:sj.project_id,FIREBASE_CLIENT_EMAIL:sj.client_email},'só a chave PEM colada em FIREBASE_SA + campos separados');
 x=await callRaw({FIREBASE_SA:sj.private_key},T1);t('só a chave PEM: diz que faltam project_id e client_email',/encontrei: private_key; não encontrei: project_id, client_email/.test(x.j.detalhe),x.j.detalhe);
 x=await callRaw({FIREBASE_SA:compact.slice(0,compact.indexOf('END PRIVATE')-4)},T1);t('JSON cortado no meio da chave: diz que não achou a private_key',/encontrei: project_id, client_email; não encontrei: private_key/.test(x.j.detalhe),x.j.detalhe);
 x=await callRaw({FIREBASE_SA:'{"project_id":"'+sj.project_id+'"}',FIREBASE_CLIENT_EMAIL:sj.client_email,FIREBASE_PRIVATE_KEY:sj.private_key},T1);t('FIREBASE_SA parcial + campos separados completam',x.s===200&&x.j.ok===true,JSON.stringify(x));DB.delete('climeta/Uaaa111');

 // descrição do FORMATO do texto (sem vazar conteúdo)
 x=await callRaw({FIREBASE_SA:'{"apiKey":"AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX","authDomain":"x.firebaseapp.com","projectId":"x"}'},T1);
 t('detalhe: reconhece a configuração WEB do Firebase',/configuração WEB do Firebase/.test(x.j.detalhe),x.j.detalhe);t('detalhe não repete a apiKey',!JSON.stringify(x).includes('AIzaSyXXXX'));
 x=await callRaw({FIREBASE_SA:'{"foo":"bar"}'},T1);t('detalhe: JSON sem os campos da conta de serviço',/parece um JSON, mas sem os campos/.test(x.j.detalhe),x.j.detalhe);
 x=await callRaw({FIREBASE_SA:'kiyora-hub-6c399-firebase-adminsdk-abcde-1234567890.json'},T1);t('detalhe: parece nome de arquivo',/NOME ou caminho de um arquivo/.test(x.j.detalhe),x.j.detalhe);
 x=await callRaw({FIREBASE_SA:'qualquer coisa que não é arquivo nenhum '.repeat(8)},T1);t('detalhe: texto comum informa só o tamanho',/não parece um arquivo JSON/.test(x.j.detalhe)&&/\d+ caracteres/.test(x.j.detalhe),x.j.detalhe);
 x=await callRaw({FIREBASE_SA:'x'.repeat(10)},T1);t('detalhe de formato não vaza o texto colado',!JSON.stringify(x).includes('xxxxxxxxxx'));
 DB.delete('climeta/Uaaa111');
 x=await callRaw({FIREBASE_SA:''},T1);t('FIREBASE_SA vazio conta como não configurado',x.j.error==='servidor_nao_configurado');
 DB.delete('climeta/Uaaa111');}
// mensagens no terminal
SRV_ENV={};r=await kh(['whoami'],{KH_TOKEN:T1});t('terminal explica que falta o segredo FIREBASE_SA no Cloudflare',r.c!==0&&/FIREBASE_SA/.test(r.e)&&/Cloudflare/.test(r.e)&&!/Traceback/.test(r.e),r.e);
SRV_ENV={FIREBASE_SA:'x'};r=await kh(['whoami'],{KH_TOKEN:T1});t('terminal explica segredo inválido e mostra o detalhe',/inválida/.test(r.e)&&/Detalhe: .*não encontrei/.test(r.e)&&/FIREBASE_CLIENT_EMAIL/.test(r.e),r.e);
SRV_ENV={FIREBASE_SA:SA};
// pasta sem permissão: mensagem amigável, sem traceback
r=await kh(['pull','meu-repo','/proc/nao-pode-gravar'],cfg2);t('pull em local sem permissão: mensagem amigável e sem traceback',r.c!==0&&!/Traceback/.test(r.e)&&/(permissão|não foi possível acessar)/.test(r.e),r.e);
r=await kh(['link','meu-repo'],{KH_CONFIG:'/proc/nao-pode/cfg.json'},{cwd:proj});t('link sem poder gravar a configuração: sem traceback',r.c!==0&&!/Traceback/.test(r.e)&&/(permissão|não foi possível)/.test(r.e),r.e);

// ================= NOVO: kh chave (conferir/copiar a chave da conta de serviço) =================
{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'khkey-'));const sj2=JSON.parse(SA);const full={type:'service_account',project_id:sj2.project_id,private_key_id:'abc',private_key:sj2.private_key,client_email:sj2.client_email,client_id:'1'};
 const wr=(n,o)=>{const p=path.join(dir,n);fs.writeFileSync(p,typeof o==='string'?o:JSON.stringify(o,null,2));return p};
 r=await kh(['chave',wr('ok.json',full)],cfg2);t('chave válida: mostra projeto e conta, sem imprimir a chave',r.c===0&&/Chave válida/.test(r.o)&&r.o.includes(full.project_id)&&r.o.includes(full.client_email)&&!r.o.includes('BEGIN PRIVATE')&&!r.o.includes(sj2.private_key.slice(40,80)),r.o+r.e);
 r=await kh(['chave',wr('web.json',{apiKey:'AIzaX',authDomain:'x.firebaseapp.com',projectId:'x'})],cfg2);t('chave: reconhece a configuração web e explica',r.c!==0&&/configuração WEB/.test(r.e),r.e);
 r=await kh(['chave',wr('quebrado.json','{nao json')],cfg2);t('chave: JSON inválido',r.c!==0&&/não é um JSON válido/.test(r.e),r.e);
 r=await kh(['chave',wr('falta.json',{type:'service_account',project_id:'p'})],cfg2);t('chave: lista o que falta',r.c!==0&&/client_email/.test(r.e)&&/private_key/.test(r.e),r.e);
 r=await kh(['chave',wr('incompleta.json',{...full,private_key:'-----BEGIN PRIVATE KEY-----\nabc'})],cfg2);t('chave: private_key incompleta',r.c!==0&&/incompleta/.test(r.e),r.e);
 r=await kh(['chave',path.join(dir,'nao-existe.json')],cfg2);t('chave: arquivo inexistente com dica do termux-setup-storage',r.c!==0&&/não consegui ler/.test(r.e)&&/termux-setup-storage/.test(r.e)&&!/Traceback/.test(r.e),r.e);
 // sem argumentos: procura sozinho
 const fakeHome=fs.mkdtempSync(path.join(os.tmpdir(),'khhome-'));fs.mkdirSync(path.join(fakeHome,'storage','downloads'),{recursive:true});
 r=await kh(['chave'],{...cfg2,HOME:fakeHome},{cwd:fakeHome});t('chave sem argumento e sem arquivo: explica permissão, download e comando',r.c!==0&&/termux-setup-storage/.test(r.e)&&/Adicionar chave/.test(r.e)&&!/Traceback/.test(r.e),r.e);
 fs.writeFileSync(path.join(fakeHome,'storage','downloads','kiyora-hub-6c399-abc.json'),JSON.stringify(full,null,2));
 fs.writeFileSync(path.join(fakeHome,'storage','downloads','outro.json'),JSON.stringify({apiKey:'x',authDomain:'y'}));
 r=await kh(['chave'],{...cfg2,HOME:fakeHome},{cwd:fakeHome});t('chave sem argumento acha sozinho o arquivo certo e ignora os outros .json',r.c===0&&/Usando: .*kiyora-hub-6c399-abc\.json/.test(r.o)&&/Chave válida/.test(r.o)&&!/outro\.json/.test(r.o),r.o+r.e);
 fs.writeFileSync(path.join(fakeHome,'storage','downloads','segunda.json'),JSON.stringify(full));
 r=await kh(['chave'],{...cfg2,HOME:fakeHome},{cwd:fakeHome});t('com duas chaves: lista os caminhos e não escolhe sozinho',/mais de uma chave/.test(r.o)&&/segunda\.json/.test(r.o)&&!/Chave válida/.test(r.o),r.o);
 r=await kh(['chave'],cfg2);t('chave sem argumento não dá traceback',!/Traceback/.test(r.e+r.o));
 r=await kh(['chave',path.join(dir,'ok.json'),'--copiar'],{...cfg2,PATH:'/usr/bin:/bin'});t('--copiar sem termux-api explica como instalar',r.c!==0&&/termux-clipboard-set/.test(r.e)&&/Termux:API/.test(r.e),r.e);
 const bin=path.join(dir,'bin');fs.mkdirSync(bin);const cap=path.join(dir,'clip.txt');fs.writeFileSync(path.join(bin,'termux-clipboard-set'),'#!/bin/sh\ncat > "'+cap+'"\n',{mode:0o755});
 r=await kh(['chave',path.join(dir,'ok.json'),'--copiar'],{...cfg2,PATH:bin+':'+process.env.PATH});const clip=fs.existsSync(cap)?fs.readFileSync(cap,'utf8'):'';
 t('--copiar envia o JSON em UMA linha para a área de transferência',r.c===0&&/Copiado/.test(r.o)&&!clip.includes('\n')&&JSON.parse(clip).private_key===full.private_key&&clip.includes('\\n'),r.o+r.e+clip.slice(0,80));
 // --servir: página local de uso único
 {const child=spawn(PY,[KH,'chave',path.join(dir,'ok.json'),'--servir'],{env:{...process.env,...cfg2}});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const closed=new Promise(res=>child.on('close',c=>res(c)));
  const waitFor=async(re,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){const m=out.match(re);if(m)return m;await new Promise(r=>setTimeout(r,50))}return null};
  const m=await waitFor(/http:\/\/127\.0\.0\.1:\d+\/[\w-]+/);t('--servir imprime um endereço 127.0.0.1 com caminho aleatório',!!m,out+err);
  if(m){const url=m[0],base=url.slice(0,url.lastIndexOf('/'));
   const bad=await realFetch(base+'/errado');t('--servir: caminho errado dá 404 e continua no ar',bad.status===404);
   const good=await realFetch(url);const body=await good.text();
   t('--servir entrega o JSON em uma linha, como texto puro',good.status===200&&/text\/plain/.test(good.headers.get('content-type'))&&!body.includes('\n')&&JSON.parse(body).private_key===full.private_key,String(good.status));
   t('--servir não deixa o navegador guardar em cache',/no-store/.test(good.headers.get('cache-control')||''));
   const code=await Promise.race([closed,new Promise(r=>setTimeout(()=>r('timeout'),5000))]);t('--servir encerra sozinho depois da primeira leitura',code===0,String(code));
   let again=true;try{await realFetch(url);again=true}catch(e){again=false}t('--servir: segunda leitura é impossível (servidor fechado)',again===false);
   t('--servir só escuta em 127.0.0.1',/127\.0\.0\.1/.test(url)&&!/0\.0\.0\.0/.test(url));
   t('o texto servido é aceito pelo servidor como FIREBASE_SA',await (async()=>{DB.delete('climeta/Uaaa111');const request=new Request('http://x/api/cli',{method:'POST',headers:{authorization:'Bearer '+T1,'content-type':'application/json'},body:JSON.stringify({op:'whoami'})});const rs=await onRequestPost({request,env:{FIREBASE_SA:body},waitUntil:p=>pending.push(p)});return rs.status===200})());}
  else child.kill();}
 t('o JSON copiado é aceito pelo servidor (vai direto no FIREBASE_SA)',await (async()=>{DB.delete('climeta/Uaaa111');const y=await new Promise(res=>res(0));const z=await (async()=>{const request=new Request('http://x/api/cli',{method:'POST',headers:{authorization:'Bearer '+T1,'content-type':'application/json'},body:JSON.stringify({op:'whoami'})});const rs=await onRequestPost({request,env:{FIREBASE_SA:clip},waitUntil:p=>pending.push(p)});return rs.status})();return z===200})());
 DB.delete('climeta/Uaaa111');}
// limite de taxa
let got429=false,n=0;for(;n<80;n++){const rr=await fetch('http://127.0.0.1:'+PORT+'/api/cli',{method:'POST',headers:{authorization:'Bearer '+T2,'content-type':'application/json'},body:JSON.stringify({op:'whoami'})});if(rr.status===429){got429=true;break}}
t('limite de taxa dispara perto de 60/min',got429&&n>=40&&n<=62,'n='+n);
// requisições inválidas (zera a cota de taxa do usuário usada pelos testes anteriores)
DB.delete('climeta/Uaaa111');
const post=(tok,body,extra={})=>realFetch('http://127.0.0.1:'+PORT+'/api/cli',{method:'POST',headers:{authorization:tok,'content-type':'application/json',...extra},body});
let rr=await post('Bearer '+T1,'{nao json');t('json inválido -> 400',rr.status===400);
rr=await post('',JSON.stringify({op:'whoami'}));t('sem token -> 401',rr.status===401);
rr=await post('Bearer '+T1,JSON.stringify({op:'push',repo:'meu-repo',files:[]}));t('lote vazio -> 400',rr.status===400);
rr=await post('Bearer '+T1,JSON.stringify({op:'push',repo:'meu-repo',files:Array.from({length:26},(_,i)=>({path:'z'+i,content:'x'}))}));t('lote >25 -> 400',rr.status===400);
rr=await post('Bearer '+T1,JSON.stringify({op:'xyz',repo:'meu-repo'}));t('operação inválida -> 400',rr.status===400);
rr=await post('Bearer '+T1,'x'.repeat(4000001));t('corpo >4MB -> 413',rr.status===413);
rr=await realFetch('http://127.0.0.1:'+PORT+'/api/cli');t('GET -> 405',rr.status===405);
rr=await post('Bearer '+T1,JSON.stringify({op:'ls',repo:'../meu-repo'}));t('repo com ../ -> 404',rr.status===404);
rr=await post('Bearer '+T1,JSON.stringify({op:'push',repo:'meu-repo',files:[{path:'../x.txt',content:'a'},{path:'a b/../c',content:'a'},{path:123,content:'a'},{path:'ok.txt',content:5}]}));
const jb=await rr.json();t('caminhos/conteúdos inválidos rejeitados no servidor',rr.status===200&&jb.sent.length===0&&jb.rejected.length===4,JSON.stringify(jb));
t('JWT assinado e aceito pelo "Google" simulado (1 troca de token em cache)',tokenCalls===1,'tokenCalls='+tokenCalls);
console.log(`\n${pass} ok, ${fail} falhas`);srv.close();process.exit(fail?1:0);
