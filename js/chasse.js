/**
 * Module Gestion de la chasse : chasseurs, plan de chasse, battues
 * (avec carte des parkings) et carnet de prélèvements.
 */

const MODELE_REGLES_SECURITE =
    "- Chaque participant porte un gilet ou une tenue fluorescente visible en permanence.\n"
    + "- Angle de tir à 30° de part et d'autre de la ligne de battue interdit.\n"
    + "- Pas de tir en direction des routes, chemins ouverts au public ou habitations.\n"
    + "- Arme déchargée pendant les déplacements et aux postes avant le lancement.\n"
    + "- Un seul signal de début et de fin de battue, donné par le responsable.\n"
    + "- En cas d'accident, prévenir immédiatement le responsable et les secours (18 ou 112).";

const MODELE_INSTRUCTIONS =
    "- Rendez-vous à l'heure indiquée au lieu de rendez-vous.\n"
    + "- Chacun rejoint son poste indiqué par le responsable avant le lancer des chiens.\n"
    + "- Respecter les consignes de sécurité ci-dessus en toutes circonstances.\n"
    + "- Ne pas quitter son poste avant le signal de fin de battue.";

let chasseursCache = [];
let especesCache = [];
let parcellesPourSelectCache = [];
let battuesCache = [];

let carteBattue = null;
let coucheParkingsBattue = null;
let coucheContourParcelleBattue = null;
let parkingsEnAttente = [];
let battueEnEditionId = null;
let chasseurEnEditionId = null;
let planEnEditionId = null;

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/chasse.html");
    afficherBandeauDemoSiBesoin();

    await chargerChasseurs();
    await chargerEspeces();
    await chargerParcellesPourSelect();
    await chargerPlan();
    await chargerBattues();
    await chargerPrelevements();

    document.getElementById("formulaire-chasseur").addEventListener("submit", enregistrerChasseur);
    document.getElementById("formulaire-plan").addEventListener("submit", enregistrerPlan);
    document.getElementById("formulaire-battue").addEventListener("submit", enregistrerBattue);
    document.getElementById("formulaire-prelevement").addEventListener("submit", enregistrerPrelevement);
    document.getElementById("champ-parcelle-battue").addEventListener("change", afficherContourParcelleBattue);
})();

function onChangementOnglet(idOnglet) {
    if (idOnglet === "onglet-plan") chargerPlan();
    if (idOnglet === "onglet-battues") chargerBattues();
    if (idOnglet === "onglet-prelevements") chargerPrelevements();
}

function nomAffichePersonne(personne) {
    return personne.prenom ? `${personne.prenom} ${personne.nom}` : personne.nom;
}

function saisonCourante() {
    const aujourdhui = new Date();
    const annee = aujourdhui.getFullYear();
    return aujourdhui.getMonth() + 1 >= 7 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}

// ----------------------------------------------------------------------------
// Chasseurs
// ----------------------------------------------------------------------------

async function chargerChasseurs() {
    const { data } = await clientSupabase.from("chasseurs").select().order("nom");
    chasseursCache = data || [];
    remplirTableauChasseurs();
}

function remplirTableauChasseurs() {
    const corps = document.getElementById("corps-tableau-chasseurs");
    if (chasseursCache.length === 0) {
        corps.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888;">Aucun chasseur</td></tr>`;
        return;
    }
    corps.innerHTML = chasseursCache.map((c) => `
        <tr>
            <td data-etiquette="Nom">${echapper(nomAffichePersonne(c))}</td>
            <td data-etiquette="Téléphone">${echapper(c.telephone)}</td>
            <td data-etiquette="Permis">${echapper(c.numero_permis)}</td>
            <td data-etiquette="Assurance">${etatAssuranceChasseur(c)}</td>
            <td data-etiquette="Statut">${c.actif ? "Actif" : "Inactif"}</td>
            <td data-etiquette="">
                <button class="bouton bouton-secondaire" style="padding:4px 8px;" onclick="ouvrirModificationChasseur('${c.id}')">Modifier</button>
                <button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerChasseur('${c.id}')">Supprimer</button>
            </td>
        </tr>
    `).join("");
}

