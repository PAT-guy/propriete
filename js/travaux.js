/**
 * Module Travaux forestiers : chantiers (avec carte des points à signaler)
 * et prestataires.
 */

let prestatairesCache = [];
let parcellesPourChantierCache = [];
let chantiersCache = [];

let carteChantier = null;
let couchePointsChantier = null;
let coucheContourParcelleChantier = null;
let pointsInteretEnAttente = [];
let chantierEnEditionId = null;
let prestataireEnEditionId = null;

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/travaux.html");
    afficherBandeauDemoSiBesoin();

    await chargerPrestataires();
    await chargerParcellesPourChantier();
    await chargerChantiers();

    document.getElementById("formulaire-chantier").addEventListener("submit", enregistrerChantier);
    document.getElementById("formulaire-prestataire").addEventListener("submit", enregistrerPrestataire);
    document.getElementById("champ-filtre-statut").addEventListener("change", chargerChantiers);
    document.getElementById("champ-parcelle-chantier").addEventListener("change", afficherContourParcelleChantier);
})();

function onChangementOnglet(idOnglet) {
    if (idOnglet === "onglet-prestataires") chargerPrestataires();
    if (idOnglet === "onglet-chantiers") chargerChantiers();
}

// ----------------------------------------------------------------------------
// Prestataires
// ----------------------------------------------------------------------------

async function chargerPrestataires() {
    const { data } = await clientSupabase.from("prestataires").select().order("nom");
    prestatairesCache = data || [];
    remplirTableauPrestataires();
    remplirSelectionPrestataires();
}

function remplirTableauPrestataires() {
    const corps = document.getElementById("corps-tableau-prestataires");
    if (prestatairesCache.length === 0) {
        corps.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">Aucun prestataire</td></tr>`;
        return;
    }
    corps.innerHTML = prestatairesCache.map((p) => `
        <tr>
            <td data-etiquette="Nom">${p.nom}</td>
            <td data-etiquette="Spécialité">${p.specialite || ""}</td>
            <td data-etiquette="Contact">${p.contact || ""}</td>
            <td data-etiquette="Téléphone">${p.telephone || ""}</td>
            <td data-etiquette="">
                <button class="bouton bouton-secondaire" style="padding:4px 8px;" onclick="ouvrirModificationPrestataire('${p.id}')">Modifier</button>
                <button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerPrestataire('${p.id}')">Supprimer</button>
            </td>
        </tr>
    `).join("");
}

function remplirSelectionPrestataires() {
    document.getElementById("champ-prestataire-chantier").innerHTML =
        '<option value="">— Non précisé —</option>' +
        prestatairesCache.map((p) => `<option value="${p.id}">${p.nom}</option>`).join("");
}

function ouvrirCreationPrestataire() {
    prestataireEnEditionId = null;
    document.getElementById("titre-modale-prestataire").textContent = "Nouveau prestataire";
    document.getElementById("formulaire-prestataire").reset();
    document.getElementById("message-modale-prestataire").innerHTML = "";
    ouvrirModale("modale-prestataire");
}

function ouvrirModificationPrestataire(id) {
    const prestataire = prestatairesCache.find((p) => p.id === id);
    if (!prestataire) return;
    prestataireEnEditionId = id;
    document.getElementById("titre-modale-prestataire").textContent = "Modifier le prestataire";
    document.getElementById("message-modale-prestataire").innerHTML = "";
    document.getElementById("champ-nom-prestataire").value = prestataire.nom || "";
    document.getElementById("champ-specialite-prestataire").value = prestataire.specialite || "";
    document.getElementById("champ-contact-prestataire").value = prestataire.contact || "";
    document.getElementById("champ-telephone-prestataire").value = prestataire.telephone || "";
    ouvrirModale("modale-prestataire");
}

async function enregistrerPrestataire(evenement) {
    evenement.preventDefault();
    const nom = document.getElementById("champ-nom-prestataire").value.trim();
    if (!nom) {
        document.getElementById("message-modale-prestataire").innerHTML = '<div class="message-alerte">Le nom est obligatoire.</div>';
        return;
    }
    const valeurs = {
        nom,
        specialite: document.getElementById("champ-specialite-prestataire").value.trim() || null,
        contact: document.getElementById("champ-contact-prestataire").value.trim() || null,
        telephone: document.getElementById("champ-telephone-prestataire").value.trim() || null,
    };
    if (prestataireEnEditionId) {
        await clientSupabase.from("prestataires").update(valeurs).eq("id", prestataireEnEditionId);
    } else {
        await clientSupabase.from("prestataires").insert(valeurs);
    }
    fermerModale("modale-prestataire");
    await chargerPrestataires();
}

