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
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(600);
 // catégories : Sanglier et Renard sans sonnerie
 const s=await p.evaluate(async()=>{
  const ins=async(n,o)=>(await clientSupabase.from(n).insert(o).select().single()).data.id;
  const cats=(await clientSupabase.from('categories_chasse').select()).data.sort((a,b)=>a.ordre-b.ordre);
  const sang=await ins('categories_chasse',{nom:'Sanglier',sonnerie:null,precisions:[],ordre:10}); const ren=await ins('categories_chasse',{nom:'Renard',sonnerie:null,precisions:[],ordre:11});
  const b1=await ins('battues',{date_battue:'2026-11-14',secteur:'Mixte',plan_jour:[{id:cats[1].id,autorise:true,nombre:3,choix:[]},{id:cats[3].id,autorise:true,nombre:null,choix:[]},{id:sang,autorise:true,nombre:5,choix:[]},{id:ren,autorise:true,nombre:null,choix:[]}]});
  const b2=await ins('battues',{date_battue:'2026-11-21',secteur:'Sans sonnerie',plan_jour:[{id:sang,autorise:true,nombre:4,choix:[]},{id:ren,autorise:true,nombre:2,choix:[]}]});
  return {b1,b2,cats:cats.map(c=>c.id),sang,ren}; });
 // ---------- formulaire de la battue
 await p.reload(); await p.waitForTimeout(500);
 await p.locator('#corps-tableau-a-venir tr', {hasText:'Mixte'}).locator('text=Modifier').click(); await p.waitForTimeout(300);
 const lignes=await p.locator('#liste-plan-jour .ligne-plan-jour').allInnerTexts();
 t('formulaire : « sans sonnerie » pour les animaux qui n\'en ont pas', lignes.some(l=>/Sanglier[\s\S]*sans sonnerie/.test(l)) && lignes.some(l=>/Renard[\s\S]*sans sonnerie/.test(l)) && lignes.some(l=>/Cerf -8[\s\S]*sonnerie 6/.test(l)));
 t('formulaire : le champ du nombre s\'appelle « à tirer »', (await p.locator('#liste-plan-jour .plan-nombre').first().getAttribute('placeholder'))==='À tirer');
 await p.click('#modale-battue >> text=Annuler');
 // ---------- carton : colonne « à tirer » par défaut
 await p.goto(B+'pages/impression.html?id='+s.b1+'&doc=carton'); await p.waitForTimeout(1500);
 const carton=p.locator('.ib-feuille[data-face=recto] .ib-carton').first();
 const ent=await carton.locator('.ib-table thead th').allInnerTexts();
 t('carton : colonnes Gibier, À tirer, Sonnerie par défaut', ent.join('|')==='GIBIER|À TIRER|SONNERIE');
 const lig=await carton.locator('.ib-table tbody tr').allInnerTexts();
 const cellules=lig.map(l=>l.split('\t').map(x=>x.trim()));
 t('le nombre d\'animaux à tirer est affiché (Cerf -8 : 3, Sanglier : 5)', cellules.some(c=>c[0]==='Cerf -8' && c[1]==='3') && cellules.some(c=>c[0]==='Sanglier' && c[1]==='5'));
 t('à tirer non précisé : un tiret (Biche, Renard)', cellules.some(c=>c[0]==='Biche' && c[1]==='–') && cellules.some(c=>c[0]==='Renard' && c[1]==='–'));
 t('sonneries conservées pour ceux qui en ont (Cerf -8 : 6, Biche : 4)', cellules.some(c=>c[0]==='Cerf -8' && c[2]==='6') && cellules.some(c=>c[0]==='Biche' && c[2]==='4'));
 t('animal sans sonnerie : un tiret grisé, pas de cellule vide (Sanglier, Renard)', cellules.some(c=>c[0]==='Sanglier' && c[2]==='–') && cellules.some(c=>c[0]==='Renard' && c[2]==='–') && await carton.locator('.ib-pas-sonnerie').count()>=4);
 t('le nombre et la sonnerie sont en gros, en gras', await carton.locator('.ib-a-tirer').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>parseFloat(getComputedStyle(e.closest('tr').firstElementChild).fontSize) && getComputedStyle(e).fontWeight>=700));
 t('aucun débordement du carton avec les 3 colonnes', !(await p.locator('#alerte-debordement').isVisible()));
 // ---------- réglages du bloc
 await p.locator('#panneau .ib-bloc-edit', {hasText:'Plan de chasse du jour'}).locator('.nom').click();
 const bloc=p.locator('#panneau .ib-bloc-edit', {hasText:'Plan de chasse du jour'});
 t('réglages : colonne « à tirer » cochée, choix de la colonne sonnerie', await bloc.locator('[data-opt=nombre]').isChecked() && (await bloc.locator('[data-opt=sonnerie] option').allInnerTexts()).join('|')==='Seulement si une ligne a une sonnerie|Toujours|Jamais');
 await bloc.locator('[data-opt=colonneNombre]').fill('Nombre à tirer'); await p.waitForTimeout(400);
 t('en-tête de la colonne personnalisable', (await carton.locator('.ib-table thead th').allInnerTexts()).includes('NOMBRE À TIRER'));
 await bloc.locator('[data-opt=sonnerie]').selectOption('non'); await p.waitForTimeout(400);
 t('sonnerie « Jamais » : colonne retirée, à tirer conservé', (await carton.locator('.ib-table thead th').allInnerTexts()).join('|')==='GIBIER|NOMBRE À TIRER');
 await bloc.locator('[data-opt=nombre]').uncheck(); await p.waitForTimeout(400);
 t('à tirer décoché : seulement le gibier', (await carton.locator('.ib-table thead th').allInnerTexts()).join('|')==='GIBIER');
 await bloc.locator('[data-opt=nombre]').check(); await bloc.locator('[data-opt=sonnerie]').selectOption('auto'); await p.waitForTimeout(400);
 // ---------- battue où aucun animal n'a de sonnerie
 await p.goto(B+'pages/impression.html?id='+s.b2+'&doc=carton'); await p.waitForTimeout(1500);
 const carton2=p.locator('.ib-feuille[data-face=recto] .ib-carton').first();
 t('aucune sonnerie sur la battue : la colonne sonnerie disparaît d\'elle-même', (await carton2.locator('.ib-table thead th').allInnerTexts()).join('|')==='GIBIER|NOMBRE À TIRER' || (await carton2.locator('.ib-table thead th').allInnerTexts()).join('|')==='GIBIER|À TIRER');
 t('… et les nombres à tirer restent (Sanglier 4, Renard 2)', (await carton2.locator('.ib-table tbody tr').allInnerTexts()).map(l=>l.split('\t').map(x=>x.trim())).filter(c=>(c[0]==='Sanglier'&&c[1]==='4')||(c[0]==='Renard'&&c[1]==='2')).length===2);
 await p.locator('#panneau .ib-bloc-edit', {hasText:'Plan de chasse du jour'}).locator('.nom').click();
 await p.locator('#panneau .ib-bloc-edit', {hasText:'Plan de chasse du jour'}).locator('[data-opt=sonnerie]').selectOption('oui'); await p.waitForTimeout(400);
 t('sonnerie « Toujours » : colonne affichée avec des tirets', (await carton2.locator('.ib-table thead th').allInnerTexts()).some(x=>x==='SONNERIE') && await carton2.locator('.ib-pas-sonnerie').count()>=2);
 // ---------- fiche de gestion
 await p.goto(B+'pages/impression.html?id='+s.b1+'&doc=fiche'); await p.waitForTimeout(1500);
 t('fiche de gestion : À tirer, Sonnerie, Prélevé', (await p.locator('.ib-feuille[data-face=recto] .ib-table').first().locator('thead th').allInnerTexts()).join('|')==='GIBIER|À TIRER|SONNERIE|PRÉLEVÉ');
 // ---------- ancienne mise en page enregistrée (sans les nouvelles options)
 await p.evaluate(()=>{ const c=JSON.parse(JSON.stringify(config)); c.faces.recto=c.faces.recto.map(b=>b.bloc==='plan_chasse_jour'?{...b,options:{titre:'Plan',colonneSonnerie:'Sonnerie',nombre:false,prelevement:false,tailleSonnerie:12,hauteurLigne:6}}:b); localStorage.setItem('foret_impression_brouillon_fiche',JSON.stringify(c)); });
 await p.reload(); await p.waitForTimeout(1500);
 t('ancienne mise en page : lue sans erreur, sonnerie en automatique', (await p.locator('.ib-feuille[data-face=recto] .ib-table').first().locator('thead th').allInnerTexts()).join('|')==='GIBIER|SONNERIE');
 // ---------- saisie rapide
 await p.goto(B+'pages/saisie.html?id='+s.b1); await p.waitForTimeout(1200);
 const noms=await p.locator('#saisie-categories .saisie-animal').evaluateAll(e=>e.map(x=>({nom:x.querySelector('.nom').innerText,son:!!x.querySelector('.sonnerie')})));
 t('saisie rapide : pastille de sonnerie seulement pour ceux qui en ont', noms.find(x=>x.nom==='Cerf -8').son && !noms.find(x=>x.nom==='Sanglier').son && !noms.find(x=>x.nom==='Renard').son);
 t('saisie rapide : le bouton Sanglier reste utilisable et affiche 0 / 5', (await p.locator('.saisie-animal:has-text("Sanglier") .compte').innerText())==='0 / 5');
 await p.click('.saisie-animal:has-text("Sanglier")'); await p.waitForTimeout(400);
 const bilan=await p.locator('#saisie-bilan').innerText();
 t('bilan : colonne « À tirer », tiret pour une sonnerie absente', bilan.includes('À TIRER') || bilan.includes('À tirer'));
 t('bilan : Sanglier pris 1 sur 5, sonnerie en tiret', /Sanglier\s+–\s+1\s+5/.test(bilan));
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
