/**
 * Page d'impression d'une battue : cartons A5 (?doc=carton) ou fiche de gestion A4 (?doc=fiche).
 * Un panneau permet de choisir les blocs de chaque face, leur ordre, leurs réglages et l'apparence ;
 * l'aperçu est à l'échelle réelle (mm) et se met à jour en direct. Les mises en page se
 * conservent dans la table modeles_impression ; le travail en cours est aussi gardé dans ce
 * navigateur pour ne rien perdre en quittant la page.
 */

let ctx = null;
let typeDoc = "carton";
let config = null;
let modeles = [];
let modeleCourantId = "defaut";
let referenceJSON = "";
let tableAbsente = false;
let blocsOuverts = new Set();
let minuterieApercu = null;
let attenteCartes = Promise.resolve();

const FACES = { recto: "Recto", verso: "Verso" };

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/battues.html");
    afficherBandeauDemoSiBesoin();

    const parametres = new URLSearchParams(window.location.search);
    const idBattue = parametres.get("id");
    typeDoc = parametres.get("doc") === "fiche" ? "fiche" : "carton";
    const zoneChargement = document.getElementById("zone-chargement");
    if (!idBattue) { zoneChargement.textContent = "Aucune battue indiquée."; return; }

    const { data: battue } = await clientSupabase.from("battues").select().eq("id", idBattue).single();
    if (!battue || battue.est_modele) { zoneChargement.textContent = "Battue introuvable (les modèles de battue ne s'impriment pas : crée d'abord une battue datée)."; return; }

    const [chasseurs, participants, parcelles, especes, plans, prelevements, traques] = await Promise.all([
        clientSupabase.from("chasseurs").select(),
        clientSupabase.from("participants_battue").select().eq("battue_id", idBattue),
        clientSupabase.from("parcelles").select(),
        clientSupabase.from("especes_gibier").select().order("nom"),
        clientSupabase.from("plans_chasse").select(),
        clientSupabase.from("prelevements").select(),
        clientSupabase.from("traques").select().eq("battue_id", idBattue).order("numero"),
    ]);
    const listeTraques = traques.data || [];
    let postes = [];
    if (listeTraques.length > 0) {
        const { data } = await clientSupabase.from("postes_traque").select().in("traque_id", listeTraques.map((t) => t.id));
        postes = data || [];
    }
    ctx = {
        battue, chasseurs: chasseurs.data || [], participants: participants.data || [], parcelles: parcelles.data || [],
        especes: especes.data || [], plans: plans.data || [], prelevements: prelevements.data || [],
        traques: listeTraques, postes,
    };

    await chargerModeles();
    choisirConfigInitiale();

    const dateTexte = ctx.battue.date_battue ? parseDate(ctx.battue.date_battue).toLocaleDateString("fr-FR") : "";
    document.getElementById("titre-page").textContent = typeDoc === "carton" ? "Cartons de battue (A5)" : "Fiche de gestion (A4)";
    document.getElementById("sous-titre-page").textContent = `${dateTexte}${battue.secteur ? " · " + battue.secteur : ""}`;
    document.getElementById("lien-plan").href = `plan-battue.html?id=${idBattue}`;
    document.getElementById("lien-carton").href = `impression.html?id=${idBattue}&doc=carton`;
    document.getElementById("lien-fiche").href = `impression.html?id=${idBattue}&doc=fiche`;
    document.getElementById(typeDoc === "carton" ? "lien-carton" : "lien-fiche").classList.add("bouton-principal");
    document.getElementById(typeDoc === "carton" ? "lien-carton" : "lien-fiche").classList.remove("bouton-secondaire");
    document.getElementById("aide-impression").textContent = typeDoc === "carton"
        ? "2 cartons A5 par feuille A4 : imprime en recto-verso (retournement sur le bord long), à 100 %, sans marges ni mise à l'échelle, puis découpe sur le trait pointillé."
        : "Feuille A4 en recto-verso (retournement sur le bord long), à 100 %, sans marges ni mise à l'échelle.";
    document.title = typeDoc === "carton" ? "Cartons de battue" : "Fiche de gestion";

    document.getElementById("bouton-imprimer").addEventListener("click", imprimer);
    window.addEventListener("resize", ajusterEchelle);

    zoneChargement.style.display = "none";
    document.getElementById("zone-contenu").style.display = "block";
    construirePanneau();
    rendreApercu();
})();

