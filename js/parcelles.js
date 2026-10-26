/**
 * Module Cadastre des parcelles : carte interactive (tracé des contours),
 * liste, fiche détaillée, essences, propriétaires.
 */

let carteParcelles;
let coucheParcellesExistantes;
let coucheDessinEnCours;
let controleDessin;
let parcelleSelectionneeId = null;
let essenceEnEditionParcelleId = null;

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/parcelles.html");
    afficherBandeauDemoSiBesoin();

    try {
        initialiserCarte();
    } catch (erreur) {
        console.error("Carte indisponible :", erreur);
        document.getElementById("carte-parcelles").innerHTML =
            '<div class="message-alerte" style="margin:0;">Carte indisponible (connexion internet nécessaire pour charger le fond de carte). Le reste de la page fonctionne normalement.</div>';
        document.getElementById("bouton-dessiner").disabled = true;
    }
    await chargerEtAfficherParcelles();

    document.getElementById("champ-recherche").addEventListener("input", filtrerTableauParcelles);
    document.getElementById("bouton-dessiner").addEventListener("click", activerModeDessin);
    document.getElementById("formulaire-parcelle").addEventListener("submit", enregistrerParcelle);
    document.getElementById("formulaire-essence").addEventListener("submit", enregistrerEssence);
    document.getElementById("bouton-ajouter-essence").addEventListener("click", ouvrirAjoutEssence);
    document.getElementById("bouton-modifier-parcelle").addEventListener("click", ouvrirModificationParcelle);
    document.getElementById("bouton-ajouter-cadastre").addEventListener("click", ouvrirAjoutCadastre);
    document.getElementById("formulaire-cadastre").addEventListener("submit", rechercherParcelleCadastre);
    document.getElementById("champ-commune-cadastre").addEventListener("input", proposerCommunes);
    document.getElementById("bouton-hors-ligne").addEventListener("click", lancerTelechargementHorsLigne);
    document.getElementById("bouton-modifier-contour").addEventListener("click", demarrerEditionContour);
    document.getElementById("bouton-valider-contour").addEventListener("click", validerEditionContour);
    document.getElementById("bouton-annuler-contour").addEventListener("click", annulerEditionContour);
    document.getElementById("bouton-supprimer-parcelle").addEventListener("click", supprimerParcelleSelectionnee);
})();

// ----------------------------------------------------------------------------
// Carte
// ----------------------------------------------------------------------------

function initialiserCarte() {
    carteParcelles = L.map("carte-parcelles").setView([46.6, 2.5], 6);
    const fonds = creerFondsCarteIGN();
    brancherBoutonsFondCarte(carteParcelles, fonds, "bouton-fond-plan", "bouton-fond-satellite");

    coucheParcellesExistantes = L.featureGroup().addTo(carteParcelles);
    coucheDessinEnCours = L.featureGroup().addTo(carteParcelles);

    controleDessin = new L.Draw.Polygon(carteParcelles, {
        shapeOptions: { color: "#5a7d4a", weight: 3 },
        showArea: true,
    });

    carteParcelles.on(L.Draw.Event.CREATED, (evenement) => {
        coucheDessinEnCours.clearLayers();
        coucheDessinEnCours.addLayer(evenement.layer);
        const latlngs = evenement.layer.getLatLngs()[0].map((p) => [p.lat, p.lng]);
        const centre = evenement.layer.getBounds().getCenter();
        ouvrirCreationParcelle(latlngs, { lat: centre.lat, lng: centre.lng });
    });
}

// ----------------------------------------------------------------------------
// Ajout d'une parcelle par sa référence cadastrale
// Services publics gratuits : geo.api.gouv.fr (communes) et API Carto IGN (parcelles).
// ----------------------------------------------------------------------------

const URL_API_COMMUNES = "https://geo.api.gouv.fr/communes";
const URL_API_CADASTRE = "https://apicarto.ign.fr/api/cadastre/parcelle";
let communesProposees = [];
let minuterieCommunes = null;

