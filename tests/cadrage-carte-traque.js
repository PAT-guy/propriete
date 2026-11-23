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
  const A=(await clientSupabase.from('parcelles').insert({nom:'Loin',contour:[[47.30,1.80],[47.31,1.80],[47.31,1.82]]}).select()).data[0];
  const B=(await clientSupabase.from('parcelles').insert({nom:'Près',contour:[[47.36,1.88],[47.37,1.88],[47.37,1.89]]}).select()).data[0];
  const ba=(await clientSupabase.from('battues').insert({nom:'B',date_battue:'2026-11-29',parcelle_id:A.id}).select()).data[0];
  await clientSupabase.from('traques').insert({battue_id:ba.id,numero:1,nom:'T1',parcelle_id:A.id,parkings:[{nom:'p',lat:47.305,lng:1.805}],elements:[]});
  await clientSupabase.from('traques').insert({battue_id:ba.id,numero:2,nom:'T2',parcelle_id:B.id,parkings:[{nom:'p',lat:47.365,lng:1.885}],elements:[]});
  return ba.id;});
 await p.goto('http://localhost:8123/pages/impression.html?id='+id+'&doc=carton'); await p.waitForTimeout(2500);
 const n = await p.evaluate(async()=>{
   const zone=document.createElement('div'); zone.style.cssText='width:400px;height:300px;position:fixed;left:0;top:0;'; document.body.appendChild(zone);
   await dessinerCarteImpression(zone,{uid:'t',fond:'aucun',etiquettes:'numeros',echelle:1,traques:[2],cadrage:null},ctx);
   const c=cartesImpression[cartesImpression.length-1].carte.getBounds(); return [c.getSouth(),c.getNorth()];});
 t('carte de la traque 2 : cadrée sur sa zone, pas sur la parcelle de la battue', n[0]>47.33);
 const g = await p.evaluate(async()=>{
   const zone=document.createElement('div'); zone.style.cssText='width:400px;height:300px;position:fixed;left:0;top:0;'; document.body.appendChild(zone);
   await dessinerCarteImpression(zone,{uid:'u',fond:'aucun',etiquettes:'numeros',echelle:1.6,traques:[2],cadrage:null},ctx);
   return zone.querySelector('.icone-point-carte div') ? zone.querySelector('.icone-point-carte div').style.transform : '';});
 t('taille des figurés appliquée', g.includes('1.6'));
 console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