/** Texte HTML de l'état de l'assurance : valide (avec la date), expirée en rouge, ou non renseignée. */
function etatAssuranceChasseur(chasseur) {
    if (!chasseur.assurance_validite) {
        return chasseur.assurance_assureur
            ? `${echapper(chasseur.assurance_assureur)}, validité non renseignée`
            : '<span style="color:#888;">Non renseignée</span>';
    }
    const date = new Date(chasseur.assurance_validite);
    const dateFormatee = date.toLocaleDateString("fr-FR");
    const fin = new Date(date);
    fin.setHours(23, 59, 59, 999);
    const assureur = chasseur.assurance_assureur ? `${echapper(chasseur.assurance_assureur)}, ` : "";
    return fin < new Date()
        ? `<span style="color:#a3442f; font-weight:600;">${assureur}expirée le ${dateFormatee}</span>`
        : `${assureur}jusqu'au ${dateFormatee}`;
}

function ouvrirCreationChasseur() {
    chasseurEnEditionId = null;
    document.getElementById("titre-modale-chasseur").textContent = "Nouveau chasseur";
    document.getElementById("formulaire-chasseur").reset();
    document.getElementById("champ-actif-chasseur").checked = true;
    document.getElementById("message-modale-chasseur").innerHTML = "";
    ouvrirModale("modale-chasseur");
}

function ouvrirModificationChasseur(id) {
    const chasseur = chasseursCache.find((c) => c.id === id);
    if (!chasseur) return;
    chasseurEnEditionId = id;
    document.getElementById("titre-modale-chasseur").textContent = "Modifier le chasseur";
    document.getElementById("message-modale-chasseur").innerHTML = "";
    document.getElementById("champ-nom-chasseur").value = chasseur.nom || "";
    document.getElementById("champ-prenom-chasseur").value = chasseur.prenom || "";
    document.getElementById("champ-telephone-chasseur").value = chasseur.telephone || "";
    document.getElementById("champ-permis-chasseur").value = chasseur.numero_permis || "";
    document.getElementById("champ-adhesion-chasseur").value = chasseur.date_adhesion || "";
    document.getElementById("champ-assureur-chasseur").value = chasseur.assurance_assureur || "";
    document.getElementById("champ-contrat-assurance-chasseur").value = chasseur.assurance_numero_contrat || "";
    document.getElementById("champ-validite-assurance-chasseur").value = chasseur.assurance_validite || "";
    document.getElementById("champ-actif-chasseur").checked = !!chasseur.actif;
    ouvrirModale("modale-chasseur");
}

async function enregistrerChasseur(evenement) {
    evenement.preventDefault();
    const nom = document.getElementById("champ-nom-chasseur").value.trim();
    if (!nom) {
        document.getElementById("message-modale-chasseur").innerHTML = '<div class="message-alerte">Le nom est obligatoire.</div>';
        return;
    }
    const valeurs = {
        nom,
        prenom: document.getElementById("champ-prenom-chasseur").value.trim() || null,
        telephone: document.getElementById("champ-telephone-chasseur").value.trim() || null,
        numero_permis: document.getElementById("champ-permis-chasseur").value.trim() || null,
        date_adhesion: document.getElementById("champ-adhesion-chasseur").value || null,
        assurance_assureur: document.getElementById("champ-assureur-chasseur").value.trim() || null,
        assurance_numero_contrat: document.getElementById("champ-contrat-assurance-chasseur").value.trim() || null,
        assurance_validite: document.getElementById("champ-validite-assurance-chasseur").value || null,
        actif: document.getElementById("champ-actif-chasseur").checked,
    };
    if (chasseurEnEditionId) {
        await clientSupabase.from("chasseurs").update(valeurs).eq("id", chasseurEnEditionId);
    } else {
        await clientSupabase.from("chasseurs").insert(valeurs);
    }
    fermerModale("modale-chasseur");
    await chargerChasseurs();
}

async function supprimerChasseur(id) {
    if (!confirm("Supprimer ce chasseur ?")) return;
    await clientSupabase.from("chasseurs").delete().eq("id", id);
    await chargerChasseurs();
}

// ----------------------------------------------------------------------------
// Espèces + Plan de chasse
// ----------------------------------------------------------------------------

async function chargerEspeces() {
    const { data } = await clientSupabase.from("especes_gibier").select().order("nom");
    especesCache = data || [];
    const options = especesCache.map((e) => `<option value="${e.id}">${echapper(e.nom)}</option>`).join("");
    document.getElementById("champ-espece-plan").innerHTML = options;
    document.getElementById("champ-espece-prelevement").innerHTML = options;
}

