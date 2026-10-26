const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[];
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1500,height:950}}); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept(d.type()==='prompt'?(d.defaultValue()||'Modèle test'):undefined));
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(600);
 // ---------- catégories et plan du jour dans la fiche de la battue
 await p.click('text=Nouvelle battue'); await p.fill('#champ-date-nouvelle','2026-11-14'); await p.selectOption('#champ-modele-nouvelle',''); await p.click('#bouton-creer-nouvelle'); await p.waitForTimeout(400);
 const lignes=await p.locator('#liste-plan-jour .ligne-plan-jour').allInnerTexts();
 t('catégories de départ installées (5) avec leurs sonneries', lignes.length===5 && /Chevreuil[\s\S]*sonnerie 2/.test(lignes[0]) && /Cerf -8[\s\S]*sonnerie 6/.test(lignes[1]) && /Cerf \+8[\s\S]*sonnerie 6/.test(lignes[2]) && /Biche[\s\S]*sonnerie 4/.test(lignes[3]) && /Jeune[\s\S]*sonnerie 3/.test(lignes[4]));
 t('ligne Chevreuil : précisions chevreuil, chevrette, chevrillard', (await p.locator('#liste-plan-jour .ligne-plan-jour').first().locator('.plan-precision').count())===3);
 await p.fill('#champ-secteur-battue','Marais');
 const l=(i)=>p.locator('#liste-plan-jour .ligne-plan-jour').nth(i);
 await l(0).locator('.plan-autorise').check(); await l(0).locator('.plan-precision[value=Chevrette]').check(); await l(0).locator('.plan-nombre').fill('3');
 await l(1).locator('.plan-autorise').check(); await l(3).locator('.plan-autorise').check();
 await p.click('#formulaire-battue button[type=submit]'); await p.waitForTimeout(700);
 const bt=await p.evaluate(async()=>(await clientSupabase.from('battues').select()).data.find(x=>!x.est_modele));
 t('plan du jour enregistré sur la battue', bt.plan_jour.filter(x=>x.autorise).length===3 && bt.plan_jour[0].nombre===3 && bt.plan_jour[0].choix.join()==='Chevrette');
 // gestion des catégories
 await p.locator('#corps-tableau-a-venir tr, #corps-tableau-passees tr').first().locator('text=Modifier').click(); await p.waitForTimeout(300);
 t('réouverture : cases et nombre conservés', await l(0).locator('.plan-autorise').isChecked() && await l(0).locator('.plan-nombre').inputValue()==='3' && await l(0).locator('.plan-precision[value=Chevrette]').isChecked() && !(await l(2).locator('.plan-autorise').isChecked()));
 await p.click('text=Gérer le gibier et les sonneries'); await p.waitForTimeout(300);
 await p.locator('#corps-categories tr').nth(4).locator('.cat-sonnerie').fill('5'); await p.locator('#corps-categories tr').nth(4).locator('.cat-sonnerie').dispatchEvent('change'); await p.waitForTimeout(300);
 await p.click('text=+ Ajouter une catégorie'); await p.waitForTimeout(300);
 const nouvelle=p.locator('#corps-categories tr').nth(5); await nouvelle.locator('.cat-nom').fill('Sanglier'); await nouvelle.locator('.cat-nom').dispatchEvent('change'); await nouvelle.locator('.cat-sonnerie').fill('1'); await nouvelle.locator('.cat-sonnerie').dispatchEvent('change'); await p.waitForTimeout(300);
 await p.locator('#corps-categories tr').nth(5).locator('text=▲').click(); await p.waitForTimeout(300);
 t('catégorie ajoutée et déplacée (Sanglier en 5e position)', (await p.locator('#corps-categories tr').nth(4).locator('.cat-nom').inputValue())==='Sanglier');
 await p.click('#modale-categories >> text=Terminer'); await p.waitForTimeout(300);
 const apres=await p.locator('#liste-plan-jour .ligne-plan-jour').allInnerTexts();
 t('fermeture : liste mise à jour sans perdre les cases cochées', apres.length===6 && /Sanglier[\s\S]*sonnerie 1/.test(apres[4]) && /Jeune[\s\S]*sonnerie 5/.test(apres[5]) && await l(0).locator('.plan-autorise').isChecked());
 await p.click('#formulaire-battue button[type=submit]'); await p.waitForTimeout(600);
 // ---------- impression : plan de chasse du jour
 const idBattue=await p.evaluate(async()=>(await clientSupabase.from('battues').select()).data.find(x=>!x.est_modele).id);
 // traques éloignées
 await p.evaluate(async(id)=>{ const mk=async(n,nom,lat,lng)=>(await clientSupabase.from('traques').insert({battue_id:id,numero:n,nom,elements:[{id:'m'+n,type:'mouvement',forme:'ligne',points:[[lat,lng],[lat+0.003,lng+0.003]],fleche:true}],parkings:[],acces:[]}).select().single()).data.id;
   const t1=await mk(1,'Nord',46.6,2.5), t2=await mk(2,'Sud lointain',46.3,2.9);
   await clientSupabase.from('postes_traque').insert([{traque_id:t1,nom:'Poste A',lat:46.601,lng:2.501},{traque_id:t2,nom:'Poste B',lat:46.301,lng:2.901},{traque_id:t2,nom:'Poste C',lat:46.302,lng:2.902}]); },idBattue);
 await p.goto(B+'pages/impression.html?id='+idBattue+'&doc=carton'); await p.waitForTimeout(1500);
 const recto=await p.locator('.ib-feuille[data-face=recto] .ib-carton').first().innerText();
 t('carton : plan de chasse du jour, lignes cochées seulement', recto.includes('PLAN DE CHASSE DU JOUR') && recto.includes('Chevrette') && recto.includes('Cerf -8') && recto.includes('Biche') && !recto.includes('Cerf +8') && !recto.includes('Sanglier') && !/\bJeune\b/.test(recto));
 t('sonneries affichées (2, 6, 4)', (await p.locator('.ib-feuille[data-face=recto] .ib-carton').first().locator('.ib-sonnerie').allInnerTexts()).join('|')==='2|6|4');
 t('précision choisie : « Chevrette » seul sur la ligne chevreuil', (await p.locator('.ib-feuille[data-face=recto] .ib-carton').first().locator('.ib-table tbody tr').first().innerText()).startsWith('Chevrette'));
 // ---------- titres uniformes
 const titres=await p.evaluate(()=>[...document.querySelectorAll('.ib-feuille[data-face=recto] .ib-carton:first-child .ib-bloc-titre')].map(e=>({h:e.offsetHeight,fs:getComputedStyle(e).fontSize,mono:e.scrollHeight<=e.clientHeight+1})));
 t('titres de section : même hauteur, même taille, une seule ligne', titres.length>=3 && titres.every(x=>x.h===titres[0].h && x.fs===titres[0].fs && x.mono));
 // ---------- plusieurs cartes
 await p.selectOption('#panneau [data-ajout-liste=verso]','carte'); await p.click('#panneau [data-ajouter=verso]'); await p.waitForTimeout(500);
 t('2 cartes sur le verso = 4 cartes (2 par carton)', await p.locator('.ib-feuille[data-face=verso] .ib-carte-leaflet').count()===4);
 const blocsCarte=p.locator('#panneau .ib-bloc-edit',{hasText:'Carte'});
 await blocsCarte.nth(0).locator('.nom').click();
 await blocsCarte.nth(0).locator('[data-opt-traque=traques][value="1"]').check(); await p.waitForTimeout(500);
 await blocsCarte.nth(1).locator('[data-opt-traque=traques][value="2"]').check(); await p.waitForTimeout(700);
 const info=await p.evaluate(()=>{const cs=[...document.querySelectorAll('.ib-feuille[data-face=verso] .ib-carton:first-child .ib-carte-leaflet')]; return cs.map(c=>({postes:c.querySelectorAll('.icone-point-carte span').length,lat:null}));});
 t('carte 1 : poste de la traque 1 seulement', info[0].postes===1);
 t('carte 2 : postes de la traque 2 seulement', info[1].postes===2);
 const leg=await p.locator('.ib-feuille[data-face=verso] .ib-carton').first().locator('.ib-legende').allInnerTexts();
 t('légendes séparées par carte', leg.length===2 && leg[0].includes('Nord') && !leg[0].includes('Sud lointain') && leg[1].includes('Sud lointain') && !leg[1].includes('Nord'));
 const centres=await p.evaluate(()=>cartesImpression.filter(c=>c.carte.getContainer().closest('.ib-carton')).map(c=>c.carte.getCenter().lat));
 t('chaque carte est cadrée sur ses traques (46,6 et 46,3)', Math.abs(centres[0]-46.6)<0.05 && Math.abs(centres[1]-46.3)<0.05);
 // ---------- cadrage manuel : Cadrer / Figer
 const uid=await p.evaluate(()=>config.faces.verso.filter(b=>b.bloc==='carte')[1].uid);
 await blocsCarte.nth(1).locator('[data-cadrer]').click(); await p.waitForTimeout(400);
 t('Cadrer : cartes déplaçables et zoomables, bouton devenu « Figer le cadrage »', await p.evaluate((u)=>cartesDuBloc(u).every(c=>c.dragging.enabled()&&c.scrollWheelZoom.enabled()),uid) && (await blocsCarte.nth(1).locator('[data-cadrer]').innerText())==='Figer le cadrage');
 t('Cadrer : les autres cartes restent verrouillées', await p.evaluate((u)=>cartesImpression.filter(c=>c.uid!==u).every(c=>!c.carte.dragging.enabled()),uid));
 await p.evaluate((u)=>cartesDuBloc(u)[0].setView([46.35,2.95],13.5,{animate:false}),uid); await p.waitForTimeout(300);
 t('Cadrer : le 2e carton suit le 1er (même vue)', await p.evaluate((u)=>{const [a,c]=cartesDuBloc(u);return Math.abs(a.getCenter().lat-c.getCenter().lat)<1e-6 && a.getZoom()===c.getZoom();},uid));
 await blocsCarte.nth(1).locator('[data-cadrer]').click(); await p.waitForTimeout(800);
 const fige=await p.evaluate((u)=>config.faces.verso.find(b=>b.uid===u).options.cadrage,uid);
 t('Figer : cadrage enregistré dans la mise en page', fige && Math.abs(fige.centre[0]-46.35)<0.01 && fige.zoom===13.5);
 t('Figer : cartes de nouveau verrouillées, retrouvent le cadrage après rechargement du rendu', await p.evaluate((u)=>cartesDuBloc(u).every(c=>!c.dragging.enabled() && Math.abs(c.getCenter().lat-46.35)<0.01 && c.getZoom()===13.5),uid));
 t('indicateur : « Cadrage figé »', (await blocsCarte.nth(1).locator('.cadrage-etat').innerText())==='Cadrage figé');
 await blocsCarte.nth(1).locator('[data-auto]').click(); await p.waitForTimeout(600);
 t('Automatique : retour au cadrage sur les traques', await p.evaluate((u)=>Math.abs(cartesDuBloc(u)[0].getCenter().lat-46.3)<0.05,uid));
 // fond de carte : aucun
 await blocsCarte.nth(0).locator('[data-opt=fond]').selectOption('aucun'); await p.waitForTimeout(600);
 t('fond « Aucun » : pas de tuiles, tracés seuls', await p.evaluate((u)=>{const c=cartesImpression.find(x=>x.uid!==u).carte; return !document.querySelector('.ib-carte-leaflet .leaflet-tile-pane img') || true;},uid) && (await p.locator('.ib-feuille[data-face=verso] .ib-carte-leaflet').first().evaluate(e=>e.querySelectorAll('.leaflet-tile').length))===0);
 // ---------- ancienne configuration (avec trait de coupe) toujours lisible
 await p.evaluate(()=>{ localStorage.setItem('foret_impression_brouillon_carton', JSON.stringify({...config, style:{...config.style, traitsCoupe:true}})); });
 await p.reload(); await p.waitForTimeout(1200);
 t('ancienne mise en page (traitsCoupe) : chargée sans trait de coupe ni erreur', await p.locator('.ib-trait-coupe').count()===0 && await p.locator('.ib-feuille').count()===2);
 // ---------- fiche : plan du jour avec colonnes nombre et prélevé
 await p.goto(B+'pages/impression.html?id='+idBattue+'&doc=fiche'); await p.waitForTimeout(1500);
 const fiche=await p.locator('.ib-feuille[data-face=recto]').innerText();
 t('fiche : plan du jour avec nombre autorisé et colonne prélevé', fiche.includes('PLAN DE CHASSE DU JOUR') && fiche.includes('NOMBRE') && fiche.includes('PRÉLEVÉ'));
 const titresFiche=await p.evaluate(()=>[...document.querySelectorAll('.ib-bloc-titre')].map(e=>({h:e.offsetHeight,fs:getComputedStyle(e).fontSize,mono:e.scrollHeight<=e.clientHeight+1})));
 t('fiche : tous les titres de section identiques sur une ligne', titresFiche.length>=4 && titresFiche.every(x=>x.h===titresFiche[0].h && x.fs===titresFiche[0].fs && x.mono));
 t('fiche : aucun débordement', !(await p.locator('#alerte-debordement').isVisible()));
 // plan non renseigné
 const sans=await p.evaluate(async()=>{const id=(await clientSupabase.from('battues').insert({date_battue:'2026-12-01'}).select().single()).data.id; return id;});
 await p.goto(B+'pages/impression.html?id='+sans+'&doc=fiche'); await p.waitForTimeout(1200);
 t('plan du jour non renseigné : message clair dans le bloc', (await p.locator('#racine').innerText()).includes('non renseigné'));
 // modèle : le plan du jour se copie
 await p.goto(B+'pages/battues.html'); await p.waitForTimeout(600);
 await p.locator('#corps-tableau-a-venir tr', {hasText:'Marais'}).locator('text=Enregistrer comme modèle').click(); await p.waitForTimeout(1000);
 t('enregistrer comme modèle : le plan de chasse du jour est copié', await p.evaluate(async()=>{const m=(await clientSupabase.from('battues').select()).data.find(x=>x.est_modele); return m && m.plan_jour && m.plan_jour.filter(x=>x.autorise).length===3;}));
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
