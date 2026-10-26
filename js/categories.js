/**
 * Catégories de gibier (Chevreuil, Cerf -8, Cerf +8, Biche, Jeune, Sanglier...) avec leur sonnerie.
 * Liste commune au plan de chasse du jour, au plan de chasse de la saison et aux prélèvements.
 * Ce fichier gère aussi la fenêtre « Catégories et sonneries » (injectée dans la page à la demande).
 */

const CATEGORIES_PAR_DEFAUT = [
    { nom: "Chevreuil", sonnerie: "2", precisions: ["Chevreuil", "Chevrette", "Chevrillard"] },
    { nom: "Cerf -8", sonnerie: "6", precisions: [] },
    { nom: "Cerf +8", sonnerie: "6", precisions: [] },
    { nom: "Biche", sonnerie: "4", precisions: [] },
    { nom: "Jeune", sonnerie: "3", precisions: [] },
];

/** Espèces que l'on peut ajouter en un clic depuis la fenêtre de gestion. */
const ESPECES_COURANTES = [
    "Sanglier", "Daim", "Renard", "Lièvre", "Faisan", "Perdrix", "Lapin de garenne", "Pigeon ramier",
    "Corneille noire", "Pie bavarde", "Ragondin", "Blaireau", "Mouflon", "Chamois",
];

let categoriesCache = [];
let rappelFermetureCategories = null;

async function chargerCategories() {
    let { data } = await clientSupabase.from("categories_chasse").select();
    if (data && data.length === 0) {
        // Première utilisation : on installe la liste de départ (modifiable ensuite).
        const { data: creees } = await clientSupabase.from("categories_chasse").insert(
            CATEGORIES_PAR_DEFAUT.map((c, i) => ({ ...c, ordre: i + 1 }))).select();
        data = creees || [];
    }
    categoriesCache = (data || []).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    return categoriesCache;
}

/** Nom du gibier d'une ligne de plan ou de prélèvement : sa catégorie, sinon son ancienne espèce. */
function nomGibierDe(ligne, categories, especes) {
    const categorie = ligne.categorie_id && (categories || []).find((c) => c.id === ligne.categorie_id);
    if (categorie) return categorie.nom;
    const espece = (especes || []).find((e) => e.id === ligne.espece_id);
    return espece ? espece.nom : "?";
}

/** Un prélèvement compte-t-il dans cette attribution du plan de chasse ? (même saison, même catégorie, ou même espèce pour les anciennes lignes) */
function prelevementCompte(prelevement, plan) {
    if (prelevement.saison !== plan.saison) return false;
    if (plan.categorie_id) return prelevement.categorie_id === plan.categorie_id;
    return !prelevement.categorie_id && prelevement.espece_id === plan.espece_id;
}

function optionsCategories(selection) {
    return categoriesCache.map((c) => `<option value="${c.id}" ${selection === c.id ? "selected" : ""}>${echapper(c.nom)}</option>`).join("");
}

// ----------------------------------------------------------------------------
// Fenêtre « Catégories et sonneries »
// ----------------------------------------------------------------------------

function injecterModaleCategories() {
    if (document.getElementById("modale-categories")) return;
    document.body.insertAdjacentHTML("beforeend", `
    <div class="fond-modale" id="modale-categories">
        <div class="boite-modale" style="max-width:680px;">
            <h2>Gibier, catégories et sonneries</h2>
            <p style="font-size:13px; color:#6b6b60; margin-top:0;">La liste commune au plan de chasse, aux prélèvements et aux cartons. La sonnerie est un texte libre (par exemple 6). « Choix possibles » permet de préciser une ligne au moment de cocher (par exemple chevreuil, chevrette, chevrillard : séparés par des virgules).</p>
            <div id="message-categories"></div>
            <table class="tableau-donnees">
                <thead><tr><th>Catégorie</th><th style="width:15%">Sonnerie</th><th>Choix possibles</th><th style="width:25%"></th></tr></thead>
                <tbody id="corps-categories"></tbody>
            </table>
            <div style="display:flex; gap:6px; margin-top:12px; flex-wrap:wrap; align-items:center;">
                <select id="select-espece-courante" style="flex:1; min-width:160px;"></select>
                <button type="button" class="bouton bouton-secondaire" onclick="ajouterEspeceCourante()">Ajouter cette espèce</button>
                <button type="button" class="bouton bouton-secondaire" onclick="ajouterCategorie()">+ Autre catégorie</button>
            </div>
            <div class="actions-modale">
                <span class="espace"></span>
                <button type="button" class="bouton bouton-principal" onclick="fermerCategories()">Terminer</button>
            </div>
        </div>
    </div>`);
}

