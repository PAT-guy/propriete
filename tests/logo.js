const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[];
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1300,height:900}}); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>r.abort());
 await p.goto(B+'index.html'); await p.waitForTimeout(600);
 const chargee=(sel)=>p.evaluate((s)=>{const i=document.querySelector(s); return !!i && i.complete && i.naturalWidth>0;},sel);
 t('connexion : logo complet affiché', await chargee('.logo-connexion'));
 const tetes=await p.evaluate(()=>({icone:[...document.querySelectorAll('link[rel=icon]')].map(l=>l.getAttribute('href')),apple:!!document.querySelector('link[rel=apple-touch-icon]'),manifest:!!document.querySelector('link[rel=manifest]'),theme:!!document.querySelector('meta[name=theme-color]')}));
 t('connexion : icône des onglets, icône d\'écran d\'accueil, manifeste, couleur', tetes.icone.length===2 && tetes.apple && tetes.manifest && tetes.theme);
 await p.click('button[type=submit]'); await p.waitForURL('**/pages/battues.html'); await p.waitForTimeout(600);
 t('en-tête du site : logo affiché', await chargee('.logo-barre'));
 // toutes les pages portent les balises
 const pages=['pages/battues.html','pages/parcelles.html','pages/chasse.html','pages/travaux.html','pages/sauvegarde.html','pages/plan-battue.html','pages/saisie.html','pages/impression.html','chantier-impression.html'];
 const manquantes=[];
 for (const u of pages) { const r=await ctx.request.get(B+u); const h=await r.text(); if(!/rel="manifest"/.test(h)||!/rel="apple-touch-icon"/.test(h)||!/rel="icon"/.test(h)) manquantes.push(u); }
 t('les '+pages.length+' pages ont l\'icône et le manifeste', manquantes.length===0);
 // manifeste et icônes
 const m=await (await ctx.request.get(B+'manifest.webmanifest')).json();
 t('manifeste : nom, page de départ, mode application, couleurs', m.name==='Forêt & Chasse' && m.start_url==='pages/battues.html' && m.display==='standalone' && /^#[0-9a-f]{6}$/i.test(m.theme_color));
 let iconesOk=true; for (const ic of m.icons) { const r=await ctx.request.get(B+ic.src); const buf=await r.body(); const png=buf.slice(0,8).toString('hex')==='89504e470d0a1a0a'; const taille=buf.readUInt32BE(16); if(!r.ok()||!png||taille!==parseInt(ic.sizes)) iconesOk=false; }
 t('manifeste : icônes 192 et 512 présentes, vraiment en PNG, à la bonne taille', iconesOk && m.icons.some(i=>i.sizes==='192x192') && m.icons.some(i=>i.sizes==='512x512'));
 const apple=await (await ctx.request.get(B+'img/apple-touch-icon.png')).body();
 t('icône iPhone : PNG 180 x 180', apple.readUInt32BE(16)===180 && apple.readUInt32BE(20)===180);
 for (const f of ['logo-bois.svg','logo-bois-complet.svg','icone-app.svg']) { const r=await ctx.request.get(B+'img/'+f); t('fichier img/'+f+' valide (SVG)', r.ok() && (await r.text()).startsWith('<svg')); }
 // impression : ornement « logo » par défaut
 const bt=await p.evaluate(async()=>{ const b=(await clientSupabase.from('battues').insert({date_battue:'2026-11-14',secteur:'Nord'}).select().single()).data.id; return b; });
 await p.goto(B+'pages/impression.html?id='+bt+'&doc=carton'); await p.waitForTimeout(1500);
 const defaut=await p.evaluate(()=>config.faces.recto.find(b=>b.bloc==='entete').options.ornement);
 t('cartons : l\'ornement par défaut est le logo', defaut==='logo' && await p.locator('.ib-feuille[data-face=recto] .ib-ornement svg path').count()>=10);
 await p.locator('#panneau .ib-bloc-edit').first().locator('.nom').click();
 t('réglages : « Logo (Les bois) » proposé en premier', (await p.locator('#panneau .ib-bloc-edit').first().locator('[data-opt=ornement] option').first().innerText())==='Logo (Les bois)');
 const ornTaille=await p.locator('.ib-feuille[data-face=recto] .ib-ornement').first().evaluate(e=>{const r=e.getBoundingClientRect(); return [r.width/3.7795,r.height/3.7795];});
 t('logo imprimé : environ 9 mm', Math.abs(ornTaille[0]-9)<1 && Math.abs(ornTaille[1]-9)<1);
 await p.locator('#panneau .ib-bloc-edit').first().locator('[data-opt=ornement]').selectOption('chene'); await p.waitForTimeout(400);
 t('on peut toujours choisir la feuille de chêne', await p.locator('.ib-feuille[data-face=recto] .ib-ornement').count()===2);
 await p.goto(B+'pages/impression.html?id='+bt+'&doc=fiche'); await p.waitForTimeout(1200);
 t('fiche de gestion : même ornement par défaut', (await p.evaluate(()=>config.faces.recto.find(b=>b.bloc==='entete').options.ornement))==='logo');
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
