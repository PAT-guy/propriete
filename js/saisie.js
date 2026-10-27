/**
 * Saisie rapide des prélèvements d'une battue (?id=...), conçue pour le téléphone au poste.
 *
 * Un appui sur un gros bouton = un animal, rattaché à la traque, au poste et au chasseur choisis.
 * Sans réseau, les prélèvements sont gardés dans une file d'attente sur l'appareil (localStorage)
 * puis envoyés dès que la connexion revient. Les données de la battue sont gardées en copie
 * pour que la page s'ouvre même sans réseau (à condition de l'avoir ouverte une fois avec du réseau).
 */

const CLE_FILE = "foret_file_prelevements";
const DELAI_TOAST_MS = 8000;

let d = null;                 // { battue, traques, postes, chasseurs, prelevements }
let selection = { traqueId: null, posteId: null };
let minuterieToast = null;
let envoiEnCours = false;
let detailEnEdition = null;

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/battues.html");
    afficherBandeauDemoSiBesoin();

    const idBattue = new URLSearchParams(window.location.search).get("id");
    const zone = document.getElementById("zone-chargement");
    if (!idBattue) { zone.textContent = "Aucune battue indiquée."; return; }

    d = await chargerDonnees(idBattue);
    if (!d) {
        zone.innerHTML = "Impossible de charger la battue. Sans réseau, ouvre d'abord cette page une fois avec du réseau avant de partir.";
        return;
    }
    if (d.battue.est_modele || !d.battue.date_battue) { zone.textContent = "Les modèles de battue n'ont pas de prélèvements : ouvre une battue datée."; return; }

    restaurerSelection();
    document.getElementById("zone-chargement").style.display = "none";
    document.getElementById("zone-saisie").style.display = "block";
    document.getElementById("formulaire-detail").addEventListener("submit", enregistrerDetail);
    document.getElementById("bouton-supprimer-detail").addEventListener("click", supprimerDepuisDetail);
    window.addEventListener("online", () => { majEtat(); envoyerFile(); });
    window.addEventListener("offline", majEtat);
    rendreTout();
    envoyerFile();
})();

// ----------------------------------------------------------------------------
// Données : réseau, sinon dernière copie gardée sur l'appareil
// ----------------------------------------------------------------------------

function lireStockage(cle) { try { return localStorage.getItem(cle); } catch (e) { return null; } }
function ecrireStockage(cle, valeur) { try { localStorage.setItem(cle, valeur); } catch (e) { /* stockage indisponible */ } }

async function chargerDonnees(idBattue) {
    try {
        if (!navigator.onLine) throw new Error("hors ligne");
        const { data: battue, error } = await clientSupabase.from("battues").select().eq("id", idBattue).single();
        if (error || !battue) throw new Error("battue introuvable");
        const [chasseurs, traques, prelevements] = await Promise.all([
            clientSupabase.from("chasseurs").select().order("nom"),
            clientSupabase.from("traques").select().eq("battue_id", idBattue).order("numero"),
            clientSupabase.from("prelevements").select().eq("battue_id", idBattue),
        ]);
        await chargerCategories();
        let postes = [];
        const listeTraques = traques.data || [];
        if (listeTraques.length > 0) {
            const { data } = await clientSupabase.from("postes_traque").select().in("traque_id", listeTraques.map((t) => t.id));
            postes = data || [];
        }
        const donnees = { battue, chasseurs: chasseurs.data || [], traques: listeTraques, postes, prelevements: prelevements.data || [], categories: categoriesCache };
        ecrireStockage(`foret_saisie_donnees_${idBattue}`, JSON.stringify(donnees));
        return donnees;
    } catch (erreur) {
        const copie = lireStockage(`foret_saisie_donnees_${idBattue}`);
        if (!copie) return null;
        const donnees = JSON.parse(copie);
        categoriesCache = donnees.categories || [];
        return donnees;
    }
}

function majCopieLocale() {
    ecrireStockage(`foret_saisie_donnees_${d.battue.id}`, JSON.stringify({ ...d, categories: categoriesCache }));
}

// ----------------------------------------------------------------------------
// File d'attente (prélèvements saisis sans réseau)
// ----------------------------------------------------------------------------

function lireFile() {
    try { return JSON.parse(lireStockage(CLE_FILE)) || []; } catch (e) { return []; }
}

function ecrireFile(file) {
    ecrireStockage(CLE_FILE, JSON.stringify(file));
}

function fileDeCetteBattue() {
    return lireFile().filter((l) => l.battue_id === d.battue.id);
}

function nouvelIdentifiant() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}

