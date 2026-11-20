const fs=require('fs'),path=require('path'),ROOT=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), rules=fs.readFileSync(path.join(ROOT,'firestore.rules'),'utf8');
const a=src.indexOf('const SNAP=50000;'), b=src.indexOf('function openRepo(id){');
const seg=src.slice(a,b);
const grab=n=>{const i=src.indexOf('const '+n+'=');const j=src.indexOf('\n',i);return src.slice(i,j)};
const helpers=['rSecret','rOK','rid','rsize','rMime'].map(grab).join('\n');
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// ---- banco simulado ----
const store=new Map(),batches=[];
const db={async batch(ops){batches.push(ops);for(const o of ops){const k=o.c+'/'+o.id;if(o.t==='del')store.delete(k);else if(o.t==='upd')store.set(k,{...(store.get(k)||{}),...o.d});else store.set(k,{...o.d})}},
 async dget(c,id){const v=store.get(c+'/'+id);return v?{...v,id}:null},
 async wget(c,conds,lim){return [...store].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({...v,id:k.slice(c.length+1)})).filter(v=>conds.every(x=>v[x[0]]===x[2])).sort((x,y)=>x.id<y.id?-1:1).slice(0,lim||1e9)}};
const env={esc,db,me:{id:'U1'},D:{repos:[{id:'U1__r',uid:'U1',name:'r'}],clilogs:[]},toasts:[],rv:'U1__r',RF:[],RC:[],rco:null,rdf:null,renders:0};
const ctx=`let rv='U1__r',RF=[],RC=[],rco=null,rdf=null;const toasts=[];let renders=0;const render=()=>{renders++},toast=m=>toasts.push(m),slow=()=>false,confirm=()=>true,ago=t=>'há pouco',prof=id=>({name:id==='U2'?'<b>Zé</b>':'Gzee'});\n`;
const F=new Function('esc','db','me','D',ctx+helpers+'\n'+seg+`;return{rcid,rCommit,lineDiff,diffHtml,rShowDiff,rRestore,histView,commitBody,diffPanel,termAct,logRow,SNAP,
 get rdf(){return rdf},set rdf(v){rdf=v},get RC(){return RC},set RC(v){RC=v},set rco(v){rco=v},set RF(v){RF=v},get RF(){return RF},toasts,get renders(){return renders},rv:()=>rv}`)(esc,db,{id:'U1'},env.D);
