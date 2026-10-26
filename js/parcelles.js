/**
 * Module Cadastre des parcelles : carte interactive (tracé des contours),
 * liste, fiche détaillée, essences, propriétaires.
 */

let carteParcelles;
let coucheParcellesExistantes;
let coucheDessinEnCours;
let controleDessin;
let parcelleSelectionneeId = null;
let proprietairesCache = [];
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
    await chargerProprietaires();
    await chargerEtAfficherParcelles();

    document.getElementById("champ-recherche").addEventListener("input", filtrerTableauParcelles);
    document.getElementById("bouton-dessiner").addEventListener("click", activerModeDessin);
    document.getElementById("formulaire-parcelle").addEventListener("submit", enregistrerParcelle);
    document.getElementById("formulaire-essence").addEventListener("submit", enregistrerEssence);
    document.getElementById("bouton-ajouter-essence").addEventListener("click", ouvrirAjoutEssence);
    document.getElementById("bouton-modifier-parcelle").addEventListener("click", ouvrirModificationParcelle);
    document.getElementById("bouton-supprimer-parcelle").addEventListener("click", supprimerParcelleSelectionnee);
    document.getElementById("bouton-proprietaires").addEventListener("click", ouvrirGestionProprietaires);
    document.getElementById("bouton-ajouter-proprietaire").addEventListener("click", ajouterProprietaireRapide);
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

async function chargerProprietaires() {
    const { data } = await clientSupabase.from("proprietaires").select().order("nom");
    proprietairesCache = data || [];
    remplirSelectionProprietaires();
}

function remplirSelectionProprietaires() {
    const select = document.getElementById("champ-proprietaire-parcelle");
    select.innerHTML = '<option value="">— Non renseigné —</option>' +
        proprietairesCache.map((p) => `<option value="${p.id}">${echapper(nomAffichePersonne(p))}</option>`).join("");
}

function nomAffichePersonne(personne) {
    return personne.prenom ? `${personne.prenom} ${personne.nom}` : personne.nom;
}

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
        corps.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">Aucune parcelle</td></tr>`;
        return;
    }

    corps.innerHTML = visibles.map((p) => {
        const proprietaire = proprietairesCache.find((pr) => pr.id === p.proprietaire_id);
        return `
            <tr style="cursor:pointer;" onclick="selectionnerParcelle('${p.id}')">
                <td data-etiquette="Nom"><strong>${echapper(p.nom)}</strong></td>
                <td data-etiquette="Commune">${echapper(p.commune)}</td>
                <td data-etiquette="Surface">${p.surface_ha ? p.surface_ha.toFixed(2) + " ha" : ""}</td>
                <td data-etiquette="Propriétaire">${proprietaire ? echapper(nomAffichePersonne(proprietaire)) : ""}</td>
                <td data-etiquette=""></td>
            </tr>
        `;
    }).join("");
}

// ----------------------------------------------------------------------------
// Sélection et détail
// ----------------------------------------------------------------------------

async function selectionnerParcelle(id) {
    parcelleSelectionneeId = id;
    const parcelle = toutesLesParcelles.find((p) => p.id === id);
    if (!parcelle) return;

    document.getElementById("panneau-detail").style.display = "block";
    document.getElementById("titre-detail").textContent = parcelle.nom;

    const proprietaire = proprietairesCache.find((pr) => pr.id === parcelle.proprietaire_id);
    const lignes = [];
    if (parcelle.reference_cadastrale) lignes.push(`Référence : ${echapper(parcelle.reference_cadastrale)}`);
    if (parcelle.commune) lignes.push(`Localisation : ${echapper(parcelle.commune)}${parcelle.lieu_dit ? " — " + parcelle.lieu_dit : ""}`);
    if (parcelle.surface_ha) lignes.push(`Surface : ${parcelle.surface_ha.toFixed(2)} ha`);
    if (parcelle.type_peuplement) lignes.push(`Peuplement : ${echapper(parcelle.type_peuplement)}`);
    if (proprietaire) lignes.push(`Propriétaire : ${echapper(nomAffichePersonne(proprietaire))}`);
    if (parcelle.notes) lignes.push(`Notes : ${echapper(parcelle.notes)}`);
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
    document.getElementById("champ-proprietaire-parcelle").value = parcelle.proprietaire_id || "";
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
        proprietaire_id: document.getElementById("champ-proprietaire-parcelle").value || null,
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

// ----------------------------------------------------------------------------
// Propriétaires
// ----------------------------------------------------------------------------

function ouvrirGestionProprietaires() {
    remplirTableauProprietaires();
    document.getElementById("champ-nom-proprietaire").value = "";
    document.getElementById("champ-prenom-proprietaire").value = "";
    document.getElementById("champ-telephone-proprietaire").value = "";
    ouvrirModale("modale-proprietaires");
}

function remplirTableauProprietaires() {
    const corps = document.getElementById("corps-tableau-proprietaires");
    if (proprietairesCache.length === 0) {
        corps.innerHTML = `<tr><td style="text-align:center; color:#888;">Aucun propriétaire</td></tr>`;
        return;
    }
    corps.innerHTML = proprietairesCache.map((p) => `
        <tr>
            <td>${echapper(nomAffichePersonne(p))}</td>
            <td style="text-align:right;"><button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerProprietaire('${p.id}')">Supprimer</button></td>
        </tr>
    `).join("");
}

async function ajouterProprietaireRapide() {
    const nom = document.getElementById("champ-nom-proprietaire").value.trim();
    if (!nom) {
        alert("Le nom est obligatoire.");
        return;
    }
    await clientSupabase.from("proprietaires").insert({
        nom,
        prenom: document.getElementById("champ-prenom-proprietaire").value.trim() || null,
        telephone: document.getElementById("champ-telephone-proprietaire").value.trim() || null,
    });
    await chargerProprietaires();
    remplirTableauProprietaires();
    document.getElementById("champ-nom-proprietaire").value = "";
    document.getElementById("champ-prenom-proprietaire").value = "";
    document.getElementById("champ-telephone-proprietaire").value = "";
}

async function supprimerProprietaire(id) {
    if (!confirm("Supprimer ce propriétaire ? Les parcelles liées resteront, sans propriétaire renseigné.")) return;
    await clientSupabase.from("proprietaires").delete().eq("id", id);
    await chargerProprietaires();
    remplirTableauProprietaires();
    await chargerEtAfficherParcelles();
}
