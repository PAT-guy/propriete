/**
 * Fonds de carte IGN (service public gratuit data.geopf.fr / cartes.gouv.fr).
 * Fournit le plan topographique et la photo aérienne, avec bascule entre les deux.
 */

const URL_BASE_IGN = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0"
    + "&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

function creerFondsCarteIGN() {
    const planIGN = L.tileLayer(
        `${URL_BASE_IGN}&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png`,
        { maxZoom: 19, attribution: "Plan IGN — © IGN/Geoportail" }
    );

    const satelliteIGN = L.tileLayer(
        `${URL_BASE_IGN}&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg`,
        { maxZoom: 19, attribution: "Photo aérienne — © IGN/Geoportail" }
    );

    return { planIGN, satelliteIGN };
}

/**
 * Relie deux boutons à la bascule entre le plan et le satellite sur une carte Leaflet.
 * Le plan est affiché par défaut.
 */
function brancherBoutonsFondCarte(carte, fonds, idBoutonPlan, idBoutonSatellite) {
    const boutonPlan = document.getElementById(idBoutonPlan);
    const boutonSatellite = document.getElementById(idBoutonSatellite);

    fonds.planIGN.addTo(carte);
    boutonPlan.classList.add("actif");

    boutonPlan.addEventListener("click", () => {
        carte.removeLayer(fonds.satelliteIGN);
        fonds.planIGN.addTo(carte);
        boutonPlan.classList.add("actif");
        boutonSatellite.classList.remove("actif");
    });

    boutonSatellite.addEventListener("click", () => {
        carte.removeLayer(fonds.planIGN);
        fonds.satelliteIGN.addTo(carte);
        boutonSatellite.classList.add("actif");
        boutonPlan.classList.remove("actif");
    });
}

/**
 * Télécharge les tuiles (plan et photo aérienne) de la zone actuellement affichée
 * pour qu'elles s'affichent sans réseau. Zooms : du niveau actuel (moins 1) à 17.
 * Plafond de sécurité par fond pour ne pas saturer le stockage du navigateur.
 */
const PLAFOND_TUILES_PAR_FOND = 1500;
const ZOOM_MAX_HORS_LIGNE = 17;

function listerTuilesZone(carte, modeleUrl) {
    const limites = carte.getBounds();
    const zoomMin = Math.max(carte.getZoom() - 1, 10);
    const adresses = [];
    for (let z = zoomMin; z <= ZOOM_MAX_HORS_LIGNE; z++) {
        const n = 2 ** z;
        const x = (lng) => Math.floor(((lng + 180) / 360) * n);
        const y = (lat) => {
            const r = (lat * Math.PI) / 180;
            return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
        };
        for (let tx = x(limites.getWest()); tx <= x(limites.getEast()); tx++) {
            for (let ty = y(limites.getNorth()); ty <= y(limites.getSouth()); ty++) {
                adresses.push(modeleUrl.replace("{z}", z).replace("{x}", tx).replace("{y}", ty));
            }
        }
    }
    return adresses;
}

async function telechargerZoneHorsLigne(carte, fonctionProgression) {
    if (!window.caches) throw new Error("Ce navigateur ne permet pas le mode hors ligne.");
    const modeles = [
        `${URL_BASE_IGN}&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png`,
        `${URL_BASE_IGN}&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg`,
    ];
    const listes = modeles.map((m) => listerTuilesZone(carte, m));
    if (listes.some((l) => l.length > PLAFOND_TUILES_PAR_FOND)) {
        throw new Error(`Zone trop grande (${Math.max(...listes.map((l) => l.length))} tuiles par fond, maximum ${PLAFOND_TUILES_PAR_FOND}). Zoome davantage sur le secteur à emporter.`);
    }
    const adresses = listes.flat();
    const cache = await caches.open("foret-tuiles-v1");
    let faites = 0, echecs = 0;
    const file = adresses.slice();
    const travailleur = async () => {
        while (file.length) {
            const adresse = file.pop();
            try {
                if (!(await cache.match(adresse, { ignoreVary: true }))) {
                    const reponse = await fetch(adresse, { mode: "cors" });
                    if (!reponse.ok) throw new Error(reponse.status);
                    await cache.put(adresse, reponse);
                }
            } catch (erreur) {
                echecs++;
            }
            faites++;
            if (fonctionProgression) fonctionProgression(faites, adresses.length);
        }
    };
    await Promise.all(Array.from({ length: 6 }, travailleur));
    return { total: adresses.length, echecs };
}
