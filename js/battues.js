/**
 * Page d'accueil : les battues. Prochaine battue, modèles de battue
 * (traques et postes prédéfinis), battues à venir et passées.
 *
 * Un modèle est une ligne de la table battues avec est_modele = true et sans date.
 * Créer une battue depuis un modèle recopie la battue, ses traques et leurs postes.
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
let parcellesCache = [];
let battuesCache = [];
let modelesCache = [];
let participantsCache = [];
let traquesCache = [];
let postesTraqueCache = [];

let battueEnEditionId = null;
let editionEstModele = false;

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/battues.html");
    afficherBandeauDemoSiBesoin();

    document.getElementById("formulaire-battue").addEventListener("submit", enregistrerBattue);
    document.getElementById("formulaire-nouvelle").addEventListener("submit", creerBattueDepuisFormulaire);
    afficherRappelSauvegarde();
    await chargerTout();
})();

/** Rappelle de télécharger une sauvegarde si la dernière date de plus de 30 jours (ou n'existe pas). */
function afficherRappelSauvegarde() {
    let derniere = null;
    try { derniere = localStorage.getItem("foret_derniere_sauvegarde"); } catch (e) { /* stockage indisponible */ }
    const jours = derniere ? (Date.now() - new Date(derniere).getTime()) / 86400000 : Infinity;
    if (jours < 30) return;
    document.getElementById("zone-prochaine").insertAdjacentHTML("beforebegin", `
        <div class="carte sans-impression" style="background:#fff8e1; border-color:#f0e0a8; font-size:13px; margin-bottom:12px;">
            ${derniere ? `Dernière sauvegarde il y a ${Math.floor(jours)} jours.` : "Aucune sauvegarde téléchargée depuis cet appareil."}
            <a href="sauvegarde.html"><strong>Télécharger une sauvegarde</strong></a> pour ne rien perdre.
        </div>`);
}

function nomAffichePersonne(personne) {
    return personne.prenom ? `${personne.prenom} ${personne.nom}` : personne.nom;
}