// ----------------------------------------------------------------------------
// Mises en page enregistrées
// ----------------------------------------------------------------------------

function lireStockage(cle) {
    try { return localStorage.getItem(cle); } catch (e) { return null; }
}

function ecrireStockage(cle, valeur) {
    try { localStorage.setItem(cle, valeur); } catch (e) { /* stockage indisponible */ }
}

async function chargerModeles() {
    const { data, error } = await clientSupabase.from("modeles_impression").select().eq("type", typeDoc);
    tableAbsente = !!error;
    modeles = (data || []).sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr"));
}

function configDuModele(id) {
    if (id === "defaut") return normaliserConfig(configParDefaut(typeDoc), typeDoc);
    const m = modeles.find((x) => x.id === id);
    return m ? normaliserConfig(m.config, typeDoc) : null;
}

function choisirConfigInitiale() {
    const idMemorise = lireStockage(`foret_impression_modele_${typeDoc}`) || "defaut";
    modeleCourantId = idMemorise === "defaut" || modeles.some((m) => m.id === idMemorise) ? idMemorise : "defaut";
    referenceJSON = instantaneConfig(configDuModele(modeleCourantId));
    let brouillon = null;
    try { brouillon = JSON.parse(lireStockage(`foret_impression_brouillon_${typeDoc}`)); } catch (e) { /* aucun brouillon */ }
    config = brouillon && brouillon.faces ? normaliserConfig(brouillon, typeDoc) : configDuModele(modeleCourantId);
}

function sauverBrouillon() {
    ecrireStockage(`foret_impression_brouillon_${typeDoc}`, JSON.stringify(config));
    ecrireStockage(`foret_impression_modele_${typeDoc}`, modeleCourantId);
}

/** Représentation comparable d'une configuration : les identifiants de blocs (uid) sont régénérés à chaque chargement. */
function instantaneConfig(c) {
    return JSON.stringify(c, (cle, valeur) => (cle === "uid" ? undefined : valeur));
}

function estModifie() {
    return instantaneConfig(config) !== referenceJSON;
}

function chargerConfig(id) {
    const c = configDuModele(id);
    if (!c) return;
    modeleCourantId = id;
    config = c;
    referenceJSON = instantaneConfig(c);
    sauverBrouillon();
    construirePanneau();
    rendreApercu();
}

async function enregistrerModele() {
    if (modeleCourantId === "defaut") return enregistrerSous();
    const { error } = await clientSupabase.from("modeles_impression").update({ config, nom: config.nom }).eq("id", modeleCourantId);
    if (error) return;
    referenceJSON = instantaneConfig(config);
    await chargerModeles();
    construirePanneau();
}

async function enregistrerSous() {
    const nom = prompt("Nom de cette mise en page :", modeleCourantId === "defaut" ? "Ma mise en page" : `${config.nom} (copie)`);
    if (!nom || !nom.trim()) return;
    config.nom = nom.trim();
    const { data, error } = await clientSupabase.from("modeles_impression").insert({ type: typeDoc, nom: config.nom, config }).select().single();
    if (error || !data) return;
    await chargerModeles();
    modeleCourantId = data.id;
    referenceJSON = instantaneConfig(config);
    sauverBrouillon();
    construirePanneau();
}

async function supprimerModele() {
    if (modeleCourantId === "defaut") return;
    const modele = modeles.find((m) => m.id === modeleCourantId);
    if (!confirm(`Supprimer la mise en page « ${modele ? modele.nom : ""} » ?`)) return;
    await clientSupabase.from("modeles_impression").delete().eq("id", modeleCourantId);
    await chargerModeles();
    chargerConfig("defaut");
}

