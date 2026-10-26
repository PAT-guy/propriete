const { chromium } = require('playwright');
const fs = require('fs');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[]; const dossier=process.argv[3]+'/dl'; fs.mkdirSync(dossier,{recursive:true});
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1400,height:900},acceptDownloads:true}); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(500);
 t('rappel de sauvegarde affiché (aucune sauvegarde faite)', (await p.locator('#zone-prochaine').locator('xpath=preceding-sibling::div[1]').innerText()).includes('Télécharger une sauvegarde'));
 const s=await p.evaluate(async()=>{
  const ins=async(n,o)=>(await clientSupabase.from(n).insert(o).select().single()).data.id;
  const c=await ins('chasseurs',{nom:'Martin',actif:true,assurance_assureur:'AXA'});
  const pa=await ins('parcelles',{nom:'P1',contour:[[46,2],[46,2.1],[46.1,2.1]]});
  const bt=await ins('battues',{date_battue:'2099-11-15',secteur:'Nord',parcelle_id:pa});
  await ins('battues',{est_modele:true,nom_modele:'Mod'});
  const tr=await ins('traques',{battue_id:bt,numero:1,nom:'T1',elements:[{id:'a',type:'mouvement',forme:'ligne',points:[[46,2],[46.01,2.01]],fleche:true}],parkings:[{nom:'P',lat:46,lng:2}]});
  await ins('postes_traque',{traque_id:tr,nom:'Poste 1',lat:46,lng:2,chasseur_id:c});
  const esp=(await clientSupabase.from('especes_gibier').select()).data[0].id;
  await ins('prelevements',{date_prelevement:'2099-11-15',saison:'2098-2099',espece_id:esp,battue_id:bt,traque_id:tr});
  return {bt,tr,c}; });
 // --- sauvegarde
 await p.goto(B+'pages/sauvegarde.html'); await p.waitForTimeout(800);
 t('contenu actuel listé', (await p.locator('#corps-contenu').innerText()).includes('Chasseurs') && (await p.locator('#corps-contenu').innerText()).includes('Traques'));
 const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#bouton-sauvegarder')]);
 const chemin=dossier+'/'+dl.suggestedFilename(); await dl.saveAs(chemin);
 const fichier=JSON.parse(fs.readFileSync(chemin,'utf8'));
 t('nom du fichier daté', /^foret-sauvegarde-\d{4}-\d{2}-\d{2}_\d{2}h\d{2}\.json$/.test(dl.suggestedFilename()));
 t('fichier : marqueur, version, tables', fichier.application==='foret-chasse-sauvegarde' && fichier.version===1 && fichier.tables.chasseurs.length===1 && fichier.tables.battues.length===2 && fichier.tables.postes_traque.length===1 && fichier.tables.prelevements.length===1);
 t('fichier : tracés conservés', fichier.tables.traques[0].elements[0].type==='mouvement');
 await p.waitForTimeout(300);
 t('date de dernière sauvegarde affichée', (await p.locator('#texte-derniere-sauvegarde').innerText()).startsWith('Dernière sauvegarde'));
 await p.goto(B+'pages/battues.html'); await p.waitForTimeout(500);
 t('rappel disparu après une sauvegarde', !(await p.locator('body').innerText()).includes('Aucune sauvegarde téléchargée'));
 // --- fichier invalide
 await p.goto(B+'pages/sauvegarde.html'); await p.waitForTimeout(500);
 fs.writeFileSync(dossier+'/mauvais.json','{"truc":1}');
 await p.setInputFiles('#champ-fichier',dossier+'/mauvais.json'); await p.waitForTimeout(300);
 t('fichier invalide refusé avec un message', (await p.locator('#message-restauration').innerText()).includes('pas une sauvegarde') && await p.isDisabled('#bouton-restaurer'));
 // --- perte puis restauration en mode ajout
 await p.evaluate(async()=>{ for (const t of ['prelevements','postes_traque','versions_plan','traques','participants_battue','battues','parcelles','chasseurs']) await clientSupabase.from(t).delete().neq('id','0'); });
 await p.reload(); await p.waitForTimeout(500);
 t('données supprimées (simulation de perte)', !(await p.locator('#corps-contenu').innerText()).includes('Traques'));
 await p.setInputFiles('#champ-fichier',chemin); await p.waitForTimeout(400);
 t('résumé du fichier affiché', (await p.locator('#resume-fichier').innerText()).includes('éléments'));
 await p.click('#bouton-restaurer'); await p.waitForTimeout(1200);
 const apres=await p.evaluate(async()=>({tr:(await clientSupabase.from('traques').select()).data,ch:(await clientSupabase.from('chasseurs').select()).data.length,bt:(await clientSupabase.from('battues').select()).data.length,po:(await clientSupabase.from('postes_traque').select()).data.length,pr:(await clientSupabase.from('prelevements').select()).data}));
 t('restauration (ajout) : tout est revenu', apres.ch===1 && apres.bt===2 && apres.po===1 && apres.tr.length===1 && apres.pr.length===1);
 t('identifiants conservés (liens entre tables intacts)', apres.tr[0].id===s.tr && apres.pr[0].traque_id===s.tr);
 // mode ajout répété : pas de doublons
 await p.setInputFiles('#champ-fichier',chemin); await p.waitForTimeout(300); await p.click('#bouton-restaurer'); await p.waitForTimeout(1000);
 t('ajout répété : aucun doublon', (await p.evaluate(async()=>(await clientSupabase.from('chasseurs').select()).data.length))===1);
 // --- mode remplacer
 await p.evaluate(async()=>{ await clientSupabase.from('chasseurs').insert({nom:'En trop',actif:true}); });
 await p.setInputFiles('#champ-fichier',chemin); await p.waitForTimeout(300);
 await p.check('input[value=remplacer]');
 const [dl2]=await Promise.all([p.waitForEvent('download'),p.click('#bouton-restaurer')]); await p.waitForTimeout(1500);
 t('remplacer : copie de sécurité téléchargée d\'abord', dl2.suggestedFilename().startsWith('foret-avant-restauration'));
 const securite=JSON.parse(fs.readFileSync(await (async()=>{const c=dossier+'/'+dl2.suggestedFilename(); await dl2.saveAs(c); return c;})(),'utf8'));
 t('la copie de sécurité contient l\'état d\'avant (avec « En trop »)', securite.tables.chasseurs.length===2);
 t('remplacer : état identique au fichier (« En trop » effacé)', (await p.evaluate(async()=>(await clientSupabase.from('chasseurs').select()).data.map(c=>c.nom)))+''==='Martin');
 // --- versions du plan
 await p.goto(B+'pages/plan-battue.html?id='+s.bt); await p.waitForTimeout(1000);
 await p.click('#bouton-versions'); await p.fill('#champ-nom-version','Départ'); await p.click('#bouton-creer-version'); await p.waitForTimeout(400);
 t('version enregistrée et listée', (await p.locator('#corps-versions').innerText()).includes('Départ') && (await p.locator('#corps-versions').innerText()).includes('1 traque'));
 await p.click('#modale-versions .actions-modale button');
 // on modifie : un point (parking) + une 2e traque, puis on enregistre
 const carte=p.locator('#carte-plan');
 await p.click('[data-outil=point]'); await carte.click({position:{x:400,y:300}}); await p.click('#choix-type label:has(input[value=parking])'); await p.fill('#champ-nom-element','Nouveau parking'); await p.click('#formulaire-element button[type=submit]'); await p.keyboard.press('Escape');
 await p.click('#bouton-ajouter-traque'); await p.click('#bouton-enregistrer-plan'); await p.waitForTimeout(900);
 const modif=await p.evaluate(async()=>(await clientSupabase.from('traques').select()).data);
 t('plan modifié enregistré (2 traques, 2 parkings sur la 1re)', modif.length===2 && modif.find(x=>x.numero===1).parkings.length===2);
 // on rouvre la version « Départ »
 await p.click('#bouton-versions'); await p.waitForTimeout(300);
 await p.locator('#corps-versions tr',{hasText:'Départ'}).locator('text=Rouvrir').click(); await p.waitForTimeout(800);
 t('version rouverte dans l\'éditeur (1 traque, 1 parking) sans rien écrire en base', await p.evaluate(()=>traquesEtat.length===1 && traquesEtat[0].parkings.length===1) && (await p.evaluate(async()=>(await clientSupabase.from('traques').select()).data.length))===2);
 await p.click('#bouton-enregistrer-plan'); await p.waitForTimeout(900);
 const final=await p.evaluate(async()=>({tr:(await clientSupabase.from('traques').select()).data,pr:(await clientSupabase.from('prelevements').select()).data,po:(await clientSupabase.from('postes_traque').select()).data}));
 t('enregistrement : la traque en trop est supprimée, l\'autre garde son identifiant', final.tr.length===1 && final.tr[0].id===s.tr && final.tr[0].parkings.length===1);
 t('les prélèvements de la traque conservée sont intacts', final.pr.length===1 && final.pr[0].traque_id===s.tr);
 t('le poste (et son chasseur) est restauré', final.po.length===1 && final.po[0].chasseur_id===s.c);
 await p.click('#bouton-versions'); await p.waitForTimeout(300);
 t('version de secours « Avant réouverture » créée automatiquement', (await p.locator('#corps-versions').innerText()).includes('Avant réouverture de « Départ »'));
 await p.locator('#corps-versions tr',{hasText:'Avant réouverture'}).locator('text=Supprimer').click(); await p.waitForTimeout(400);
 t('suppression d\'une version', !(await p.locator('#corps-versions').innerText()).includes('Avant réouverture'));
 // suppression de la battue : versions supprimées aussi
 await p.goto(B+'pages/battues.html'); await p.waitForTimeout(500);
 await p.locator('#corps-tableau-a-venir tr').first().locator('text=Supprimer').click(); await p.waitForTimeout(800);
 t('suppression de la battue : ses versions disparaissent', (await p.evaluate(async()=>(await clientSupabase.from('versions_plan').select()).data.length))===0);
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