async function supprimerPrestataire(id) {
    if (!confirm("Supprimer ce prestataire ?")) return;
    await clientSupabase.from("prestataires").delete().eq("id", id);
    await chargerPrestataires();
}

// ----------------------------------------------------------------------------
// Parcelles (pour le formulaire chantier) + carte des points à signaler
// ----------------------------------------------------------------------------

async function chargerParcellesPourChantier() {
    const { data } = await clientSupabase.from("parcelles").select().order("nom");
    parcellesPourChantierCache = data || [];
    document.getElementById("champ-parcelle-chantier").innerHTML =
        '<option value="">— Non précisé —</option>' +
        parcellesPourChantierCache.map((p) => `<option value="${p.id}">${p.nom}</option>`).join("");
}

function initialiserCarteChantierSiBesoin() {
    if (carteChantier) return;
    carteChantier = L.map("carte-chantier").setView([46.6, 2.5], 6);
    const fonds = creerFondsCarteIGN();
    brancherBoutonsFondCarte(carteChantier, fonds, "bouton-fond-plan-chantier", "bouton-fond-satellite-chantier");
    couchePointsChantier = L.featureGroup().addTo(carteChantier);
    coucheContourParcelleChantier = L.featureGroup().addTo(carteChantier);

    carteChantier.on("click", (evenement) => {
        const nom = prompt("Que signale ce point ? (ex : accès engins, dépôt de grumes)", "Accès engins");
        if (!nom) return;
        pointsInteretEnAttente.push({ nom, lat: evenement.latlng.lat, lng: evenement.latlng.lng });
        redessinerPointsInteret();
    });
}

function redessinerPointsInteret() {
    couchePointsChantier.clearLayers();
    pointsInteretEnAttente.forEach((point) => {
        couchePointsChantier.addLayer(L.marker([point.lat, point.lng]).bindPopup(point.nom));
    });
    const liste = document.getElementById("liste-points-interet");
    if (pointsInteretEnAttente.length === 0) {
        liste.innerHTML = '<em style="color:#888;">Aucun point placé. Clique sur la carte pour en ajouter.</em>';
    } else {
        liste.innerHTML = pointsInteretEnAttente.map((p, i) =>
            `📍 ${p.nom} <button type="button" class="bouton bouton-danger" style="padding:2px 6px; margin-left:6px;" onclick="retirerPointInteret(${i})">×</button>`
        ).join("<br>");
    }
}

function retirerPointInteret(index) {
    pointsInteretEnAttente.splice(index, 1);
    redessinerPointsInteret();
}

function afficherContourParcelleChantier() {
    coucheContourParcelleChantier.clearLayers();
    const parcelle = parcellesPourChantierCache.find((p) => p.id === document.getElementById("champ-parcelle-chantier").value);
    if (!parcelle || !parcelle.contour) return;
    const polygone = L.polygon(parcelle.contour, { color: "#5a7d4a", weight: 2, fillOpacity: 0.15 });
    coucheContourParcelleChantier.addLayer(polygone);
    carteChantier.fitBounds(polygone.getBounds(), { maxZoom: 15, padding: [20, 20] });
}

// ----------------------------------------------------------------------------
// Chantiers
// ----------------------------------------------------------------------------

async function chargerChantiers() {
    let requete = clientSupabase.from("chantiers").select().order("date_debut", { ascending: false });
    const statutFiltre = document.getElementById("champ-filtre-statut").value;
    if (statutFiltre) requete = requete.eq("statut", statutFiltre);
    const { data } = await requete;
    chantiersCache = data || [];

    const corps = document.getElementById("corps-tableau-chantiers");
    if (chantiersCache.length === 0) {
        corps.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#888;">Aucun chantier</td></tr>`;
        return;
    }

    corps.innerHTML = chantiersCache.map((chantier) => {
        const parcelle = parcellesPourChantierCache.find((p) => p.id === chantier.parcelle_id);
        const debut = chantier.date_debut ? new Date(chantier.date_debut).toLocaleDateString("fr-FR") : "";
        const cout = chantier.cout_reel ? chantier.cout_reel.toFixed(2) + " €" : "";
        return `
            <tr>
                <td data-etiquette="Titre"><strong>${chantier.titre}</strong></td>
                <td data-etiquette="Type">${chantier.type_travaux}</td>
                <td data-etiquette="Statut">${chantier.statut}</td>
                <td data-etiquette="Parcelle">${parcelle ? parcelle.nom : ""}</td>
                <td data-etiquette="Début">${debut}</td>
                <td data-etiquette="Coût">${cout}</td>
                <td data-etiquette="">
                    <a class="bouton bouton-secondaire" style="padding:4px 8px;" href="../chantier-impression.html?id=${chantier.id}" target="_blank">Carte à imprimer</a>
                    <button class="bouton bouton-secondaire" style="padding:4px 8px;" onclick="ouvrirModificationChantier('${chantier.id}')">Modifier</button>
                    <button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerChantier('${chantier.id}')">Supprimer</button>
                </td>
            </tr>
        `;
    }).join("");
}