async function chargerPlan() {
    const { data: plans } = await clientSupabase.from("plans_chasse").select().order("saison", { ascending: false });
    const { data: prelevements } = await clientSupabase.from("prelevements").select();

    const corps = document.getElementById("corps-tableau-plan");
    if (!plans || plans.length === 0) {
        corps.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">Aucune attribution</td></tr>`;
        return;
    }

    corps.innerHTML = plans.map((plan) => {
        const espece = especesCache.find((e) => e.id === plan.espece_id);
        const realise = (prelevements || []).filter((p) => p.espece_id === plan.espece_id && p.saison === plan.saison).length;
        const depasse = plan.attribution && realise >= plan.attribution;
        return `
            <tr>
                <td data-etiquette="Saison">${echapper(plan.saison)}</td>
                <td data-etiquette="Espèce">${espece ? echapper(espece.nom) : ""}</td>
                <td data-etiquette="Attribution">${plan.attribution}</td>
                <td data-etiquette="Réalisé" style="${depasse ? "color:#a3442f; font-weight:600;" : ""}">${realise} / ${plan.attribution}</td>
                <td data-etiquette="">
                    <button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerPlan('${plan.id}')">Supprimer</button>
                </td>
            </tr>
        `;
    }).join("");
}

function ouvrirCreationPlan() {
    planEnEditionId = null;
    document.getElementById("formulaire-plan").reset();
    document.getElementById("champ-saison-plan").value = saisonCourante();
    document.getElementById("message-modale-plan").innerHTML = "";
    ouvrirModale("modale-plan");
}

async function enregistrerPlan(evenement) {
    evenement.preventDefault();
    const saison = document.getElementById("champ-saison-plan").value.trim();
    if (!saison) {
        document.getElementById("message-modale-plan").innerHTML = '<div class="message-alerte">La saison est obligatoire.</div>';
        return;
    }
    await clientSupabase.from("plans_chasse").insert({
        saison,
        espece_id: document.getElementById("champ-espece-plan").value,
        attribution: parseInt(document.getElementById("champ-attribution-plan").value) || 0,
    });
    fermerModale("modale-plan");
    await chargerPlan();
}

async function supprimerPlan(id) {
    if (!confirm("Supprimer cette attribution ?")) return;
    await clientSupabase.from("plans_chasse").delete().eq("id", id);
    await chargerPlan();
}

// ----------------------------------------------------------------------------
// Parcelles (pour le formulaire battue)
// ----------------------------------------------------------------------------

async function chargerParcellesPourSelect() {
    const { data } = await clientSupabase.from("parcelles").select().order("nom");
    parcellesPourSelectCache = data || [];
    const options = '<option value="">— Non précisé —</option>' +
        parcellesPourSelectCache.map((p) => `<option value="${p.id}">${echapper(p.nom)}</option>`).join("");
    document.getElementById("champ-parcelle-battue").innerHTML = options;

    const optionsResponsable = '<option value="">— Non précisé —</option>' +
        chasseursCache.filter((c) => c.actif).map((c) => `<option value="${c.id}">${echapper(nomAffichePersonne(c))}</option>`).join("");
    document.getElementById("champ-responsable-battue").innerHTML = optionsResponsable;
}

// ----------------------------------------------------------------------------
// Carte des parkings (dans la modale battue)
// ----------------------------------------------------------------------------

function initialiserCarteBattueSiBesoin() {
    if (carteBattue) return;
    carteBattue = L.map("carte-battue").setView([46.6, 2.5], 6);
    const fonds = creerFondsCarteIGN();
    brancherBoutonsFondCarte(carteBattue, fonds, "bouton-fond-plan-battue", "bouton-fond-satellite-battue");
    coucheParkingsBattue = L.featureGroup().addTo(carteBattue);
    coucheContourParcelleBattue = L.featureGroup().addTo(carteBattue);

    carteBattue.on("click", (evenement) => {
        const nom = prompt("Nom de cet emplacement de parking :", `Parking ${parkingsEnAttente.length + 1}`);
        if (!nom) return;
        parkingsEnAttente.push({ nom, lat: evenement.latlng.lat, lng: evenement.latlng.lng });
        redessinerParkings();
    });
}