function ouvrirAjoutCadastre() {
    document.getElementById("formulaire-cadastre").reset();
    document.getElementById("message-modale-cadastre").innerHTML = "";
    document.getElementById("liste-communes-cadastre").innerHTML = "";
    communesProposees = [];
    ouvrirModale("modale-cadastre");
}

function libelleCommune(c) {
    return `${c.nom} (${(c.codesPostaux && c.codesPostaux[0]) || c.code})`;
}

function proposerCommunes() {
    clearTimeout(minuterieCommunes);
    const texte = document.getElementById("champ-commune-cadastre").value.trim();
    if (texte.length < 3) return;
    minuterieCommunes = setTimeout(async () => {
        try {
            const reponse = await fetch(`${URL_API_COMMUNES}?nom=${encodeURIComponent(texte)}&fields=nom,code,codesPostaux&boost=population&limit=8`);
            if (!reponse.ok) return;
            communesProposees = await reponse.json();
            document.getElementById("liste-communes-cadastre").innerHTML =
                communesProposees.map((c) => `<option value="${echapper(libelleCommune(c))}"></option>`).join("");
        } catch (erreur) {
            // Pas de réseau : la recherche échouera avec un message clair à la validation.
        }
    }, 250);
}

/** Convertit une géométrie GeoJSON (Polygon ou MultiPolygon) en contour [[lat, lng], ...]. */
function contourDepuisGeometrie(geometrie) {
    const polygones = geometrie.type === "MultiPolygon" ? geometrie.coordinates : [geometrie.coordinates];
    const anneaux = polygones.map((p) => p[0]);
    const surfaceApprox = (a) => Math.abs(a.reduce((somme, [x1, y1], i) => {
        const [x2, y2] = a[(i + 1) % a.length];
        return somme + (x1 * y2 - x2 * y1);
    }, 0)) / 2;
    const principal = anneaux.reduce((meilleur, a) => (surfaceApprox(a) > surfaceApprox(meilleur) ? a : meilleur));
    const [premier, dernier] = [principal[0], principal[principal.length - 1]];
    const fermeParDoublon = principal.length > 1 && premier[0] === dernier[0] && premier[1] === dernier[1];
    const sansFermeture = fermeParDoublon ? principal.slice(0, -1) : principal;
    return { contour: sansFermeture.map(([lng, lat]) => [lat, lng]), morceaux: anneaux.length };
}