function ouvrirCategories(rappel) {
    injecterModaleCategories();
    rappelFermetureCategories = rappel || null;
    document.getElementById("message-categories").innerHTML = "";
    afficherCategories();
    ouvrirModale("modale-categories");
}

function afficherCategories() {
    const existants = new Set(categoriesCache.map((c) => c.nom.toLowerCase()));
    document.getElementById("select-espece-courante").innerHTML = '<option value="">Ajouter une espèce courante…</option>' +
        ESPECES_COURANTES.filter((n) => !existants.has(n.toLowerCase())).map((n) => `<option>${echapper(n)}</option>`).join("");
    const corps = document.getElementById("corps-categories");
    corps.innerHTML = categoriesCache.length === 0
        ? '<tr><td colspan="4" style="text-align:center; color:#888;">Aucune catégorie.</td></tr>'
        : categoriesCache.map((c, i) => `
        <tr data-id="${c.id}">
            <td><input type="text" class="cat-nom" value="${echapper(c.nom)}" onchange="majCategorie('${c.id}')" style="padding:4px 6px;"></td>
            <td><input type="text" class="cat-sonnerie" value="${echapper(c.sonnerie)}" onchange="majCategorie('${c.id}')" style="padding:4px 6px;"></td>
            <td><input type="text" class="cat-precisions" value="${echapper((c.precisions || []).join(", "))}" placeholder="facultatif" onchange="majCategorie('${c.id}')" style="padding:4px 6px;"></td>
            <td style="white-space:nowrap; text-align:right;">
                <button type="button" class="bouton bouton-secondaire" style="padding:2px 6px;" onclick="deplacerCategorie('${c.id}', -1)" ${i === 0 ? "disabled" : ""}>▲</button>
                <button type="button" class="bouton bouton-secondaire" style="padding:2px 6px;" onclick="deplacerCategorie('${c.id}', 1)" ${i === categoriesCache.length - 1 ? "disabled" : ""}>▼</button>
                <button type="button" class="bouton bouton-danger" style="padding:2px 6px;" onclick="supprimerCategorie('${c.id}')">✕</button>
            </td>
        </tr>`).join("");
}

async function majCategorie(id) {
    const ligne = document.querySelector(`#corps-categories tr[data-id="${id}"]`);
    if (!ligne) return;
    const nom = ligne.querySelector(".cat-nom").value.trim();
    if (!nom) { afficherCategories(); return; }
    const valeurs = {
        nom,
        sonnerie: ligne.querySelector(".cat-sonnerie").value.trim() || null,
        precisions: ligne.querySelector(".cat-precisions").value.split(",").map((p) => p.trim()).filter(Boolean),
    };
    await clientSupabase.from("categories_chasse").update(valeurs).eq("id", id);
    Object.assign(categoriesCache.find((c) => c.id === id), valeurs);
}

async function ajouterCategorieAvec(valeurs) {
    const ordre = categoriesCache.reduce((m, c) => Math.max(m, c.ordre || 0), 0) + 1;
    const { data } = await clientSupabase.from("categories_chasse").insert({ sonnerie: null, precisions: [], ...valeurs, ordre }).select().single();
    if (data) categoriesCache.push(data);
    afficherCategories();
}

function ajouterCategorie() {
    return ajouterCategorieAvec({ nom: "Nouvelle catégorie" });
}

function ajouterEspeceCourante() {
    const select = document.getElementById("select-espece-courante");
    if (!select.value) return Promise.resolve();
    return ajouterCategorieAvec({ nom: select.value });
}

async function deplacerCategorie(id, sens) {
    const i = categoriesCache.findIndex((c) => c.id === id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= categoriesCache.length) return;
    [categoriesCache[i], categoriesCache[j]] = [categoriesCache[j], categoriesCache[i]];
    for (let k = 0; k < categoriesCache.length; k++) {
        if (categoriesCache[k].ordre !== k + 1) {
            categoriesCache[k].ordre = k + 1;
            await clientSupabase.from("categories_chasse").update({ ordre: k + 1 }).eq("id", categoriesCache[k].id);
        }
    }
    afficherCategories();
}

async function supprimerCategorie(id) {
    const c = categoriesCache.find((x) => x.id === id);
    if (!confirm(`Supprimer la catégorie « ${c ? c.nom : ""} » ? Elle disparaît du plan de chasse du jour de toutes les battues. Les prélèvements déjà notés gardent leur date mais perdent leur catégorie.`)) return;
    await clientSupabase.from("categories_chasse").delete().eq("id", id);
    categoriesCache = categoriesCache.filter((x) => x.id !== id);
    afficherCategories();
}

function fermerCategories() {
    fermerModale("modale-categories");
    if (rappelFermetureCategories) rappelFermetureCategories();
}
