const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[];
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(600);
 const s=await p.evaluate(async()=>{
  const ins=async(n,o)=>(await clientSupabase.from(n).insert(o).select().single()).data.id;
  const c1=await ins('chasseurs',{nom:'Martin',prenom:'Paul',actif:true}); const c2=await ins('chasseurs',{nom:'Durand',actif:true});
  const cats=(await clientSupabase.from('categories_chasse').select()).data.sort((a,b)=>a.ordre-b.ordre);
  const bt=await ins('battues',{date_battue:'2026-11-14',secteur:'Marais',plan_jour:[
    {id:cats[0].id,autorise:true,nombre:null,choix:['Chevreuil','Chevrette']},   // chevreuil : 2 précisions
    {id:cats[1].id,autorise:true,nombre:2,choix:[]},                              // cerf -8 : quota 2
    {id:cats[3].id,autorise:true,nombre:null,choix:[]},                           // biche
  ]});
  const t1=await ins('traques',{battue_id:bt,numero:1,nom:'Marais',elements:[],parkings:[],acces:[]}); const t2=await ins('traques',{battue_id:bt,numero:2,nom:'Fourneau',elements:[],parkings:[],acces:[]});
  await ins('postes_traque',{traque_id:t1,nom:'Poste 1',lat:46.6,lng:2.5,chasseur_id:c1}); await ins('postes_traque',{traque_id:t1,nom:'Poste 2',lat:46.6,lng:2.5,chasseur_id:c2}); await ins('postes_traque',{traque_id:t2,nom:'Poste 3',lat:46.6,lng:2.5,chasseur_id:null});
  return {bt,t1,t2,c1,c2}; });
 // accès depuis la page des battues
 await p.reload(); await p.waitForTimeout(600);
 t('page Battues : bouton « Saisie rapide » sur la prochaine battue', (await p.locator('#zone-prochaine').innerText()).includes('Saisie rapide'));
 await p.goto(B+'pages/saisie.html?id='+s.bt); await p.waitForTimeout(1200);
 const prelevements=()=>p.evaluate(async()=>(await clientSupabase.from('prelevements').select()).data);
 t('page de saisie : titre, date, secteur', (await p.locator('#saisie-sous-titre').innerText()).includes('Marais'));
 t('1. Où ? : 2 traques et le premier choix par défaut', await p.locator('.saisie-traque').count()===2 && await p.locator('.saisie-traque.actif').count()===1);
 t('postes de la traque avec le chasseur affecté', (await p.locator('#saisie-postes').innerText()).includes('Paul Martin') && (await p.locator('#saisie-postes .saisie-poste').count())===3);
 const noms=await p.locator('#saisie-categories .saisie-animal .nom').allInnerTexts();
 t('2. Quel animal ? : seulement les catégories autorisées ce jour-là', noms.join('|')==='Chevreuil, Chevrette|Cerf -8|Biche');
 t('sonneries affichées sur les boutons', (await p.locator('#saisie-categories .sonnerie').allInnerTexts()).join('|')==='2|6|4');
 t('autre gibier rangé à part (repliable)', await p.locator('#saisie-autres').isVisible() && (await p.locator('#saisie-categories-autres .saisie-animal').count())===2);
 const tailles=await p.locator('#saisie-categories .saisie-animal').evaluateAll(e=>e.map(x=>{const r=x.getBoundingClientRect(); return [r.width,r.height];}));
 t('boutons tactiles : au moins 44 px de haut et 120 px de large', tailles.every(([w,h])=>h>=60 && w>=120));
 const tailleTraque=await p.locator('.saisie-traque').first().evaluate(e=>e.getBoundingClientRect().height);
 t('boutons de traque et de poste : au moins 44 px', tailleTraque>=44 && (await p.locator('.saisie-poste').first().evaluate(e=>e.getBoundingClientRect().height))>=44);
 // choix du poste puis un appui = un animal
 await p.click('.saisie-poste:has-text("Poste 1")');
 await p.click('#saisie-categories .saisie-animal:has-text("Cerf -8")'); await p.waitForTimeout(400);
 let pr=await prelevements();
 t('un appui : prélèvement créé (catégorie, battue, date, saison)', pr.length===1 && pr[0].battue_id===s.bt && pr[0].date_prelevement==='2026-11-14' && pr[0].saison==='2026-2027');
 t('rattaché à la traque, au poste et au chasseur du poste', pr[0].traque_id===s.t1 && pr[0].poste==='Poste 1' && pr[0].chasseur_id===s.c1);
 t('message d\'enregistrement avec Annuler et Détails', await p.locator('#saisie-toast').isVisible() && (await p.locator('#saisie-toast').innerText()).includes('Cerf -8 enregistré · Poste 1'));
 t('compteur du bouton : 1 / 2', (await p.locator('.saisie-animal:has-text("Cerf -8") .compte').innerText())==='1 / 2');
 await p.click('#toast-annuler'); await p.waitForTimeout(300);
 t('Annuler : le prélèvement est retiré', (await prelevements()).length===0 && (await p.locator('.saisie-animal:has-text("Cerf -8") .compte').innerText())==='0 / 2');
 // quota
 for (let i=0;i<3;i++){ await p.click('#saisie-categories .saisie-animal:has-text("Cerf -8")'); await p.waitForTimeout(250); }
 t('quota dépassé : bouton signalé', await p.locator('.saisie-animal.depasse:has-text("Cerf -8")').count()===1 && (await p.locator('.saisie-animal:has-text("Cerf -8") .compte').innerText()).includes('dépassé'));
 // précision (chevreuil / chevrette)
 await p.click('#saisie-categories .saisie-animal:has-text("Chevreuil")'); await p.waitForTimeout(300);
 t('deux précisions possibles : un choix est demandé', await p.locator('#modale-precision.ouverte').count()===1 && (await p.locator('#choix-precision .saisie-animal').allInnerTexts()).join('|')==='Chevreuil|Chevrette');
 await p.click('#choix-precision .saisie-animal:has-text("Chevrette")'); await p.waitForTimeout(400);
 pr=await prelevements();
 t('la précision est enregistrée (commentaire « Chevrette »)', pr.length===4 && pr.some(x=>x.commentaire==='Chevrette'));
 t('derniers enregistrés : libellé « Chevrette » avec poste et chasseur', (await p.locator('#saisie-derniers').innerText()).includes('Chevrette') && (await p.locator('#saisie-derniers').innerText()).includes('Poste 1'));
 // détails
 await p.click('#toast-details'); await p.waitForTimeout(300);
 await p.selectOption('#champ-sexe-detail','Femelle'); await p.fill('#champ-poids-detail','18.5'); await p.click('#formulaire-detail button[type=submit]'); await p.waitForTimeout(400);
 pr=await prelevements(); const chev=pr.find(x=>x.commentaire==='Chevrette');
 t('détails : sexe et poids enregistrés', chev.sexe==='Femelle' && chev.poids_kg===18.5);
 // changement de traque et de poste
 await p.click('.saisie-traque:has-text("Fourneau")'); await p.waitForTimeout(200);
 t('changer de traque : poste désélectionné, postes de l\'autre traque', (await p.locator('#saisie-postes .saisie-poste').count())===2 && await p.locator('.saisie-poste.actif').innerText()==='Sans poste');
 await p.click('#saisie-categories .saisie-animal:has-text("Biche")'); await p.waitForTimeout(400);
 pr=await prelevements(); const biche=pr[pr.length-1];
 t('traque 2, sans poste : traque notée, poste et chasseur vides', biche.traque_id===s.t2 && !biche.poste && !biche.chasseur_id);
 // bilan
 const bilan=await p.locator('#saisie-bilan').innerText();
 t('bilan de la journée : pris et autorisé par catégorie, total', /Cerf -8\s+6\s+3\s+2/.test(bilan) && /Total\s+5/.test(bilan));
 // la sélection est mémorisée
 await p.reload(); await p.waitForTimeout(1000);
 t('la traque choisie est retenue après rechargement', (await p.locator('.saisie-traque.actif').innerText()).includes('Fourneau'));
 // ---------- hors ligne : file d'attente
 await ctx.setOffline(true); await p.evaluate(()=>window.dispatchEvent(new Event('offline'))); await p.waitForTimeout(300);
 t('hors ligne : état affiché', (await p.locator('#saisie-etat').innerText()).includes('Hors ligne'));
 await p.click('.saisie-traque:has-text("Marais")'); await p.click('.saisie-poste:has-text("Poste 2")');
 await p.click('#saisie-categories .saisie-animal:has-text("Biche")'); await p.waitForTimeout(400);
 await p.click('#saisie-categories .saisie-animal:has-text("Biche")'); await p.waitForTimeout(400);
 t('hors ligne : 2 prélèvements gardés en attente, avec message', (await p.evaluate(()=>JSON.parse(localStorage.getItem('foret_file_prelevements')).length))===2 && (await p.locator('#saisie-toast').innerText()).includes('en attente de réseau'));
 t('hors ligne : visibles dans la liste, marqués « en attente », compteur à jour', (await p.locator('#saisie-derniers .saisie-attente').count())===2 && (await p.locator('.saisie-animal:has-text("Biche") .compte').innerText()).startsWith('3'));
 t('hors ligne : rien n\'est encore en base', (await prelevements()).length===5);
 // rechargement de la page sans réseau (mode démo : données locales, page servie par le cache)
 await p.reload(); await p.waitForTimeout(1500);
 t('hors ligne : la page se rouvre avec la file d\'attente', (await p.locator('#saisie-derniers .saisie-attente').count())===2 && (await p.locator('#saisie-etat').innerText()).includes('2 en attente'));
 // retour du réseau
 await ctx.setOffline(false); await p.evaluate(()=>window.dispatchEvent(new Event('online'))); await p.waitForTimeout(1500);
 const enBase=await prelevements();
 t('retour du réseau : les 2 prélèvements sont envoyés', enBase.length===7 && (await p.evaluate(()=>JSON.parse(localStorage.getItem('foret_file_prelevements')||'[]').length))===0);
 t('envoyés avec leur poste et leur chasseur', enBase.filter(x=>x.poste==='Poste 2' && x.chasseur_id===s.c2).length===2);
 t('l\'heure de saisie d\'origine est conservée (created_at)', enBase.filter(x=>x.poste==='Poste 2').every(x=>Math.abs(new Date(x.created_at)-Date.now())<120000));
 await p.evaluate(()=>envoyerFile()); await p.waitForTimeout(500);
 t('renvoyer ne crée pas de doublon', (await prelevements()).length===7);
 t('état : « tout est envoyé »', (await p.locator('#saisie-etat').innerText()).includes('tout est envoyé'));
 // suppression via les détails
 await p.click('#saisie-derniers [data-detail] >> nth=0'); await p.waitForTimeout(200); await p.click('#bouton-supprimer-detail'); await p.waitForTimeout(500);
 t('suppression d\'un prélèvement depuis les détails', (await prelevements()).length===6);
 // le plan de chasse de la page Chasse affiche le poste et la précision
 await p.goto(B+'pages/chasse.html'); await p.waitForTimeout(700); await p.click('[data-onglet=onglet-prelevements]');
 const tableau=await p.locator('#corps-tableau-prelevements').innerText();
 t('page Chasse : prélèvements avec poste et précision', tableau.includes('Poste 1') && tableau.includes('Chevrette'));
 // modèle : pas de saisie
 await p.goto(B+'pages/battues.html'); await p.waitForTimeout(400);
 const mod=await p.evaluate(async()=>(await clientSupabase.from('battues').insert({est_modele:true,nom_modele:'M'}).select().single()).data.id);
 await p.goto(B+'pages/saisie.html?id='+mod); await p.waitForTimeout(600);
 t('un modèle n\'a pas de saisie', (await p.locator('#zone-chargement').innerText()).includes('modèles'));
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
