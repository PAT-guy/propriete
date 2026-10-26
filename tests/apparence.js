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
 const bt=await p.evaluate(async()=>{ const ins=async(n,o)=>(await clientSupabase.from(n).insert(o).select().single()).data.id;
  const b=await ins('battues',{date_battue:'2026-11-14',secteur:'Marais',regles_securite:'Gilet'}); const t=await ins('traques',{battue_id:b,numero:1,nom:'T',elements:[],parkings:[],acces:[]}); await ins('postes_traque',{traque_id:t,nom:'P1',lat:46.6,lng:2.5}); return b; });
 await p.goto(B+'pages/impression.html?id='+bt+'&doc=fiche'); await p.waitForTimeout(1500);
 const racine=(prop)=>p.evaluate((x)=>getComputedStyle(document.querySelector('#racine')).getPropertyValue(x).trim(),prop);
 const nbOpt=async(sel)=>p.locator(sel+' option').count();
 t('palettes : 10 choix dont « Personnalisée »', (await nbOpt('#panneau [data-style=palette]'))===10 && (await p.locator('#panneau [data-style=palette] option').allInnerTexts()).some(x=>x.startsWith('Personnalisée')));
 t('polices : 7 choix', (await nbOpt('#panneau [data-style=police]'))===7);
 const sel=(k)=>p.locator(`#panneau [data-style=${k}] option`).allInnerTexts();
 t('cadre : 5 choix, titres : 4, tableaux : 4, coins : 3, fond : 4', (await sel('cadreStyle')).length===5 && (await sel('titreStyle')).length===4 && (await sel('tableStyle')).length===4 && (await sel('coins')).length===3 && (await sel('fond')).length===4);
 await p.locator('#panneau .ib-bloc-edit').first().locator('.nom').click();
 t('en-tête : 5 styles et 5 ornements', (await p.locator('#panneau .ib-bloc-edit').first().locator('[data-opt=style] option').count())===5 && (await p.locator('#panneau .ib-bloc-edit').first().locator('[data-opt=ornement] option').count())===5);
 // effets réels
 await p.selectOption('#panneau [data-style=cadreStyle]','epais'); await p.waitForTimeout(400);
 t('cadre épais appliqué (≥ 3 px)', await p.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.ib-cadre')).borderTopWidth)>=3));
 await p.selectOption('#panneau [data-style=cadreStyle]','aucun'); await p.waitForTimeout(400);
 t('sans cadre : le cadre disparaît', await p.evaluate(()=>getComputedStyle(document.querySelector('.ib-cadre')).display==='none'));
 await p.selectOption('#panneau [data-style=titreStyle]','bandeau'); await p.waitForTimeout(400);
 t('titres en bandeau : fond de la couleur principale', await p.evaluate(()=>getComputedStyle(document.querySelector('.ib-bloc-titre')).backgroundColor==='rgb(47, 74, 51)'));
 await p.selectOption('#panneau [data-style=titreCasse]','normale'); await p.waitForTimeout(300);
 t('casse normale des titres', await p.evaluate(()=>getComputedStyle(document.querySelector('.ib-bloc-titre')).textTransform==='none'));
 await p.selectOption('#panneau [data-style=tableStyle]','zebre'); await p.waitForTimeout(400);
 t('tableaux zébrés : en-tête colorée', await p.evaluate(()=>getComputedStyle(document.querySelector('.ib-table th')).backgroundColor==='rgb(47, 74, 51)'));
 await p.selectOption('#panneau [data-style=fond]','vert'); await p.waitForTimeout(300);
 t('fond vert très pâle', await p.evaluate(()=>getComputedStyle(document.querySelector('.ib-feuille')).backgroundColor==='rgb(238, 243, 234)'));
 await p.selectOption('#panneau [data-style=police]','machine'); await p.waitForTimeout(300);
 t('police machine à écrire', (await racine('--ib-police')).includes('Courier'));
 // palette personnalisée
 await p.selectOption('#panneau [data-style=palette]','perso'); await p.waitForTimeout(400);
 t('palette personnalisée : 3 sélecteurs de couleur apparaissent', (await p.locator('#panneau [data-couleur]').count())===3);
 await p.locator('#panneau [data-couleur=primaire]').evaluate((e)=>{ e.value='#0b5a6b'; e.dispatchEvent(new Event('input',{bubbles:true})); }); await p.waitForTimeout(400);
 t('couleur principale personnalisée appliquée', (await racine('--ib-primaire'))==='#0b5a6b');
 t('filet et papier déduits de la couleur choisie', /^#[0-9a-f]{6}$/.test(await racine('--ib-filet')) && /^#[0-9a-f]{6}$/.test(await racine('--ib-papier')));
 // en-tête : styles et ornements
 const entete=p.locator('#panneau .ib-bloc-edit').first();
 for (const [st,orn] of [['centre','cerf'],['encadre','cor'],['minimal','gland'],['simple','chene'],['bandeau','aucun']]) {
  await entete.locator('[data-opt=style]').selectOption(st); await entete.locator('[data-opt=ornement]').selectOption(orn); await p.waitForTimeout(300);
  const nbOrn=await p.locator('.ib-feuille[data-face=recto] .ib-ornement').count();
  t(`en-tête « ${st} » avec ornement « ${orn} » : ${st==='centre'&&orn!=='aucun'?'2 ornements':orn==='aucun'?'aucun ornement':'1 ornement'}`, await p.locator(`.ib-entete-${st}`).count()===1 && nbOrn===(orn==='aucun'?0:st==='centre'?2:1));
 }
 await entete.locator('[data-opt=tailleTitre]').fill('1.6'); await p.waitForTimeout(300);
 t('taille du titre agrandie', await p.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.ib-titre')).fontSize)>parseFloat(getComputedStyle(document.querySelector('.ib-bloc-titre')).fontSize)*2.5));
 // anciennes mises en page
 const ancienne={ version:1, type:'carton', nom:'Ancienne', style:{palette:'sologne',police:'serif',tailleBase:9,fondPapier:true,cadre:false,traitsCoupe:true,marge:8},
   faces:{recto:[{bloc:'entete',options:{titre:'Vieux titre',style:'bandeau',ornement:true,afficherDate:true,afficherSecteur:true}}],verso:[]} };
 await p.evaluate((a)=>{ localStorage.setItem('foret_impression_brouillon_carton', JSON.stringify(a)); },ancienne);
 await p.goto(B+'pages/impression.html?id='+bt+'&doc=carton'); await p.waitForTimeout(1500);
 const mig=await p.evaluate(()=>({cadre:config.style.cadreStyle,fond:config.style.fond,orn:config.faces.recto[0].options.ornement,vieux:config.style.cadre,pap:config.style.fondPapier}));
 t('ancienne mise en page : cadre « non » devient « aucun », fond papier devient « crème »', mig.cadre==='aucun' && mig.fond==='creme' && mig.vieux===undefined && mig.pap===undefined);
 t('ancienne mise en page : l\'ornement coché devient la feuille de chêne et s\'affiche', await p.locator('.ib-feuille[data-face=recto] .ib-ornement').count()===2 && (await p.locator('#racine').innerText()).includes('Vieux titre'));
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