/** Envoie une ligne. Une ligne déjà présente en base (identifiant connu) compte comme envoyée. */
async function envoyerLigne(ligne) {
    if (!navigator.onLine) throw new Error("hors ligne");
    const { data: existante } = await clientSupabase.from("prelevements").select().eq("id", ligne.id);
    if (existante && existante.length > 0) return;
    const { error } = await clientSupabase.from("prelevements").insert(ligne);
    if (error) {
        if (/duplicate|23505|already exists/i.test(`${error.code || ""} ${error.message || ""}`)) return;
        throw new Error(error.message || "échec de l'envoi");
    }
}

async function envoyerFile() {
    if (envoiEnCours) return;
    envoiEnCours = true;
    try {
        for (const ligne of lireFile()) {
            try {
                await envoyerLigne(ligne);
            } catch (erreur) {
                break;   // réseau absent ou refus de la base : on réessaiera plus tard
            }
            ecrireFile(lireFile().filter((l) => l.id !== ligne.id));
            if (d && ligne.battue_id === d.battue.id) d.prelevements.push(ligne);
        }
    } finally {
        envoiEnCours = false;
        if (d) { majCopieLocale(); rendreTout(); }
    }
}

// ----------------------------------------------------------------------------
// Sélection traque / poste
// ----------------------------------------------------------------------------

function restaurerSelection() {
    let memo = null;
    try { memo = JSON.parse(lireStockage(`foret_saisie_selection_${d.battue.id}`)); } catch (e) { /* aucune */ }
    const traque = (memo && d.traques.find((t) => t.id === memo.traqueId)) || d.traques[0] || null;
    selection.traqueId = traque ? traque.id : null;
    selection.posteId = memo && d.postes.some((p) => p.id === memo.posteId && p.traque_id === selection.traqueId) ? memo.posteId : null;
}

function memoriserSelection() {
    ecrireStockage(`foret_saisie_selection_${d.battue.id}`, JSON.stringify(selection));
}

function traqueActive() {
    return d.traques.find((t) => t.id === selection.traqueId) || null;
}

function nomChasseur(c) {
    return c.prenom ? `${c.prenom} ${c.nom}` : c.nom;
}

function chasseurDePoste(poste) {
    return poste && d.chasseurs.find((c) => c.id === poste.chasseur_id);
}

// ----------------------------------------------------------------------------
// Enregistrement d'un animal
// ----------------------------------------------------------------------------

function saisonPour(dateISO) {
    const [a, m] = dateISO.split("-").map(Number);
    return m >= 7 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
}

function nouvelleLigne(categorie, precision) {
    const traque = traqueActive();
    const poste = d.postes.find((p) => p.id === selection.posteId);
    return {
        id: nouvelIdentifiant(),
        created_at: new Date().toISOString(),
        date_prelevement: d.battue.date_battue,
        saison: saisonPour(d.battue.date_battue),
        categorie_id: categorie.id,
        battue_id: d.battue.id,
        traque_id: traque ? traque.id : null,
        chasseur_id: poste ? poste.chasseur_id || null : null,
        poste: poste ? poste.nom : null,
        sexe: "Indéterminé",
        poids_kg: null,
        commentaire: precision || null,
    };
}

function precisionsAutorisees(categorie) {
    const plan = (d.battue.plan_jour || []).find((l) => l.id === categorie.id);
    return plan && plan.choix && plan.choix.length ? plan.choix : [];
}

function toucherAnimal(idCategorie) {
    const categorie = categoriesCache.find((c) => c.id === idCategorie);
    if (!categorie) return;
    const choix = precisionsAutorisees(categorie);
    if (choix.length >= 2) {
        document.getElementById("titre-precision").textContent = categorie.nom;
        document.getElementById("choix-precision").innerHTML = choix.map((p) =>
            `<button type="button" class="saisie-animal" data-categorie="${categorie.id}" data-precision="${echapper(p)}"><span class="nom">${echapper(p)}</span></button>`).join("");
        document.querySelectorAll("#choix-precision .saisie-animal").forEach((b) => b.addEventListener("click", () => {
            fermerModale("modale-precision");
            enregistrerAnimal(categorie, b.dataset.precision);
        }));
        ouvrirModale("modale-precision");
        return;
    }
    enregistrerAnimal(categorie, choix.length === 1 ? choix[0] : null);
}

