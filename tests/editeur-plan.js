const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','leaflet-draw@1.0.4/dist/leaflet.draw.js':L+'/leaflet-draw/dist/leaflet.draw.js','leaflet-draw@1.0.4/dist/leaflet.draw.css':L+'/leaflet-draw/dist/leaflet.draw.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[];
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1400,height:900}}); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(400);
 const seed=await p.evaluate(async()=>{ const c=(await clientSupabase.from('chasseurs').insert({nom:'Martin',actif:true}).select().single()).data.id;
   const bt=(await clientSupabase.from('battues').insert({date_battue:'2099-11-15',secteur:'Nord'}).select().single()).data.id; return {c,bt}; });
 await p.goto(B+'pages/plan-battue.html?id='+seed.bt); await p.waitForTimeout(1000);
 const carte=p.locator('#carte-plan');
 const clic=async(x,y)=>{ await carte.click({position:{x,y}}); await p.waitForTimeout(120); };
 t('3 étapes et 4 outils affichés', await p.locator('#etapes li').count()===3 && await p.locator('#outils-dessin .outil').count()===4);
 t('carte grande (au moins 450 px de haut)', (await carte.boundingBox()).height>=450);
 t('boutons d\'impression (cartons, fiche de gestion)', (await p.locator('.lien-impression').allInnerTexts()).join('|')==='Cartons de battue|Fiche de gestion');
 // 1. ligne point par point
 await p.click('[data-outil=ligne]'); t('étape 2 active quand un outil est choisi', await p.locator('#etape-2.actif').count()===1);
 await clic(200,300); await clic(350,250); await clic(500,320);
 await p.click('#bouton-terminer-dessin'); await p.waitForTimeout(200);
 t('fenêtre de description ouverte (étape 3)', await p.locator('#modale-element.ouverte').count()===1 && await p.locator('#etape-3.actif').count()===1);
 t('types proposés pour une ligne', (await p.locator('#choix-type label').allInnerTexts()).join('|')==='Mouvement de la traque|Ligne des rabatteurs|Sens de la battue|Autre tracé');
 t('flèche cochée par défaut pour un mouvement', await p.isChecked('#champ-fleche-element'));
 await p.fill('#champ-nom-element','Matin'); await p.click('#formulaire-element button[type=submit]'); await p.waitForTimeout(200);
 // 2. courbe terminée par double-clic
 await p.click('[data-outil=courbe]'); await clic(200,450); await clic(300,400); await clic(400,470);
 await carte.dblclick({position:{x:520,y:420}}); await p.waitForTimeout(250);
 t('double-clic termine la courbe (4 points, pas de doublon)', await p.locator('#modale-element.ouverte').count()===1 && (await p.evaluate(()=>edition.points.length))===4);
 await p.click('#choix-type label:has(input[value=sens])'); t('sens : flèche cochée', await p.isChecked('#champ-fleche-element'));
 await p.click('#formulaire-element button[type=submit]'); await p.waitForTimeout(200);
 // 3. polygone fermé en cliquant le premier point
 await p.click('[data-outil=polygone]'); await clic(700,200); await clic(850,220); await clic(840,350); await clic(720,330); await clic(701,201);
 t('clic sur le premier point ferme le polygone', await p.locator('#modale-element.ouverte').count()===1);
 t('types proposés pour un polygone', (await p.locator('#choix-type label').allInnerTexts()).join('|')==='Zone de battue|Zone interdite de tir');
 await p.click('#formulaire-element button[type=submit]'); await p.waitForTimeout(200);
 // 4. points : poste, puis parking, outil reste actif
 await p.click('[data-outil=point]'); await clic(600,150);
 t('types proposés pour un point', (await p.locator('#choix-type label').allInnerTexts()).map(s=>s.replace(/^\S+\s/,'')).join('|')==='Poste|Parking|Accès');
 await p.fill('#champ-nom-element','Poste Chêne'); await p.selectOption('#champ-chasseur-element',seed.c); await p.click('#formulaire-element button[type=submit]'); await p.waitForTimeout(200);
 t('l\'outil Point reste actif pour enchaîner', await p.locator('[data-outil=point].actif').count()===1);
 await clic(650,500); await p.click('#choix-type label:has(input[value=parking])'); await p.click('#formulaire-element button[type=submit]'); await p.waitForTimeout(200);
 await p.keyboard.press('Escape'); t('Échap désactive l\'outil', await p.locator('#outils-dessin .outil.actif').count()===0 && await p.locator('#etape-1.actif').count()===1);
 // enregistrement
 await p.click('#bouton-enregistrer-plan'); await p.waitForTimeout(900);
 const bd=await p.evaluate(async()=>{const tr=(await clientSupabase.from('traques').select()).data; return {n:tr.length, el:tr[0].elements, pk:tr[0].parkings, mv:tr[0].mouvement, po:(await clientSupabase.from('postes_traque').select()).data};});
 t('3 tracés enregistrés (ligne, courbe, polygone)', bd.n===1 && bd.el.map(e=>e.forme).join()==='ligne,courbe,polygone');
 t('types et noms enregistrés', bd.el[0].type==='mouvement' && bd.el[0].nom==='Matin' && bd.el[1].type==='sens' && bd.el[1].fleche===true && bd.el[2].type==='zone' && bd.el[2].fleche===false);
 t('poste affecté et parking enregistrés', bd.po.length===1 && bd.po[0].chasseur_id===seed.c && bd.pk.length===1 && bd.mv===null);
 t('la courbe est lissée (plus de points affichés que cliqués)', await p.evaluate(()=>pointsAffiches(traquesEtat[0].elements[1]).length)>4*5);
 // rechargement + édition
 await p.reload(); await p.waitForTimeout(1000);
 t('tout est rechargé (3 tracés, 1 poste, 1 parking)', await p.evaluate(()=>traquesEtat[0].elements.length===3 && traquesEtat[0].postes.length===1 && traquesEtat[0].parkings.length===1));
 const pt=await p.evaluate(()=>{const e=traquesEtat[0].elements[0]; const pp=carte.latLngToContainerPoint(e.points[1]); return {x:pp.x,y:pp.y};});
 await carte.click({position:{x:pt.x,y:pt.y}}); await p.waitForTimeout(250);
 t('clic sur un tracé : la fenêtre s\'ouvre avec ses infos', await p.locator('#modale-element.ouverte').count()===1 && await p.inputValue('#champ-nom-element')==='Matin');
 await p.click('#bouton-inverser-element'); await p.click('#bouton-modifier-forme'); await p.waitForTimeout(200);
 t('modification de forme : poignées affichées', await p.locator('.poignee-forme').count()>=3);
 const avant=await p.evaluate(()=>JSON.stringify(traquesEtat[0].elements[0].points[0]));
 const h=p.locator('.poignee-forme:not(.milieu)').first(); const hb=await h.boundingBox();
 await p.mouse.move(hb.x+7,hb.y+7); await p.mouse.down(); await p.mouse.move(hb.x+60,hb.y+50,{steps:6}); await p.mouse.up();
 t('poignée déplacée : le point change', await p.evaluate(()=>JSON.stringify(traquesEtat[0].elements[0].points[0]))!==avant);
 const nbAvant=await p.evaluate(()=>traquesEtat[0].elements[0].points.length);
 await p.locator('.poignee-forme.milieu').first().click(); 
 t('point intermédiaire ajouté', await p.evaluate(()=>traquesEtat[0].elements[0].points.length)===nbAvant+1);
 await p.click('#bouton-fin-edition-forme'); t('forme terminée', await p.locator('.poignee-forme').count()===0);
 // suppression via la liste du panneau
 await p.locator('.liste-elements .ligne-element', {hasText:'Autre'}).count();
 await p.locator('.liste-elements .ligne-element', {hasText:'Zone de battue'}).click(); await p.waitForTimeout(200);
 await p.click('#bouton-supprimer-element'); await p.waitForTimeout(200);
 t('suppression d\'un élément', await p.evaluate(()=>traquesEtat[0].elements.length)===2);
 // traque 2 + anciens tracés
 await p.click('#bouton-ajouter-traque'); t('2e traque ajoutée avec sa pastille', await p.locator('.pastille-traque').count()===2);
 await p.click('#bouton-enregistrer-plan'); await p.waitForTimeout(800);
 const ancien=await p.evaluate(async b=>{ const tr=(await clientSupabase.from('traques').insert({battue_id:b,numero:3,mouvement:[[46,2],[46.01,2.01]],ligne_rabatteurs:[[46,2.02],[46.01,2.03]]}).select().single()).data; return tr.id;},seed.bt);
 await p.reload(); await p.waitForTimeout(1000);
 t('anciens tracés (mouvement, rabatteurs) convertis en éléments', await p.evaluate(()=>{const t3=traquesEtat.find(x=>x.numero===3); return t3 && t3.elements.map(e=>e.type).join()==='mouvement,rabatteurs' && t3.elements.every(e=>e.fleche);}));
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