// ----------------------------------------------------------------------------
// Panneau de réglages
// ----------------------------------------------------------------------------

function genererChampOption(def, valeur, uid) {
    const id = `opt-${uid}-${def.cle}`;
    if (def.type === "bool") {
        return `<label class="etiquette" style="font-weight:400;"><input type="checkbox" data-uid="${uid}" data-opt="${def.cle}" ${valeur ? "checked" : ""}> ${echapper(def.libelle)}</label>`;
    }
    const etiquette = `<label class="etiquette" for="${id}">${echapper(def.libelle)}</label>`;
    if (def.type === "texte") return `${etiquette}<input type="text" id="${id}" data-uid="${uid}" data-opt="${def.cle}" value="${echapper(valeur)}">`;
    if (def.type === "zone") return `${etiquette}<textarea id="${id}" rows="3" data-uid="${uid}" data-opt="${def.cle}">${echapper(valeur)}</textarea>`;
    if (def.type === "nombre") return `${etiquette}<input type="number" id="${id}" data-uid="${uid}" data-opt="${def.cle}" value="${echapper(valeur)}" min="${def.min ?? ""}" max="${def.max ?? ""}" step="${def.pas ?? 1}">`;
    return `${etiquette}<select id="${id}" data-uid="${uid}" data-opt="${def.cle}">${def.choix.map(([v, l]) => `<option value="${echapper(v)}" ${String(valeur) === String(v) ? "selected" : ""}>${echapper(l)}</option>`).join("")}</select>`;
}

function htmlBloc(bloc, face, index, total) {
    const def = BLOCS[bloc.bloc];
    const autreFace = face === "recto" ? "verso" : "recto";
    return `<div class="ib-bloc-edit ${bloc.actif ? "" : "inactif"} ${blocsOuverts.has(bloc.uid) ? "ouvert" : ""}" data-uid="${bloc.uid}">
        <div class="entete-bloc">
            <input type="checkbox" data-actif="${bloc.uid}" ${bloc.actif ? "checked" : ""} title="Afficher ce bloc">
            <span class="nom" data-ouvrir="${bloc.uid}" title="${echapper(def.description)}">${echapper(def.libelle)}</span>
            <button type="button" class="bouton bouton-secondaire" data-monter="${bloc.uid}" ${index === 0 ? "disabled" : ""} title="Monter">▲</button>
            <button type="button" class="bouton bouton-secondaire" data-descendre="${bloc.uid}" ${index === total - 1 ? "disabled" : ""} title="Descendre">▼</button>
            <button type="button" class="bouton bouton-secondaire" data-deplacer="${bloc.uid}" title="Déplacer vers le ${autreFace}">⇄</button>
            <button type="button" class="bouton bouton-danger" data-supprimer="${bloc.uid}" title="Retirer ce bloc">✕</button>
        </div>
        <div class="options-bloc">
            <div class="ligne-champs">
                <div><label class="etiquette">Largeur</label>
                    <select data-uid="${bloc.uid}" data-general="largeur"><option value="pleine" ${bloc.largeur === "pleine" ? "selected" : ""}>Pleine</option><option value="moitie" ${bloc.largeur === "moitie" ? "selected" : ""}>Moitié (se place à côté du bloc suivant)</option></select></div>
                <div><label class="etiquette">Hauteur</label>
                    <select data-uid="${bloc.uid}" data-general="taille"><option value="auto" ${bloc.taille === "auto" ? "selected" : ""}>Selon le contenu</option><option value="remplir" ${bloc.taille === "remplir" ? "selected" : ""}>Remplit la place restante</option><option value="fixe" ${bloc.taille === "fixe" ? "selected" : ""}>Fixe (mm)</option></select></div>
            </div>
            ${bloc.taille === "fixe" ? `<label class="etiquette">Hauteur fixe (mm)</label><input type="number" min="5" max="280" data-uid="${bloc.uid}" data-general="hauteurMm" value="${bloc.hauteurMm}">` : ""}
            ${def.options.map((opt) => genererChampOption(opt, bloc.options[opt.cle], bloc.uid)).join("")}
        </div>
    </div>`;
}