function ouvrirCreationChantier() {
    chantierEnEditionId = null;
    document.getElementById("titre-modale-chantier").textContent = "Nouveau chantier";
    document.getElementById("formulaire-chantier").reset();
    document.getElementById("message-modale-chantier").innerHTML = "";
    pointsInteretEnAttente = [];

    ouvrirModale("modale-chantier");
    try {
        initialiserCarteChantierSiBesoin();
        setTimeout(() => { carteChantier.invalidateSize(); redessinerPointsInteret(); }, 150);
    } catch (erreur) {
        console.error("Carte indisponible :", erreur);
        document.getElementById("carte-chantier").innerHTML =
            '<div class="message-alerte" style="margin:0;">Carte indisponible (connexion internet nécessaire). Les points déjà enregistrés sont conservés.</div>';
    }
}

function ouvrirModificationChantier(id) {
    const chantier = chantiersCache.find((c) => c.id === id);
    if (!chantier) return;
    chantierEnEditionId = id;

    document.getElementById("titre-modale-chantier").textContent = "Modifier le chantier";
    document.getElementById("message-modale-chantier").innerHTML = "";
    document.getElementById("champ-titre-chantier").value = chantier.titre || "";
    document.getElementById("champ-type-chantier").value = chantier.type_travaux || "Coupe";
    document.getElementById("champ-statut-chantier").value = chantier.statut || "Planifié";
    document.getElementById("champ-parcelle-chantier").value = chantier.parcelle_id || "";
    document.getElementById("champ-prestataire-chantier").value = chantier.prestataire_id || "";
    document.getElementById("champ-date-debut-chantier").value = chantier.date_debut || "";
    document.getElementById("champ-date-fin-chantier").value = chantier.date_fin_prevue || "";
    document.getElementById("champ-cout-estime-chantier").value = chantier.cout_estime || "";
    document.getElementById("champ-cout-reel-chantier").value = chantier.cout_reel || "";
    document.getElementById("champ-description-chantier").value = chantier.description || "";

    pointsInteretEnAttente = chantier.points_interet ? [...chantier.points_interet] : [];

    ouvrirModale("modale-chantier");
    try {
        initialiserCarteChantierSiBesoin();
        setTimeout(() => {
            carteChantier.invalidateSize();
            redessinerPointsInteret();
            afficherContourParcelleChantier();
        }, 150);
    } catch (erreur) {
        console.error("Carte indisponible :", erreur);
        document.getElementById("carte-chantier").innerHTML =
            '<div class="message-alerte" style="margin:0;">Carte indisponible (connexion internet nécessaire). Les points déjà enregistrés sont conservés.</div>';
    }
}

async function enregistrerChantier(evenement) {
    evenement.preventDefault();
    const titre = document.getElementById("champ-titre-chantier").value.trim();
    if (!titre) {
        document.getElementById("message-modale-chantier").innerHTML = '<div class="message-alerte">Le titre est obligatoire.</div>';
        return;
    }

    const statut = document.getElementById("champ-statut-chantier").value;
    const valeurs = {
        titre,
        type_travaux: document.getElementById("champ-type-chantier").value,
        statut,
        parcelle_id: document.getElementById("champ-parcelle-chantier").value || null,
        prestataire_id: document.getElementById("champ-prestataire-chantier").value || null,
        date_debut: document.getElementById("champ-date-debut-chantier").value || null,
        date_fin_prevue: document.getElementById("champ-date-fin-chantier").value || null,
        cout_estime: parseFloat(document.getElementById("champ-cout-estime-chantier").value) || null,
        cout_reel: parseFloat(document.getElementById("champ-cout-reel-chantier").value) || null,
        description: document.getElementById("champ-description-chantier").value.trim() || null,
        points_interet: pointsInteretEnAttente,
    };
    if (statut === "Terminé") valeurs.date_fin_reelle = new Date().toISOString().slice(0, 10);

    if (chantierEnEditionId) {
        await clientSupabase.from("chantiers").update(valeurs).eq("id", chantierEnEditionId);
    } else {
        await clientSupabase.from("chantiers").insert(valeurs);
    }

    fermerModale("modale-chantier");
    await chargerChantiers();
}

async function supprimerChantier(id) {
    if (!confirm("Supprimer ce chantier ?")) return;
    await clientSupabase.from("chantiers").delete().eq("id", id);
    await chargerChantiers();
}