function dateLocaleISO(date) {
    const mois = String(date.getMonth() + 1).padStart(2, "0");
    const jour = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${mois}-${jour}`;
}

function formaterDate(dateISO, longue) {
    if (!dateISO) return "";
    const [a, m, j] = dateISO.split("-").map(Number);
    return new Date(a, m - 1, j).toLocaleDateString("fr-FR", longue
        ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
        : { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ----------------------------------------------------------------------------
// Chargement et affichage
// ----------------------------------------------------------------------------

async function chargerTout() {
    await chargerCategories();
    const [battues, chasseurs, parcelles, participants, traques, postes] = await Promise.all([
        clientSupabase.from("battues").select(),
        clientSupabase.from("chasseurs").select().order("nom"),
        clientSupabase.from("parcelles").select().order("nom"),
        clientSupabase.from("participants_battue").select(),
        clientSupabase.from("traques").select(),
        clientSupabase.from("postes_traque").select(),
    ]);
    const toutes = battues.data || [];
    modelesCache = toutes.filter((b) => b.est_modele).sort((a, b) => (a.nom_modele || "").localeCompare(b.nom_modele || "", "fr"));
    battuesCache = toutes.filter((b) => !b.est_modele);
    chasseursCache = chasseurs.data || [];
    parcellesCache = parcelles.data || [];
    participantsCache = participants.data || [];
    traquesCache = traques.data || [];
    postesTraqueCache = postes.data || [];

    afficherProchaine();
    afficherModeles();
    afficherListes();
}

function nbTraquesDe(idBattue) {
    return traquesCache.filter((t) => t.battue_id === idBattue).length;
}

function nbPostesDe(idBattue) {
    const idsTraques = new Set(traquesCache.filter((t) => t.battue_id === idBattue).map((t) => t.id));
    return postesTraqueCache.filter((p) => idsTraques.has(p.traque_id)).length;
}

function participantsDe(idBattue) {
    return participantsCache
        .filter((p) => p.battue_id === idBattue)
        .map((p) => chasseursCache.find((c) => c.id === p.chasseur_id))
        .filter(Boolean);
}

function afficherProchaine() {
    const zone = document.getElementById("zone-prochaine");
    const aujourdhui = dateLocaleISO(new Date());
    const aVenir = battuesCache.filter((b) => b.date_battue && b.date_battue >= aujourdhui)
        .sort((a, b) => a.date_battue.localeCompare(b.date_battue));
    if (aVenir.length === 0) {
        zone.innerHTML = `
            <div class="carte" style="text-align:center; color:#666;">
                Aucune battue prévue. Clique sur « Nouvelle battue » pour en créer une à partir d'un modèle.
            </div>`;
        return;
    }
    const b = aVenir[0];
    const responsable = chasseursCache.find((c) => c.id === b.responsable_id);
    const participants = participantsDe(b.id);
    const jours = Math.round((new Date(b.date_battue + "T00:00:00") - new Date(aujourdhui + "T00:00:00")) / 86400000);
    const delai = jours === 0 ? "Aujourd'hui" : jours === 1 ? "Demain" : `Dans ${jours} jours`;
    zone.innerHTML = `
        <div class="carte" style="border-left:5px solid var(--couleur-accent);">
            <div style="font-size:12px; color:#6b6b60; text-transform:uppercase;">Prochaine battue · ${delai}</div>
            <div style="font-size:20px; font-weight:700; margin:2px 0;">${echapper(formaterDate(b.date_battue, true))}${b.secteur ? " · " + echapper(b.secteur) : ""}</div>
            <div style="font-size:13px; color:#555; margin-bottom:8px;">
                ${b.lieu_rdv ? "RDV : " + echapper(b.lieu_rdv) + (b.heure_rdv ? " à " + echapper(b.heure_rdv) : "") + " · " : ""}
                ${responsable ? "Responsable : " + echapper(nomAffichePersonne(responsable)) + " · " : ""}
                ${nbTraquesDe(b.id)} traque(s), ${nbPostesDe(b.id)} poste(s)
            </div>
            <div style="font-size:13px; margin-bottom:10px;">
                <strong>${participants.length} participant(s)</strong>${participants.length ? " : " + echapper(participants.map(nomAffichePersonne).join(", ")) : ""}
            </div>
            <a class="bouton bouton-principal" href="saisie.html?id=${b.id}">Saisie rapide</a>
            <a class="bouton bouton-secondaire" href="plan-battue.html?id=${b.id}">Plan de battue</a>
            <a class="bouton bouton-secondaire" href="impression.html?id=${b.id}&doc=carton" target="_blank">Cartons A5</a>
            <a class="bouton bouton-secondaire" href="impression.html?id=${b.id}&doc=fiche" target="_blank">Fiche de gestion</a>
            <button class="bouton bouton-secondaire" onclick="ouvrirModificationBattue('${b.id}')">Participants et infos</button>
        </div>`;
}

function afficherModeles() {
    const corps = document.getElementById("corps-tableau-modeles");
    if (modelesCache.length === 0) {
        corps.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">Aucun modèle. Crée-en un avec « Nouveau modèle », ou enregistre une battue existante comme modèle.</td></tr>`;
        return;
    }
    corps.innerHTML = modelesCache.map((m) => `
        <tr>
            <td data-etiquette="Modèle"><strong>${echapper(m.nom_modele)}</strong></td>
            <td data-etiquette="Secteur">${echapper(m.secteur)}</td>
            <td data-etiquette="Traques">${nbTraquesDe(m.id)}</td>
            <td data-etiquette="Postes">${nbPostesDe(m.id)}</td>
            <td data-etiquette="">
                <button class="bouton bouton-principal" style="padding:4px 8px;" onclick="ouvrirNouvelleBattue('${m.id}')">Créer une battue</button>
                <a class="bouton bouton-secondaire" style="padding:4px 8px;" href="plan-battue.html?id=${m.id}">Plan</a>
                <button class="bouton bouton-secondaire" style="padding:4px 8px;" onclick="ouvrirModificationBattue('${m.id}')">Modifier</button>
                <button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerBattue('${m.id}')">Supprimer</button>
            </td>
        </tr>
    `).join("");
}

