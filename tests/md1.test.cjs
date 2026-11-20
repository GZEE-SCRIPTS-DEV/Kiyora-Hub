const fs=require('fs'),path=require('path');
const MDSRC=(()=>{const s=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');return s.slice(s.indexOf('function md(src'),s.indexOf('\nfunction crc32'))})();
let __f=0;const __log=console.log;console.log=(...a)=>{if(typeof a[0]==='string'&&a[0].startsWith('FALHOU'))__f++;__log(...a)};process.on('exit',()=>{if(__f)process.exitCode=1});
const md=new Function(MDSRC+';return md')();
const readme=`<div align="center">

# 🚀 Olá, mundo! Eu sou um desenvolvedor

### 💻 Transformando ideias em realidade através da tecnologia.

![Profile Views](https://komarev.com/ghpvc/?username=SEU-USUARIO&color=8b5cf6&style=for-the-badge)

</div>

---

## 👨‍💻 Sobre mim

- 🎮 Desenvolvedor de jogos.
- 💻 Desenvolvedor de softwares.

## 🛠️ Tecnologias

<div align="center">

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

</div>

<div align="center">

![GitHub Stats](https://github-readme-stats.vercel.app/api?username=SEU-USUARIO&show_icons=true&theme=tokyonight)

</div>

---

<div align="center">

### 🌟 Obrigado pela visita!

**Feito com ❤️ e muito código.**

</div>`;
const out=md(readme);
console.log(out.slice(0,1500));
// checagem de segurança
const ALLOWED=new Set("a div p h1 h2 h3 h4 h5 h6 details summary b strong i em u s del sub sup small kbd span ul ol li table thead tbody tr th td blockquote br hr img pre code".split(" "));
const AT=new Set("href target rel src alt loading referrerpolicy width height style".split(" "));
const STY=/^(text-align:(left|center|right)|max-width:100%|border:1px solid #8884;padding:4px 8px;text-align:(left|center|right)|border-collapse:collapse|overflow-x:auto)$/;
function check(h,label){let bad=[];
 for(const m of h.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z-]+="[^"]*")*)\s*>/g)){}
 // todo '<' deve pertencer a uma tag bem formada e permitida
 const stripped=h.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z-]+="[^"]*")*)\s*>/g,(m,c,t,a)=>{
   if(!ALLOWED.has(t.toLowerCase()))bad.push('tag '+t);
   for(const x of a.matchAll(/\s+([a-zA-Z-]+)="([^"]*)"/g)){const n=x[1].toLowerCase(),v=x[2];
     if(!AT.has(n))bad.push('attr '+n);
     if((n==='href'||n==='src')&&!/^https?:\/\//i.test(v))bad.push(n+'='+v);
     if(n==='style'&&!STY.test(v))bad.push('style '+v);
     if(n!=='style'&&/[<>]/.test(v))bad.push('<> em '+n);}
   return ''});
 if(/</.test(stripped.replace(/&lt;/g,'')))bad.push('< solto: '+stripped.match(/.{0,30}<.{0,30}/)[0]);
 console.log(bad.length?'FALHOU':'ok   ',label,bad.slice(0,3).join(' | '));}
check(out,'README do usuário');
const atk=[
 '<script>alert(1)</script>','<img src=x onerror=alert(1)>','<img src="javascript:alert(1)">','<a href="javascript:alert(1)">x</a>',
 '[x](javascript:alert(1))','![x](javascript:alert(1))','<div onclick="alert(1)" align="center">x</div>','<iframe src="https://evil"></iframe>',
 '![`a`](https://x/ "onerror=alert(1) ")','![ <img src="https://a/onerror=alert(1)//"> ](https://b/c.png)','[a](https://x/`code`)',
 '<img src="https://x/y.png" alt="q&quot; onerror=&quot;alert(1)">','<img src=\'https://x/y.png\' alt=\'" onerror="alert(1)\'>',
 '<a href="https://x" onmouseover="alert(1)">hi</a>','<style>body{display:none}</style>','<svg onload=alert(1)>','<div style="position:fixed;inset:0">x</div>',
 '**<b onclick=1>x</b>**','`<script>`','\u0001 0\u0002 \u00011\u0002','<details><summary>x</summary>y','</div></div></div>x','<p align="center" style="x:y">t</p>',
 '| a | b |\n|---|:-:|\n| <script>1</script> | ![x](https://a/b.png) |','<div align="center"><img src="https://a/b.png" width="100" height="javascript:1"></div>',
 '<img src="https://a/b.png" width="9999999">','<a href="https://x"><img src="https://y/z.png"></a>','<!-- <script>alert(1)</script> -->'];
atk.forEach((a,i)=>{const r=md(a);check(r,'atk'+i+' '+JSON.stringify(a).slice(0,50));});
console.log('\nex tabela:',md('| a | b |\n|---|:-:|\n| 1 | 2 |').slice(0,200));
console.log('\nex link+img:',md('[![x](https://a/b.png)](https://c.com)'));
console.log('\nex 100KB tempo:');const big=('<div align="center">\n![x](https://a/b.png)\n</div>\n'+'texto **negrito** `c` [l](https://x.y)\n').repeat(2500);console.time('big');md(big);console.timeEnd('big');
