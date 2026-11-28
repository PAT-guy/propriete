const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
let ok=0,ko=0; const t=(n,c)=>{c?ok++:(ko++,console.log('FAIL',n));};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1400,height:900}}); const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto('http://localhost:8123/index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(500);
 const id=await p.evaluate(async()=>{
  const ba=(await clientSupabase.from('battues').insert({nom:'B',date_battue:'2026-11-29',regles_securite:'- Règle un\n- Règle deux'}).select()).data[0];
  for (const n of [1,2,3]) await clientSupabase.from('traques').insert({battue_id:ba.id,numero:n,nom:'T'+n,elements:[]});
  return ba.id;});
 await p.goto('http://localhost:8123/pages/impression.html?id='+id+'&doc=livret'); await p.waitForTimeout(2500);
 t('deux faces de feuille : extérieur et intérieur', await p.locator('.ib-feuille.ib-paysage').count()===2);
 t('quatre demi-pages A5', await p.locator('.ib-demi').count()===4);
 const dim=await p.evaluate(()=>{const f=document.querySelector('.ib-feuille.ib-paysage'); const d=document.querySelector('.ib-demi'); const mm=96/25.4; return [f.offsetWidth/mm,f.offsetHeight/mm,d.offsetWidth/mm,d.offsetHeight/mm].map(x=>Math.round(x));});
 t('feuille 297x210 mm, demi-page 149x210 mm', dim[0]===297&&dim[1]===210&&dim[2]>=148&&dim[2]<=150&&dim[3]===210);
 t('page A4 paysage demandée à l\'impression', await p.evaluate(()=>[...document.querySelectorAll('style')].some(s=>s.textContent.includes('A4 landscape'))));
 t('extérieur : dos (consignes) à gauche, couverture à droite', await p.evaluate(()=>{const e=document.querySelector('.ib-feuille[data-face=exterieur]'); const d=e.querySelectorAll('.ib-demi'); return /Règle un/.test(d[0].innerText) && /Battue/.test(d[1].innerText);}));
 t('intérieur : 3 cartes, une par traque, 2 puis 1', await p.evaluate(()=>{const e=document.querySelector('.ib-feuille[data-face=interieur]').querySelectorAll('.ib-demi'); return e[0].querySelectorAll('.ib-carte-leaflet').length===2 && e[1].querySelectorAll('.ib-carte-leaflet').length===1;}));
 t('pas de débordement', !(await p.locator('#alerte-debordement').isVisible()));
 const h=await p.locator('#panneau .ib-section h3').allInnerTexts(); t('panneau : 4 pages à régler '+JSON.stringify(h), h.filter(x=>/^PAGE \d/i.test(x)).length===4);
 t('aucune erreur JS', errs.length===0);
 console.log(ok+' OK, '+ko+' FAIL', errs); await b.close();
})();
