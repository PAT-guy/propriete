const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','leaflet-draw@1.0.4/dist/leaflet.draw.js':L+'/leaflet-draw/dist/leaflet.draw.js','leaflet-draw@1.0.4/dist/leaflet.draw.css':L+'/leaflet-draw/dist/leaflet.draw.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[];
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept(d.type()==='prompt'?(d.message().includes('modèle')?'Modèle depuis battue':d.defaultValue()):undefined));
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html');
 t('la connexion mène à la page Battues', true);
 t('navigation : Battues en premier, Sauvegarde en dernier, plus de Finances', (await p.locator('nav.navigation a').allInnerTexts()).join('|')==='Battues|Parcelles|Chasse|Travaux|Sauvegarde');
 await p.waitForTimeout(500);
 const ids=await p.evaluate(async()=>{ const ch=[]; for (const n of ['Martin','Durand']) ch.push((await clientSupabase.from('chasseurs').insert({nom:n,actif:true}).select().single()).data.id); return ch; });
 await p.reload(); await p.waitForTimeout(500);
 t('accueil vide : message sans battue prévue', (await p.locator('#zone-prochaine').innerText()).includes('Aucune battue prévue'));
 // création d'un modèle via le formulaire
 await p.click('text=Nouveau modèle'); await p.fill('#champ-nom-modele','Grands Marais'); await p.fill('#champ-secteur-battue','Nord'); await p.fill('#champ-lieu-rdv-battue','Parking mairie');
 await p.click('#formulaire-battue button[type=submit]'); await p.waitForTimeout(600);
 t('modèle créé et listé', (await p.locator('#corps-tableau-modeles').innerText()).includes('Grands Marais'));
 const idModele=await p.evaluate(async()=>(await clientSupabase.from('battues').select().eq('est_modele',true).single()).data.id);
 // on y ajoute traque + 2 postes (affectés à un chasseur) + parking, directement en base
 await p.evaluate(async([m,c])=>{ const tr=(await clientSupabase.from('traques').insert({battue_id:m,numero:1,nom:'Traque A',elements:[{id:'z',type:'zone',forme:'polygone',points:[[46.6,2.5],[46.61,2.5],[46.61,2.51]]},{id:'c',type:'sens',forme:'courbe',points:[[46.6,2.5],[46.605,2.505],[46.61,2.51]],fleche:true}],parkings:[{nom:'P1',lat:46.6,lng:2.5}]}).select().single()).data;
   await clientSupabase.from('postes_traque').insert([{traque_id:tr.id,nom:'Poste 1',lat:46.6,lng:2.5,chasseur_id:c},{traque_id:tr.id,nom:'Poste 2',lat:46.61,lng:2.51,chasseur_id:c}]); },[idModele,ids[0]]);
 await p.reload(); await p.waitForTimeout(500);
 const ligneModele=await p.locator('#corps-tableau-modeles tr').first().innerText();
 t('modèle : 1 traque, 2 postes', /Grands Marais\s+Nord\s+1\s+2/.test(ligneModele));
 // plan du modèle
 await p.goto(B+'pages/plan-battue.html?id='+idModele); await p.waitForTimeout(900);
 t('plan du modèle : titre dédié, sans fiche à imprimer', (await p.locator('#titre-page').innerText()).includes('Modèle de battue : Grands Marais') && await p.locator('.lien-impression').count()===0);
 await p.goto(B+'pages/battues.html'); await p.waitForTimeout(500);
 // battue depuis le modèle (date future)
 await p.click('#corps-tableau-modeles >> text=Créer une battue'); await p.fill('#champ-date-nouvelle','2099-11-15'); await p.click('#bouton-creer-nouvelle'); await p.waitForTimeout(1200);
 t('la fiche de la nouvelle battue s\'ouvre', await p.locator('#modale-battue.ouverte').count()===1 && await p.inputValue('#champ-date-battue')==='2099-11-15');
 t('infos du modèle reprises (secteur, RDV)', await p.inputValue('#champ-secteur-battue')==='Nord' && await p.inputValue('#champ-lieu-rdv-battue')==='Parking mairie');
 await p.check(`.case-participant[value="${ids[0]}"]`); await p.check(`.case-participant[value="${ids[1]}"]`);
 await p.selectOption('#champ-responsable-battue',ids[0]);
 await p.click('#formulaire-battue button[type=submit]'); await p.waitForTimeout(700);
 const bd=await p.evaluate(async()=>{ const bs=(await clientSupabase.from('battues').select()).data.filter(b=>!b.est_modele); const b=bs[0]; const tr=(await clientSupabase.from('traques').select().eq('battue_id',b.id)).data; const po=tr.length?(await clientSupabase.from('postes_traque').select().eq('traque_id',tr[0].id)).data:[]; return {n:bs.length,tr:tr.length,el:(tr[0]||{}).elements,pk:(tr[0]||{}).parkings,po:po.length,chasseurs:po.map(x=>x.chasseur_id),pa:(await clientSupabase.from('participants_battue').select().eq('battue_id',b.id)).data.length}; });
 t('copie : 1 traque avec ses 2 tracés (zone, sens) et son parking', bd.n===1 && bd.tr===1 && bd.el.length===2 && bd.el[1].type==='sens' && bd.pk.length===1);
 t('copie : 2 postes sans chasseur affecté', bd.po===2 && bd.chasseurs.every(x=>x===null));
 t('participants du jour enregistrés', bd.pa===2);
 const modeleInchange=await p.evaluate(async m=>(await clientSupabase.from('postes_traque').select()).data.filter(x=>x.chasseur_id).length,idModele);
 t('le modèle garde ses propres postes', modeleInchange===2);
 const carte=await p.locator('#zone-prochaine').innerText();
 t('carte « prochaine battue » : date, secteur, participants', /novembre 2099/.test(carte) && carte.includes('Nord') && carte.includes('2 participant') && carte.includes('Martin') && carte.includes('Parking mairie'));
 t('battue listée dans « à venir »', (await p.locator('#corps-tableau-a-venir').innerText()).includes('15/11/2099'));
 // enregistrer comme modèle
 await p.click('#corps-tableau-a-venir >> text=Enregistrer comme modèle'); await p.waitForTimeout(1200);
 t('battue enregistrée comme modèle (sans date ni responsable)', await p.evaluate(async()=>{const m=(await clientSupabase.from('battues').select()).data.filter(b=>b.est_modele); const nouveau=m.find(x=>x.nom_modele==='Modèle depuis battue'); return m.length===2 && nouveau && nouveau.date_battue===null && nouveau.responsable_id===null;}));
 // battue passée
 await p.evaluate(async()=>{ await clientSupabase.from('battues').insert({date_battue:'2020-03-01',secteur:'Ancien'}); });
 await p.reload(); await p.waitForTimeout(500);
 t('battue passée dans « passées »', (await p.locator('#corps-tableau-passees').innerText()).includes('01/03/2020'));
 // les modèles n'apparaissent pas dans les prélèvements
 await p.goto(B+'pages/chasse.html'); await p.waitForTimeout(700);
 await p.evaluate(()=>ouvrirCreationPrelevement());
 const opts=await p.locator('#champ-battue-prelevement option').allInnerTexts();
 t('prélèvements : battues datées seulement (pas de modèle)', opts.length===3 && !opts.some(o=>/undefined|Invalid/.test(o)));
 t('page Chasse sans onglet Battues', (await p.locator('.onglets button').allInnerTexts()).join('|')==='Chasseurs|Plan de chasse|Prélèvements');
 // suppression d'un modèle
 await p.goto(B+'pages/battues.html'); await p.waitForTimeout(500);
 await p.locator('#corps-tableau-modeles tr',{hasText:'Modèle depuis battue'}).locator('text=Supprimer').click(); await p.waitForTimeout(800);
 t('suppression d\'un modèle', await p.evaluate(async()=>(await clientSupabase.from('battues').select()).data.filter(b=>b.est_modele).length===1 && (await clientSupabase.from('traques').select()).data.length===2));
 t('redirection de l\'ancienne adresse', await (async()=>{await p.goto(B+'tableau-de-bord.html'); await p.waitForURL('**/pages/battues.html',{timeout:5000}).catch(()=>{}); return p.url().endsWith('/pages/battues.html');})());
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