async function rechercherParcelleCadastre(evenement) {
    evenement.preventDefault();
    const message = document.getElementById("message-modale-cadastre");
    const bouton = document.getElementById("bouton-chercher-cadastre");
    const alerte = (texte) => { message.innerHTML = `<div class="message-alerte">${echapper(texte)}</div>`; };
    message.innerHTML = "";

    const saisieCommune = document.getElementById("champ-commune-cadastre").value.trim();
    const commune = communesProposees.find((c) => libelleCommune(c) === saisieCommune);
    if (!commune) return alerte("Choisis la commune dans la liste proposée (tape au moins 3 lettres).");

    const section = document.getElementById("champ-section-cadastre").value.trim().toUpperCase();
    const numeroSaisi = document.getElementById("champ-numero-cadastre").value.trim();
    if (!/^[A-Z0-9]{1,2}$/.test(section)) return alerte("La section comporte une ou deux lettres (ex : AB).");
    if (!/^\d{1,4}$/.test(numeroSaisi)) return alerte("Le numéro comporte un à quatre chiffres (ex : 12).");

    const prefixe = document.getElementById("champ-prefixe-cadastre").value.trim();
    const parametres = new URLSearchParams({
        code_insee: commune.code,
        section: section.padStart(2, "0"),
        numero: numeroSaisi.padStart(4, "0"),
    });
    if (prefixe) parametres.set("com_abs", prefixe.padStart(3, "0"));

    bouton.disabled = true;
    try {
        const reponse = await fetch(`${URL_API_CADASTRE}?${parametres}`);
        if (!reponse.ok) throw new Error(`Le service cadastre a répondu par une erreur (${reponse.status}).`);
        const resultat = await reponse.json();
        if (!resultat.features || resultat.features.length === 0) {
            return alerte(`Aucune parcelle ${section} ${numeroSaisi} trouvée sur ${commune.nom}. Vérifie la section et le numéro, ou essaie un préfixe si la commune a fusionné.`);
        }
        const parcelle = resultat.features[0];
        const { contour, morceaux } = contourDepuisGeometrie(parcelle.geometry);
        const limites = limitesContour(contour);
        const centre = { lat: (limites.nord + limites.sud) / 2, lng: (limites.est + limites.ouest) / 2 };
        const proprietes = parcelle.properties || {};

        fermerModale("modale-cadastre");
        ouvrirCreationParcelle(contour, centre);
        document.getElementById("champ-nom-parcelle").value = `${section} ${parseInt(numeroSaisi, 10)}`;
        document.getElementById("champ-reference-parcelle").value = `${commune.nom} ${section} ${numeroSaisi.padStart(4, "0")}`;
        document.getElementById("champ-commune-parcelle").value = commune.nom;
        if (proprietes.contenance) document.getElementById("champ-surface-parcelle").value = (proprietes.contenance / 10000).toFixed(2);
        if (morceaux > 1) {
            document.getElementById("message-modale-parcelle").innerHTML =
                '<div class="message-alerte">Cette parcelle est en plusieurs morceaux : seul le plus grand est repris.</div>';
        }
        if (carteParcelles) {
            coucheDessinEnCours.clearLayers();
            const apercu = L.polygon(contour, { color: "#5a7d4a", weight: 3, dashArray: "6" }).addTo(coucheDessinEnCours);
            carteParcelles.fitBounds(apercu.getBounds(), { maxZoom: 17, padding: [30, 30] });
        }
    } catch (erreur) {
        alerte(erreur instanceof TypeError
            ? "Impossible de joindre le service du cadastre (vérifie ta connexion internet)."
            : erreur.message);
    } finally {
        bouton.disabled = false;
    }
}

function limitesContour(contour) {
    const lats = contour.map((p) => p[0]);
    const lngs = contour.map((p) => p[1]);
    return { nord: Math.max(...lats), sud: Math.min(...lats), est: Math.max(...lngs), ouest: Math.min(...lngs) };
}

async function lancerTelechargementHorsLigne() {
    const bouton = document.getElementById("bouton-hors-ligne");
    if (!carteParcelles) {
        alert("La carte n'est pas disponible.");
        return;
    }
    const texteInitial = bouton.textContent;
    bouton.disabled = true;
    try {
        const { total, echecs } = await telechargerZoneHorsLigne(carteParcelles, (faites, sur) => {
            bouton.textContent = `Téléchargement ${faites}/${sur}…`;
        });
        alert(echecs === 0
            ? `Zone enregistrée pour le hors ligne (${total} tuiles).`
            : `Zone enregistrée en partie : ${echecs} tuiles sur ${total} n'ont pas pu être téléchargées.`);
    } catch (erreur) {
        alert(erreur.message);
    } finally {
        bouton.textContent = texteInitial;
        bouton.disabled = false;
    }
}

function activerModeDessin() {
    coucheDessinEnCours.clearLayers();
    controleDessin.enable();
}

function dessinerPolygone(carte, couche, coordonnees, options) {
    if (!coordonnees || coordonnees.length === 0) return null;
    const polygone = L.polygon(coordonnees, options || { color: "#5a7d4a", weight: 2, fillOpacity: 0.25 });
    couche.addLayer(polygone);
    return polygone;
}

// ----------------------------------------------------------------------------
// Chargement des données
// ----------------------------------------------------------------------------

let toutesLesParcelles = [];