function redessinerParkings() {
    coucheParkingsBattue.clearLayers();
    parkingsEnAttente.forEach((parking, index) => {
        const marqueur = L.marker([parking.lat, parking.lng]).bindPopup(echapper(parking.nom));
        coucheParkingsBattue.addLayer(marqueur);
    });

    const liste = document.getElementById("liste-parkings");
    if (parkingsEnAttente.length === 0) {
        liste.innerHTML = '<em style="color:#888;">Aucun parking placé. Clique sur la carte pour en ajouter.</em>';
    } else {
        liste.innerHTML = parkingsEnAttente.map((p, i) =>
            `🅿️ ${echapper(p.nom)} <button type="button" class="bouton bouton-danger" style="padding:2px 6px; margin-left:6px;" onclick="retirerParking(${i})">×</button>`
        ).join("<br>");
    }
}

function retirerParking(index) {
    parkingsEnAttente.splice(index, 1);
    redessinerParkings();
}

function afficherContourParcelleBattue() {
    coucheContourParcelleBattue.clearLayers();
    const parcelleId = document.getElementById("champ-parcelle-battue").value;
    const parcelle = parcellesPourSelectCache.find((p) => p.id === parcelleId);
    if (!parcelle || !parcelle.contour) return;
    const polygone = L.polygon(parcelle.contour, { color: "#5a7d4a", weight: 2, fillOpacity: 0.15 });
    coucheContourParcelleBattue.addLayer(polygone);
    carteBattue.fitBounds(polygone.getBounds(), { maxZoom: 15, padding: [20, 20] });
}

// ----------------------------------------------------------------------------
// Battues
// ----------------------------------------------------------------------------

async function chargerBattues() {
    const { data } = await clientSupabase.from("battues").select().order("date_battue", { ascending: false });
    battuesCache = data || [];

    const { data: participants } = await clientSupabase.from("participants_battue").select();
    const { data: traques } = await clientSupabase.from("traques").select();

    const corps = document.getElementById("corps-tableau-battues");
    if (battuesCache.length === 0) {
        corps.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888;">Aucune battue</td></tr>`;
        return;
    }

    corps.innerHTML = battuesCache.map((battue) => {
        const responsable = chasseursCache.find((c) => c.id === battue.responsable_id);
        const nbParticipants = (participants || []).filter((p) => p.battue_id === battue.id).length;
        const nbTraques = (traques || []).filter((t) => t.battue_id === battue.id).length;
        const dateFormatee = new Date(battue.date_battue).toLocaleDateString("fr-FR");
        return `
            <tr>
                <td data-etiquette="Date">${dateFormatee}</td>
                <td data-etiquette="Secteur">${echapper(battue.secteur)}</td>
                <td data-etiquette="Responsable">${responsable ? echapper(nomAffichePersonne(responsable)) : ""}</td>
                <td data-etiquette="Participants">${nbParticipants}</td>
                <td data-etiquette="Traques">${nbTraques}</td>
                <td data-etiquette="">
                    <a class="bouton bouton-principal" style="padding:4px 8px;" href="plan-battue.html?id=${battue.id}">Plan de battue</a>
                    <a class="bouton bouton-secondaire" style="padding:4px 8px;" href="../battue-impression.html?id=${battue.id}" target="_blank">Fiche à imprimer</a>
                    <button class="bouton bouton-secondaire" style="padding:4px 8px;" onclick="ouvrirModificationBattue('${battue.id}')">Modifier</button>
                    <button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerBattue('${battue.id}')">Supprimer</button>
                </td>
            </tr>
        `;
    }).join("");

    remplirListeParticipantsCochables([]);
}

function remplirListeParticipantsCochables(idsCoches) {
    const zone = document.getElementById("liste-participants-cochables");
    const actifs = chasseursCache.filter((c) => c.actif);
    if (actifs.length === 0) {
        zone.innerHTML = '<em style="color:#888;">Aucun chasseur actif. Ajoute des chasseurs dans l\'onglet précédent.</em>';
        return;
    }
    zone.innerHTML = actifs.map((c) => `
        <label style="display:block; padding:3px 0;">
            <input type="checkbox" value="${c.id}" class="case-participant" ${idsCoches.includes(c.id) ? "checked" : ""}>
            ${echapper(nomAffichePersonne(c))}
        </label>
    `).join("");
}