let pass=0,fail=0;const t=(n,c,x='')=>{c?pass++:fail++;console.log((c?'ok   ':'FALHOU')+' '+n+(c?'':'  -> '+x))};
// ---- 1) rcid / rCommit vs regras ----
const id1=F.rcid('U1__r');t('id do commit bate com o padrão das regras',/^U1__r__[0-9]{13}_[a-z0-9]{3,8}$/.test(id1),id1);
const ids=new Set();for(let i=0;i<200;i++)ids.add(F.rcid('U1__r'));t('ids de commit não colidem em 200 gerações',ids.size>150,ids.size);
(async()=>{
 const doc=(c)=>({content:c,url:'',size:c.length,mime:'text/plain'});
 const cid=await F.rCommit('U1__r',[{p:'a.txt',op:'a',size:3,text:'abc',doc:doc('abc')},{p:'src/b.js',op:'m',size:5,text:'x\ny\n',doc:doc('x\ny\n')},{p:'img.png',op:'a',size:9,text:null,bin:true,doc:{content:'',url:'https://c/x.png',size:9,mime:'image/png'}},{p:'old.txt',op:'d',size:2,text:'zz'}],'Teste \\u00e7');
 const ops=batches[0];
 t('lote tem rfiles, rver, rcommits e repos',['rfiles','rver','rcommits','repos'].every(c=>ops.some(o=>o.c===c)));
 t('binário não gera versão, texto sim (3 versões: a, b, d)',ops.filter(o=>o.c==='rver').length===3);
 t('exclusão vira delete em rfiles',ops.some(o=>o.c==='rfiles'&&o.t==='del'&&o.id==='U1__r__old.txt'));
 t('id da versão: commit__caminho com ~',ops.some(o=>o.c==='rver'&&o.id===cid+'__src~b.js'));
 // chaves vs regras
 const keysOf=blk=>{const m=blk.match(/hasOnly\(\[([^\]]*)\]\)/);return m?m[1].split(',').map(x=>x.trim().replace(/'/g,'')).sort().join():null};
 const blockOf=n=>{const i=rules.indexOf('match /'+n+'/');return rules.slice(i,rules.indexOf('\n    }\n',i))};
 const cm=ops.find(o=>o.c==='rcommits'),vr=ops.find(o=>o.c==='rver'),fl=ops.find(o=>o.c==='rfiles'&&o.t==='set');
 t('chaves de rcommits = hasOnly das regras',Object.keys(cm.d).sort().join()===keysOf(blockOf('rcommits')),Object.keys(cm.d).join()+' vs '+keysOf(blockOf('rcommits')));
 t('chaves de rver = hasOnly das regras',Object.keys(vr.d).sort().join()===keysOf(blockOf('rver')),Object.keys(vr.d).join());
 t('chaves de rfiles = hasOnly das regras',Object.keys(fl.d).sort().join()===keysOf(blockOf('rfiles')),Object.keys(fl.d).join());
 t('commit: via=site, uid, ch como a|caminho|tamanho',cm.d.via==='site'&&cm.d.uid==='U1'&&cm.d.ch[0]==='a|a.txt|3'&&cm.d.ch[3]==='d|old.txt|2',JSON.stringify(cm.d.ch));
 const re=new RegExp('^'+cm.d.repo+'__[0-9]{13}_[a-z0-9]{3,8}$');t('id do commit passa na regex das regras',re.test(cm.id));
 t('id da versão começa com o id do commit',vr.id.startsWith(cm.id+'__'));
 t('repos só atualiza upd',ops.find(o=>o.c==='repos').t==='upd'&&Object.keys(ops.find(o=>o.c==='repos').d).join()==='upd');
 t('lote cabe nos limites (<=500 operações)',ops.length<=500);
 t('mensagem limitada a 200',(await (async()=>{await F.rCommit('U1__r',[],'x'.repeat(500));return batches.at(-1).find(o=>o.c==='rcommits').d.msg.length})())===200);
 // arquivo grande: sem conteúdo na versão
 await F.rCommit('U1__r',[{p:'g.txt',op:'a',size:60000,text:'x'.repeat(60000),doc:doc('x'.repeat(60000))}],'grande');
 const gv=batches.at(-1).find(o=>o.c==='rver');t('versão de arquivo >50000: big=true e content vazio',gv.d.big===true&&gv.d.content===''&&gv.d.size===60000);
 // 100 arquivos = 202 ops
 await F.rCommit('U1__r',Array.from({length:100},(_,i)=>({p:'f'+i,op:'a',size:1,text:'x',doc:doc('x')})),'cem');t('100 arquivos geram 203 operações (<=500), incluindo o limite de taxa',batches.at(-1).length===203,batches.at(-1).length);
 // ---- 2) lineDiff ----
 const D1=F.lineDiff('a\nb\nc','a\nB\nc\nd');const sum=x=>x.map(l=>l[0]+l[1]).join('|');
 t('diff simples correto',sum(D1)===' a|-b|+B| c|+d',sum(D1));
 t('diff de vazio -> só adições (sem linha vazia removida)',F.lineDiff('', 'x\ny').length===2&&F.lineDiff('', 'x\ny').every(l=>l[0]==='+'));t('diff de remoção total não adiciona linha vazia',F.lineDiff('x\ny','').length===2&&F.lineDiff('x\ny','').every(l=>l[0]==='-'));
 t('diff de iguais -> nenhuma mudança',F.lineDiff('a\nb','a\nb').every(l=>l[0]===' '));
 t('diff de remoção total',F.lineDiff('x\ny','').filter(l=>l[0]==='-').length===2);
 const big1=Array.from({length:3000},(_,i)=>'l'+i).join('\n'),big2=Array.from({length:3000},(_,i)=>'m'+i).join('\n');
 t('arquivos grandes e totalmente diferentes: devolve null (sem travar)',F.lineDiff(big1,big2)===null);
 const t0=Date.now();const bd=F.lineDiff(big1,big1.replace('l1500','CHANGED'));t('arquivo grande com 1 linha mudada: rápido e correto',Date.now()-t0<500&&bd.filter(l=>l[0]!==' ').length===2,Date.now()-t0);
 // reconstrução: aplicar o diff reproduz o novo arquivo
 const A='um\ndois\ntres\nquatro\ncinco',B2='um\n2\ntres\ncinco\nseis';const d2=F.lineDiff(A,B2);
 t('aplicar diff reproduz o arquivo novo e o antigo',d2.filter(l=>l[0]!=='-').map(l=>l[1]).join('\n')===B2&&d2.filter(l=>l[0]!=='+').map(l=>l[1]).join('\n')===A);
 // ---- 3) diffHtml escapa ----
 const h=F.diffHtml(F.lineDiff('ok','<script>alert(1)</script>\n<img src=x onerror=alert(2)>'));
 t('diffHtml escapa HTML do conteúdo',!/<script|<img/.test(h)&&/&lt;script&gt;/.test(h));
 const many=Array.from({length:50},(_,i)=>'linha'+i).join('\n');const hc=F.diffHtml(F.lineDiff(many,many.replace('linha25','X')));
 t('linhas iguais distantes ficam recolhidas',/linha\(s\) iguais/.test(hc)&&!/linha5</.test(hc)&&/linha24/.test(hc));
 t('diffHtml(null) mostra aviso',/grande demais/.test(F.diffHtml(null)));
 // ---- 4) histView com dados hostis ----
 F.RC=[{id:'U1__r__9999999999999_abcde',uid:'U2',msg:'<img src=x onerror=alert(1)>',at:1,via:'cli',ch:['a|<b>x.txt|5','m|a|b|c.txt|7','d|z|0']},{id:'x" onclick="alert(1)',uid:'U1',msg:'ok',at:2,via:'site',ch:[]}];F.rco='U1__r__9999999999999_abcde';
 const hv=F.histView({id:'U1__r',name:'r'},true);
 t('histórico escapa mensagem, nome e caminhos',!/<img src=x|<b>x|<b>Zé/.test(hv)&&/&lt;img src=x onerror/.test(hv));
 t('id hostil não quebra atributo',!/data-id="x" onclick/.test(hv)&&/data-id="x&quot; onclick/.test(hv));
 t('caminho com | é lido corretamente (a|b|c.txt)',/<code>a\|b<\/code>/.test(hv)===false&&/a\|b\|c\.txt|a\|b/.test(hv)===true);
 t('mostra origem terminal/site e contagem',/terminal/.test(hv)&&/site/.test(hv)&&/3 arquivo/.test(hv));
 t('só o dono vê "Uso pelo terminal"',/Uso pelo terminal/.test(hv)&&!/Uso pelo terminal/.test(F.histView({id:'U1__r',name:'r'},false)));
 // ---- 5) rShowDiff com banco simulado ----
 store.clear();const vid=(c,p)=>c+'__'+p.replace(/\//g,'~');
 store.set('rver/'+vid('U1__r__9999999999998_aaaaa','src/a.js'),{repo:'U1__r',commit:'U1__r__9999999999998_aaaaa',path:'src/a.js',op:'a',content:'um\ndois',big:false,size:8,at:100,uid:'U1'});
 store.set('rver/'+vid('U1__r__9999999999997_bbbbb','src/a.js'),{repo:'U1__r',commit:'U1__r__9999999999997_bbbbb',path:'src/a.js',op:'m',content:'um\nDOIS\ntres',big:false,size:12,at:200,uid:'U1'});
 store.set('rver/'+vid('U1__r__9999999999996_ccccc','src/a.js'),{repo:'U1__r',commit:'U1__r__9999999999996_ccccc',path:'src/a.js',op:'d',content:'um\nDOIS\ntres',big:false,size:12,at:300,uid:'U1'});
 store.set('rver/'+vid('U1__r__9999999999995_ddddd','g.txt'),{repo:'U1__r',commit:'U1__r__9999999999995_ddddd',path:'g.txt',op:'m',content:'',big:true,size:60000,at:400,uid:'U1'});
 store.set('rver/'+vid('U1__r__9999999999994_eeeee','solo.txt'),{repo:'U1__r',commit:'U1__r__9999999999994_eeeee',path:'solo.txt',op:'m',content:'novo',big:false,size:4,at:500,uid:'U1'});
 await F.rShowDiff('U1__r__9999999999997_bbbbb','src/a.js');
 t('diff de modificação usa a versão anterior (+1 −1)',F.rdf.ops&&sum(F.rdf.ops)===' um|-dois|+DOIS|+tres',F.rdf.ops&&sum(F.rdf.ops));
 await F.rShowDiff('U1__r__9999999999998_aaaaa','src/a.js');t('diff de adição: tudo +',F.rdf.ops.every(l=>l[0]==='+'||(l[0]===' '&&l[1]==='')||l[0]==='-'&&l[1]===''));
 await F.rShowDiff('U1__r__9999999999996_ccccc','src/a.js');t('diff de exclusão: tudo −',F.rdf.ops.filter(l=>l[0]==='+'&&l[1]!=='').length===0&&F.rdf.ops.filter(l=>l[0]==='-').length>=3);
 await F.rShowDiff('U1__r__9999999999995_ddddd','g.txt');t('arquivo grande: mensagem sem conteúdo',/Arquivo grande/.test(F.rdf.err)&&!F.rdf.ops);
 await F.rShowDiff('U1__r__9999999999994_eeeee','solo.txt');t('modificação sem versão anterior: aviso e arquivo inteiro',/anterior não encontrada/.test(F.rdf.note));
 await F.rShowDiff('U1__r__0000000000000_zzzzz','nada.txt');t('versão inexistente: mensagem amigável',/Sem versão guardada/.test(F.rdf.err));
 // ---- 6) restaurar ----
 await F.rShowDiff('U1__r__9999999999996_ccccc','src/a.js'); // op d: conteúdo apagado
 F.RF=[];const nb=batches.length;await F.rRestore();const rb=batches[batches.length-1];
 const rf=rb&&rb.find(o=>o.c==='rfiles'),rc=rb&&rb.find(o=>o.c==='rcommits');
 t('restaurar arquivo apagado cria commit "a" com o conteúdo',batches.length===nb+1&&rf.d.content==='um\nDOIS\ntres'&&rc.d.ch[0].startsWith('a|src/a.js|')&&/^Restaura src\/a\.js/.test(rc.d.msg),JSON.stringify(rc&&rc.d));
 F.RF=[{path:'src/a.js',content:'outro',url:''}];const nb2=batches.length;await F.rRestore();const rc2=batches.at(-1).find(o=>o.c==='rcommits');
 t('restaurar arquivo existente cria commit "m"',batches.length===nb2+1&&rc2.d.ch[0].startsWith('m|src/a.js|'));
 F.RF=[{path:'src/a.js',content:'um\nDOIS\ntres',url:''}];const nb3=batches.length;await F.rRestore();t('restaurar versão igual à atual não cria commit',batches.length===nb3&&F.toasts.at(-1)==='O arquivo já está nesta versão.');
 F.rdf={c:'x',p:'p',cur:{path:'../x',content:'ok',big:false,at:1,op:'a'}};const nb4=batches.length;await F.rRestore();t('restaurar caminho inválido é recusado',batches.length===nb4);
 F.rdf={c:'x',p:'p',cur:{path:'s.txt',content:'token ghp_'+'a'.repeat(36),big:false,at:1,op:'a'}};F.RF=[];await F.rRestore();t('restaurar conteúdo com segredo é recusado',batches.length===nb4);
 // ---- 7) logs ----
 env.D.clilogs.push({op:'push',repo:'r',tk:'<i>cel</i>',cc:'BR',ip:'1.2.3.0',ok:true,at:1},{op:'rm',repo:'outro',tk:'x',cc:'US',ip:'',ok:false,at:2});
 const ta=F.termAct({id:'U1__r',name:'r'});t('atividade do repo filtra pelo nome e escapa token',/push/.test(ta)&&!/outro/.test(ta)&&!/<i>cel/.test(ta)&&/&lt;i&gt;cel/.test(ta),ta);
 console.log(`\n${pass} ok, ${fail} falhas`);process.exit(fail?1:0)})();