async function enregistrerAnimal(categorie, precision) {
    const ligne = nouvelleLigne(categorie, precision);
    let enAttente = false;
    try {
        await envoyerLigne(ligne);
        d.prelevements.push(ligne);
    } catch (erreur) {
        const file = lireFile();
        file.push(ligne);
        ecrireFile(file);
        enAttente = true;
    }
    majCopieLocale();
    rendreTout();
    const poste = ligne.poste ? ` · ${ligne.poste}` : "";
    afficherToast(`${precision || categorie.nom} enregistré${poste}${enAttente ? " (en attente de réseau)" : ""}`, ligne.id);
}

function lignesDeLaBattue() {
    const file = fileDeCetteBattue();
    const idsFile = new Set(file.map((l) => l.id));
    return [...d.prelevements.filter((p) => !idsFile.has(p.id)), ...file];
}

function estEnAttente(id) {
    return lireFile().some((l) => l.id === id);
}

// ----------------------------------------------------------------------------
// Rendu
// ----------------------------------------------------------------------------

function rendreTout() {
    document.getElementById("saisie-titre").textContent = "Saisie rapide";
    const date = new Date(d.battue.date_battue + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    document.getElementById("saisie-sous-titre").textContent = `${date}${d.battue.secteur ? " · " + d.battue.secteur : ""}`;
    majEtat();
    rendreOu();
    rendreCategories();
    rendreDerniers();
    rendreBilan();
}

function majEtat() {
    const enAttente = fileDeCetteBattue().length;
    const zone = document.getElementById("saisie-etat");
    if (!navigator.onLine) {
        zone.innerHTML = `<span class="saisie-pastille-etat hors">Hors ligne</span>${enAttente ? `<div class="saisie-attente">${enAttente} en attente</div>` : ""}`;
    } else if (enAttente) {
        zone.innerHTML = `<span class="saisie-pastille-etat attente">${enAttente} à envoyer</span><div><button class="bouton bouton-secondaire" style="padding:4px 10px; margin-top:4px;" onclick="envoyerFile()">Envoyer maintenant</button></div>`;
    } else {
        zone.innerHTML = '<span class="saisie-pastille-etat ok">Connecté, tout est envoyé</span>';
    }
}

function rendreOu() {
    const zoneTraques = document.getElementById("saisie-traques");
    const zonePostes = document.getElementById("saisie-postes");
    if (d.traques.length === 0) {
        zoneTraques.innerHTML = '<em style="color:#888;">Aucune traque dans le plan : les prélèvements seront notés sans traque.</em>';
        zonePostes.innerHTML = "";
        return;
    }
    zoneTraques.innerHTML = d.traques.map((t) =>
        `<button type="button" class="saisie-traque ${t.id === selection.traqueId ? "actif" : ""}" data-traque="${t.id}"><i style="background:${couleurTraqueSaisie(t.numero)}"></i>${echapper(t.nom || "Traque " + t.numero)}</button>`).join("");
    zoneTraques.querySelectorAll("[data-traque]").forEach((b) => b.addEventListener("click", () => {
        selection.traqueId = b.dataset.traque;
        selection.posteId = null;
        memoriserSelection();
        rendreOu();
    }));
    const postes = d.postes.filter((p) => p.traque_id === selection.traqueId);
    zonePostes.innerHTML = `<button type="button" class="saisie-poste ${selection.posteId ? "" : "actif"}" data-poste="">Sans poste</button>` + postes.map((p, i) => {
        const c = chasseurDePoste(p);
        return `<button type="button" class="saisie-poste ${p.id === selection.posteId ? "actif" : ""}" data-poste="${p.id}"><span>${i + 1}. ${echapper(p.nom)}${c ? `<small>${echapper(nomChasseur(c))}</small>` : ""}</span></button>`;
    }).join("");
    zonePostes.querySelectorAll("[data-poste]").forEach((b) => b.addEventListener("click", () => {
        selection.posteId = b.dataset.poste || null;
        memoriserSelection();
        rendreOu();
    }));
}

function couleurTraqueSaisie(numero) {
    const couleurs = ["#a3442f", "#3a6b8a", "#5a7d4a", "#8a3a6b", "#c28a1f", "#2f7a7a"];
    return couleurs[((numero || 1) - 1) % couleurs.length];
}

function comptes() {
    const par = {};
    lignesDeLaBattue().forEach((p) => { par[p.categorie_id] = (par[p.categorie_id] || 0) + 1; });
    return par;
}

function boutonAnimal(c, ligne, nombre, pris, autre) {
    const choix = ligne && ligne.choix && ligne.choix.length ? ligne.choix.join(", ") : null;
    const quota = ligne && ligne.nombre !== null && ligne.nombre !== undefined ? Number(ligne.nombre) : null;
    const etat = quota === null ? "" : pris > quota ? "depasse" : pris === quota ? "quota" : "";
    const compte = quota === null ? `${pris} aujourd'hui` : `${pris} / ${quota}${pris > quota ? " dépassé" : pris === quota ? " atteint" : ""}`;
    return `<button type="button" class="saisie-animal ${etat} ${autre ? "autre" : ""}" data-categorie="${c.id}">
        ${c.sonnerie ? `<span class="sonnerie" title="Sonnerie">${echapper(c.sonnerie)}</span>` : ""}
        <span class="nom">${echapper(choix || c.nom)}</span><span class="compte">${echapper(compte)}</span></button>`;
}

function rendreCategories() {
    const plan = d.battue.plan_jour || [];
    const cochees = plan.filter((l) => l.autorise);
    const par = comptes();
    const principales = cochees.length > 0 ? cochees.map((l) => ({ ligne: l, c: categoriesCache.find((x) => x.id === l.id) })).filter((x) => x.c)
        : categoriesCache.map((c) => ({ ligne: null, c }));
    const autres = cochees.length > 0 ? categoriesCache.filter((c) => !cochees.some((l) => l.id === c.id)) : [];
    document.getElementById("saisie-categories").innerHTML = principales.length
        ? principales.map((x) => boutonAnimal(x.c, x.ligne, null, par[x.c.id] || 0, false)).join("")
        : '<em style="color:#888;">Aucune catégorie : ajoute du gibier dans la page Chasse.</em>';
    const blocAutres = document.getElementById("saisie-autres");
    blocAutres.style.display = autres.length ? "" : "none";
    document.getElementById("saisie-categories-autres").innerHTML = autres.map((c) => boutonAnimal(c, null, null, par[c.id] || 0, true)).join("");
    document.querySelectorAll("#zone-saisie [data-categorie]").forEach((b) => b.addEventListener("click", () => toucherAnimal(b.dataset.categorie)));
}

function libelleLigne(p) {
    const c = categoriesCache.find((x) => x.id === p.categorie_id);
    return p.commentaire && c && (c.precisions || []).includes(p.commentaire) ? p.commentaire : (c ? c.nom : "?");
}

function rendreDerniers() {
    const lignes = lignesDeLaBattue().sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    const zone = document.getElementById("saisie-derniers");
    if (lignes.length === 0) { zone.innerHTML = '<em style="color:#888;">Rien d\'enregistré pour l\'instant.</em>'; return; }
    zone.innerHTML = lignes.slice(0, 10).map((p) => {
        const heure = p.created_at ? new Date(p.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
        const traque = d.traques.find((t) => t.id === p.traque_id);
        const chasseur = d.chasseurs.find((c) => c.id === p.chasseur_id);
        const details = [heure, traque ? (traque.nom || "Traque " + traque.numero) : null, p.poste, chasseur ? nomChasseur(chasseur) : null,
            p.sexe && p.sexe !== "Indéterminé" ? p.sexe.toLowerCase() : null, p.poids_kg ? p.poids_kg + " kg" : null].filter(Boolean).join(" · ");
        return `<div class="saisie-ligne"><div class="quoi"><strong>${echapper(libelleLigne(p))}${estEnAttente(p.id) ? ' <span class="saisie-attente">en attente</span>' : ""}</strong><small>${echapper(details)}</small></div>
            <button type="button" class="bouton bouton-secondaire" data-detail="${p.id}">Détails</button></div>`;
    }).join("");
    zone.querySelectorAll("[data-detail]").forEach((b) => b.addEventListener("click", () => ouvrirDetail(b.dataset.detail)));
}

function rendreBilan() {
    const par = comptes();
    const plan = d.battue.plan_jour || [];
    const lignes = categoriesCache.filter((c) => (par[c.id] || 0) > 0 || plan.some((l) => l.id === c.id && l.autorise));
    const zone = document.getElementById("saisie-bilan");
    if (lignes.length === 0) { zone.innerHTML = '<em style="color:#888;">Aucune catégorie autorisée ni prélevée.</em>'; return; }
    const total = Object.values(par).reduce((s, n) => s + n, 0);
    zone.innerHTML = `<table class="tableau-donnees saisie-bilan"><thead><tr><th>Gibier</th><th>Sonnerie</th><th>Pris</th><th>Autorisé</th></tr></thead><tbody>
        ${lignes.map((c) => {
            const l = plan.find((x) => x.id === c.id);
            const pris = par[c.id] || 0;
            const autorise = l && l.nombre !== null && l.nombre !== undefined ? l.nombre : "";
            const depasse = autorise !== "" && pris > Number(autorise);
            return `<tr><td>${echapper(c.nom)}</td><td>${echapper(c.sonnerie)}</td><td style="${depasse ? "color:#a3442f; font-weight:700;" : ""}">${pris}</td><td>${echapper(autorise)}</td></tr>`;
        }).join("")}
        <tr><td colspan="2"><strong>Total</strong></td><td colspan="2"><strong>${total}</strong></td></tr></tbody></table>`;
}

// ----------------------------------------------------------------------------
// Message d'enregistrement avec « Annuler »
// ----------------------------------------------------------------------------

function afficherToast(texte, idLigne) {
    const toast = document.getElementById("saisie-toast");
    toast.innerHTML = `<span class="texte">${echapper(texte)}</span>
        <button type="button" class="bouton bouton-secondaire" id="toast-annuler">Annuler</button>
        <button type="button" class="bouton bouton-principal" id="toast-details">Détails</button>`;
    toast.style.display = "flex";
    document.getElementById("toast-annuler").addEventListener("click", () => { cacherToast(); supprimerLigne(idLigne); });
    document.getElementById("toast-details").addEventListener("click", () => { cacherToast(); ouvrirDetail(idLigne); });
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(cacherToast, DELAI_TOAST_MS);
}

function cacherToast() {
    clearTimeout(minuterieToast);
    document.getElementById("saisie-toast").style.display = "none";
}

// ----------------------------------------------------------------------------
// Détails, modification, suppression
// ----------------------------------------------------------------------------

function ouvrirDetail(id) {
    const ligne = lignesDeLaBattue().find((p) => p.id === id);
    if (!ligne) return;
    detailEnEdition = id;
    document.getElementById("titre-detail").textContent = libelleLigne(ligne);
    document.getElementById("message-detail").innerHTML = "";
    document.getElementById("champ-sexe-detail").value = ligne.sexe || "Indéterminé";
    document.getElementById("champ-poids-detail").value = ligne.poids_kg || "";
    document.getElementById("champ-commentaire-detail").value = ligne.commentaire || "";
    document.getElementById("champ-chasseur-detail").innerHTML = '<option value="">— Non précisé —</option>' +
        d.chasseurs.map((c) => `<option value="${c.id}" ${c.id === ligne.chasseur_id ? "selected" : ""}>${echapper(nomChasseur(c))}</option>`).join("");
    ouvrirModale("modale-detail");
}

async function modifierLigne(id, valeurs) {
    if (estEnAttente(id)) {
        ecrireFile(lireFile().map((l) => (l.id === id ? { ...l, ...valeurs } : l)));
        return;
    }
    if (!navigator.onLine) throw new Error("Pas de réseau : modification impossible pour un prélèvement déjà envoyé.");
    const { error } = await clientSupabase.from("prelevements").update(valeurs).eq("id", id);
    if (error) throw new Error(error.message);
    d.prelevements = d.prelevements.map((p) => (p.id === id ? { ...p, ...valeurs } : p));
}

async function enregistrerDetail(evenement) {
    evenement.preventDefault();
    const valeurs = {
        sexe: document.getElementById("champ-sexe-detail").value,
        poids_kg: parseFloat(document.getElementById("champ-poids-detail").value) || null,
        chasseur_id: document.getElementById("champ-chasseur-detail").value || null,
        commentaire: document.getElementById("champ-commentaire-detail").value.trim() || null,
    };
    try {
        await modifierLigne(detailEnEdition, valeurs);
    } catch (erreur) {
        document.getElementById("message-detail").innerHTML = `<div class="message-alerte">${echapper(erreur.message)}</div>`;
        return;
    }
    fermerModale("modale-detail");
    majCopieLocale();
    rendreTout();
}

async function supprimerLigne(id) {
    if (estEnAttente(id)) {
        ecrireFile(lireFile().filter((l) => l.id !== id));
    } else {
        if (!navigator.onLine) {
            document.getElementById("saisie-message").innerHTML = '<div class="message-alerte">Pas de réseau : un prélèvement déjà envoyé ne peut pas être supprimé maintenant.</div>';
            return;
        }
        const { error } = await clientSupabase.from("prelevements").delete().eq("id", id);
        if (error) return;
        d.prelevements = d.prelevements.filter((p) => p.id !== id);
    }
    document.getElementById("saisie-message").innerHTML = "";
    majCopieLocale();
    rendreTout();
}

async function supprimerDepuisDetail() {
    if (!detailEnEdition) return;
    if (!confirm("Supprimer ce prélèvement ?")) return;
    fermerModale("modale-detail");
    await supprimerLigne(detailEnEdition);
}
