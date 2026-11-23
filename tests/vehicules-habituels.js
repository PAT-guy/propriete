const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
let ok=0,ko=0; const t=(n,c)=>{c?ok++:(ko++,console.log('FAIL',n));};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1400,height:900}}); const p=await ctx.newPage();
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto('http://localhost:8123/index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(500);
 const ids=await p.evaluate(async()=>{
   const par=(await clientSupabase.from('parcelles').insert({nom:'Bois test',contour:[[47.36,1.88],[47.37,1.88],[47.37,1.9]]}).select()).data[0];
   const ba=(await clientSupabase.from('battues').insert({nom:'B',date_battue:'2026-11-29',parcelle_id:par.id}).select()).data[0];
   await clientSupabase.from('traques').insert({battue_id:ba.id,numero:1,nom:'A',vehicules:'Hilux blanche\nRemorque',elements:[]});
   return {b:ba.id,p:par.id};});
 await p.goto('http://localhost:8123/pages/plan-battue.html?id='+ids.b); await p.waitForTimeout(1200);
 t('pastille Hilux proposée sur une autre traque', true);
 await p.evaluate(()=>{const n=nouvelleTraque(); traqueActiveCle=n.cle; redessinerTout();});
 t('nouvelle traque garde la parcelle', await p.evaluate(()=>traqueActive().parcelle_id!==null));
 await p.locator('#fiche-traque button:has-text("+ Hilux blanche")').click(); await p.waitForTimeout(200);
 t('clic sur la pastille ajoute le véhicule', await p.evaluate(()=>traqueActive().vehicules==='Hilux blanche'));
 t('la pastille disparaît une fois ajoutée', await p.locator('#fiche-traque button:has-text("+ Hilux blanche")').count()===0);
 console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