function ligneBattue(b) {
    const responsable = chasseursCache.find((c) => c.id === b.responsable_id);
    return `
        <tr>
            <td data-etiquette="Date">${formaterDate(b.date_battue)}</td>
            <td data-etiquette="Secteur">${echapper(b.secteur)}</td>
            <td data-etiquette="Responsable">${responsable ? echapper(nomAffichePersonne(responsable)) : ""}</td>
            <td data-etiquette="Participants">${participantsDe(b.id).length}</td>
            <td data-etiquette="Traques">${nbTraquesDe(b.id)}</td>
            <td data-etiquette="">
                <a class="bouton bouton-principal" style="padding:4px 8px;" href="plan-battue.html?id=${b.id}">Plan</a>
                <a class="bouton bouton-secondaire" style="padding:4px 8px;" href="saisie.html?id=${b.id}">Saisie</a>
                <a class="bouton bouton-secondaire" style="padding:4px 8px;" href="impression.html?id=${b.id}&doc=carton" target="_blank">Cartons</a>
                <a class="bouton bouton-secondaire" style="padding:4px 8px;" href="impression.html?id=${b.id}&doc=fiche" target="_blank">Gestion</a>
                <button class="bouton bouton-secondaire" style="padding:4px 8px;" onclick="ouvrirModificationBattue('${b.id}')">Modifier</button>
                <button class="bouton bouton-secondaire" style="padding:4px 8px;" onclick="enregistrerCommeModele('${b.id}')">Enregistrer comme modèle</button>
                <button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerBattue('${b.id}')">Supprimer</button>
            </td>
        </tr>`;
}

function afficherListes() {
    const aujourdhui = dateLocaleISO(new Date());
    const avecDate = battuesCache.filter((b) => b.date_battue);
    const aVenir = avecDate.filter((b) => b.date_battue >= aujourdhui).sort((a, b) => a.date_battue.localeCompare(b.date_battue));
    const passees = avecDate.filter((b) => b.date_battue < aujourdhui).sort((a, b) => b.date_battue.localeCompare(a.date_battue));
    document.getElementById("corps-tableau-a-venir").innerHTML = aVenir.length
        ? aVenir.map(ligneBattue).join("")
        : `<tr><td colspan="6" style="text-align:center; color:#888;">Aucune battue à venir</td></tr>`;
    document.getElementById("corps-tableau-passees").innerHTML = passees.length
        ? passees.map(ligneBattue).join("")
        : `<tr><td colspan="6" style="text-align:center; color:#888;">Aucune battue passée</td></tr>`;
}

// ----------------------------------------------------------------------------
// Nouvelle battue (depuis un modèle ou vierge)
// ----------------------------------------------------------------------------

function ouvrirNouvelleBattue(idModele) {
    document.getElementById("message-modale-nouvelle").innerHTML = "";
    document.getElementById("formulaire-nouvelle").reset();
    document.getElementById("champ-modele-nouvelle").innerHTML =
        '<option value="">— Battue vierge —</option>' +
        modelesCache.map((m) => `<option value="${m.id}">${echapper(m.nom_modele)}</option>`).join("");
    document.getElementById("champ-modele-nouvelle").value = idModele || (modelesCache[0] ? modelesCache[0].id : "");
    ouvrirModale("modale-nouvelle");
}

async function creerBattueDepuisFormulaire(evenement) {
    evenement.preventDefault();
    const idModele = document.getElementById("champ-modele-nouvelle").value;
    const date = document.getElementById("champ-date-nouvelle").value;
    if (!date) return;
    const bouton = document.getElementById("bouton-creer-nouvelle");
    bouton.disabled = true;
    try {
        fermerModale("modale-nouvelle");
        if (!idModele) {
            ouvrirCreationBattue(date);
            return;
        }
        const nouvelle = await copierBattue(idModele, { est_modele: false, nom_modele: null, date_battue: date });
        await chargerTout();
        // On enchaîne sur la fiche pour choisir le responsable et les participants du jour.
        await ouvrirModificationBattue(nouvelle.id);
    } catch (erreur) {
        console.error(erreur);
        alert("La battue n'a pas pu être créée : " + erreur.message);
    } finally {
        bouton.disabled = false;
    }
}

