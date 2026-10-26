const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','leaflet-draw@1.0.4/dist/leaflet.draw.js':L+'/leaflet-draw/dist/leaflet.draw.js','leaflet-draw@1.0.4/dist/leaflet.draw.css':L+'/leaflet-draw/dist/leaflet.draw.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ko=0;
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:760}}); const p=await ctx.newPage();
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html');
 for (const [page,ouvrir,modale] of [['pages/parcelles.html','#bouton-ajouter-cadastre','#modale-cadastre'],['pages/parcelles.html',"()=>ouvrirCreationParcelle([[46,2],[46,2.1],[46.1,2.1]],{lat:46,lng:2})",'#modale-parcelle']]) {
  await p.goto(B+page); await p.waitForTimeout(800);
  if (ouvrir.startsWith('#')) await p.click(ouvrir); else await p.evaluate(eval(ouvrir));
  await p.waitForTimeout(300);
  // la boîte de dialogue chevauche la carte : le point au milieu de la boîte doit appartenir à la modale, pas à Leaflet
  const res=await p.evaluate(m=>{const boite=document.querySelector(m+' .boite-modale');const r=boite.getBoundingClientRect();const carte=document.querySelector('#carte-parcelles').getBoundingClientRect();
    const y=Math.max(r.top,carte.top)+10; const x=r.left+r.width/2; const el=document.elementFromPoint(x,y); return {dansModale:!!el.closest(m), chevauche:r.bottom>carte.top, controleZoomSousModale: (()=>{const z=document.querySelector('.leaflet-control-zoom').getBoundingClientRect(); const e=document.elementFromPoint(z.left+5,z.top+5); return !!e.closest('.fond-modale');})()};},modale);
  console.log(modale, JSON.stringify(res)); if(!res.dansModale || !res.controleZoomSousModale) ko++;
 }
 console.log(ko?ko+' FAIL':'OK'); await b.close();
})();
