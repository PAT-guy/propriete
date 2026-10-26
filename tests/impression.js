const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[];
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1500,height:950}}); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept(d.type()==='prompt'?'Ma mise en page':undefined));
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(400);
 const s=await p.evaluate(async()=>{
  const ins=async(n,o)=>(await clientSupabase.from(n).insert(o).select().single()).data.id;
  const cs=[]; for (const [n,pr] of [['Martin','Paul'],['Durand','Jacques'],['Lefèvre','Marie'],['<b>Piège</b>','Luc']]) cs.push(await ins('chasseurs',{nom:n,prenom:pr,actif:true,numero_permis:'41-123',assurance_assureur:'Groupama',assurance_validite:n==='Durand'?'2020-01-01':'2099-06-30'}));
  const bt=await ins('battues',{date_battue:'2026-11-14',secteur:'Grands Marais',lieu_rdv:'Étang du Chêne',heure_rdv:'08:30',responsable_id:cs[0],regles_securite:'Gilet obligatoire\nArme déchargée',instructions:'Rester au poste',notes:'Repas à midi'});
  const mk=async(n,nom,extra)=>ins('traques',{battue_id:bt,numero:n,nom,...extra,elements:[{id:'m'+n,type:'mouvement',forme:'courbe',points:[[46.6,2.5],[46.605,2.505],[46.61,2.51]],fleche:true},{id:'s'+n,type:'sens',forme:'ligne',points:[[46.59,2.49],[46.62,2.52]],fleche:true}],parkings:[{nom:'P1',lat:46.59,lng:2.5}]});
  const t1=await mk(1,'Marais',{conducteur:'Paul Martin',chef_de_ligne:'Marie Lefèvre',vehicules:'Hilux blanche'}); const t2=await mk(2,'Fourneau',{});
  await ins('postes_traque',{traque_id:t1,nom:'Poste 1',lat:46.6,lng:2.5,chasseur_id:cs[0]}); await ins('postes_traque',{traque_id:t1,nom:'Poste 2',lat:46.61,lng:2.51,chasseur_id:cs[1]}); await ins('postes_traque',{traque_id:t2,nom:'Poste 3',lat:46.605,lng:2.505,chasseur_id:cs[3]});
  const mod=await ins('battues',{est_modele:true,nom_modele:'M'});
  return {bt,mod,t1}; });
 // ---------- cartons
 await p.goto(B+'pages/impression.html?id='+s.bt+'&doc=carton'); await p.waitForTimeout(1500);
 t('cartons : 2 feuilles A4 (recto, verso) et 4 cartons A5', await p.locator('.ib-feuille').count()===2 && await p.locator('.ib-carton').count()===4);
 const dim=await p.evaluate(()=>{const mm=(sel)=>{const e=document.querySelector(sel); return e.offsetWidth/3.7795+'x'+e.offsetHeight/3.7795;}; return {feuille:mm('.ib-feuille'),carton:mm('.ib-carton')};});
 t('dimensions réelles : feuille 210x297 mm, carton 210x148,5 mm', Math.abs(parseFloat(dim.feuille)-210)<0.6 && Math.abs(parseFloat(dim.feuille.split('x')[1])-297)<0.6 && Math.abs(parseFloat(dim.carton.split('x')[1])-148.5)<0.6);
 t('trait de coupe présent', await p.locator('.ib-trait-coupe').count()===2);
 const recto=await p.locator('.ib-feuille[data-face=recto] .ib-carton').first().innerText();
 t('recto : titre, date, rendez-vous, responsable', recto.includes('Battue') && /novembre 2026/.test(recto) && recto.includes('Étang du Chêne') && recto.includes('08:30') && recto.includes('Paul Martin'));
 t('recto : encart des numéros de poste, une ligne par traque', (await p.locator('.ib-feuille[data-face=recto] .ib-carton').first().locator('.ib-encart-traque').count())===2 && recto.includes('Postes n°'));
 t('recto : règles de sécurité', recto.includes('Gilet obligatoire'));
 t('verso : une carte par carton, avec légende', await p.locator('.ib-feuille[data-face=verso] .ib-carte-leaflet').count()===2 && (await p.locator('.ib-feuille[data-face=verso] .ib-legende').first().innerText()).includes('Sens de la battue'));
 t('verso : postes colorés par traque (marqueurs numérotés)', await p.locator('.ib-feuille[data-face=verso] .ib-carte-leaflet .icone-point-carte span').count()>=6);
 t('aucun débordement avec la mise en page standard', (await p.locator('#alerte-debordement').isVisible())===false);
 // ---------- personnalisation
 await p.locator('.ib-bloc-edit',{hasText:'Règles de sécurité'}).locator('input[data-actif]').uncheck(); await p.waitForTimeout(500);
 t('bloc désactivé : disparaît de l\'aperçu', !(await p.locator('.ib-feuille[data-face=recto]').first().innerText()).includes('Gilet obligatoire'));
 await p.locator('.ib-bloc-edit',{hasText:'Règles de sécurité'}).locator('input[data-actif]').check();
 await p.selectOption('#panneau [data-ajout-liste=recto]','texte_libre'); await p.click('#panneau [data-ajouter=recto]'); await p.waitForTimeout(300);
 const nouveau=p.locator('.ib-bloc-edit.ouvert').last();
 await nouveau.locator('[data-opt=texte]').fill('Battue du {date} à {rdv_heure}, secteur {secteur}'); await nouveau.locator('[data-opt=titre]').fill('Mot du responsable'); await p.waitForTimeout(500);
 const apercu=await p.locator('.ib-feuille[data-face=recto] .ib-carton').first().innerText();
 t('texte libre : variables remplacées, titre affiché', apercu.toLowerCase().includes('mot du responsable') && /Battue du samedi 14 novembre 2026 à 08:30, secteur Grands Marais/.test(apercu));
 await p.selectOption('#panneau [data-style=palette]','brique'); await p.waitForTimeout(400);
 t('palette : couleurs du document changées', (await p.evaluate(()=>getComputedStyle(document.querySelector('#racine')).getPropertyValue('--ib-primaire').trim()))==='#7b3a2e');
 await p.fill('#panneau [data-style=tailleBase]','11'); await p.waitForTimeout(400);
 t('taille du texte : appliquée', (await p.evaluate(()=>getComputedStyle(document.querySelector('#racine')).getPropertyValue('--ib-base').trim()))==='11pt');
 // réordonner : monter le dernier bloc du recto
 const avantOrdre=await p.locator('#panneau .ib-section').nth(2).locator('.ib-bloc-edit .nom').allInnerTexts();
 await p.locator('#panneau .ib-section').nth(2).locator('.ib-bloc-edit').last().locator('[data-monter]').click(); await p.waitForTimeout(300);
 const apresOrdre=await p.locator('#panneau .ib-section').nth(2).locator('.ib-bloc-edit .nom').allInnerTexts();
 t('réordonner : le bloc monte d\'un rang', apresOrdre[apresOrdre.length-2]===avantOrdre[avantOrdre.length-1] && apresOrdre[apresOrdre.length-1]===avantOrdre[avantOrdre.length-2]);
 // déplacer vers le verso
 await p.locator('#panneau .ib-section').nth(2).locator('.ib-bloc-edit',{hasText:'Mot'}).count();
 const nbVersoAvant=await p.locator('#panneau .ib-section').nth(3).locator('.ib-bloc-edit').count();
 await p.locator('#panneau .ib-section').nth(2).locator('.ib-bloc-edit').last().locator('[data-deplacer]').click(); await p.waitForTimeout(300);
 t('déplacer un bloc du recto vers le verso', (await p.locator('#panneau .ib-section').nth(3).locator('.ib-bloc-edit').count())===nbVersoAvant+1);
 // débordement
 await p.selectOption('#panneau [data-ajout-liste=verso]','incidents'); await p.click('#panneau [data-ajouter=verso]'); await p.waitForTimeout(300);
 await p.locator('.ib-bloc-edit.ouvert').last().locator('[data-opt=lignes]').fill('30'); await p.waitForTimeout(700);
 t('débordement signalé (alerte + cadre rouge)', await p.locator('#alerte-debordement').isVisible() && await p.locator('.ib-face-contenu.deborde').count()>=1);
 await p.locator('.ib-bloc-edit.ouvert').last().locator('[data-opt=lignes]').fill('2'); await p.waitForTimeout(700);
 t('débordement corrigé : alerte disparue', !(await p.locator('#alerte-debordement').isVisible()));
 // brouillon et mise en page enregistrée
 t('modifications signalées', (await p.locator('#panneau .ib-section h3').first().innerText()).includes('modifiée'));
 await p.reload(); await p.waitForTimeout(1500);
 t('brouillon conservé après rechargement', (await p.evaluate(()=>getComputedStyle(document.querySelector('#racine')).getPropertyValue('--ib-primaire').trim()))==='#7b3a2e');
 await p.click('#bouton-enregistrer-sous'); await p.waitForTimeout(600);
 const enBase=await p.evaluate(async()=>(await clientSupabase.from('modeles_impression').select()).data);
 t('mise en page enregistrée en base (type carton, palette brique)', enBase.length===1 && enBase[0].type==='carton' && enBase[0].nom==='Ma mise en page' && enBase[0].config.style.palette==='brique');
 t('sélecteur : la nouvelle mise en page est choisie, plus « modifiée »', (await p.locator('#select-modele option:checked').innerText())==='Ma mise en page' && !(await p.locator('#panneau .ib-section h3').first().innerText()).includes('modifiée'));
 await p.selectOption('#select-modele','defaut'); await p.waitForTimeout(600);
 t('retour à la mise en page standard', (await p.evaluate(()=>getComputedStyle(document.querySelector('#racine')).getPropertyValue('--ib-primaire').trim()))==='#2f4a33');
 await p.selectOption('#select-modele',enBase[0].id); await p.waitForTimeout(600);
 t('rouvrir ma mise en page : palette et bloc ajouté retrouvés', (await p.evaluate(()=>getComputedStyle(document.querySelector('#racine')).getPropertyValue('--ib-primaire').trim()))==='#7b3a2e' && (await p.locator('#racine').innerText()).toLowerCase().includes('mot du responsable'));
 // ---------- fiche de gestion
 await p.goto(B+'pages/impression.html?id='+s.bt+'&doc=fiche'); await p.waitForTimeout(1500);
 t('fiche : 2 pages A4', await p.locator('.ib-feuille').count()===2 && await p.locator('.ib-page').count()===2 && await p.locator('.ib-carton').count()===0);
 const f1=await p.locator('.ib-feuille[data-face=recto]').innerText();
 t('fiche : conducteur, chef de ligne et véhicules par traque', f1.includes('Paul Martin') && f1.includes('Marie Lefèvre') && f1.includes('Hilux blanche'));
 t('fiche : chasseur nommé à chaque poste, par traque', /Poste 1[\s\S]*Paul Martin/.test(f1) && f1.includes('Poste 2') && f1.includes('Jacques Durand') && f1.includes('Poste 3'));
 t('fiche : XSS, nom piégé affiché littéralement', f1.includes('<b>Piège</b>') && await p.locator('#racine b').count()===0);
 const f2=await p.locator('.ib-feuille[data-face=verso]').innerText();
 t('fiche verso : carte grande et cases de saisie', await p.locator('.ib-feuille[data-face=verso] .ib-carte-leaflet').count()===1 && f2.includes('PRÉLÈVEMENTS') && f2.includes('DÉROULEMENT'));
 const hauteurCarte=await p.locator('.ib-feuille[data-face=verso] .ib-carte-zone').evaluate((e)=>e.offsetHeight/3.7795);
 t('la carte de la fiche occupe la place restante (> 80 mm)', hauteurCarte>80);
 t('onglets : fiche active', (await p.locator('#lien-fiche').getAttribute('class')).includes('bouton-principal'));
 // bloc présence : assurance expirée en rouge
 await p.selectOption('#panneau [data-ajout-liste=recto]','presence'); await p.click('#panneau [data-ajouter=recto]'); await p.waitForTimeout(600);
 t('présence : assurance expirée signalée', await p.locator('#racine .ib-expiree').count()>=1);
 // ---------- impression réelle (PDF)
 await p.emulateMedia({media:'print'}); await p.waitForTimeout(300);
 t('en impression : panneau et légendes masqués', !(await p.locator('#panneau').isVisible()) && !(await p.locator('.ib-legende-feuille').first().isVisible()));
 const largeur=await p.locator('.ib-feuille').first().evaluate((e)=>e.getBoundingClientRect().width/3.7795);
 t('en impression : feuille à l\'échelle réelle (210 mm)', Math.abs(largeur-210)<0.6);
 const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});
 const nbPages=(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length;
 t('PDF : exactement 2 pages (recto, verso)', nbPages===2);
 await p.emulateMedia({media:'screen'});
 // ---------- équipe de traque saisie dans le plan
 await p.goto(B+'pages/plan-battue.html?id='+s.bt); await p.waitForTimeout(1000);
 await p.locator('#fiche-traque input[oninput*="conducteur"]').fill('Hugues Moreau'); await p.locator('#fiche-traque input[oninput*="chef_de_ligne"]').fill('Anne Petit'); await p.locator('#fiche-traque input[oninput*="vehicules"]').fill('Berlingo verte');
 await p.click('#bouton-enregistrer-plan'); await p.waitForTimeout(800);
 const eq=await p.evaluate(async()=>(await clientSupabase.from('traques').select()).data.find(x=>x.numero===1));
 t('équipe de la traque enregistrée depuis le plan', eq.conducteur==='Hugues Moreau' && eq.chef_de_ligne==='Anne Petit' && eq.vehicules==='Berlingo verte');
 // ---------- cas limites
 await p.goto(B+'pages/impression.html?id='+s.mod+'&doc=carton'); await p.waitForTimeout(600);
 t('un modèle de battue ne s\'imprime pas', (await p.locator('#zone-chargement').innerText()).includes('introuvable'));
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
