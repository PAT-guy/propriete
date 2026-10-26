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
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/tableau-de-bord.html');
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
 await p.reload(); await p.waitForTimeout(500); await p.click('text=Battues').catch(()=>{});
 t('battue listée', (await p.locator('#corps-tableau-battues tr').count())>0);
 await p.goto(B+'pages/plan-battue.html?id='+ids.b); await p.waitForTimeout(1000);
 await p.click('#bouton-ajouter-traque'); await p.waitForTimeout(600);
 const carte=p.locator('.conteneur-carte, .leaflet-container').first();
 t('carte leaflet rendue', await p.locator('.leaflet-container').count()>0);
 const bb=await carte.boundingBox();
 const clic=async(dx,dy)=>{await carte.click({position:{x:bb.width*dx,y:bb.height*dy}});await p.waitForTimeout(150);};
 await p.locator('[id^=bouton-mode-mouvement-]').first().click();
 await clic(.2,.8);await clic(.5,.5);await clic(.7,.3);
 await p.locator('[id^=bouton-mode-poste-]').first().click(); await clic(.4,.4);
 await p.locator('[id^=bouton-mode-parking-]').first().click(); await clic(.1,.9);
 await p.waitForTimeout(300);
 t('flèche de direction présente', await p.locator('.leaflet-container svg path, .leaflet-marker-icon').count()>2);
 await p.locator('[id^=bouton-enregistrer-traque-]').first().click(); await p.waitForTimeout(800);
 const dbt=await p.evaluate(async()=>({t:(await clientSupabase.from('traques').select()).data,pt:(await clientSupabase.from('postes_traque').select()).data}));
 t('traque enregistrée avec mouvement ('+(dbt.t[0]?.mouvement||[]).length+' pts)', dbt.t.length===1 && (dbt.t[0].mouvement||[]).length===3);
 t('poste enregistré', dbt.pt.length===1);
 t('parking enregistré', (dbt.t[0]?.parkings||[]).length===1);
 await p.waitForTimeout(300);
 await p.reload(); await p.waitForTimeout(1000);
 const d2=await p.evaluate(async()=>(await clientSupabase.from('traques').select()).data.length);
 t('persistance après rechargement', d2===1);
 await p.goto(B+'battue-impression.html?id='+ids.b); await p.waitForTimeout(1200);
 t('fiche impression visible', await p.locator('#zone-fiche').isVisible());
 t('carte impression avec éléments', await p.locator('#carte-impression .leaflet-marker-icon, #carte-impression path').count()>0);
 await p.screenshot({path:process.argv[3]+'/fiche.png',fullPage:true});

 await p.goto(B+'pages/chasse.html'); await p.waitForTimeout(800);
 t('XSS chasseur : aucun script exécuté', !(await p.evaluate(()=>window.__xss)));
 t('XSS chasseur : texte affiché littéralement', (await p.locator('#corps-tableau-chasseurs').innerText()).includes('<img src=x'));
 await p.goto(B+'pages/plan-battue.html?id='+ids.b); await p.waitForTimeout(1000);
 t('XSS plan-battue : aucun script exécuté', !(await p.evaluate(()=>window.__xss)));
 await p.goto(B+'battue-impression.html?id='+ids.b); await p.waitForTimeout(1000);
 t('XSS fiche : aucun script exécuté', !(await p.evaluate(()=>window.__xss)));
 for (const u of ['tableau-de-bord.html','pages/travaux.html','pages/finances.html']) { await p.goto(B+u); await p.waitForTimeout(700); }
 t('autres pages sans erreur JS', errs.length===0);
 console.log('Erreurs JS:',errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
