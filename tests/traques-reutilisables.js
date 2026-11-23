const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[];
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1400,height:900}}); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(600);
 // ---------- guide de départ
 t('aucun modèle ni battue : guide de départ avec « Nouveau modèle »', (await p.locator('#guide-debut').innerText()).includes('Nouveau modèle') && (await p.locator('#guide-debut a[href="aide.html"]').count())===1);
 const s=await p.evaluate(async()=>{
  const ins=async(n,o)=>(await clientSupabase.from(n).insert(o).select().single()).data.id;
  const c1=await ins('chasseurs',{nom:'Martin',actif:true});
  const mA=await ins('battues',{est_modele:true,nom_modele:'Réserve'}); const mB=await ins('battues',{est_modele:true,nom_modele:'Centrale'});
  const pa=await ins('parcelles',{nom:'Réserve',contour:[[46,2],[46,2.1],[46.1,2.1]]});
  const tA=await ins('traques',{battue_id:mA,numero:1,nom:'Traque Réserve',parcelle_id:pa,conducteur:'Paul',elements:[{id:'e1',type:'mouvement',forme:'ligne',points:[[46,2],[46.01,2.01]],fleche:true}],parkings:[{nom:'P1',lat:46,lng:2}],acces:[{nom:'Portail',lat:46.02,lng:2.02}]});
  const tB=await ins('traques',{battue_id:mB,numero:1,nom:'Traque Centrale',elements:[{id:'e2',type:'zone',forme:'polygone',points:[[46,2],[46,2.1],[46.1,2.1]]}],parkings:[],acces:[]});
  // postes insérés dans le désordre (la base ne garantit aucun ordre)
  for (const n of [10,2,1,19,3,11]) await ins('postes_traque',{traque_id:tA,nom:'Poste '+n,lat:46+n/1000,lng:2,chasseur_id:c1});
  await ins('postes_traque',{traque_id:tB,nom:'Poste 1',lat:46.05,lng:2.05});
  return {mA,mB,tA,tB,c1}; });
 await p.reload(); await p.waitForTimeout(500);
 t('modèle prêt mais aucune battue : le guide invite à créer une battue', (await p.locator('#guide-debut').innerText()).includes('Ton modèle est prêt'));
 s.bj=await p.evaluate(async()=>(await clientSupabase.from('battues').insert({date_battue:'2026-12-05',secteur:'Mixte'}).select().single()).data.id);
 await p.reload(); await p.waitForTimeout(500);
 t('dès qu\'une battue existe, le guide disparaît', (await p.locator('#guide-debut').count())===0);
 // ---------- ordre des postes
 await p.goto(B+'pages/plan-battue.html?id='+s.mA); await p.waitForTimeout(1000);
 const noms=await p.evaluate(()=>traquesEtat[0].postes.map(x=>x.nom));
 t('postes triés par numéro (1, 2, 3, 10, 11, 19) malgré l\'ordre de la base', noms.join('|')==='Poste 1|Poste 2|Poste 3|Poste 10|Poste 11|Poste 19');
 t('marqueur « 4 » = Poste 10 : le numéro suit l\'ordre trié', await p.evaluate(()=>{const e=document.querySelectorAll('.leaflet-marker-icon.icone-point-carte span'); return [...e].some(x=>x.textContent==='4');}));
 t('étiquettes de la carte allégées : pas de « non affecté »', !(await p.evaluate(()=>[...document.querySelectorAll('.leaflet-tooltip')].map(x=>x.textContent).join('|'))).includes('non affecté'));
 // ---------- reprendre des traques
 await p.goto(B+'pages/plan-battue.html?id='+s.bj); await p.waitForTimeout(1000);
 t('battue sans traque : la traque vide créée par défaut', (await p.evaluate(()=>traquesEtat.length))===1 && (await p.locator('#bouton-traque-existante').isVisible()));
 await p.click('#bouton-traque-existante'); await p.waitForTimeout(500);
 const liste=await p.locator('#liste-traques-existantes').innerText();
 t('liste : les deux modèles et leurs traques, avec le nombre de postes', liste.includes('MODÈLE « RÉSERVE »') && liste.includes('MODÈLE « CENTRALE »') && liste.includes('Traque Réserve') && liste.includes('6 poste(s)') && liste.includes('1 parking(s)') && liste.includes('1 accès'));
 await p.fill('#recherche-traques','centrale'); await p.waitForTimeout(200);
 t('recherche : filtre par nom', (await p.locator('.case-traque-existante').count())===1);
 await p.fill('#recherche-traques',''); await p.waitForTimeout(200);
 t('« Ajouter » désactivé tant que rien n\'est coché', await p.isDisabled('#bouton-reprendre-traques'));
 await p.locator('.case-traque-existante').nth(0).check(); await p.locator('.case-traque-existante').nth(1).check();
 t('« Ajouter » activé après sélection', !(await p.isDisabled('#bouton-reprendre-traques')));
 await p.click('#bouton-reprendre-traques'); await p.waitForTimeout(600);
 const etat=await p.evaluate(()=>traquesEtat.map(x=>({n:x.numero,nom:x.nom,po:x.postes.length,el:x.elements.length,pk:x.parkings.length,ac:x.acces.length,ch:x.postes.filter(y=>y.chasseur_id).length,c:x.conducteur})));
 t('2 traques ajoutées (la traque vide par défaut est remplacée), numérotées 1 et 2', etat.length===2 && etat[0].n===1 && etat[1].n===2);
 const reserve=etat.find(x=>x.nom==='Traque Réserve');
 t('traque reprise : tracés, postes, parking, accès et conducteur recopiés', reserve && reserve.po===6 && reserve.el===1 && reserve.pk===1 && reserve.ac===1 && reserve.c==='Paul');
 t('aucun chasseur recopié sur les postes', etat.every(x=>x.ch===0));
 t('la dernière traque reprise est sélectionnée', (await p.locator('.pastille-traque.actif').innerText()).includes('Traque Centrale'));
 await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
 t('Ctrl+Z : la reprise s\'annule d\'un coup', (await p.evaluate(()=>traquesEtat.length))===1);
 await p.keyboard.press('Control+y'); await p.waitForTimeout(300);
 await p.click('#bouton-enregistrer-plan'); await p.waitForTimeout(900);
 const bd=await p.evaluate(async(bj)=>{const tr=(await clientSupabase.from('traques').select().eq('battue_id',bj)).data; const po=(await clientSupabase.from('postes_traque').select()).data; return {n:tr.length,noms:tr.map(x=>x.nom).sort(),po:po.filter(x=>tr.some(y=>y.id===x.traque_id)).length};},s.bj);
 t('enregistré : 2 traques et 7 postes dans la battue du jour', bd.n===2 && bd.po===7 && bd.noms.join('|')==='Traque Centrale|Traque Réserve');
 // l'original n'est pas touché ; la copie est indépendante
 await p.evaluate(()=>{ const t=traquesEtat.find(x=>x.nom==='Traque Réserve'); t.nom='Réserve modifiée'; t.postes.pop(); marquerModifie(); });
 await p.click('#bouton-enregistrer-plan'); await p.waitForTimeout(800);
 const orig=await p.evaluate(async(tA)=>({nom:(await clientSupabase.from('traques').select().eq('id',tA).single()).data.nom,po:(await clientSupabase.from('postes_traque').select()).data.filter(x=>x.traque_id===tA).length}),s.tA);
 t('modifier la copie ne touche pas la traque d\'origine', orig.nom==='Traque Réserve' && orig.po===6);
 // la battue en cours n'est pas proposée à elle-même
 await p.click('#bouton-traque-existante'); await p.waitForTimeout(500);
 const l2=await p.locator('#liste-traques-existantes').innerText();
 t('les traques de la battue en cours ne sont pas proposées', !l2.includes('Réserve modifiée') && l2.includes('MODÈLE « RÉSERVE »'));
 await p.click('#modale-traques-existantes >> text=Annuler');
 // ---------- aide
 await p.goto(B+'pages/aide.html'); await p.waitForTimeout(600);
 t('page Aide : accessible depuis le menu, avec les étapes et « Reprendre une traque déjà faite »', (await p.locator('nav.navigation a').allInnerTexts()).includes('Aide') && (await p.locator('.aide-etape').count())===7 && (await p.locator('main').innerText()).includes('Reprendre une traque déjà faite'));
 // ---------- page Chasse : suppression d'un prélèvement et conversion d'une ancienne attribution
 const g=await p.evaluate(async()=>{ const ins=async(n,o)=>(await clientSupabase.from(n).insert(o).select().single()).data.id;
   const esp=(await clientSupabase.from('especes_gibier').select()).data; const chev=esp.find(e=>e.nom==='Chevreuil'); const daim=esp.find(e=>e.nom==='Daim');
   await ins('plans_chasse',{saison:'2026-2027',espece_id:chev.id,attribution:10}); await ins('plans_chasse',{saison:'2026-2027',espece_id:daim.id,attribution:2});
   const cats=(await clientSupabase.from('categories_chasse').select()).data; const cc=cats.find(c=>c.nom==='Chevreuil');
   const pr=await ins('prelevements',{date_prelevement:'2026-12-05',saison:'2026-2027',categorie_id:cc.id,sexe:'Indéterminé'}); await ins('prelevements',{date_prelevement:'2026-12-05',saison:'2026-2027',categorie_id:cc.id,sexe:'Indéterminé'});
   return {pr}; });
 await p.goto(B+'pages/chasse.html'); await p.waitForTimeout(800); await p.click('[data-onglet=onglet-plan]');
 const lignes=await p.locator('#corps-tableau-plan tr').allInnerTexts();
 t('anciennes attributions repérées, réalisé à 0 malgré 2 prélèvements de la catégorie', lignes.every(l=>l.includes('ancienne saisie par espèce')) && lignes.some(l=>/Chevreuil[\s\S]*0 \/ 10/.test(l)));
 t('conversion proposée seulement si une catégorie de même nom existe (Chevreuil oui, Daim non)', (await p.locator('#corps-tableau-plan tr',{hasText:'Chevreuil'}).locator('text=Passer à').count())===1 && (await p.locator('#corps-tableau-plan tr',{hasText:'Daim'}).locator('text=Passer à').count())===0);
 await p.locator('#corps-tableau-plan tr',{hasText:'Chevreuil'}).locator('text=Passer à').click(); await p.waitForTimeout(500);
 const apres=await p.locator('#corps-tableau-plan tr',{hasText:'Chevreuil'}).innerText();
 t('après conversion : plus d\'avertissement, réalisé 2 / 10', !apres.includes('ancienne') && /2 \/ 10/.test(apres));
 await p.click('[data-onglet=onglet-prelevements]');
 const avant=await p.locator('#corps-tableau-prelevements tr').count();
 await p.locator('#corps-tableau-prelevements tr').first().locator('text=Supprimer').click(); await p.waitForTimeout(500);
 t('prélèvement supprimé depuis la page Chasse', (await p.locator('#corps-tableau-prelevements tr').count())===avant-1 && (await p.evaluate(async()=>(await clientSupabase.from('prelevements').select()).data.length))===1);
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