function construirePanneau() {
    const modifie = estModifie();
    const optionsModeles = `<option value="defaut" ${modeleCourantId === "defaut" ? "selected" : ""}>Mise en page standard</option>` +
        modeles.map((m) => `<option value="${m.id}" ${modeleCourantId === m.id ? "selected" : ""}>${echapper(m.nom)}</option>`).join("");
    const s = config.style;
    document.getElementById("panneau").innerHTML = `
        <div class="ib-section">
            <h3>Mise en page ${modifie ? '<span style="color:#a3442f; text-transform:none;">(modifiée)</span>' : ""}</h3>
            <select id="select-modele">${optionsModeles}</select>
            ${tableAbsente ? '<p style="font-size:12px; color:#a3442f; margin:6px 0 0;">Pour enregistrer des mises en page, recopie schema.sql dans l\'éditeur SQL de Supabase (Run).</p>' : ""}
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
                <button type="button" class="bouton bouton-principal" id="bouton-enregistrer-modele" ${tableAbsente || modeleCourantId === "defaut" || !modifie ? "disabled" : ""}>Enregistrer</button>
                <button type="button" class="bouton bouton-secondaire" id="bouton-enregistrer-sous" ${tableAbsente ? "disabled" : ""}>Enregistrer sous…</button>
                <button type="button" class="bouton bouton-secondaire" id="bouton-reinitialiser" ${modifie ? "" : "disabled"}>Annuler mes changements</button>
                <button type="button" class="bouton bouton-danger" id="bouton-supprimer-modele" ${modeleCourantId === "defaut" ? "disabled" : ""}>Supprimer</button>
            </div>
        </div>

        <div class="ib-section">
            <h3>Apparence</h3>
            <div class="ligne-champs">
                <div><label class="etiquette">Palette</label><select data-style="palette">${Object.entries(PALETTES).map(([k, p]) => `<option value="${k}" ${s.palette === k ? "selected" : ""}>${echapper(p.libelle)}</option>`).join("")}</select></div>
                <div><label class="etiquette">Police</label><select data-style="police">${Object.entries(POLICES).map(([k, p]) => `<option value="${k}" ${s.police === k ? "selected" : ""}>${echapper(p.libelle)}</option>`).join("")}</select></div>
            </div>
            <div class="ligne-champs">
                <div><label class="etiquette">Taille du texte (pt)</label><input type="number" min="6" max="14" step="0.5" data-style="tailleBase" value="${s.tailleBase}"></div>
                <div><label class="etiquette">Marge intérieure (mm)</label><input type="number" min="4" max="25" step="1" data-style="marge" value="${s.marge}"></div>
            </div>
            <label class="etiquette" style="font-weight:400;"><input type="checkbox" data-style="cadre" ${s.cadre !== false ? "checked" : ""}> Cadre à double filet</label>
            <label class="etiquette" style="font-weight:400;"><input type="checkbox" data-style="fondPapier" ${s.fondPapier ? "checked" : ""}> Fond papier crème (consomme de l'encre)</label>
            ${typeDoc === "carton" ? `<label class="etiquette" style="font-weight:400;"><input type="checkbox" data-style="traitsCoupe" ${s.traitsCoupe ? "checked" : ""}> Trait de coupe entre les deux cartons</label>` : ""}
        </div>

        ${["recto", "verso"].map((face) => `
        <div class="ib-section">
            <h3>${FACES[face]} ${typeDoc === "carton" ? "du carton" : "de la fiche"}</h3>
            ${config.faces[face].length === 0 ? '<em style="color:#888; font-size:13px;">Aucun bloc sur cette face.</em>' : ""}
            ${config.faces[face].map((b, i) => htmlBloc(b, face, i, config.faces[face].length)).join("")}
            <div style="display:flex; gap:6px; margin-top:8px;">
                <select data-ajout-liste="${face}" style="flex:1;">${Object.entries(BLOCS).map(([k, d]) => `<option value="${k}">${echapper(d.libelle)}</option>`).join("")}</select>
                <button type="button" class="bouton bouton-secondaire" data-ajouter="${face}">Ajouter</button>
            </div>
        </div>`).join("")}
    `;
    brancherPanneau();
}