function ouvrirCreationBattue() {
    battueEnEditionId = null;
    document.getElementById("titre-modale-battue").textContent = "Nouvelle battue";
    document.getElementById("formulaire-battue").reset();
    document.getElementById("message-modale-battue").innerHTML = "";
    document.getElementById("champ-securite-battue").value = MODELE_REGLES_SECURITE;
    document.getElementById("champ-instructions-battue").value = MODELE_INSTRUCTIONS;
    parkingsEnAttente = [];
    remplirListeParticipantsCochables([]);

    ouvrirModale("modale-battue");
    try {
        initialiserCarteBattueSiBesoin();
        setTimeout(() => { carteBattue.invalidateSize(); redessinerParkings(); }, 150);
    } catch (erreur) {
        console.error("Carte indisponible :", erreur);
        document.getElementById("carte-battue").innerHTML =
            '<div class="message-alerte" style="margin:0;">Carte indisponible (connexion internet nécessaire). Les parkings déjà enregistrés sont conservés.</div>';
    }
}

async function ouvrirModificationBattue(id) {
    const battue = battuesCache.find((b) => b.id === id);
    if (!battue) return;
    battueEnEditionId = id;

    document.getElementById("titre-modale-battue").textContent = "Modifier la battue";
    document.getElementById("message-modale-battue").innerHTML = "";
    document.getElementById("champ-date-battue").value = battue.date_battue || "";
    document.getElementById("champ-secteur-battue").value = battue.secteur || "";
    document.getElementById("champ-parcelle-battue").value = battue.parcelle_id || "";
    document.getElementById("champ-responsable-battue").value = battue.responsable_id || "";
    document.getElementById("champ-lieu-rdv-battue").value = battue.lieu_rdv || "";
    document.getElementById("champ-heure-rdv-battue").value = battue.heure_rdv || "";
    document.getElementById("champ-securite-battue").value = battue.regles_securite || MODELE_REGLES_SECURITE;
    document.getElementById("champ-instructions-battue").value = battue.instructions || MODELE_INSTRUCTIONS;
    document.getElementById("champ-notes-battue").value = battue.notes || "";

    parkingsEnAttente = battue.parkings ? [...battue.parkings] : [];

    const { data: participants } = await clientSupabase.from("participants_battue").select().eq("battue_id", id);
    remplirListeParticipantsCochables((participants || []).map((p) => p.chasseur_id));

    ouvrirModale("modale-battue");
    try {
        initialiserCarteBattueSiBesoin();
        setTimeout(() => {
            carteBattue.invalidateSize();
            redessinerParkings();
            afficherContourParcelleBattue();
        }, 150);
    } catch (erreur) {
        console.error("Carte indisponible :", erreur);
        document.getElementById("carte-battue").innerHTML =
            '<div class="message-alerte" style="margin:0;">Carte indisponible (connexion internet nécessaire). Les parkings déjà enregistrés sont conservés.</div>';
    }
}

async function enregistrerBattue(evenement) {
    evenement.preventDefault();
    const date = document.getElementById("champ-date-battue").value;
    if (!date) {
        document.getElementById("message-modale-battue").innerHTML = '<div class="message-alerte">La date est obligatoire.</div>';
        return;
    }

    const valeurs = {
        date_battue: date,
        secteur: document.getElementById("champ-secteur-battue").value.trim() || null,
        parcelle_id: document.getElementById("champ-parcelle-battue").value || null,
        responsable_id: document.getElementById("champ-responsable-battue").value || null,
        lieu_rdv: document.getElementById("champ-lieu-rdv-battue").value.trim() || null,
        heure_rdv: document.getElementById("champ-heure-rdv-battue").value || null,
        parkings: parkingsEnAttente,
        regles_securite: document.getElementById("champ-securite-battue").value.trim() || null,
        instructions: document.getElementById("champ-instructions-battue").value.trim() || null,
        notes: document.getElementById("champ-notes-battue").value.trim() || null,
    };

    const idsParticipants = Array.from(document.querySelectorAll(".case-participant:checked")).map((c) => c.value);

    let idBattue = battueEnEditionId;
    if (idBattue) {
        await clientSupabase.from("battues").update(valeurs).eq("id", idBattue);
        await clientSupabase.from("participants_battue").delete().eq("battue_id", idBattue);
    } else {
        const { data } = await clientSupabase.from("battues").insert(valeurs).select().single();
        idBattue = data.id;
    }

    if (idsParticipants.length > 0) {
        await clientSupabase.from("participants_battue").insert(
            idsParticipants.map((chasseurId) => ({ battue_id: idBattue, chasseur_id: chasseurId }))
        );
    }

    fermerModale("modale-battue");
    await chargerBattues();
}

