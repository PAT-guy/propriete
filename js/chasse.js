/**
 * Module Gestion de la chasse : chasseurs, plan de chasse et carnet de prélèvements.
 * Les battues ont leur propre page (battues.js).
 */

let chasseursCache = [];
let especesCache = [];
let battuesCache = [];

let chasseurEnEditionId = null;
let planEnEditionId = null;

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/chasse.html");
    afficherBandeauDemoSiBesoin();

    await chargerChasseurs();
    await chargerCategories();
    await chargerEspeces();
    await chargerPlan();
    await chargerBattuesPourSelect();
    await chargerPrelevements();

    document.getElementById("formulaire-chasseur").addEventListener("submit", enregistrerChasseur);
    document.getElementById("formulaire-plan").addEventListener("submit", enregistrerPlan);
    document.getElementById("formulaire-prelevement").addEventListener("submit", enregistrerPrelevement);
})();

function onChangementOnglet(idOnglet) {
    if (idOnglet === "onglet-plan") chargerPlan();
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
    // Les anciennes espèces ne servent plus qu'à nommer les lignes saisies avant les catégories.
    const { data } = await clientSupabase.from("especes_gibier").select().order("nom");
    especesCache = data || [];
    remplirSelectsGibier();
}

function remplirSelectsGibier() {
    const options = optionsCategories();
    document.getElementById("champ-espece-plan").innerHTML = options;
    document.getElementById("champ-espece-prelevement").innerHTML = options;
}

/** Après la gestion du gibier : met à jour les listes et les tableaux. */
async function rechargerGibier() {
    remplirSelectsGibier();
    await chargerPlan();
    await chargerPrelevements();
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
        const realise = (prelevements || []).filter((p) => prelevementCompte(p, plan)).length;
        const depasse = plan.attribution && realise >= plan.attribution;
        return `
            <tr>
                <td data-etiquette="Saison">${echapper(plan.saison)}</td>
                <td data-etiquette="Gibier">${echapper(nomGibierDe(plan, categoriesCache, especesCache))}</td>
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
        categorie_id: document.getElementById("champ-espece-plan").value || null,
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

async function chargerBattuesPourSelect() {
    const { data } = await clientSupabase.from("battues").select();
    battuesCache = (data || [])
        .filter((b) => !b.est_modele && b.date_battue)
        .sort((a, b) => b.date_battue.localeCompare(a.date_battue));
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
        const chasseur = chasseursCache.find((c) => c.id === p.chasseur_id);
        return `
            <tr>
                <td data-etiquette="Date">${new Date(p.date_prelevement).toLocaleDateString("fr-FR")}</td>
                <td data-etiquette="Gibier">${echapper(nomGibierDe(p, categoriesCache, especesCache))}</td>
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
        battuesCache.map((b) => `<option value="${b.id}">${new Date(b.date_battue + "T00:00:00").toLocaleDateString("fr-FR")}${b.secteur ? " — " + echapper(b.secteur) : ""}</option>`).join("");
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
        categorie_id: document.getElementById("champ-espece-prelevement").value || null,
        chasseur_id: document.getElementById("champ-chasseur-prelevement").value || null,
        battue_id: document.getElementById("champ-battue-prelevement").value || null,
        sexe: document.getElementById("champ-sexe-prelevement").value,
        poids_kg: parseFloat(document.getElementById("champ-poids-prelevement").value) || null,
    });
    fermerModale("modale-prelevement");
    await chargerPrelevements();
    await chargerPlan();
}
