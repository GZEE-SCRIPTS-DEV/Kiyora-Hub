const fs=require('fs'),path=require('path');
const MDSRC=(()=>{const s=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');return s.slice(s.indexOf('function md(src'),s.indexOf('\nfunction crc32'))})();
let __f=0;const __log=console.log;console.log=(...a)=>{if(typeof a[0]==='string'&&a[0].startsWith('FALHOU'))__f++;__log(...a)};process.on('exit',()=>{if(__f)process.exitCode=1});
const md=new Function(MDSRC+';return md')();
const ctx={stars:(u,n)=>{u=u.toLowerCase();if(u==='this')return 7;if(u==='gzee'&&!n)return 42;if(u==='gzee'&&n&&n.toLowerCase()==='kiyora')return 5;return null}};
const show=(t)=>console.log(JSON.stringify(t),'\n  =>',md(t,ctx).replace(/ style="[^"]*"/g,' style=…').replace(/ loading="lazy" referrerpolicy="no-referrer"/g,''),'\n');
show('stars:Gzee'); show('stars:Gzee/Kiyora'); show('stars:this'); show('stars:Fulano'); show('Nota: stars:Gzee.');
show('lang:JavaScript'); show('lang:JavaScript,Python,C++,C#'); show('lang:Brainfuck'); show('lang:js lang:PY');
show('`stars:Gzee` e `lang:JS` ficam literais'); show('[stars:Gzee](https://a.com/lang:JS)'); show('https://a.com/stars:Gzee');
show('mystars:Gzee'); show('**lang:Go**'); show('| lang:Go | stars:Gzee |\n|--|--|\n| lang:Rust | stars:this |');
console.log('sem ctx:',md('stars:Gzee lang:JS'));
// segurança
const ALLOWED=new Set("a div p h1 h2 h3 h4 h5 h6 details summary b strong i em u s del sub sup small kbd span ul ol li table thead tbody tr th td blockquote br hr img pre code".split(" "));
const AT=new Set("href target rel src alt loading referrerpolicy width height style title".split(" "));
function check(h,l){const bad=[];const rest=h.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z-]+="[^"]*")*)\s*>/g,(m,c,t,a)=>{if(!ALLOWED.has(t.toLowerCase()))bad.push('tag '+t);
 for(const x of a.matchAll(/\s+([a-zA-Z-]+)="([^"]*)"/g)){const n=x[1].toLowerCase(),v=x[2];if(!AT.has(n))bad.push('attr '+n);
  if((n==='href'||n==='src')&&!/^https:\/\/(cdn\.simpleicons\.org\/[a-z0-9]+\/[0-9a-f]{6}$|(?!cdn\.simpleicons)[^\s"]+$)/i.test(v))bad.push(n+'='+v);
  if(n==='style'&&/url\(|expression|javascript|position\s*:|@import/i.test(v))bad.push('style '+v);if(/[<>]/.test(v))bad.push('<>'+n)}return ''});
 if(/</.test(rest.replace(/&lt;/g,'')))bad.push('< solto');console.log(bad.length?'FALHOU':'ok   ',l,bad.slice(0,3).join('|'))}
['lang:<img src=x onerror=1>','lang:a"onmouseover=1','stars:<script>alert(1)</script>','stars:Gzee"/x','lang:js,<b>','stars:Gzee/Kiyora"><svg onload=1>','\u0001 0\u0002lang:js','lang:'+'a'.repeat(5000),'stars:'+'x/'.repeat(3000)].forEach((a,i)=>check(md(a,ctx),'atk'+i));
