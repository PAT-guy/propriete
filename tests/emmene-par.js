const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
let ok=0,ko=0; const t=(n,c)=>{c?ok++:(ko++,console.log('FAIL',n));};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1400,height:900}}); const p=await ctx.newPage();
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto('http://localhost:8123/index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(500);
 const id=await p.evaluate(async()=>{
  const ba=(await clientSupabase.from('battues').insert({nom:'B',date_battue:'2026-11-29'}).select()).data[0];
  const tr=(await clientSupabase.from('traques').insert({battue_id:ba.id,numero:1,nom:'A',vehicules:'Hilux|1 à 2|Paul\nQuad|3, 5|Marie',elements:[]}).select()).data[0];
  for(let i=1;i<=5;i++) await clientSupabase.from('postes_traque').insert({traque_id:tr.id,nom:'Poste '+i,lat:47.36,lng:1.88});
  return ba.id;});
 // fonctions pures
 t('spec « 1 à 2 »', await p.evaluate(()=>[...numerosDepuisSpec('1 à 2')].join()==='1,2'));
 t('spec « 3, 5-6 et 9 »', await p.evaluate(()=>[...numerosDepuisSpec('3, 5-6 et 9')].join()==='3,5,6,9'));
 await p.goto('http://localhost:8123/pages/impression.html?id='+id+'&doc=fiche'); await p.waitForTimeout(2000);
 const lignes=await p.locator('.ib-feuille[data-face=recto] .ib-sous-tableaux tbody tr').allInnerTexts();
 const clean=lignes.map(l=>l.replace(/\s+/g,' ').trim());
 t('poste 1 emmené par Paul', /^1 Poste 1.*Paul/.test(clean[0]));
 t('poste 4 sans véhicule', !/Paul|Marie/.test(clean[3]));
 t('poste 5 emmené par Marie', /Marie/.test(clean[4]));
 console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
