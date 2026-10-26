const { chromium } = require('playwright');
const fs = require('fs');
const L = process.argv[2] + '/node_modules';
const map = {
 'leaflet@1.9.4/dist/leaflet.js': L+'/leaflet/dist/leaflet.js',
 'leaflet@1.9.4/dist/leaflet.css': L+'/leaflet/dist/leaflet.css',
 'leaflet-draw@1.0.4/dist/leaflet.draw.js': L+'/leaflet-draw/dist/leaflet.draw.js',
 'leaflet-draw@1.0.4/dist/leaflet.draw.css': L+'/leaflet-draw/dist/leaflet.draw.css',
 '@supabase/supabase-js@2': L+'/@supabase/supabase-js/dist/umd/supabase.js',
};
const B='http://localhost:8123/';
let ok=0, ko=0; const errs=[];
const t=(n,c)=>{ (c?ok++:ko++); console.log((c?'OK  ':'FAIL ')+n); };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));
 await ctx.route(/unpkg\.com/, r=>{ const u=r.request().url(); const k=Object.keys(map).find(k=>u.includes(k)); k?r.fulfill({path:map[k]}):r.abort(); });
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html');
 t('connexion démo', true);
 await p.goto(B+'pages/parcelles.html'); await p.waitForTimeout(800);
 t('page parcelles chargée', await p.locator('#zone-navigation').count()>0);
 await p.goto(B+'pages/chasse.html'); await p.waitForTimeout(800);
 // seed via client démo
 const ids = await p.evaluate(async()=>{
   const c=(await clientSupabase.from('chasseurs').insert({nom:'<img src=x onerror=window.__xss=1>',prenom:'O\'Brien "Q"',actif:true}).select().single()).data;
   const e=(await clientSupabase.from('especes_gibier').select()).data;
   const bt=(await clientSupabase.from('battues').insert({date_battue:'2026-11-15',secteur:'Nord'}).select().single()).data;
   return {c:c.id,b:bt.id,nEsp:e.length};
 });
 t('seed chasseur/battue (espèces='+ids.nEsp+')', !!ids.b);
 await p.goto(B+'pages/battues.html'); await p.waitForTimeout(700);
 t('battue listée', (await p.locator('#corps-tableau-a-venir tr').count())>0 && !(await p.locator('#corps-tableau-a-venir').innerText()).includes('Aucune'));
 await p.goto(B+'pages/plan-battue.html?id='+ids.b); await p.waitForTimeout(1000);
 t('carte leaflet rendue', await p.locator('.leaflet-container').count()>0);
 await p.click('[data-outil=ligne]'); const carte=p.locator('#carte-plan');
 for (const [x,y] of [[200,250],[350,200],[500,300]]) { await carte.click({position:{x,y}}); await p.waitForTimeout(100); }
 await p.click('#bouton-terminer-dessin'); await p.click('#formulaire-element button[type=submit]');
 await p.click('[data-outil=point]'); await carte.click({position:{x:300,y:350}}); await p.fill('#champ-nom-element','Poste test'); await p.click('#formulaire-element button[type=submit]');
 await p.keyboard.press('Escape');
 await p.click('#bouton-enregistrer-plan'); await p.waitForTimeout(800);
 const dbt=await p.evaluate(async()=>({t:(await clientSupabase.from('traques').select()).data,pt:(await clientSupabase.from('postes_traque').select()).data}));
 t('traque enregistrée avec son tracé ('+((dbt.t[0]||{}).elements||[]).length+' élément)', dbt.t.length===1 && dbt.t[0].elements.length===1 && dbt.t[0].elements[0].points.length===3);
 t('poste enregistré', dbt.pt.length===1 && dbt.pt[0].nom==='Poste test');
 await p.reload(); await p.waitForTimeout(1000);
 t('persistance après rechargement', (await p.evaluate(async()=>(await clientSupabase.from('traques').select()).data.length))===1 && await p.evaluate(()=>traquesEtat[0].elements.length===1));
 await p.goto(B+'battue-impression.html?id='+ids.b); await p.waitForURL('**/pages/impression.html**'); await p.waitForTimeout(1200);
 t('ancienne adresse de la fiche : redirigée vers les cartons', p.url().includes('doc=carton'));
 t('cartons : 2 feuilles A4, 4 cartons', await p.locator('.ib-feuille').count()===2 && await p.locator('.ib-carton').count()===4);
 t('carte des cartons avec éléments', await p.locator('.ib-carte-leaflet .leaflet-marker-icon, .ib-carte-leaflet path').count()>0);

 await p.goto(B+'pages/chasse.html'); await p.waitForTimeout(800);
 t('XSS chasseur : aucun script exécuté', !(await p.evaluate(()=>window.__xss)));
 t('XSS chasseur : texte affiché littéralement', (await p.locator('#corps-tableau-chasseurs').innerText()).includes('<img src=x'));
 await p.goto(B+'pages/plan-battue.html?id='+ids.b); await p.waitForTimeout(1000);
 t('XSS plan-battue : aucun script exécuté', !(await p.evaluate(()=>window.__xss)));
 await p.goto(B+'pages/impression.html?doc=fiche&id='+ids.b); await p.waitForTimeout(1000);
 t('XSS fiche de gestion : aucun script exécuté', !(await p.evaluate(()=>window.__xss)));
 for (const u of ['pages/battues.html','pages/travaux.html']) { await p.goto(B+u); await p.waitForTimeout(700); }
 t('autres pages sans erreur JS', errs.length===0);
 console.log('Erreurs JS:',errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