function trouverBloc(uid) {
    for (const face of ["recto", "verso"]) {
        const index = config.faces[face].findIndex((b) => b.uid === uid);
        if (index >= 0) return { face, index, bloc: config.faces[face][index] };
    }
    return null;
}

function changementConfig(structure) {
    sauverBrouillon();
    if (structure) construirePanneau();
    else majIndicateurModifie();
    planifierApercu();
}

function majIndicateurModifie() {
    const titre = document.querySelector("#panneau .ib-section h3");
    if (titre) titre.innerHTML = `Mise en page ${estModifie() ? '<span style="color:#a3442f; text-transform:none;">(modifiée)</span>' : ""}`;
    const modifie = estModifie();
    const enregistrer = document.getElementById("bouton-enregistrer-modele");
    if (enregistrer) enregistrer.disabled = tableAbsente || modeleCourantId === "defaut" || !modifie;
    const reinit = document.getElementById("bouton-reinitialiser");
    if (reinit) reinit.disabled = !modifie;
}

function brancherPanneau() {
    const panneau = document.getElementById("panneau");
    document.getElementById("select-modele").addEventListener("change", (e) => {
        if (estModifie() && !confirm("Tes changements non enregistrés seront perdus. Continuer ?")) { e.target.value = modeleCourantId; return; }
        chargerConfig(e.target.value);
    });
    document.getElementById("bouton-enregistrer-modele").addEventListener("click", enregistrerModele);
    document.getElementById("bouton-enregistrer-sous").addEventListener("click", enregistrerSous);
    document.getElementById("bouton-supprimer-modele").addEventListener("click", supprimerModele);
    document.getElementById("bouton-reinitialiser").addEventListener("click", () => chargerConfig(modeleCourantId));

    panneau.querySelectorAll("[data-style]").forEach((champ) => {
        champ.addEventListener(champ.type === "number" || champ.type === "text" ? "input" : "change", () => {
            const cle = champ.dataset.style;
            config.style[cle] = champ.type === "checkbox" ? champ.checked : champ.type === "number" ? Number(champ.value) : champ.value;
            changementConfig(false);
        });
    });
    panneau.querySelectorAll("[data-opt]").forEach((champ) => {
        champ.addEventListener(champ.type === "number" || champ.type === "text" || champ.tagName === "TEXTAREA" ? "input" : "change", () => {
            const t = trouverBloc(champ.dataset.uid);
            if (!t) return;
            t.bloc.options[champ.dataset.opt] = champ.type === "checkbox" ? champ.checked : champ.type === "number" ? Number(champ.value) : champ.value;
            changementConfig(false);
        });
    });
    panneau.querySelectorAll("[data-general]").forEach((champ) => {
        champ.addEventListener(champ.type === "number" ? "input" : "change", () => {
            const t = trouverBloc(champ.dataset.uid);
            if (!t) return;
            t.bloc[champ.dataset.general] = champ.type === "number" ? Number(champ.value) : champ.value;
            changementConfig(champ.dataset.general === "taille");
        });
    });
    panneau.querySelectorAll("[data-actif]").forEach((champ) => champ.addEventListener("change", () => {
        const t = trouverBloc(champ.dataset.actif);
        if (t) { t.bloc.actif = champ.checked; champ.closest(".ib-bloc-edit").classList.toggle("inactif", !champ.checked); changementConfig(false); }
    }));
    panneau.querySelectorAll("[data-ouvrir]").forEach((el) => el.addEventListener("click", () => {
        const uid = el.dataset.ouvrir;
        if (blocsOuverts.has(uid)) blocsOuverts.delete(uid); else blocsOuverts.add(uid);
        el.closest(".ib-bloc-edit").classList.toggle("ouvert", blocsOuverts.has(uid));
    }));
    const deplacer = (uid, delta) => {
        const t = trouverBloc(uid);
        if (!t) return;
        const liste = config.faces[t.face];
        const cible = t.index + delta;
        if (cible < 0 || cible >= liste.length) return;
        [liste[t.index], liste[cible]] = [liste[cible], liste[t.index]];
        changementConfig(true);
    };
    panneau.querySelectorAll("[data-monter]").forEach((b) => b.addEventListener("click", () => deplacer(b.dataset.monter, -1)));
    panneau.querySelectorAll("[data-descendre]").forEach((b) => b.addEventListener("click", () => deplacer(b.dataset.descendre, 1)));
    panneau.querySelectorAll("[data-deplacer]").forEach((b) => b.addEventListener("click", () => {
        const t = trouverBloc(b.dataset.deplacer);
        if (!t) return;
        config.faces[t.face].splice(t.index, 1);
        config.faces[t.face === "recto" ? "verso" : "recto"].push(t.bloc);
        changementConfig(true);
    }));
    panneau.querySelectorAll("[data-supprimer]").forEach((b) => b.addEventListener("click", () => {
        const t = trouverBloc(b.dataset.supprimer);
        if (!t) return;
        config.faces[t.face].splice(t.index, 1);
        changementConfig(true);
    }));
    panneau.querySelectorAll("[data-ajouter]").forEach((b) => b.addEventListener("click", () => {
        const face = b.dataset.ajouter;
        const cle = panneau.querySelector(`[data-ajout-liste="${face}"]`).value;
        const bloc = nouveauBloc(cle);
        config.faces[face].push(bloc);
        blocsOuverts.add(bloc.uid);
        changementConfig(true);
    }));
}