/** Recopie une battue avec ses traques et leurs postes (sans chasseurs ni participants ni prélèvements). */
async function copierBattue(idSource, surcharges) {
    const { data: source } = await clientSupabase.from("battues").select().eq("id", idSource).single();
    if (!source) throw new Error("Battue source introuvable.");
    const { id: _id, created_at: _c, ...champs } = source;
    const { data: nouvelle, error } = await clientSupabase.from("battues").insert({ ...champs, ...surcharges }).select().single();
    if (error || !nouvelle) throw new Error((error && error.message) || "Création impossible.");

    const { data: traques } = await clientSupabase.from("traques").select().eq("battue_id", idSource).order("numero");
    for (const traque of traques || []) {
        const { id: idTraque, created_at: _ct, ...champsTraque } = traque;
        const { data: nouvelleTraque } = await clientSupabase.from("traques").insert({ ...champsTraque, battue_id: nouvelle.id }).select().single();
        const { data: postes } = await clientSupabase.from("postes_traque").select().eq("traque_id", idTraque);
        if (postes && postes.length > 0) {
            await clientSupabase.from("postes_traque").insert(postes.map((p) => {
                const { id: _p, created_at: _cp, ...champsPoste } = p;
                return { ...champsPoste, traque_id: nouvelleTraque.id, chasseur_id: null };
            }));
        }
    }
    return nouvelle;
}

async function enregistrerCommeModele(id) {
    const source = battuesCache.find((b) => b.id === id);
    if (!source) return;
    const nom = prompt("Nom du modèle :", source.secteur || "Ma battue");
    if (!nom || !nom.trim()) return;
    try {
        await copierBattue(id, { est_modele: true, nom_modele: nom.trim(), date_battue: null, responsable_id: null });
        await chargerTout();
    } catch (erreur) {
        alert("Le modèle n'a pas pu être enregistré : " + erreur.message);
    }
}

// ----------------------------------------------------------------------------
// Formulaire battue / modèle
// ----------------------------------------------------------------------------

function preparerFormulaire(estModele) {
    editionEstModele = estModele;
    document.getElementById("message-modale-battue").innerHTML = "";
    document.getElementById("ligne-nom-modele").style.display = estModele ? "" : "none";
    document.getElementById("bloc-date-battue").style.display = estModele ? "none" : "";
    document.getElementById("bloc-participants").style.display = estModele ? "none" : "";
    document.getElementById("bloc-plan-jour").style.display = "";
    document.getElementById("champ-parcelle-battue").innerHTML = '<option value="">— Non précisé —</option>' +
        parcellesCache.map((p) => `<option value="${p.id}">${echapper(p.nom)}</option>`).join("");
    document.getElementById("champ-responsable-battue").innerHTML = '<option value="">— Non précisé —</option>' +
        chasseursCache.filter((c) => c.actif).map((c) => `<option value="${c.id}">${echapper(nomAffichePersonne(c))}</option>`).join("");
}

function remplirListeParticipantsCochables(idsCoches) {
    const zone = document.getElementById("liste-participants-cochables");
    const actifs = chasseursCache.filter((c) => c.actif);
    if (actifs.length === 0) {
        zone.innerHTML = '<em style="color:#888;">Aucun chasseur actif. Ajoute des chasseurs dans la page Chasse.</em>';
        return;
    }
    zone.innerHTML = actifs.map((c) => `
        <label style="display:block; padding:3px 0;">
            <input type="checkbox" value="${c.id}" class="case-participant" ${idsCoches.includes(c.id) ? "checked" : ""}>
            ${echapper(nomAffichePersonne(c))}
        </label>
    `).join("");
}

function ouvrirCreationBattue(date) {
    battueEnEditionId = null;
    preparerFormulaire(false);
    document.getElementById("titre-modale-battue").textContent = "Nouvelle battue";
    document.getElementById("formulaire-battue").reset();
    document.getElementById("champ-date-battue").value = date || "";
    document.getElementById("champ-securite-battue").value = MODELE_REGLES_SECURITE;
    document.getElementById("champ-instructions-battue").value = MODELE_INSTRUCTIONS;
    remplirListeParticipantsCochables([]);
    remplirPlanJour(null);
    ouvrirModale("modale-battue");
}

