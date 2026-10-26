const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[];
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1500,height:950}}); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(500);
 await p.goto(B+'pages/chasse.html'); await p.waitForTimeout(800);
 await p.click('[data-onglet=onglet-plan]');
 await p.evaluate(()=>ouvrirCreationPlan());
 const opts=await p.locator('#champ-espece-plan option').allInnerTexts();
 t('plan de chasse : gibier = Chevreuil, Cerf -8, Cerf +8, Biche, Jeune', opts.join('|')==='Chevreuil|Cerf -8|Cerf +8|Biche|Jeune');
 // attributions
 const attribuer=async(nom,n)=>{ await p.evaluate(()=>ouvrirCreationPlan()); await p.fill('#champ-saison-plan','2026-2027'); await p.selectOption('#champ-espece-plan',{label:nom}); await p.fill('#champ-attribution-plan',String(n)); await p.click('#formulaire-plan button[type=submit]'); await p.waitForTimeout(400); };
 await attribuer('Cerf -8',3); await attribuer('Biche',2); await attribuer('Cerf +8',1);
 const lignes=await p.locator('#corps-tableau-plan tr').allInnerTexts();
 t('3 attributions par catégorie, réalisé à 0', lignes.length===3 && lignes.some(l=>/Cerf -8\s+3\s+0 \/ 3/.test(l)) && lignes.some(l=>/Biche\s+2\s+0 \/ 2/.test(l)));
 // prélèvement
 await p.click('[data-onglet=onglet-prelevements]');
 await p.evaluate(()=>ouvrirCreationPrelevement());
 t('prélèvement : mêmes catégories proposées', (await p.locator('#champ-espece-prelevement option').allInnerTexts()).join('|')==='Chevreuil|Cerf -8|Cerf +8|Biche|Jeune');
 const prelever=async(nom,date)=>{ await p.evaluate(()=>ouvrirCreationPrelevement()); await p.fill('#champ-date-prelevement',date); await p.fill('#champ-saison-prelevement','2026-2027'); await p.selectOption('#champ-espece-prelevement',{label:nom}); await p.click('#formulaire-prelevement button[type=submit]'); await p.waitForTimeout(400); };
 await prelever('Cerf -8','2026-11-14'); await prelever('Cerf -8','2026-11-14'); await prelever('Biche','2026-11-15');
 const tableau=await p.locator('#corps-tableau-prelevements').innerText();
 t('tableau des prélèvements : catégorie affichée', tableau.includes('Cerf -8') && tableau.includes('Biche'));
 await p.click('[data-onglet=onglet-plan]'); await p.waitForTimeout(300);
 const apres=await p.locator('#corps-tableau-plan tr').allInnerTexts();
 t('réalisé compté par catégorie (Cerf -8 : 2/3, Biche : 1/2, Cerf +8 : 0/1)', apres.some(l=>/Cerf -8\s+3\s+2 \/ 3/.test(l)) && apres.some(l=>/Biche\s+2\s+1 \/ 2/.test(l)) && apres.some(l=>/Cerf \+8\s+1\s+0 \/ 1/.test(l)));
 // autres espèces
 await p.click('text=Gérer le gibier et les sonneries'); await p.waitForTimeout(300);
 t('liste des espèces courantes proposée', (await p.locator('#select-espece-courante option').allInnerTexts()).includes('Sanglier'));
 await p.selectOption('#select-espece-courante','Sanglier'); await p.click('text=Ajouter cette espèce'); await p.waitForTimeout(400);
 await p.selectOption('#select-espece-courante','Renard'); await p.click('text=Ajouter cette espèce'); await p.waitForTimeout(400);
 t('Sanglier et Renard ajoutés, retirés de la liste des espèces proposées', (await p.locator('#corps-categories .cat-nom').evaluateAll(e=>e.map(x=>x.value))).join('|').endsWith('Sanglier|Renard') && !(await p.locator('#select-espece-courante option').allInnerTexts()).includes('Sanglier'));
 await p.click('#modale-categories >> text=Terminer'); await p.waitForTimeout(500);
 await p.evaluate(()=>ouvrirCreationPlan());
 t('les nouvelles espèces apparaissent dans le plan de chasse', (await p.locator('#champ-espece-plan option').allInnerTexts()).join('|').includes('Sanglier|Renard'));
 await prelever('Sanglier','2026-11-16');
 t('prélèvement de sanglier enregistré', (await p.locator('#corps-tableau-prelevements').innerText()).includes('Sanglier'));
 // anciennes données (espèce sans catégorie) toujours lisibles
 await p.evaluate(async()=>{ const e=(await clientSupabase.from('especes_gibier').select()).data.find(x=>x.nom==='Daim'); await clientSupabase.from('plans_chasse').insert({saison:'2025-2026',espece_id:e.id,attribution:4}); await clientSupabase.from('prelevements').insert({date_prelevement:'2025-12-01',saison:'2025-2026',espece_id:e.id}); });
 await p.reload(); await p.waitForTimeout(800); await p.click('[data-onglet=onglet-plan]');
 t('anciennes lignes (espèce) : nom conservé, réalisé 1/4', (await p.locator('#corps-tableau-plan tr').allInnerTexts()).some(l=>/Daim\s+4\s+1 \/ 4/.test(l)));
 // battue : plan du jour avec les nouvelles espèces + prélèvement par traque
 await p.goto(B+'pages/battues.html'); await p.waitForTimeout(500);
 const bt=await p.evaluate(async()=>{ const b=(await clientSupabase.from('battues').insert({date_battue:'2026-11-20',secteur:'Nord'}).select().single()).data.id; const t1=(await clientSupabase.from('traques').insert({battue_id:b,numero:1,nom:'T1',elements:[],parkings:[],acces:[]}).select().single()).data.id; return {b,t1}; });
 await p.goto(B+'pages/plan-battue.html?id='+bt.b); await p.waitForTimeout(1000);
 t('plan de battue : prélèvement par catégorie', (await p.locator('#champ-espece-traque option').allInnerTexts()).includes('Cerf +8'));
 await p.selectOption('#champ-espece-traque',{label:'Cerf +8'}); await p.click('text=Enregistrer un prélèvement'); await p.waitForTimeout(500);
 t('décompte de la traque : « 1 Cerf +8 »', (await p.locator('#tally-prelevements').innerText()).includes('1 Cerf +8'));
 // impression : bilan par catégorie
 await p.goto(B+'pages/impression.html?id='+bt.b+'&doc=fiche'); await p.waitForTimeout(1200);
 await p.selectOption('#panneau [data-ajout-liste=recto]','bilan'); await p.click('#panneau [data-ajouter=recto]'); await p.waitForTimeout(700);
 const bilan=await p.locator('#racine').innerText();
 t('bilan imprimé : catégories du plan de chasse de la saison', bilan.includes('Cerf -8') && bilan.includes('Biche') && bilan.includes('Cerf +8'));
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