// ----------------------------------------------------------------------------
// Aperçu et impression
// ----------------------------------------------------------------------------

function planifierApercu() {
    clearTimeout(minuterieApercu);
    minuterieApercu = setTimeout(rendreApercu, 180);
}

function ajusterEchelle() {
    const boite = document.getElementById("apercu");
    const echelle = document.getElementById("echelle");
    if (!boite || !echelle) return;
    echelle.style.transform = "none";
    const largeurPage = echelle.offsetWidth;
    const facteur = Math.min(1, boite.clientWidth / largeurPage);
    echelle.style.transform = `scale(${facteur})`;
    boite.style.height = `${echelle.offsetHeight * facteur}px`;
}

function rendreApercu() {
    const racine = document.getElementById("racine");
    const a = attributsRacine(config);
    racine.className = a.classes;
    racine.setAttribute("style", a.style);
    const legendes = {
        carton: { recto: "Recto : feuille à imprimer en premier (2 cartons)", verso: "Verso : au dos de la même feuille (2 cartons)" },
        fiche: { recto: "Recto : page 1", verso: "Verso : page 2 (au dos)" },
    }[typeDoc];
    racine.innerHTML = rendreDocument(config, ctx).map((f) =>
        `<div class="ib-legende-feuille ib-hors-impression">${legendes[f.nom]}</div>${f.html}`).join("");
    ajusterEchelle();
    attenteCartes = initialiserCartesImpression(racine, ctx);
    requestAnimationFrame(() => {
        const faces = detecterDebordements(racine);
        const alerte = document.getElementById("alerte-debordement");
        alerte.style.display = faces.length ? "block" : "none";
        alerte.textContent = faces.length
            ? `Le ${faces.map((f) => FACES[f].toLowerCase()).join(" et le ")} dépasse la page (cadre rouge) : le bas serait coupé à l'impression. Retire un bloc, réduis le texte ou la hauteur des lignes.`
            : "";
        ajusterEchelle();
    });
}

async function imprimer() {
    const bouton = document.getElementById("bouton-imprimer");
    bouton.disabled = true;
    const texte = bouton.textContent;
    bouton.textContent = "Chargement des cartes…";
    try {
        await Promise.race([attenteCartes, new Promise((r) => setTimeout(r, 10000))]);
    } finally {
        bouton.textContent = texte;
        bouton.disabled = false;
    }
    window.print();
}