function ouvrirCreationModele() {
    battueEnEditionId = null;
    preparerFormulaire(true);
    document.getElementById("titre-modale-battue").textContent = "Nouveau modèle de battue";
    document.getElementById("formulaire-battue").reset();
    document.getElementById("champ-securite-battue").value = MODELE_REGLES_SECURITE;
    document.getElementById("champ-instructions-battue").value = MODELE_INSTRUCTIONS;
    remplirPlanJour(null);
    ouvrirModale("modale-battue");
}

async function ouvrirModificationBattue(id) {
    const battue = [...battuesCache, ...modelesCache].find((b) => b.id === id);
    if (!battue) return;
    battueEnEditionId = id;
    preparerFormulaire(!!battue.est_modele);
    document.getElementById("titre-modale-battue").textContent = battue.est_modele ? "Modifier le modèle" : "Modifier la battue";
    document.getElementById("champ-nom-modele").value = battue.nom_modele || "";
    document.getElementById("champ-date-battue").value = battue.date_battue || "";
    document.getElementById("champ-secteur-battue").value = battue.secteur || "";
    document.getElementById("champ-parcelle-battue").value = battue.parcelle_id || "";
    document.getElementById("champ-responsable-battue").value = battue.responsable_id || "";
    document.getElementById("champ-lieu-rdv-battue").value = battue.lieu_rdv || "";
    document.getElementById("champ-heure-rdv-battue").value = battue.heure_rdv || "";
    document.getElementById("champ-securite-battue").value = battue.regles_securite || MODELE_REGLES_SECURITE;
    document.getElementById("champ-instructions-battue").value = battue.instructions || MODELE_INSTRUCTIONS;
    document.getElementById("champ-notes-battue").value = battue.notes || "";
    if (!battue.est_modele) remplirListeParticipantsCochables(participantsDe(id).map((c) => c.id));
    remplirPlanJour(battue.plan_jour);
    ouvrirModale("modale-battue");
}

async function enregistrerBattue(evenement) {
    evenement.preventDefault();
    const message = document.getElementById("message-modale-battue");
    const nomModele = document.getElementById("champ-nom-modele").value.trim();
    const date = document.getElementById("champ-date-battue").value;
    if (editionEstModele && !nomModele) {
        message.innerHTML = '<div class="message-alerte">Le nom du modèle est obligatoire.</div>';
        return;
    }
    if (!editionEstModele && !date) {
        message.innerHTML = '<div class="message-alerte">La date est obligatoire.</div>';
        return;
    }

    // Les parkings enregistrés au niveau de la battue (ancienne version) ne sont pas touchés :
    // les parkings se placent désormais traque par traque, dans le plan de battue.
    const valeurs = {
        est_modele: editionEstModele,
        nom_modele: editionEstModele ? nomModele : null,
        date_battue: editionEstModele ? null : date,
        secteur: document.getElementById("champ-secteur-battue").value.trim() || null,
        parcelle_id: document.getElementById("champ-parcelle-battue").value || null,
        responsable_id: document.getElementById("champ-responsable-battue").value || null,
        lieu_rdv: document.getElementById("champ-lieu-rdv-battue").value.trim() || null,
        heure_rdv: document.getElementById("champ-heure-rdv-battue").value || null,
        regles_securite: document.getElementById("champ-securite-battue").value.trim() || null,
        instructions: document.getElementById("champ-instructions-battue").value.trim() || null,
        notes: document.getElementById("champ-notes-battue").value.trim() || null,
        plan_jour: lirePlanJour(),
    };

    let idBattue = battueEnEditionId;
    if (idBattue) {
        await clientSupabase.from("battues").update(valeurs).eq("id", idBattue);
    } else {
        const { data } = await clientSupabase.from("battues").insert(valeurs).select().single();
        idBattue = data.id;
    }

    if (!editionEstModele) {
        const idsParticipants = Array.from(document.querySelectorAll(".case-participant:checked")).map((c) => c.value);
        await clientSupabase.from("participants_battue").delete().eq("battue_id", idBattue);
        if (idsParticipants.length > 0) {
            await clientSupabase.from("participants_battue").insert(
                idsParticipants.map((chasseurId) => ({ battue_id: idBattue, chasseur_id: chasseurId }))
            );
        }
    }

    fermerModale("modale-battue");
    await chargerTout();
}

