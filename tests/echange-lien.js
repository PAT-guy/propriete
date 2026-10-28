const { chromium } = require('playwright');
const fs = require('fs');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[]; const dossier=process.argv[3]+'/dl'; fs.mkdirSync(dossier,{recursive:true});
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch();
 const nouvelAppareil=async(mobile)=>{ const ctx=await b.newContext(mobile?{viewport:{width:390,height:844},hasTouch:true,isMobile:true,acceptDownloads:true,permissions:['clipboard-read','clipboard-write']}:{viewport:{width:1300,height:900},acceptDownloads:true});
   const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
   await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
   await ctx.route(/geopf\.fr/, r=>r.abort());
   await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(500); return {ctx,p}; };
 const pc=await nouvelAppareil(false);
 const s=await pc.p.evaluate(async()=>{
  const ins=async(n,o)=>(await clientSupabase.from(n).insert(o).select().single()).data.id;
  const c1=await ins('chasseurs',{nom:'Martin',prenom:'Paul',actif:true}); const c2=await ins('chasseurs',{nom:'Durand',actif:true});
  const cats=(await clientSupabase.from('categories_chasse').select()).data.sort((a,b)=>a.ordre-b.ordre);
  const bt=await ins('battues',{date_battue:'2026-11-14',secteur:'Marais',plan_jour:[{id:cats[1].id,autorise:true,nombre:2,choix:[]},{id:cats[3].id,autorise:true,nombre:null,choix:[]}]});
  const t1=await ins('traques',{battue_id:bt,numero:1,nom:'Marais',elements:[{id:'e1',type:'mouvement',forme:'ligne',points:[[46.6,2.5],[46.61,2.51]],fleche:true}],parkings:[],acces:[]});
  await ins('postes_traque',{traque_id:t1,nom:'Poste 1',lat:46.6,lng:2.5,chasseur_id:c1}); await ins('postes_traque',{traque_id:t1,nom:'Poste 2',lat:46.61,lng:2.51,chasseur_id:c2});
  return {bt,t1,c1,cat:cats.map(c=>c.id)}; });
 const donneesPC=await pc.p.evaluate(()=>localStorage.getItem('foret_demo_donnees_v1'));
 // ---------- le téléphone part d'une copie des données du PC
 const tel=await nouvelAppareil(true);
 await tel.p.evaluate((d)=>localStorage.setItem('foret_demo_donnees_v1',d),donneesPC);
 await tel.p.goto(B+'pages/saisie.html?id='+s.bt); await tel.p.waitForTimeout(1200);
 await tel.p.click('.saisie-poste:has-text("Poste 1")');
 await tel.p.click('#saisie-categories .saisie-animal:has-text("Cerf -8")'); await tel.p.waitForTimeout(300);
 await tel.p.click('#saisie-categories .saisie-animal:has-text("Cerf -8")'); await tel.p.waitForTimeout(300);
 await tel.p.click('.saisie-poste:has-text("Poste 2")');
 await tel.p.click('#saisie-categories .saisie-animal:has-text("Biche")'); await tel.p.waitForTimeout(300);
 // une saisie faite sans réseau (en attente) doit partir aussi
 await tel.ctx.setOffline(true); await tel.p.evaluate(()=>window.dispatchEvent(new Event('offline')));
 await tel.p.click('#saisie-categories .saisie-animal:has-text("Biche")'); await tel.p.waitForTimeout(300);
 t('téléphone : 4 prélèvements saisis (1 en attente)', (await tel.p.evaluate(()=>lignesDeLaBattue().length))===4 && (await tel.p.evaluate(()=>fileDeCetteBattue().length))===1);
 await tel.p.click('text=Créer le lien d\'échange'); await tel.p.waitForTimeout(600);
 const lien=await tel.p.inputValue('#champ-lien-echange');
 t('lien d\'échange créé : adresse de la page de réception + code après #c=', /\/pages\/echange\.html#c=1\.[A-Za-z0-9_-]+$/.test(lien));
 t('résumé : 4 prélèvements dont 1 pas encore envoyé à la base', (await tel.p.locator('#resume-echange').innerText()).includes('4') && (await tel.p.locator('#resume-echange').innerText()).includes('1 pas encore envoyé'));
 t('lien court (moins de 6000 caractères) sans le plan', lien.length<6000 && !(await tel.p.locator('#taille-echange').innerText()).includes('long'));
 await tel.p.click('#bouton-copier'); await tel.p.waitForTimeout(300);
 t('Copier le lien : le presse-papiers contient le lien', (await tel.p.evaluate(()=>navigator.clipboard.readText()))===lien);
 // plan inclus : lien plus long
 await tel.p.check('#case-plan-echange'); await tel.p.waitForTimeout(500);
 const lienPlan=await tel.p.inputValue('#champ-lien-echange');
 t('avec le plan : lien plus long, résumé des traques et postes', lienPlan.length>lien.length && (await tel.p.locator('#resume-echange').innerText()).includes('2 poste'));
 await tel.p.uncheck('#case-plan-echange');
 const [dl]=await Promise.all([tel.p.waitForEvent('download'),tel.p.click('#bouton-fichier')]);
 const chemin=dossier+'/'+dl.suggestedFilename(); await dl.saveAs(chemin);
 t('fichier d\'échange : JSON lisible, nom daté', /^foret-echange-2026-11-14\.json$/.test(dl.suggestedFilename()) && JSON.parse(fs.readFileSync(chemin,'utf8')).prelevements.length===4);
 // ---------- le PC ouvre le lien
 await pc.p.goto(lien); await pc.p.waitForTimeout(1200);
 t('PC : page « Recevoir une battue » avec aperçu', await pc.p.locator('#bloc-apercu').isVisible() && (await pc.p.locator('#titre-apercu').innerText()).includes('Marais'));
 const apercu=await pc.p.locator('#detail-apercu').innerText();
 t('aperçu : 4 nouveaux (2 Cerf -8, 2 Biche), 0 déjà présent', apercu.includes('4 nouveau') && apercu.includes('2 Cerf -8') && apercu.includes('2 Biche') && apercu.includes('0 déjà'));
 t('aperçu : la battue existe, plan non inclus, pas d\'option de remplacement', (await pc.p.locator('#options-cible').innerText()).includes('existe sur cet appareil') && await pc.p.locator('#option-plan').isHidden());
 t('rien n\'est écrit avant la confirmation', (await pc.p.evaluate(async()=>(await clientSupabase.from('prelevements').select()).data.length))===0);
 await pc.p.click('#bouton-importer'); await pc.p.waitForTimeout(800);
 const prPC=await pc.p.evaluate(async()=>(await clientSupabase.from('prelevements').select()).data);
 t('import : 4 prélèvements ajoutés à la bonne battue', prPC.length===4 && prPC.every(x=>x.battue_id===s.bt));
 const prTel=await tel.p.evaluate(()=>lignesDeLaBattue().map(x=>x.id).sort());
 t('mêmes identifiants que sur le téléphone (pas de doublon possible)', JSON.stringify(prPC.map(x=>x.id).sort())===JSON.stringify(prTel));
 t('traque, poste, chasseur et catégorie conservés', prPC.filter(x=>x.poste==='Poste 1' && x.traque_id===s.t1 && x.chasseur_id===s.c1 && x.categorie_id===s.cat[1]).length===2);
 t('heure de saisie d\'origine conservée', prPC.every(x=>Math.abs(new Date(x.created_at)-Date.now())<180000));
 t('message de fin et liens utiles', (await pc.p.locator('#resultat-echange').innerText()).includes('4 prélèvement(s) ajouté(s)') && await pc.p.locator('#resultat-echange a[href*="saisie.html"]').count()===1);
 t('l\'adresse est nettoyée (le code a disparu)', !(await pc.p.evaluate(()=>location.hash)));
 // ---------- réimporter : aucun doublon
 await pc.p.goto(lien); await pc.p.waitForTimeout(1000);
 t('réimport : 0 nouveau, 4 déjà présents', (await pc.p.locator('#detail-apercu').innerText()).includes('0 nouveau') && (await pc.p.locator('#detail-apercu').innerText()).includes('4 déjà'));
 await pc.p.click('#bouton-importer'); await pc.p.waitForTimeout(600);
 t('réimport : toujours 4 prélèvements', (await pc.p.evaluate(async()=>(await clientSupabase.from('prelevements').select()).data.length))===4);
 // ---------- plan modifié sur le téléphone
 await tel.ctx.setOffline(false);
 await tel.p.evaluate(async(t1)=>{ await clientSupabase.from('traques').update({nom:'Marais (modifié)',elements:[{id:'e1',type:'mouvement',forme:'ligne',points:[[46.6,2.5],[46.62,2.52]],fleche:true},{id:'e2',type:'zone',forme:'polygone',points:[[46.59,2.49],[46.59,2.53],[46.63,2.53]]}]}).eq('id',t1);
   const ps=(await clientSupabase.from('postes_traque').select()).data.filter(p=>p.nom==='Poste 2'); await clientSupabase.from('postes_traque').delete().eq('id',ps[0].id); },s.t1);
 await tel.p.reload(); await tel.p.waitForTimeout(1000);
 await tel.p.click('text=Créer le lien d\'échange'); await tel.p.check('#case-plan-echange'); await tel.p.waitForTimeout(500);
 const lienPlan2=await tel.p.inputValue('#champ-lien-echange');
 await pc.p.goto(lienPlan2); await pc.p.waitForTimeout(1200);
 t('plan : le PC propose de remplacer (différent), case cochée par défaut', await pc.p.locator('#case-plan').isChecked() && (await pc.p.locator('#option-plan').innerText()).includes('différent'));
 await pc.p.uncheck('#case-plan'); await pc.p.click('#bouton-importer'); await pc.p.waitForTimeout(700);
 t('case décochée : le plan du PC n\'est pas touché', (await pc.p.evaluate(async()=>(await clientSupabase.from('traques').select()).data[0].nom))==='Marais');
 await pc.p.goto(lienPlan2); await pc.p.waitForTimeout(1000);
 await pc.p.click('#bouton-importer'); await pc.p.waitForTimeout(900);
 const planPC=await pc.p.evaluate(async()=>({tr:(await clientSupabase.from('traques').select()).data,po:(await clientSupabase.from('postes_traque').select()).data,pr:(await clientSupabase.from('prelevements').select()).data}));
 t('plan remplacé : nouveau nom, 2 tracés, un seul poste', planPC.tr.length===1 && planPC.tr[0].nom==='Marais (modifié)' && planPC.tr[0].elements.length===2 && planPC.po.length===1);
 t('la traque garde son identifiant : les prélèvements y restent liés', planPC.tr[0].id===s.t1 && planPC.pr.filter(x=>x.traque_id===s.t1).length===4);
 // ---------- autre PC qui ne connaît pas la battue : elle est créée avec ses correspondances par nom
 const pc2=await nouvelAppareil(false);
 await pc2.p.evaluate(async()=>{ await clientSupabase.from('chasseurs').insert({nom:'Martin',prenom:'Paul',actif:true}); });
 await pc2.p.goto(lienPlan2); await pc2.p.waitForTimeout(1200);
 t('autre PC : « la battue n\'existe pas », elle sera créée', (await pc2.p.locator('#options-cible').innerText()).includes('n\'existe pas') && await pc2.p.locator('#option-plan').isHidden());
 await pc2.p.click('#bouton-importer'); await pc2.p.waitForTimeout(1000);
 const d2=await pc2.p.evaluate(async()=>({b:(await clientSupabase.from('battues').select()).data,tr:(await clientSupabase.from('traques').select()).data,po:(await clientSupabase.from('postes_traque').select()).data,pr:(await clientSupabase.from('prelevements').select()).data,ch:(await clientSupabase.from('chasseurs').select()).data,ca:(await clientSupabase.from('categories_chasse').select()).data}));
 t('battue, traque, postes et 4 prélèvements créés', d2.b.length===1 && d2.b[0].secteur==='Marais' && d2.tr.length===1 && d2.po.length===1 && d2.pr.length===4);
 t('chasseur existant retrouvé par son nom (pas de doublon Martin)', d2.ch.filter(c=>c.nom==='Martin').length===1);
 t('catégories créées par leur nom, sonnerie conservée', ['Cerf -8','Biche'].every(n=>d2.ca.some(c=>c.nom===n && c.sonnerie)) && d2.pr.every(x=>d2.ca.some(c=>c.id===x.categorie_id)));
 t('plan du jour de la battue recopié avec les nouvelles catégories', d2.b[0].plan_jour.length===2 && d2.b[0].plan_jour.every(l=>d2.ca.some(c=>c.id===l.id)));
 // ---------- PC avec la même battue sous un autre identifiant : fusion proposée
 const pc3=await nouvelAppareil(false);
 const idAutre=await pc3.p.evaluate(async()=>{ const b=(await clientSupabase.from('battues').insert({date_battue:'2026-11-14',secteur:'Marais'}).select().single()).data.id; await clientSupabase.from('traques').insert({battue_id:b,numero:1,nom:'Ma traque',elements:[],parkings:[],acces:[]}); return b; });
 await pc3.p.goto(lien); await pc3.p.waitForTimeout(1200);
 t('même date et même secteur sous un autre identifiant : fusion proposée (cochée par défaut)', (await pc3.p.locator('#options-cible').innerText()).includes('même date et même secteur') && await pc3.p.locator('input[name=cible][value=candidate]').isChecked());
 await pc3.p.click('#bouton-importer'); await pc3.p.waitForTimeout(900);
 const d3=await pc3.p.evaluate(async()=>({b:(await clientSupabase.from('battues').select()).data.length,tr:(await clientSupabase.from('traques').select()).data,pr:(await clientSupabase.from('prelevements').select()).data}));
 t('fusion : toujours une seule battue, prélèvements rattachés à la traque de même numéro', d3.b===1 && d3.pr.length===4 && d3.pr.every(x=>x.battue_id===idAutre && x.traque_id===d3.tr[0].id));
 // ---------- fichier
 const pc4=await nouvelAppareil(false);
 await pc4.p.goto(B+'pages/echange.html'); await pc4.p.waitForTimeout(600);
 await pc4.p.setInputFiles('#champ-fichier',chemin); await pc4.p.waitForTimeout(1200);
 t('import depuis un fichier : même aperçu', (await pc4.p.locator('#detail-apercu').innerText()).includes('4 nouveau'));
 await pc4.p.click('#bouton-annuler-import');
 // ---------- code collé, code invalide
 await pc4.p.fill('#champ-code','n importe quoi'); await pc4.p.click('#bouton-analyser'); await pc4.p.waitForTimeout(400);
 t('code invalide : message clair, rien d\'importé', (await pc4.p.locator('#message-echange').innerText()).includes('Impossible de lire') && !(await pc4.p.locator('#bloc-apercu').isVisible()));
 await pc4.p.fill('#champ-code','Voici le lien : '+lien+' merci'); await pc4.p.click('#bouton-analyser'); await pc4.p.waitForTimeout(800);
 t('lien collé au milieu d\'un message : retrouvé', await pc4.p.locator('#bloc-apercu').isVisible());
 // ---------- ouverture du lien avant connexion
 const pc5=await b.newContext({viewport:{width:1300,height:900}}); const q=await pc5.newPage(); q.on('pageerror',e=>errs.push(e.message));
 await pc5.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await q.goto(lien); await q.waitForURL('**/index.html'); await q.waitForTimeout(500);
 t('non connecté : renvoyé vers la connexion', q.url().includes('index.html'));
 await q.click('button[type=submit]'); await q.waitForURL('**/pages/echange.html'); await q.waitForTimeout(1200);
 t('après connexion : retour automatique sur l\'échange, aperçu affiché', await q.locator('#bloc-apercu').isVisible() && (await q.locator('#detail-apercu').innerText()).includes('4 nouveau'));
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