async function chargerEtAfficherParcelles() {
    const { data } = await clientSupabase.from("parcelles").select().order("nom");
    toutesLesParcelles = data || [];

    if (carteParcelles) {
        coucheParcellesExistantes.clearLayers();
        toutesLesParcelles.forEach((parcelle) => {
            if (!parcelle.contour) return;
            const polygone = dessinerPolygone(carteParcelles, coucheParcellesExistantes, parcelle.contour);
            polygone.bindPopup(echapper(parcelle.nom));
            polygone.bindTooltip(echapper(parcelle.nom), { permanent: true, direction: "center", className: "etiquette-parcelle" });
            polygone.on("click", () => selectionnerParcelle(parcelle.id));
            polygone._parcelleId = parcelle.id;
        });

        if (coucheParcellesExistantes.getLayers().length > 0) {
            carteParcelles.fitBounds(coucheParcellesExistantes.getBounds(), { maxZoom: 15, padding: [20, 20] });
        }
    }

    filtrerTableauParcelles();
}

function filtrerTableauParcelles() {
    const terme = document.getElementById("champ-recherche").value.trim().toLowerCase();
    const corps = document.getElementById("corps-tableau-parcelles");

    const visibles = toutesLesParcelles.filter((p) => {
        if (!terme) return true;
        const texte = [p.nom, p.commune, p.reference_cadastrale].filter(Boolean).join(" ").toLowerCase();
        return texte.includes(terme);
    });

    if (visibles.length === 0) {
        corps.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888;">Aucune parcelle</td></tr>`;
        return;
    }

    corps.innerHTML = visibles.map((p) => {
        return `
            <tr style="cursor:pointer;" onclick="selectionnerParcelle('${p.id}')">
                <td data-etiquette="Nom"><strong>${echapper(p.nom)}</strong></td>
                <td data-etiquette="Commune">${echapper(p.commune)}</td>
                <td data-etiquette="Surface">${p.surface_ha ? p.surface_ha.toFixed(2) + " ha" : ""}</td>
                <td data-etiquette=""></td>
            </tr>
        `;
    }).join("");
}

// ----------------------------------------------------------------------------
// Sélection et détail
// ----------------------------------------------------------------------------

