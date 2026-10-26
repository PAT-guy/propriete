const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','leaflet-draw@1.0.4/dist/leaflet.draw.js':L+'/leaflet-draw/dist/leaflet.draw.js','leaflet-draw@1.0.4/dist/leaflet.draw.css':L+'/leaflet-draw/dist/leaflet.draw.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[];
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html');
 // propriétaire retiré de Parcelles
 await p.goto(B+'pages/parcelles.html'); await p.waitForTimeout(700);
 const html=await p.content();
 t('plus aucune mention de propriétaire sur Parcelles', !/propri[ée]taire/i.test(await p.locator('body').innerText()) && !/proprietaire/.test(html.replace(/<script[\s\S]*?<\/script>/g,'')));
 await p.evaluate(()=>ouvrirCreationParcelle([[46,2],[46,2.1],[46.1,2.1]],{lat:46,lng:2}));
 await p.fill('#champ-nom-parcelle','Test'); await p.click('#formulaire-parcelle button[type=submit]'); await p.waitForTimeout(600);
 t('création de parcelle sans propriétaire', (await p.evaluate(async()=>(await clientSupabase.from('parcelles').select()).data)).length===1);
 // assurance chasseur
 await p.goto(B+'pages/chasse.html'); await p.waitForTimeout(700);
 const ajouter=async(nom,assureur,date)=>{ await p.evaluate(()=>ouvrirCreationChasseur()); await p.fill('#champ-nom-chasseur',nom); await p.fill('#champ-assureur-chasseur',assureur); await p.fill('#champ-contrat-assurance-chasseur','C-123'); if(date) await p.fill('#champ-validite-assurance-chasseur',date); await p.click('#formulaire-chasseur button[type=submit]'); await p.waitForTimeout(500); };
 await ajouter('Valide','Groupama','2099-12-31'); await ajouter('Perime','AXA','2020-01-31'); await ajouter('Sans','', '');
 const lignes=await p.locator('#corps-tableau-chasseurs tr').allInnerTexts();
 const l=n=>lignes.find(x=>x.includes(n))||'';
 t('assurance valide affichée', /Groupama, jusqu'au 31\/12\/2099/.test(l('Valide')));
 t('assurance expirée signalée', /AXA, expirée le 31\/01\/2020/.test(l('Perime')));
 t('assurance non renseignée', /Non renseignée/.test(l('Sans')));
 const rouge=await p.locator('#corps-tableau-chasseurs tr',{hasText:'Perime'}).locator('span[style*="a3442f"]').count();
 t('expirée en rouge', rouge===1);
 // modification : les champs sont repris
 const id=await p.evaluate(async()=>(await clientSupabase.from('chasseurs').select().eq('nom','Valide').single()).data.id);
 await p.evaluate(i=>ouvrirModificationChasseur(i),id);
 t('modification : champs assurance pré-remplis', await p.inputValue('#champ-assureur-chasseur')==='Groupama' && await p.inputValue('#champ-contrat-assurance-chasseur')==='C-123' && await p.inputValue('#champ-validite-assurance-chasseur')==='2099-12-31');
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
