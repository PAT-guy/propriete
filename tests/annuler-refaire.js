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
 const s=await p.evaluate(async()=>{
  const ins=async(n,o)=>(await clientSupabase.from(n).insert(o).select().single()).data.id;
  const bt=await ins('battues',{date_battue:'2026-11-14',secteur:'Nord'});
  const t1=await ins('traques',{battue_id:bt,numero:1,nom:'Traque A',elements:[],parkings:[],acces:[]});
  const t2=await ins('traques',{battue_id:bt,numero:2,nom:'Traque B',elements:[],parkings:[],acces:[]});
  await ins('postes_traque',{traque_id:t1,nom:'Poste 1',lat:46.6,lng:2.5});
  return {bt,t1,t2}; });
 await p.goto(B+'pages/plan-battue.html?id='+s.bt); await p.waitForTimeout(1000);
 const carte=p.locator('#carte-plan'); const clic=async(x,y)=>{await carte.click({position:{x,y}});await p.waitForTimeout(100);};
 const etat=()=>p.evaluate(()=>({tr:traquesEtat.length,el:traquesEtat[0].elements.length,po:traquesEtat[0].postes.length,pk:traquesEtat[0].parkings.length,nom:traquesEtat[0].nom,lat:traquesEtat[0].postes[0]&&traquesEtat[0].postes[0].lat}));
 const annulerDesactive=()=>p.isDisabled('#bouton-annuler-action'); const refaireDesactive=()=>p.isDisabled('#bouton-refaire-action');
 t('au départ : annuler et rétablir désactivés', await annulerDesactive() && await refaireDesactive());
 // 1. tracer une ligne puis annuler / rétablir au clavier
 await p.click('[data-outil=ligne]'); await clic(200,250); await clic(350,200); await clic(500,300);
 t('pendant un tracé : le bouton Annuler est actif', !(await annulerDesactive()));
 await p.keyboard.press('Control+z'); await p.waitForTimeout(100);
 t('pendant un tracé : Ctrl+Z retire le dernier point', (await p.evaluate(()=>pointsEnCours.length))===2);
 await clic(500,300); await p.click('#bouton-terminer-dessin'); await p.click('#formulaire-element button[type=submit]'); await p.waitForTimeout(200);
 t('tracé validé : 1 élément', (await etat()).el===1);
 await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
 t('Ctrl+Z : le tracé disparaît', (await etat()).el===0);
 t('après annulation : Rétablir actif', !(await refaireDesactive()));
 await p.keyboard.press('Control+y'); await p.waitForTimeout(200);
 t('Ctrl+Y : le tracé revient', (await etat()).el===1);
 await p.keyboard.press('Control+z'); await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(200);
 t('Ctrl+Maj+Z rétablit aussi', (await etat()).el===1);
 // 2. suppression d'un élément via la fenêtre
 await p.locator('.liste-elements .ligne-element', {hasText:'Mouvement'}).click(); await p.click('#bouton-supprimer-element'); await p.waitForTimeout(200);
 t('élément supprimé', (await etat()).el===0);
 await p.click('#bouton-annuler-action'); await p.waitForTimeout(200);
 t('bouton Annuler : l\'élément supprimé revient', (await etat()).el===1);
 // 3. déplacer un poste (glisser)
 const avant=(await etat()).lat;
 const marqueur=p.locator('.leaflet-marker-icon.icone-point-carte').first(); const bb=await marqueur.boundingBox();
 await p.mouse.move(bb.x+13,bb.y+13); await p.mouse.down(); await p.mouse.move(bb.x+90,bb.y+70,{steps:8}); await p.mouse.up(); await p.waitForTimeout(200);
 t('poste déplacé', (await etat()).lat!==avant);
 await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
 t('Ctrl+Z : le poste revient à sa place', Math.abs((await etat()).lat-avant)<1e-9);
 // 4. saisie dans un champ : regroupée en une action, et Ctrl+Z dans le champ ne déclenche pas l'annulation de l'application
 const champNom=p.locator('#fiche-traque input[oninput*="\'nom\'"]');
 await champNom.fill('Premier'); await champNom.pressSequentially(' puis suite',{delay:20}); await p.waitForTimeout(200);
 t('nom de traque modifié', (await etat()).nom==='Premier puis suite');
 const tailleAvant=await p.evaluate(()=>pileAnnuler.length);
 await champNom.press('Control+z'); await p.waitForTimeout(100);
 t('Ctrl+Z dans un champ : l\'historique de l\'application n\'est pas touché', (await p.evaluate(()=>pileAnnuler.length))===tailleAvant);
 await p.locator('h1').click(); await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
 t('Ctrl+Z hors champ : tout le nom revient d\'un coup (frappes regroupées)', (await etat()).nom==='Traque A');
 await p.keyboard.press('Control+y'); await p.waitForTimeout(200);
 // 5. suppression d'une traque : différée, donc annulable
 await p.click('.pastille-traque >> nth=1'); await p.click('text=Supprimer cette traque'); await p.waitForTimeout(300);
 t('traque supprimée dans l\'éditeur', (await etat()).tr===1);
 t('… mais toujours en base tant que le plan n\'est pas enregistré', (await p.evaluate(async()=>(await clientSupabase.from('traques').select()).data.length))===2);
 await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
 t('Ctrl+Z : la traque supprimée revient', (await etat()).tr===2);
 await p.click('#bouton-enregistrer-plan'); await p.waitForTimeout(800);
 t('enregistrement : les 2 traques sont en base (rien n\'a été supprimé)', (await p.evaluate(async()=>(await clientSupabase.from('traques').select()).data.length))===2);
 // 6. annuler après un enregistrement : pas de doublon
 await p.click('#bouton-ajouter-traque'); await p.waitForTimeout(200);
 await p.click('#bouton-enregistrer-plan'); await p.waitForTimeout(800);
 t('3 traques enregistrées', (await p.evaluate(async()=>(await clientSupabase.from('traques').select()).data.length))===3);
 await p.locator('h1').click(); await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
 t('Ctrl+Z après enregistrement : la 3e traque disparaît de l\'éditeur', (await etat()).tr===2);
 await p.keyboard.press('Control+y'); await p.waitForTimeout(200);
 await p.click('#bouton-enregistrer-plan'); await p.waitForTimeout(800);
 t('annuler puis rétablir puis enregistrer : toujours 3 traques en base (aucun doublon)', (await p.evaluate(async()=>(await clientSupabase.from('traques').select()).data.length))===3);
 // 7. rien pendant qu'une fenêtre est ouverte
 await p.click('[data-outil=point]'); await clic(300,350);
 const avantModale=await p.evaluate(()=>pileAnnuler.length);
 await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
 t('fenêtre de description ouverte : Ctrl+Z ne touche pas au plan', (await p.evaluate(()=>pileAnnuler.length))===avantModale && await p.locator('#modale-element.ouverte').count()===1);
 await p.click('#bouton-annuler-element'); await p.keyboard.press('Escape');
 // ---------- page d'impression
 await p.goto(B+'pages/impression.html?id='+s.bt+'&doc=carton'); await p.waitForTimeout(1500);
 const pal=()=>p.evaluate(()=>config.style.palette); const titre=()=>p.evaluate(()=>config.faces.recto.find(x=>x.bloc==='entete').options.titre);
 t('impression : annuler et rétablir désactivés au départ', await p.isDisabled('#bouton-annuler-action') && await p.isDisabled('#bouton-refaire-action'));
 await p.selectOption('#panneau [data-style=palette]','brique'); await p.waitForTimeout(300);
 t('palette changée, bouton Annuler actif', (await pal())==='brique' && !(await p.isDisabled('#bouton-annuler-action')));
 await p.locator('h1').click(); await p.keyboard.press('Control+z'); await p.waitForTimeout(500);
 t('Ctrl+Z : la palette revient', (await pal())==='sologne' && (await p.evaluate(()=>getComputedStyle(document.querySelector('#racine')).getPropertyValue('--ib-primaire').trim()))==='#2f4a33');
 await p.keyboard.press('Control+y'); await p.waitForTimeout(500);
 t('Ctrl+Y : la palette est de nouveau brique', (await pal())==='brique');
 // saisie du titre : regroupée
 await p.locator('#panneau .ib-bloc-edit').first().locator('.nom').click();
 const champTitre=p.locator('#panneau .ib-bloc-edit').first().locator('[data-opt=titre]');
 await champTitre.fill('Grande battue'); await champTitre.pressSequentially(' d\'automne',{delay:15}); await p.waitForTimeout(300);
 t('titre modifié', (await titre())==='Grande battue d\'automne');
 await p.locator('h1').click(); await p.keyboard.press('Control+z'); await p.waitForTimeout(500);
 t('Ctrl+Z : le titre revient d\'un coup à « Battue »', (await titre())==='Battue');
 // ajout et suppression de blocs
 const nb=()=>p.evaluate(()=>config.faces.verso.length);
 const nb0=await nb();
 await p.selectOption('#panneau [data-ajout-liste=verso]','incidents'); await p.click('#panneau [data-ajouter=verso]'); await p.waitForTimeout(300);
 t('bloc ajouté', (await nb())===nb0+1);
 await p.click('#bouton-annuler-action'); await p.waitForTimeout(400);
 t('bouton Annuler : le bloc ajouté disparaît', (await nb())===nb0);
 await p.click('#panneau .ib-section >> nth=2 >> [data-supprimer] >> nth=0'); await p.waitForTimeout(300);
 await p.locator('h1').click(); await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
 t('bloc retiré puis Ctrl+Z : il revient', await p.evaluate(()=>config.faces.recto.filter(b=>b.bloc==='entete').length)===1);
 // changement de mise en page enregistrée
 await p.click('#bouton-enregistrer-sous'); await p.waitForTimeout(500);
 const avantCharge=await p.evaluate(()=>config.style.palette);
 await p.selectOption('#select-modele','defaut'); await p.waitForTimeout(500);
 await p.locator('h1').click(); await p.keyboard.press('Control+z'); await p.waitForTimeout(500);
 t('retour à la mise en page standard puis Ctrl+Z : ma mise en page revient', (await pal())===avantCharge);
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