async function selectionnerParcelle(id) {
    if (polygoneEnEdition && polygoneEnEdition._parcelleId !== id) annulerEditionContour();
    parcelleSelectionneeId = id;
    const parcelle = toutesLesParcelles.find((p) => p.id === id);
    if (!parcelle) return;

    document.getElementById("panneau-detail").style.display = "block";
    document.getElementById("titre-detail").textContent = parcelle.nom;

    const lignes = [];
    if (parcelle.reference_cadastrale) lignes.push(`Référence : ${parcelle.reference_cadastrale}`);
    if (parcelle.commune) lignes.push(`Localisation : ${parcelle.commune}${parcelle.lieu_dit ? " — " + parcelle.lieu_dit : ""}`);
    if (parcelle.surface_ha) lignes.push(`Surface : ${parcelle.surface_ha.toFixed(2)} ha`);
    if (parcelle.type_peuplement) lignes.push(`Peuplement : ${parcelle.type_peuplement}`);
    if (parcelle.notes) lignes.push(`Notes : ${parcelle.notes}`);
    document.getElementById("infos-detail").textContent = lignes.join("\n") || "Aucune information complémentaire.";

    if (parcelle.contour && carteParcelles) {
        const polygoneCorrespondant = coucheParcellesExistantes.getLayers().find((l) => l._parcelleId === id);
        if (polygoneCorrespondant) carteParcelles.fitBounds(polygoneCorrespondant.getBounds(), { maxZoom: 16 });
    }

    await chargerEssences(id);
    document.getElementById("panneau-detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function chargerEssences(parcelleId) {
    const { data } = await clientSupabase.from("essences_parcelle").select().eq("parcelle_id", parcelleId);
    const corps = document.getElementById("corps-tableau-essences");
    const essences = data || [];

    if (essences.length === 0) {
        corps.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888;">Aucune essence renseignée</td></tr>`;
        return;
    }

    corps.innerHTML = essences.map((e) => `
        <tr>
            <td data-etiquette="Essence">${echapper(e.essence)}</td>
            <td data-etiquette="Surface">${e.surface_ha ? e.surface_ha.toFixed(2) + " ha" : ""}</td>
            <td data-etiquette="Âge">${e.age_moyen ? e.age_moyen + " ans" : ""}</td>
            <td data-etiquette=""><button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerEssence('${e.id}')">Retirer</button></td>
        </tr>
    `).join("");
}

// ----------------------------------------------------------------------------
// Création / modification de parcelle
// ----------------------------------------------------------------------------

let contourEnAttenteCreation = null;
let centreEnAttenteCreation = null;
let parcelleEnEditionId = null;

function ouvrirCreationParcelle(contour, centre) {
    parcelleEnEditionId = null;
    contourEnAttenteCreation = contour;
    centreEnAttenteCreation = centre;
    document.getElementById("titre-modale-parcelle").textContent = "Nouvelle parcelle";
    document.getElementById("formulaire-parcelle").reset();
    document.getElementById("message-modale-parcelle").innerHTML = "";
    ouvrirModale("modale-parcelle");
}

function ouvrirModificationParcelle() {
    if (!parcelleSelectionneeId) return;
    const parcelle = toutesLesParcelles.find((p) => p.id === parcelleSelectionneeId);
    if (!parcelle) return;

    parcelleEnEditionId = parcelle.id;
    contourEnAttenteCreation = null; // le contour existant est conservé tel quel
    document.getElementById("titre-modale-parcelle").textContent = "Modifier la parcelle";
    document.getElementById("message-modale-parcelle").innerHTML = "";

    document.getElementById("champ-nom-parcelle").value = parcelle.nom || "";
    document.getElementById("champ-reference-parcelle").value = parcelle.reference_cadastrale || "";
    document.getElementById("champ-commune-parcelle").value = parcelle.commune || "";
    document.getElementById("champ-lieu-dit-parcelle").value = parcelle.lieu_dit || "";
    document.getElementById("champ-surface-parcelle").value = parcelle.surface_ha || "";
    document.getElementById("champ-peuplement-parcelle").value = parcelle.type_peuplement || "";
    document.getElementById("champ-date-acquisition-parcelle").value = parcelle.date_acquisition || "";
    document.getElementById("champ-notes-parcelle").value = parcelle.notes || "";

    ouvrirModale("modale-parcelle");
}

async function enregistrerParcelle(evenement) {
    evenement.preventDefault();
    const nom = document.getElementById("champ-nom-parcelle").value.trim();
    if (!nom) {
        document.getElementById("message-modale-parcelle").innerHTML =
            '<div class="message-alerte">Le nom de la parcelle est obligatoire.</div>';
        return;
    }

    const valeurs = {
        nom,
        reference_cadastrale: document.getElementById("champ-reference-parcelle").value.trim() || null,
        commune: document.getElementById("champ-commune-parcelle").value.trim() || null,
        lieu_dit: document.getElementById("champ-lieu-dit-parcelle").value.trim() || null,
        surface_ha: parseFloat(document.getElementById("champ-surface-parcelle").value) || null,
        type_peuplement: document.getElementById("champ-peuplement-parcelle").value.trim() || null,
        date_acquisition: document.getElementById("champ-date-acquisition-parcelle").value || null,
        notes: document.getElementById("champ-notes-parcelle").value.trim() || null,
    };

    if (parcelleEnEditionId) {
        await clientSupabase.from("parcelles").update(valeurs).eq("id", parcelleEnEditionId);
    } else {
        valeurs.contour = contourEnAttenteCreation;
        valeurs.centre = centreEnAttenteCreation;
        await clientSupabase.from("parcelles").insert(valeurs);
    }

    coucheDessinEnCours.clearLayers();
    fermerModale("modale-parcelle");
    await chargerEtAfficherParcelles();
    if (parcelleEnEditionId) selectionnerParcelle(parcelleEnEditionId);
}

// ----------------------------------------------------------------------------
// Modification du contour d'une parcelle déjà tracée
// ----------------------------------------------------------------------------

let polygoneEnEdition = null;
let contourAvantEdition = null;

function demarrerEditionContour() {
    if (!parcelleSelectionneeId || !carteParcelles) {
        alert("Sélectionne d'abord une parcelle, la carte doit être disponible.");
        return;
    }
    const polygone = coucheParcellesExistantes.getLayers().find((l) => l._parcelleId === parcelleSelectionneeId);
    if (!polygone) {
        alert("Cette parcelle n'a pas de contour à modifier. Trace-la à nouveau avec « Tracer une nouvelle parcelle ».");
        return;
    }
    if (polygoneEnEdition) annulerEditionContour();
    polygoneEnEdition = polygone;
    contourAvantEdition = polygone.getLatLngs()[0].map((p) => [p.lat, p.lng]);
    polygone.editing.enable();
    document.getElementById("barre-edition-contour").style.display = "inline";
}

function terminerEditionContour() {
    if (polygoneEnEdition) polygoneEnEdition.editing.disable();
    polygoneEnEdition = null;
    contourAvantEdition = null;
    document.getElementById("barre-edition-contour").style.display = "none";
}

async function validerEditionContour() {
    if (!polygoneEnEdition) return;
    const id = polygoneEnEdition._parcelleId;
    const contour = polygoneEnEdition.getLatLngs()[0].map((p) => [p.lat, p.lng]);
    const centre = polygoneEnEdition.getBounds().getCenter();
    terminerEditionContour();
    await clientSupabase.from("parcelles").update({ contour, centre: { lat: centre.lat, lng: centre.lng } }).eq("id", id);
    await chargerEtAfficherParcelles();
    await selectionnerParcelle(id);
}

function annulerEditionContour() {
    if (!polygoneEnEdition) return;
    polygoneEnEdition.setLatLngs(contourAvantEdition);
    terminerEditionContour();
}

async function supprimerParcelleSelectionnee() {
    if (!parcelleSelectionneeId) return;
    if (!confirm("Supprimer cette parcelle et les essences associées ?")) return;
    await clientSupabase.from("essences_parcelle").delete().eq("parcelle_id", parcelleSelectionneeId);
    await clientSupabase.from("parcelles").delete().eq("id", parcelleSelectionneeId);
    parcelleSelectionneeId = null;
    document.getElementById("panneau-detail").style.display = "none";
    await chargerEtAfficherParcelles();
}

// ----------------------------------------------------------------------------
// Essences
// ----------------------------------------------------------------------------

function ouvrirAjoutEssence() {
    if (!parcelleSelectionneeId) {
        alert("Sélectionne d'abord une parcelle dans la liste.");
        return;
    }
    document.getElementById("formulaire-essence").reset();
    document.getElementById("message-modale-essence").innerHTML = "";
    ouvrirModale("modale-essence");
}

async function enregistrerEssence(evenement) {
    evenement.preventDefault();
    const essence = document.getElementById("champ-nom-essence").value.trim();
    if (!essence) {
        document.getElementById("message-modale-essence").innerHTML =
            '<div class="message-alerte">Le nom de l\'essence est obligatoire.</div>';
        return;
    }

    await clientSupabase.from("essences_parcelle").insert({
        parcelle_id: parcelleSelectionneeId,
        essence,
        surface_ha: parseFloat(document.getElementById("champ-surface-essence").value) || null,
        age_moyen: parseInt(document.getElementById("champ-age-essence").value) || null,
    });

    fermerModale("modale-essence");
    await chargerEssences(parcelleSelectionneeId);
}

async function supprimerEssence(id) {
    if (!confirm("Retirer cette essence de la parcelle ?")) return;
    await clientSupabase.from("essences_parcelle").delete().eq("id", id);
    await chargerEssences(parcelleSelectionneeId);
}