async function supprimerBattue(id) {
    const estModele = modelesCache.some((m) => m.id === id);
    const question = estModele
        ? "Supprimer ce modèle, ses traques et ses postes ? Les battues déjà créées avec ce modèle ne changent pas."
        : "Supprimer cette battue, ses traques, ses postes et ses participants ?";
    if (!confirm(question)) return;
    const { data: traques } = await clientSupabase.from("traques").select().eq("battue_id", id);
    for (const traque of traques || []) {
        await clientSupabase.from("postes_traque").delete().eq("traque_id", traque.id);
    }
    await clientSupabase.from("prelevements").update({ traque_id: null }).eq("battue_id", id);
    await clientSupabase.from("traques").delete().eq("battue_id", id);
    await clientSupabase.from("participants_battue").delete().eq("battue_id", id);
    await clientSupabase.from("versions_plan").delete().eq("battue_id", id);
    await clientSupabase.from("prelevements").update({ battue_id: null }).eq("battue_id", id);
    await clientSupabase.from("battues").delete().eq("id", id);
    await chargerTout();
}

// ----------------------------------------------------------------------------
// Plan de chasse du jour et catégories (avec leur sonnerie)
// ----------------------------------------------------------------------------

function remplirPlanJour(planJour) {
    const zone = document.getElementById("liste-plan-jour");
    if (categoriesCache.length === 0) {
        zone.innerHTML = '<em style="color:#888;">Aucune catégorie : ajoute-en avec « Gérer le gibier et les sonneries ».</em>';
        return;
    }
    const parId = new Map((planJour || []).map((l) => [l.id, l]));
    zone.innerHTML = categoriesCache.map((c) => {
        const ligne = parId.get(c.id) || {};
        const choix = ligne.choix || [];
        const precisions = c.precisions || [];
        return `<div class="ligne-plan-jour" data-id="${c.id}" style="padding:4px 0; border-bottom:1px solid #eee;">
            <label style="display:flex; align-items:center; gap:8px; font-weight:600; margin:0;">
                <input type="checkbox" class="plan-autorise" ${ligne.autorise ? "checked" : ""}>
                <span style="flex:1;">${echapper(c.nom)}</span>
                <span style="font-weight:400; color:#666;">sonnerie ${echapper(c.sonnerie) || "?"}</span>
                <input type="number" class="plan-nombre" min="0" placeholder="Nombre" value="${echapper(ligne.nombre)}" style="width:80px; padding:3px 6px;" title="Nombre autorisé (facultatif)">
            </label>
            ${precisions.length ? `<div style="margin:3px 0 0 26px; font-size:12px;">${precisions.map((p) =>
                `<label style="margin-right:12px; font-weight:400;"><input type="checkbox" class="plan-precision" value="${echapper(p)}" ${choix.includes(p) ? "checked" : ""}> ${echapper(p)}</label>`).join("")}</div>` : ""}
        </div>`;
    }).join("");
}

function lirePlanJour() {
    const lignes = Array.from(document.querySelectorAll("#liste-plan-jour .ligne-plan-jour")).map((el) => ({
        id: el.dataset.id,
        autorise: el.querySelector(".plan-autorise").checked,
        nombre: el.querySelector(".plan-nombre").value === "" ? null : Number(el.querySelector(".plan-nombre").value),
        choix: Array.from(el.querySelectorAll(".plan-precision:checked")).map((c) => c.value),
    }));
    return lignes.length ? lignes : null;
}

/** Après la gestion des catégories : met à jour les cases du formulaire en gardant ce qui est déjà coché. */
function rafraichirPlanJourDepuisFormulaire() {
    remplirPlanJour(lirePlanJour());
}
