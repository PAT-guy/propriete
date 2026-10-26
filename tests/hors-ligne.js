const { chromium } = require('playwright');
const L = process.argv[2] + '/node_modules';
const map = {'leaflet@1.9.4/dist/leaflet.js':L+'/leaflet/dist/leaflet.js','leaflet@1.9.4/dist/leaflet.css':L+'/leaflet/dist/leaflet.css','leaflet-draw@1.0.4/dist/leaflet.draw.js':L+'/leaflet-draw/dist/leaflet.draw.js','leaflet-draw@1.0.4/dist/leaflet.draw.css':L+'/leaflet-draw/dist/leaflet.draw.css','@supabase/supabase-js@2':L+'/@supabase/supabase-js/dist/umd/supabase.js'};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const B='http://localhost:8123/'; let ok=0,ko=0; const errs=[]; let tuilesServies=0;
const t=(n,c)=>{(c?ok++:ko++);console.log((c?'OK  ':'FAIL ')+n);};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>{console.log('  [dialog] '+d.message());d.accept();});
 await ctx.route(/unpkg\.com/, r=>{const u=r.request().url();const k=Object.keys(map).find(k=>u.includes(k));k?r.fulfill({path:map[k]}):r.abort();});
 await ctx.route(/geopf\.fr/, r=>{tuilesServies++; r.fulfill({body:PNG,contentType:'image/png',headers:{'access-control-allow-origin':'*'}});});
 await p.goto(B+'index.html'); await p.click('button[type=submit]'); await p.waitForURL('**/tableau-de-bord.html');
 await p.goto(B+'pages/parcelles.html'); await p.waitForTimeout(1500);
 await p.evaluate(()=>navigator.serviceWorker.ready); 
 await p.reload(); await p.waitForTimeout(1500);
 t('service worker actif', await p.evaluate(()=>!!navigator.serviceWorker.controller));
 await p.evaluate(()=>carteParcelles.setView([46.6,2.5],15));
 await p.click('#bouton-hors-ligne'); await p.waitForFunction(()=>!document.getElementById('bouton-hors-ligne').disabled,null,{timeout:30000});
 const nb=await p.evaluate(async()=>(await (await caches.open('foret-tuiles-v1')).keys()).length);
 t('tuiles mises en cache ('+nb+')', nb>10);
 // zone trop grande
 await p.evaluate(()=>carteParcelles.setView([46.6,2.5],8));
 await p.click('#bouton-hors-ligne'); await p.waitForTimeout(800);
 await p.evaluate(()=>carteParcelles.setView([46.6,2.5],15));
 // navigation vers d'autres pages pour les mettre en cache
 for (const u of ['pages/chasse.html','tableau-de-bord.html']) { await p.goto(B+u); await p.waitForTimeout(800); }
 await p.goto(B+'pages/parcelles.html'); await p.waitForTimeout(800);
 // Hors ligne
 await ctx.setOffline(true); tuilesServies=0;
 await p.reload(); await p.waitForTimeout(1500);
 t('page parcelles rechargée hors ligne', await p.locator('#corps-tableau-parcelles').count()>0 && await p.evaluate(()=>typeof L!=='undefined'));
 t('carte rendue hors ligne', await p.locator('.leaflet-container').count()>0);
 const ok2=await p.evaluate(()=>[...document.querySelectorAll('.leaflet-tile')].filter(i=>i.complete&&i.naturalWidth>0).length);
 t('tuiles affichées depuis le cache ('+ok2+')', ok2>0 && tuilesServies===0);
 t('bandeau hors ligne visible', await p.locator('#bandeau-hors-ligne').isVisible());
 await p.goto(B+'pages/chasse.html'); await p.waitForTimeout(800);
 t('page chasse hors ligne', await p.locator('#corps-tableau-chasseurs').count()>0);
 t('aucune erreur JS', errs.length===0); console.log(errs); console.log(ok+' OK, '+ko+' FAIL'); await b.close();
})();
