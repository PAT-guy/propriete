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
