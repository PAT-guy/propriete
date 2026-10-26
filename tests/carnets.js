const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[];
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1100,height:900}}); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(400);
 const s=await p.evaluate(async()=>{
  const ins=async(n,o)=>(await clientSupabase.from(n).insert(o).select().single()).data.id;
  const a=await ins('chasseurs',{nom:'<b>Martin</b>',prenom:'Paul',actif:true,numero_permis:'123',assurance_assureur:'Groupama',assurance_numero_contrat:'C-9',assurance_validite:'2099-12-31'});
  const e=await ins('chasseurs',{nom:'Durand',actif:true,assurance_assureur:'AXA',assurance_validite:'2020-01-01'});
  const n=await ins('chasseurs',{nom:'Sans',actif:true});
  const x=await ins('chasseurs',{nom:'Invite',actif:true});
  const esp=(await clientSupabase.from('especes_gibier').select()).data[0].id;
  await clientSupabase.from('plans_chasse').insert({saison:'2098-2099',espece_id:esp,attribution:5});
  const bt=await ins('battues',{date_battue:'2099-11-15',secteur:'Nord',lieu_rdv:'Mairie',heure_rdv:'08:30',responsable_id:a,regles_securite:'Gilet obligatoire',instructions:'Rester au poste'});
  for (const c of [a,e,n]) await clientSupabase.from('participants_battue').insert({battue_id:bt,chasseur_id:c});
  const mk=async(num,nom)=>ins('traques',{battue_id:bt,numero:num,nom,elements:[{id:'1',type:'mouvement',forme:'courbe',points:[[46.6,2.5],[46.605,2.505],[46.61,2.51]],fleche:true},{id:'2',type:'zone',forme:'polygone',points:[[46.59,2.49],[46.59,2.52],[46.62,2.52]]}],parkings:[{nom:'P1',lat:46.59,lng:2.5}],acces:[]});
  const t1=await mk(1,'Traque A'); const t2=await mk(2,'Traque B');
  await clientSupabase.from('postes_traque').insert([{traque_id:t1,nom:'Poste 1',lat:46.601,lng:2.501,chasseur_id:a},{traque_id:t1,nom:'Poste 2',lat:46.605,lng:2.506,chasseur_id:x},{traque_id:t2,nom:'Poste 3',lat:46.61,lng:2.51,chasseur_id:e}]);
  return {bt};});
 // --- carnet de battue
 await p.goto(B+'carnet-impression.html?id='+s.bt+'&type=battue'); await p.waitForTimeout(1500);
 const pages=await p.locator('.page-carnet').count();
 t('carnet de battue : 1 plan + 1 émargement + 2 traques + 1 bilan = 5 pages', pages===5);
 const txt=await p.locator('#zone-carnet').innerText();
 t('infos de la battue (date, secteur, RDV, responsable)', /novembre 2099/.test(txt) && txt.includes('Nord') && txt.includes('Mairie à 08:30') && txt.includes('Paul'));
 t('consignes de sécurité reprises', txt.includes('Gilet obligatoire') && txt.includes('Rester au poste'));
 const emarge=await p.locator('.page-carnet').nth(1).innerText();
 t('émargement : participants ET chasseurs aux postes (4 noms)', ['Martin','Durand','Sans','Invite'].every(n=>emarge.includes(n)));
 t('émargement : permis et assurance affichés', emarge.includes('123') && emarge.includes('Groupama') && emarge.includes('contrat C-9'));
 t('assurance expirée signalée à la date de la battue', (await p.locator('.page-carnet').nth(1).locator('.expiree').allInnerTexts()).some(x=>/EXPIRÉE/.test(x)));
 t('assurance non renseignée signalée', (await p.locator('.page-carnet').nth(1).locator('.expiree').allInnerTexts()).some(x=>/Non renseignée/.test(x)));
 t('XSS : nom saisi affiché littéralement, pas interprété', emarge.includes('<b>Martin</b>') && await p.locator('#zone-carnet b').count()===0);
 const traque1=await p.locator('.page-carnet').nth(2).innerText();
 t('page traque : postes et chasseurs', traque1.includes('Traque A') && traque1.includes('Poste 1') && traque1.includes('Poste 2') && traque1.includes('Invite'));
 t('page bilan : attribution de la saison', (await p.locator('.page-carnet').nth(4).innerText()).includes('Bilan') );
 t('une carte par page concernée (plan + 2 traques)', await p.locator('.carte-carnet').count()===3);
 t('les cartes sont initialisées avec leurs tracés', await p.locator('.carte-carnet .leaflet-interactive').count()>=3 || await p.locator('.carte-carnet svg path').count()>=3);
 // --- carnets individuels
 await p.goto(B+'carnet-impression.html?id='+s.bt+'&type=chasseurs'); await p.waitForTimeout(1500);
 t('carnets individuels : une page par personne (4)', await p.locator('.page-carnet').count()===4);
 const martin=await p.locator('.page-carnet',{hasText:'Carnet de chasse : Paul'}).first().innerText();
 t('carnet de Paul : son poste et sa traque', martin.includes('Traque A · poste n° 1 : Poste 1'));
 t('carnet : assurance, consignes, tableau de tirs', martin.includes('Groupama') && martin.includes('Gilet obligatoire') && martin.includes('Mes tirs'));
 const sans=await p.locator('.page-carnet',{hasText:'Sans'}).first().innerText();
 t('chasseur sans poste : mention claire', sans.includes('Poste non attribué'));
 t('repère rouge autour du poste du chasseur', await p.locator('.page-carnet',{hasText:'Carnet de chasse : Paul'}).first().locator('path[stroke="#b00020"]').count()>=1);
 await p.screenshot({path:process.argv[3]+'/carnet.png',fullPage:false});
 // --- fiche de battue
 await p.goto(B+'battue-impression.html?id='+s.bt); await p.waitForTimeout(1500);
 t('fiche : carte avec tracés et légende', await p.locator('#carte-impression path').count()>=2 && (await p.locator('#legende-impression').innerText()).includes('Traque A'));
 // --- modèle : pas de carnet
 const mod=await p.evaluate(async()=>(await clientSupabase.from('battues').insert({est_modele:true,nom_modele:'M'}).select().single()).data.id);
 await p.goto(B+'carnet-impression.html?id='+mod+'&type=battue'); await p.waitForTimeout(600);
 t('un modèle n\'a pas de carnet', (await p.locator('#zone-chargement').innerText()).includes('introuvable'));
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
