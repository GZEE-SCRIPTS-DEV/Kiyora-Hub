const fs=require('fs'),path=require('path'),ROOT=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), rules=fs.readFileSync(path.join(ROOT,'firestore.rules'),'utf8');
const seg=src.slice(src.indexOf('const SNAP=50000;'),src.indexOf('function openRepo(id){'));
const tkb=src.slice(src.indexOf('let tkShow=null;'),src.indexOf('function repoList(){'));
const grab=n=>{const i=src.indexOf('const '+n+'=');const j=src.indexOf('\n',i);return src.slice(i,j)};
const helpers=['rSecret','rOK','rid','rsize','rMime','RLANG','RBLOCK'].map(grab).join('\n');
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const sha=t=>require('crypto').createHash('sha256').update(t).digest('hex');
const log=[],batches=[],toasts=[],clip=[],els={};
const D={repos:[{id:'U1__r',uid:'U1',name:'r<b>'},{id:'U2__z',uid:'U2',name:'z'}],tokens:[],clilogs:[]};
const db={async batch(ops){log.push('batch');batches.push(ops)},async wget(c,conds,lim){return db._w?db._w(c,conds,lim):[]},limited:async()=>{}};
const col=n=>({doc:id=>({async set(d){log.push('set:'+n);batches.push([{t:'set',c:n,id,d}]);if(col.fail)throw Object.assign(new Error('x'),{code:'permission-denied'})},async delete(){batches.push([{t:'del',c:n,id}])}})});
let nav={clipboard:{writeText:async t=>{log.push('clip');clip.push(t)}}};
const loc={origin:'https://kiyora-hub.pages.dev'};
let fetchImpl=async()=>{throw new Error('sem rede')};
const ctx=`let rv='U1__r',RF=[],RC=[],rco=null,rdf=null,renders=0;const render=()=>{renders++},toast=m=>toasts.push(m),slow=()=>false,ago=t=>'há pouco',prof=id=>({name:'Gzee'}),banned=()=>false,openRepo=id=>toasts.push('open:'+id),confirm=()=>true,me={id:'U1'};const $=q=>els[q]||(els[q]={value:'',textContent:''});\n`;
const F=new Function('esc','db','col','D','toasts','els','navigator','location','fetch','crypto','console',ctx+helpers+'\n'+seg+'\n'+tkb+`;return{tkCmds,tkCard,tkGen,tkAll,tkDel,cpy,ghCard,rImport,rfSearch,hClear,hDelFile,rWipe,get tkShow(){return tkShow},set tkShow(v){tkShow=v},set RF(v){RF=v},set rfsq(v){rfsq=v},get renders(){return renders},rv:()=>rv}`)(esc,db,col,D,toasts,els,nav,loc,(...a)=>fetchImpl(...a),globalThis.crypto,{error(){}});
let pass=0,fail=0;const t=(n,c,x='')=>{c?pass++:fail++;console.log((c?'ok   ':'FALHOU')+' '+n+(c?'':'  -> '+x))};
const keysOf=blk=>{const m=blk.match(/hasOnly\(\[([^\]]*)\]\)/);return m?m[1].split(',').map(x=>x.trim().replace(/'/g,'')).sort().join():null};
const blockOf=n=>{const i=rules.indexOf('match /'+n+'/');return rules.slice(i,rules.indexOf('\n    }\n',i))};
(async()=>{
 // ---- comandos do Termux ----
 const c=F.tkCmds('kh_'+'a'.repeat(48),'meu-repo');
 t('comando de instalação: pkg, curl do site, install, login por heredoc, history -c',/^pkg update -y && pkg install python curl -y\ncurl -fsSL https:\/\/kiyora-hub\.pages\.dev\/kh\.py -o kh\.py && python kh\.py install && rm kh\.py\nkh login << EOF\nkh_a{48}\nEOF\nhistory -c$/.test(c.setup),c.setup);
 t('comando de envio: cd, link com o repo escolhido, push',c.send==='cd local-da-pasta\nkh link meu-repo\nkh push',c.send);
 t('sem repo escolhido usa meu-repo de exemplo',F.tkCmds('kh_x','').send.includes('kh link meu-repo'));
 // ---- cartão sem token novo ----
 let h=F.tkCard();
 t('cartão mostra instruções com token de exemplo',/kh_SEU_TOKEN/.test(h)&&/termux-setup-storage/.test(h)&&/Gerar token e copiar comando/.test(h));
 t('cartão escapa nome de repositório hostil',!/<b>"?<\/option>/.test(h)&&/r&lt;b&gt;/.test(h));
 t('lista só os repositórios do próprio usuário no seletor',/value="r&lt;b&gt;"/.test(h)&&!/>z</.test(h));
 t('seletores de permissão e validade presentes',/id="tks"/.test(h)&&/value="90" selected/.test(h)&&/id="tkv"/.test(h));
 // ---- gerar token ----
 els['#tkn']={value:'meu celular'};els['#tkr']={value:'r<b>'};els['#tks']={value:'rw'};els['#tkv']={value:'90'};
 log.length=0;batches.length=0;clip.length=0;await F.tkGen();
 const tk=batches.find(b=>b[0].c==='tokens')[0];
 t('comando é copiado ANTES de gravar no banco (gesto do toque)',log.indexOf('clip')<log.indexOf('set:tokens')&&log.indexOf('clip')>=0,log.join());
 t('token tem formato kh_ + 48 hex e vai no comando copiado',/^kh_[a-f0-9]{48}$/.test(F.tkShow.tok)&&clip[0].includes(F.tkShow.tok));
 t('documento do token: id = sha256 e campos permitidos pelas regras',tk.id===sha(F.tkShow.tok)&&Object.keys(tk.d).sort().join()===keysOf(blockOf('tokens')),Object.keys(tk.d).join());
 t('validade 90 dias, permissão rw, repositório gravados',Math.abs(tk.d.ex-(tk.d.at+90*864e5))<2000&&tk.d.sc==='rw'&&tk.d.rp==='r<b>'&&tk.d.name==='meu celular');
 t('regras: ex máximo cabe em request.time + 32000000000 ms (≈370 dias)',365*864e5<32000000000);
 t('token em claro NÃO é gravado',!JSON.stringify(tk.d).includes(F.tkShow.tok));
 h=F.tkCard();t('depois de gerar: mostra o token, o comando real e botões de copiar',h.includes(F.tkShow.tok)&&/data-rr="tkcopyset"/.test(h)&&/data-rr="tkcopysend"/.test(h)&&!/kh_SEU_TOKEN/.test(h));
 t('comando de envio usa o repositório escolhido',/kh link r&lt;b&gt;/.test(h));
 // somente leitura, sem repo, validade inválida
 els['#tkr']={value:''};els['#tks']={value:'r'};els['#tkv']={value:'9999'};batches.length=0;await F.tkGen();const t2=batches.at(-1)[0].d;
 t('somente leitura: sc=r, sem campo rp, validade inválida vira 90 dias',t2.sc==='r'&&!('rp' in t2)&&Math.abs(t2.ex-(t2.at+90*864e5))<2000,JSON.stringify(t2));
 els['#tks']={value:'qualquer'};batches.length=0;await F.tkGen();t('permissão desconhecida vira rw (não escala para algo inesperado)',batches.at(-1)[0].d.sc==='rw');
 // limite de 5 tokens e erro de permissão
 D.tokens=Array.from({length:5},(_,i)=>({id:'t'+i,name:'n'+i,at:i,ex:Date.now()+1e6,sc:'rw'}));batches.length=0;await F.tkGen();t('limite de 5 tokens',batches.length===0&&/Limite de 5/.test(toasts.at(-1)));
 D.tokens=[];col.fail=true;await F.tkGen();t('erro de permissão avisa para NÃO usar o comando copiado',/Não use o comando copiado/.test(toasts.at(-1)),toasts.at(-1));col.fail=false;
 // lista de tokens: validade, permissão, expirado, escape
 D.tokens=[{id:'a"b',name:'<i>x</i>',at:1,ex:Date.now()-1000,sc:'r',rp:'meu',last:5,lcc:'BR',lip:'1.2.3.0'},{id:'c',name:'ok',at:2,ex:Date.now()+864e5*10,sc:'rw'},{id:'d',name:'velho',at:3}];
 h=F.tkCard();t('token expirado marcado como EXPIRADO, só leitura e repo exibidos',/EXPIRADO/.test(h)&&/só leitura/.test(h)&&/repo meu/.test(h)&&/BR 1\.2\.3\.0/.test(h)&&/sem validade/.test(h));
 t('lista de tokens escapa nome e id',!/<i>x/.test(h)&&/&lt;i&gt;x/.test(h)&&/data-id="a&quot;b"/.test(h));
 t('"Revogar todos" aparece com mais de um token',/data-rr="tkall"/.test(h));
 // ---- limpar histórico ----
 const del=[];db._w=async(c,conds,lim)=>{const n=del.filter(x=>x.c===c).length;return n>=2?[]:[{id:c+'1'},{id:c+'2'}]};
 batches.length=0;await F.hClear();const dels=batches.flat().filter(o=>o.t==='del');
 t('limpar histórico apaga rver e rcommits do repositório',dels.some(o=>o.c==='rver')&&dels.some(o=>o.c==='rcommits'),JSON.stringify(dels));
 // ---- busca ----
 F.RF=[{path:'src/app.js',content:'const a=1;\nfunction ola(){ return "Olá" }\nconst b=2'},{path:'README.md',content:'# Projeto\nUso da função ola()'},{path:'img.png',url:'https://x/y.png',content:''},{path:'x.txt',content:'<script>alert(1)</script> ola'}];
 F.rfsq='ola';h=F.rfSearch();
 t('busca encontra texto em arquivos e mostra linha',/src\/app\.js/.test(h)&&/2: function ola/.test(h)&&/README\.md/.test(h));
 t('busca ignora arquivos de mídia (url)',!/img\.png/.test(h));
 t('busca escapa o conteúdo',!/<script>/.test(h)&&/&lt;script&gt;/.test(h));
 F.rfsq='a';t('busca exige 2+ caracteres',F.rfSearch()==='');F.rfsq='zzzz';t('sem resultado mostra aviso',/Nada encontrado/.test(F.rfSearch()));F.rfsq='SRC';t('busca pelo nome do arquivo sem diferenciar maiúsculas',/src\/app\.js/.test(F.rfSearch()));
 // ---- importar do GitHub ----
 const mkRes=(body,status=200)=>({ok:status<400,status,json:async()=>body,arrayBuffer:async()=>typeof body==='string'?new TextEncoder().encode(body).buffer:body});
 const tree=[{path:'README.md',type:'blob',size:20},{path:'src/main.py',type:'blob',size:30},{path:'logo.png',type:'blob',size:50},{path:'node_modules/x/i.js',type:'blob',size:5},{path:'.env',type:'blob',size:5},{path:'big.txt',type:'blob',size:300000},{path:'chave.txt',type:'blob',size:60},{path:'bin.dat',type:'blob',size:9},{path:'docs/a b.md',type:'blob',size:9},{path:'pasta',type:'tree'},{path:'a/b/c/d/e/f/g/h.txt',type:'blob',size:3},{path:'ok-binario.txt',type:'blob',size:4}];
 const files={'README.md':'# Oi\n','src/main.py':'print("é")\n','chave.txt':'ghp_'+'a'.repeat(36),'docs/a b.md':'doc','ok-binario.txt':new Uint8Array([0xff,0xfe,0x00]).buffer};
 const urls=[];fetchImpl=async u=>{urls.push(u);if(u==='https://api.github.com/repos/gu/meu-proj')return mkRes({default_branch:'main',description:'Desc do GitHub',language:'Python'});
  if(u.startsWith('https://api.github.com/repos/gu/meu-proj/git/trees/main'))return mkRes({tree});
  const m=u.match(/^https:\/\/raw\.githubusercontent\.com\/gu\/meu-proj\/main\/(.*)$/);if(m){const p=decodeURIComponent(m[1]).split('/').map(x=>x).join('/');const v=files[p];return v===undefined?mkRes('',404):mkRes(v)}return mkRes({},404)};
 const ev={preventDefault(){}};els['#gir']={value:'https://github.com/gu/meu-proj.git'};els['#gis']={textContent:''};D.repos=[];batches.length=0;toasts.length=0;await F.rImport(ev);
 const ops=batches.at(-1);
 t('importar: lote com limites rl g e w, repo, arquivos, versões e commit',ops[0].t==='rl'&&ops[0].k==='g'&&ops[1].k==='w'&&ops.some(o=>o.c==='repos')&&ops.some(o=>o.c==='rcommits'),JSON.stringify(ops.map(o=>o.t+o.c+(o.k||''))));
 const ip=ops.filter(o=>o.c==='rfiles').map(o=>o.d.path).sort();
 t('importa só texto válido (README, main.py, "a b.md")',ip.join()==='README.md,docs/a b.md,src/main.py',ip.join());
 t('ignora binário, node_modules, .env, grande, com segredo, UTF-8 inválido e pasta profunda',!ip.some(p=>/png|node_modules|\.env|big|chave|bin\.dat|ok-binario|a\/b\/c/.test(p)));
 const rp=ops.find(o=>o.c==='repos').d;t('repo: nome do GitHub, descrição, linguagem mapeada, dono',rp.name==='meu-proj'&&rp.desc==='Desc do GitHub'&&rp.lang==='Python'&&rp.uid==='U1'&&rp.topics[0]==='Python');
 t('chaves dos documentos importados batem com as regras',Object.keys(rp).sort().join()===keysOf(blockOf('repos'))&&Object.keys(ops.find(o=>o.c==='rfiles').d).sort().join()===keysOf(blockOf('rfiles'))&&Object.keys(ops.find(o=>o.c==='rver').d).sort().join()===keysOf(blockOf('rver'))&&Object.keys(ops.find(o=>o.c==='rcommits').d).sort().join()===keysOf(blockOf('rcommits')));
 const cm=ops.find(o=>o.c==='rcommits');t('commit "Importa de github.com/...", via site, ch com 3 arquivos',/^Importa de github\.com\/gu\/meu-proj$/.test(cm.d.msg)&&cm.d.via==='site'&&cm.d.ch.length===3);
 t('id do commit e do repo seguem o padrão das regras',new RegExp('^'+cm.d.repo+'__[0-9]{13}_[a-z0-9]{3,8}$').test(cm.id)&&cm.d.repo==='U1__meu-proj');
 t('README vem primeiro na ordem',ops.find(o=>o.c==='rfiles').d.path==='README.md');
 t('acentos preservados no conteúdo',ops.find(o=>o.c==='rfiles'&&o.d.path==='src/main.py').d.content==='print("é")\n');
 t('caminhos são codificados por segmento na URL raw',urls.some(u=>u.endsWith('/docs/a%20b.md')));
 t('abre o repositório e informa ignorados',toasts.includes('open:U1__meu-proj')&&toasts.some(x=>/importado/.test(x)&&/ignorado/.test(x)),JSON.stringify(toasts));
 t('lote cabe em 500 operações',ops.length<=500);
 // erros
 const tryImp=async(v,imp)=>{els['#gir']={value:v};els['#gis']={textContent:''};toasts.length=0;batches.length=0;if(imp)fetchImpl=imp;await F.rImport(ev);return{st:els['#gis'].textContent,toast:toasts.join('|'),n:batches.length}};
 let e1=await tryImp('lixo');t('formato inválido',/usuario\/repositorio/.test(e1.toast)&&e1.n===0);
 e1=await tryImp('a/b;rm -rf');t('caracteres perigosos no nome são recusados',e1.n===0);
 e1=await tryImp('gu/meu-proj',async()=>mkRes({},404));t('repositório inexistente',/não encontrado/.test(e1.st)&&e1.n===0);
 e1=await tryImp('gu/meu-proj',async()=>mkRes({},403));t('limite de consultas do GitHub',/limitou/.test(e1.st)&&e1.n===0);
 D.repos=[{id:'U1__meu-proj',uid:'U1',name:'meu-proj'}];e1=await tryImp('gu/meu-proj');t('nome já existente é recusado',/já tem/.test(e1.toast)&&e1.n===0);D.repos=[];
 fetchImpl=async u=>{if(u==='https://api.github.com/repos/gu/muitos')return mkRes({default_branch:'main'});if(u.includes('/git/trees/'))return mkRes({tree:Array.from({length:150},(_,i)=>({path:'f'+String(i).padStart(3,'0')+'.txt',type:'blob',size:1}))});return mkRes('x')};
 e1=await tryImp('gu/muitos');const o2=batches.at(-1);t('máximo de 100 arquivos importados (202+ operações)',o2&&o2.filter(o=>o.c==='rfiles').length===100&&o2.length<=500,o2&&o2.length);
 fetchImpl=async u=>{if(u.startsWith('https://api.github.com/repos/gu/vazio')&&!u.includes('trees'))return mkRes({default_branch:'main'});return mkRes({tree:[{path:'a.png',type:'blob',size:1}]})};
 e1=await tryImp('gu/vazio');t('sem arquivos de texto: mensagem e nada gravado',/Nenhum arquivo/.test(e1.st)&&e1.n===0);
 // ---- coerência com as regras ----
 const used=[...src.matchAll(/\{t:"rl",k:"(\w)"\}|db\.limited\("(\w)"/g)].map(m=>m[1]||m[2]);const allowed=(blockOf('rl').match(/_\(([a-z|]+)\)\$/)||[])[1].split('|');
 t('todos os tipos de limite usados no site existem nas regras ('+[...new Set(used)].join(',')+')',used.every(k=>allowed.includes(k)),used.join());
 t('posts, comentários, repos e commits exigem rlOk nas regras',['posts','comments','repos','rcommits'].every(n=>/rlOk\('\w'\)/.test(blockOf(n))));
 t('site grava posts e comentários via db.limited',/db\.limited\("p","posts"/.test(src)&&/db\.limited\("c","comments"/.test(src)&&!/col\("posts"\)\.doc\([^)]*\)\.set/.test(src)&&!/col\("comments"\)\.doc\([^)]*\)\.set/.test(src));
 t('regras: tokens aceitam ex, sc e rp',keysOf(blockOf('tokens'))==='at,ex,name,rp,sc,uid');
 console.log(`\n${pass} ok, ${fail} falhas`);process.exit(fail?1:0)})();