async function supprimerBattue(id) {
    if (!confirm("Supprimer cette battue, ses traques et ses participants ?")) return;
    const { data: traques } = await clientSupabase.from("traques").select().eq("battue_id", id);
    for (const traque of traques || []) {
        await clientSupabase.from("postes_traque").delete().eq("traque_id", traque.id);
    }
    await clientSupabase.from("prelevements").update({ traque_id: null }).eq("battue_id", id);
    await clientSupabase.from("traques").delete().eq("battue_id", id);
    await clientSupabase.from("participants_battue").delete().eq("battue_id", id);
    await clientSupabase.from("prelevements").update({ battue_id: null }).eq("battue_id", id);
    await clientSupabase.from("battues").delete().eq("id", id);
    await chargerBattues();
}

// ----------------------------------------------------------------------------
// Prélèvements
// ----------------------------------------------------------------------------

async function chargerPrelevements() {
    const { data } = await clientSupabase.from("prelevements").select().order("date_prelevement", { ascending: false });
    const prelevements = data || [];

    const corps = document.getElementById("corps-tableau-prelevements");
    if (prelevements.length === 0) {
        corps.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">Aucun prélèvement</td></tr>`;
        return;
    }

    corps.innerHTML = prelevements.map((p) => {
        const espece = especesCache.find((e) => e.id === p.espece_id);
        const chasseur = chasseursCache.find((c) => c.id === p.chasseur_id);
        return `
            <tr>
                <td data-etiquette="Date">${new Date(p.date_prelevement).toLocaleDateString("fr-FR")}</td>
                <td data-etiquette="Espèce">${espece ? echapper(espece.nom) : ""}</td>
                <td data-etiquette="Chasseur">${chasseur ? echapper(nomAffichePersonne(chasseur)) : ""}</td>
                <td data-etiquette="Sexe">${echapper(p.sexe)}</td>
                <td data-etiquette="Poids">${p.poids_kg ? p.poids_kg.toFixed(1) + " kg" : ""}</td>
            </tr>
        `;
    }).join("");
}

function ouvrirCreationPrelevement() {
    document.getElementById("formulaire-prelevement").reset();
    document.getElementById("champ-saison-prelevement").value = saisonCourante();
    document.getElementById("message-modale-prelevement").innerHTML = "";

    const optionsChasseurs = '<option value="">— Non précisé —</option>' +
        chasseursCache.map((c) => `<option value="${c.id}">${echapper(nomAffichePersonne(c))}</option>`).join("");
    document.getElementById("champ-chasseur-prelevement").innerHTML = optionsChasseurs;

    const optionsBattues = '<option value="">— Hors battue —</option>' +
        battuesCache.map((b) => `<option value="${b.id}">${new Date(b.date_battue).toLocaleDateString("fr-FR")}${b.secteur ? " — " + echapper(b.secteur) : ""}</option>`).join("");
    document.getElementById("champ-battue-prelevement").innerHTML = optionsBattues;

    ouvrirModale("modale-prelevement");
}

async function enregistrerPrelevement(evenement) {
    evenement.preventDefault();
    const saison = document.getElementById("champ-saison-prelevement").value.trim();
    const date = document.getElementById("champ-date-prelevement").value;
    if (!saison || !date) {
        document.getElementById("message-modale-prelevement").innerHTML = '<div class="message-alerte">La date et la saison sont obligatoires.</div>';
        return;
    }
    await clientSupabase.from("prelevements").insert({
        date_prelevement: date,
        saison,
        espece_id: document.getElementById("champ-espece-prelevement").value,
        chasseur_id: document.getElementById("champ-chasseur-prelevement").value || null,
        battue_id: document.getElementById("champ-battue-prelevement").value || null,
        sexe: document.getElementById("champ-sexe-prelevement").value,
        poids_kg: parseFloat(document.getElementById("champ-poids-prelevement").value) || null,
    });
    fermerModale("modale-prelevement");
    await chargerPrelevements();
    await chargerPlan();
}
