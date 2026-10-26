/**
 * Plan de battue détaillé : une journée de battue (battues) peut compter
 * plusieurs traques, chacune avec son propre tracé (mouvement, ligne des
 * rabatteurs, parkings, accès), ses postes affectés à un chasseur, et son
 * décompte d'animaux prélevés.
 */

let battueCourante = null;
let chasseursCache = [];
let parcellesCache = [];
let especesCache = [];
let postesChasseCache = [];
let traquesEtat = [];
let compteurCleLocale = 0;

const COULEUR_MOUVEMENT = "#a3442f";
const COULEUR_RABATTEURS = "#3a6b8a";

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/chasse.html");
    afficherBandeauDemoSiBesoin();

    const idBattue = new URLSearchParams(window.location.search).get("id");
    if (!idBattue) {
        document.getElementById("zone-chargement").textContent = "Aucune battue indiquée.";
        return;
    }

    const { data: battue } = await clientSupabase.from("battues").select().eq("id", idBattue).single();
    if (!battue) {
        document.getElementById("zone-chargement").textContent = "Battue introuvable.";
        return;
    }
    battueCourante = battue;

    const [chasseurs, parcelles, especes, postesChasse, traquesExistantes] = await Promise.all([
        clientSupabase.from("chasseurs").select().order("nom"),
        clientSupabase.from("parcelles").select().order("nom"),
        clientSupabase.from("especes_gibier").select().order("nom"),
        clientSupabase.from("postes_chasse").select().order("nom"),
        clientSupabase.from("traques").select().eq("battue_id", idBattue).order("numero"),
    ]);
    chasseursCache = chasseurs.data || [];
    parcellesCache = parcelles.data || [];
    especesCache = especes.data || [];
    postesChasseCache = postesChasse.data || [];

    const dateFormatee = new Date(battue.date_battue).toLocaleDateString("fr-FR");
    document.getElementById("titre-page").textContent =
        `Plan de battue — ${dateFormatee}${battue.secteur ? " — " + battue.secteur : ""}`;
    document.getElementById("lien-fiche-impression").href = `../battue-impression.html?id=${battue.id}`;

    document.getElementById("zone-chargement").style.display = "none";
    document.getElementById("zone-contenu").style.display = "block";

    const traquesDB = traquesExistantes.data || [];
    if (traquesDB.length === 0) {
        ajouterNouvelleTraqueCarte();
    } else {
        for (const t of traquesDB) {
            await ajouterTraqueDepuisDB(t);
        }
    }

    document.getElementById("bouton-ajouter-traque").addEventListener("click", () => ajouterNouvelleTraqueCarte());
    document.getElementById("bouton-bibliotheque").addEventListener("click", ouvrirBibliothequePostes);
})();

function nomAffichePersonne(personne) {
    return personne.prenom ? `${personne.prenom} ${personne.nom}` : personne.nom;
}

function genererCleLocale() {
    compteurCleLocale += 1;
    return `t${compteurCleLocale}`;
}

function saisonPourDate(dateStr) {
    const d = new Date(dateStr);
    const annee = d.getFullYear();
    return d.getMonth() + 1 >= 7 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}

// ----------------------------------------------------------------------------
// Création des cartes de traque
// ----------------------------------------------------------------------------

function nouvelEtatTraqueVide() {
    return {
        cleLocale: genererCleLocale(),
        id: null,
        numero: traquesEtat.length + 1,
        nom: null,
        parcelle_id: null,
        notes: null,
        mouvement: [],
        ligne_rabatteurs: [],
        parkings: [],
        acces: [],
        postes: [],
        carte: null,
        couches: {},
        mode: "aucun",
    };
}

function ajouterNouvelleTraqueCarte() {
    const etat = nouvelEtatTraqueVide();
    traquesEtat.push(etat);
    creerCarteTraqueDOM(etat);
}

async function ajouterTraqueDepuisDB(ligneTraque) {
    const etat = nouvelEtatTraqueVide();
    etat.id = ligneTraque.id;
    etat.numero = ligneTraque.numero;
    etat.nom = ligneTraque.nom;
    etat.parcelle_id = ligneTraque.parcelle_id;
    etat.notes = ligneTraque.notes;
    etat.mouvement = ligneTraque.mouvement || [];
    etat.ligne_rabatteurs = ligneTraque.ligne_rabatteurs || [];
    etat.parkings = ligneTraque.parkings || [];
    etat.acces = ligneTraque.acces || [];

    const { data: postes } = await clientSupabase.from("postes_traque").select().eq("traque_id", ligneTraque.id);
    etat.postes = (postes || []).map((p) => ({
        cleLocale: genererCleLocale(),
        id: p.id,
        poste_id: p.poste_id,
        nom: p.nom,
        lat: p.lat,
        lng: p.lng,
        chasseur_id: p.chasseur_id,
    }));

    traquesEtat.push(etat);
    creerCarteTraqueDOM(etat);
    await rafraichirTallyPrelevements(etat);
}

function gabaritCarteTraque(etat) {
    const cle = etat.cleLocale;
    const optionsParcelles = '<option value="">— Non précisé —</option>' +
        parcellesCache.map((p) => `<option value="${p.id}" ${etat.parcelle_id === p.id ? "selected" : ""}>${p.nom}</option>`).join("");
    const optionsEspeces = especesCache.map((e) => `<option value="${e.id}">${e.nom}</option>`).join("");
    const optionsChasseurs = '<option value="">— Non précisé —</option>' +
        chasseursCache.filter((c) => c.actif).map((c) => `<option value="${c.id}">${nomAffichePersonne(c)}</option>`).join("");

    return `
        <div class="carte-traque" id="carte-traque-conteneur-${cle}">
            <div class="ligne-champs">
                <div>
                    <label class="etiquette">Nom de la traque</label>
                    <input type="text" id="champ-nom-traque-${cle}" placeholder="Traque ${etat.numero}" value="${etat.nom || ""}">
                </div>
                <div>
                    <label class="etiquette">Parcelle / secteur</label>
                    <select id="champ-parcelle-traque-${cle}">${optionsParcelles}</select>
                </div>
            </div>

            <div class="barre-outils-dessin">
                <button type="button" class="bouton bouton-secondaire" id="bouton-mode-mouvement-${cle}">Tracer le mouvement de la traque</button>
                <button type="button" class="bouton bouton-secondaire" id="bouton-mode-rabatteurs-${cle}">Tracer la ligne des rabatteurs</button>
                <button type="button" class="bouton bouton-secondaire" id="bouton-mode-parking-${cle}">Ajouter un parking</button>
                <button type="button" class="bouton bouton-secondaire" id="bouton-mode-acces-${cle}">Ajouter un accès</button>
                <button type="button" class="bouton bouton-secondaire" id="bouton-mode-poste-${cle}">Ajouter un poste (nouveau)</button>
                <button type="button" class="bouton bouton-secondaire" id="bouton-effacer-traces-${cle}">Effacer les tracés</button>
            </div>

            <div class="controles-fond-carte">
                <button type="button" id="bouton-fond-plan-${cle}" class="bouton bouton-secondaire">Plan IGN</button>
                <button type="button" id="bouton-fond-satellite-${cle}" class="bouton bouton-secondaire">Satellite</button>
            </div>
            <div id="carte-${cle}" class="conteneur-carte" style="height:320px;"></div>

            <div class="ligne-champs" style="margin-top:10px; align-items:flex-end;">
                <div>
                    <label class="etiquette">Ajouter un poste depuis la bibliothèque</label>
                    <select id="select-bibliotheque-${cle}">
                        <option value="">— Choisir un poste enregistré —</option>
                        ${postesChasseCache.map((p) => `<option value="${p.id}">${p.nom}</option>`).join("")}
                    </select>
                </div>
                <div><button type="button" class="bouton bouton-secondaire" id="bouton-ajouter-bibliotheque-${cle}">Ajouter à la traque</button></div>
            </div>

            <div class="liste-postes-traque" id="liste-postes-${cle}"></div>
            <div id="liste-parkings-${cle}" style="margin-top:8px; font-size:13px;"></div>
            <div id="liste-acces-${cle}" style="margin-top:4px; font-size:13px;"></div>

            <label class="etiquette" style="margin-top:12px;">Notes pour cette traque</label>
            <textarea id="champ-notes-traque-${cle}" rows="2">${etat.notes || ""}</textarea>

            <div class="actions-modale" style="margin-top:10px;">
                <button type="button" class="bouton bouton-danger" id="bouton-supprimer-traque-${cle}">Supprimer la traque</button>
                <span class="espace"></span>
                <span id="message-traque-${cle}"></span>
                <button type="button" class="bouton bouton-principal" id="bouton-enregistrer-traque-${cle}">Enregistrer la traque</button>
            </div>

            <div class="carte" style="margin-top:14px; padding:12px;">
                <strong style="font-size:13px;">Prélèvements de cette traque</strong>
                <div class="ligne-champs" style="margin-top:6px;">
                    <select id="champ-espece-traque-${cle}">${optionsEspeces}</select>
                    <select id="champ-chasseur-traque-${cle}">${optionsChasseurs}</select>
                </div>
                <div class="ligne-champs" style="margin-top:6px;">
                    <select id="champ-sexe-traque-${cle}">
                        <option>Indéterminé</option><option>Mâle</option><option>Femelle</option>
                    </select>
                    <input type="number" step="0.1" min="0" placeholder="Poids (kg)" id="champ-poids-traque-${cle}">
                </div>
                <button type="button" class="bouton bouton-secondaire" style="margin-top:6px;" id="bouton-ajouter-prelevement-${cle}">Enregistrer un prélèvement</button>
                <div id="tally-prelevements-${cle}" style="margin-top:8px;"></div>
            </div>
        </div>
    `;
}

function creerCarteTraqueDOM(etat) {
    const cle = etat.cleLocale;
    document.getElementById("liste-traques").insertAdjacentHTML("beforeend", gabaritCarteTraque(etat));

    document.getElementById(`bouton-mode-mouvement-${cle}`).addEventListener("click", () => basculerMode(etat, "mouvement"));
    document.getElementById(`bouton-mode-rabatteurs-${cle}`).addEventListener("click", () => basculerMode(etat, "rabatteurs"));
    document.getElementById(`bouton-mode-parking-${cle}`).addEventListener("click", () => basculerMode(etat, "parking"));
    document.getElementById(`bouton-mode-acces-${cle}`).addEventListener("click", () => basculerMode(etat, "acces"));
    document.getElementById(`bouton-mode-poste-${cle}`).addEventListener("click", () => basculerMode(etat, "poste-nouveau"));
    document.getElementById(`bouton-effacer-traces-${cle}`).addEventListener("click", () => effacerTraces(etat));
    document.getElementById(`bouton-ajouter-bibliotheque-${cle}`).addEventListener("click", () => ajouterPosteDepuisBibliotheque(etat));
    document.getElementById(`bouton-supprimer-traque-${cle}`).addEventListener("click", () => supprimerTraque(cle));
    document.getElementById(`bouton-enregistrer-traque-${cle}`).addEventListener("click", () => enregistrerTraque(etat));
    document.getElementById(`bouton-ajouter-prelevement-${cle}`).addEventListener("click", () => ajouterPrelevementTraque(cle));
    document.getElementById(`champ-parcelle-traque-${cle}`).addEventListener("change", (e) => {
        etat.parcelle_id = e.target.value || null;
        redessinerTraceTraque(etat);
    });

    try {
        initialiserCarteTraque(etat);
    } catch (erreur) {
        console.error("Carte indisponible :", erreur);
        document.getElementById(`carte-${cle}`).innerHTML =
            '<div class="message-alerte" style="margin:0;">Carte indisponible (connexion internet nécessaire). Les éléments déjà enregistrés sont conservés.</div>';
    }

    construireListePostes(etat);
    construireListesPoints(etat);
}

function initialiserCarteTraque(etat) {
    const cle = etat.cleLocale;
    const carte = L.map(`carte-${cle}`).setView([46.6, 2.5], 6);
    const fonds = creerFondsCarteIGN();
    brancherBoutonsFondCarte(carte, fonds, `bouton-fond-plan-${cle}`, `bouton-fond-satellite-${cle}`);

    etat.carte = carte;
    etat.couches = {
        contour: L.featureGroup().addTo(carte),
        mouvement: L.featureGroup().addTo(carte),
        rabatteurs: L.featureGroup().addTo(carte),
        parkings: L.featureGroup().addTo(carte),
        acces: L.featureGroup().addTo(carte),
        postes: L.featureGroup().addTo(carte),
    };

    carte.on("click", (evenement) => gererClicCarteTraque(etat, evenement));
    setTimeout(() => {
        carte.invalidateSize();
        redessinerTraceTraque(etat);
    }, 150);
}

// ----------------------------------------------------------------------------
// Modes de dessin
// ----------------------------------------------------------------------------

function basculerMode(etat, mode) {
    etat.mode = etat.mode === mode ? "aucun" : mode;
    const cle = etat.cleLocale;
    const correspondances = {
        mouvement: `bouton-mode-mouvement-${cle}`,
        rabatteurs: `bouton-mode-rabatteurs-${cle}`,
        parking: `bouton-mode-parking-${cle}`,
        acces: `bouton-mode-acces-${cle}`,
        "poste-nouveau": `bouton-mode-poste-${cle}`,
    };
    Object.entries(correspondances).forEach(([m, id]) => {
        document.getElementById(id).classList.toggle("actif", etat.mode === m);
    });
}

function gererClicCarteTraque(etat, evenement) {
    const latlng = [evenement.latlng.lat, evenement.latlng.lng];

    if (etat.mode === "mouvement") {
        etat.mouvement.push(latlng);
        redessinerTraceTraque(etat);
        return;
    }
    if (etat.mode === "rabatteurs") {
        etat.ligne_rabatteurs.push(latlng);
        redessinerTraceTraque(etat);
        return;
    }
    if (etat.mode === "parking") {
        const nom = prompt("Nom de ce parking :", `Parking ${etat.parkings.length + 1}`);
        if (!nom) return;
        etat.parkings.push({ nom, lat: latlng[0], lng: latlng[1] });
        redessinerTraceTraque(etat);
        construireListesPoints(etat);
        return;
    }
    if (etat.mode === "acces") {
        const nom = prompt("Nom de cet accès :", `Accès ${etat.acces.length + 1}`);
        if (!nom) return;
        etat.acces.push({ nom, lat: latlng[0], lng: latlng[1] });
        redessinerTraceTraque(etat);
        construireListesPoints(etat);
        return;
    }
    if (etat.mode === "poste-nouveau") {
        const nom = prompt("Nom de ce poste :", `Poste ${etat.postes.length + 1}`);
        if (!nom) return;
        const poste = { cleLocale: genererCleLocale(), id: null, poste_id: null, nom, lat: latlng[0], lng: latlng[1], chasseur_id: null };
        etat.postes.push(poste);
        redessinerTraceTraque(etat);
        construireListePostes(etat);
        if (confirm(`Enregistrer "${nom}" dans la bibliothèque de postes pour pouvoir le replacer sur d'autres traques ?`)) {
            enregistrerNouveauPosteBibliotheque(poste);
        }
    }
}

function effacerTraces(etat) {
    if (!confirm("Effacer le mouvement de la traque et la ligne des rabatteurs ?")) return;
    etat.mouvement = [];
    etat.ligne_rabatteurs = [];
    redessinerTraceTraque(etat);
}

function ajouterPosteDepuisBibliotheque(etat) {
    const select = document.getElementById(`select-bibliotheque-${etat.cleLocale}`);
    const posteId = select.value;
    if (!posteId) return;
    const poste = postesChasseCache.find((p) => p.id === posteId);
    if (!poste) return;
    etat.postes.push({
        cleLocale: genererCleLocale(),
        id: null,
        poste_id: poste.id,
        nom: poste.nom,
        lat: poste.lat,
        lng: poste.lng,
        chasseur_id: null,
    });
    select.value = "";
    redessinerTraceTraque(etat);
    construireListePostes(etat);
}

async function enregistrerNouveauPosteBibliotheque(poste) {
    const { data } = await clientSupabase.from("postes_chasse").insert({ nom: poste.nom, lat: poste.lat, lng: poste.lng }).select().single();
    poste.poste_id = data.id;
    postesChasseCache.push(data);
    traquesEtat.forEach((etat) => {
        const select = document.getElementById(`select-bibliotheque-${etat.cleLocale}`);
        if (select) select.insertAdjacentHTML("beforeend", `<option value="${data.id}">${data.nom}</option>`);
    });
}

// ----------------------------------------------------------------------------
// Rendu de la carte d'une traque
// ----------------------------------------------------------------------------

function redessinerTraceTraque(etat) {
    if (!etat.carte) return;
    const c = etat.couches;
    c.contour.clearLayers();
    c.mouvement.clearLayers();
    c.rabatteurs.clearLayers();
    c.parkings.clearLayers();
    c.acces.clearLayers();
    c.postes.clearLayers();

    const groupeEtendue = L.featureGroup();

    if (etat.parcelle_id) {
        const parcelle = parcellesCache.find((p) => p.id === etat.parcelle_id);
        if (parcelle && parcelle.contour) {
            const polygone = L.polygon(parcelle.contour, { color: "#5a7d4a", weight: 2, fillOpacity: 0.1 });
            polygone.bindTooltip(parcelle.nom, { permanent: true, direction: "center", className: "etiquette-parcelle" });
            c.contour.addLayer(polygone);
            groupeEtendue.addLayer(polygone);
        }
    }

    const groupeMouvement = dessinerLigneAvecFleche(c.mouvement, etat.mouvement, COULEUR_MOUVEMENT, false);
    if (groupeMouvement) groupeEtendue.addLayer(groupeMouvement);
    const groupeRabatteurs = dessinerLigneAvecFleche(c.rabatteurs, etat.ligne_rabatteurs, COULEUR_RABATTEURS, true);
    if (groupeRabatteurs) groupeEtendue.addLayer(groupeRabatteurs);

    etat.parkings.forEach((parking) => {
        const marqueur = L.marker([parking.lat, parking.lng], { icon: iconePointCarte("🅿️", "#3a6b8a") }).bindTooltip(parking.nom);
        c.parkings.addLayer(marqueur);
        groupeEtendue.addLayer(marqueur);
    });

    etat.acces.forEach((acces) => {
        const marqueur = L.marker([acces.lat, acces.lng], { icon: iconePointCarte("🚪", "#8a6d3a") }).bindTooltip(acces.nom);
        c.acces.addLayer(marqueur);
        groupeEtendue.addLayer(marqueur);
    });

    etat.postes.forEach((poste, index) => {
        const chasseur = chasseursCache.find((ch) => ch.id === poste.chasseur_id);
        const texte = chasseur ? `${poste.nom} — ${nomAffichePersonne(chasseur)}` : `${poste.nom} — non affecté`;
        const marqueur = L.marker([poste.lat, poste.lng], { icon: iconePosteAssigne(index + 1, !!poste.chasseur_id) })
            .bindTooltip(texte, { permanent: true, direction: "right" });
        c.postes.addLayer(marqueur);
        groupeEtendue.addLayer(marqueur);
    });

    if (groupeEtendue.getLayers().length > 0) {
        etat.carte.fitBounds(groupeEtendue.getBounds(), { maxZoom: 16, padding: [25, 25] });
    }
}

function construireListePostes(etat) {
    const zone = document.getElementById(`liste-postes-${etat.cleLocale}`);
    if (!zone) return;
    if (etat.postes.length === 0) {
        zone.innerHTML = '<em style="color:#888;">Aucun poste placé. Choisis-en un dans la bibliothèque ou clique "Ajouter un poste (nouveau)" puis clique sur la carte.</em>';
        return;
    }
    zone.innerHTML = etat.postes.map((poste, index) => `
        <div class="ligne-poste-traque">
            <span class="nom-poste">${index + 1}. ${poste.nom}</span>
            <select onchange="assignerChasseurPoste('${etat.cleLocale}','${poste.cleLocale}', this.value)">
                <option value="">— Chasseur non affecté —</option>
                ${chasseursCache.filter((c) => c.actif).map((c) =>
                    `<option value="${c.id}" ${poste.chasseur_id === c.id ? "selected" : ""}>${nomAffichePersonne(c)}</option>`
                ).join("")}
            </select>
            <button type="button" class="bouton bouton-danger" style="padding:2px 6px;" onclick="retirerPosteTraque('${etat.cleLocale}','${poste.cleLocale}')">×</button>
        </div>
    `).join("");
}

function construireListesPoints(etat) {
    const cle = etat.cleLocale;
    const zoneParkings = document.getElementById(`liste-parkings-${cle}`);
    zoneParkings.innerHTML = etat.parkings.length === 0 ? "" : etat.parkings.map((p, i) =>
        `🅿️ ${p.nom} <button type="button" class="bouton bouton-danger" style="padding:2px 6px; margin-left:4px;" onclick="retirerPoint('${cle}','parkings',${i})">×</button>`
    ).join(" &nbsp; ");

    const zoneAcces = document.getElementById(`liste-acces-${cle}`);
    zoneAcces.innerHTML = etat.acces.length === 0 ? "" : etat.acces.map((a, i) =>
        `🚪 ${a.nom} <button type="button" class="bouton bouton-danger" style="padding:2px 6px; margin-left:4px;" onclick="retirerPoint('${cle}','acces',${i})">×</button>`
    ).join(" &nbsp; ");
}

function retirerPoint(cleLocale, liste, index) {
    const etat = traquesEtat.find((t) => t.cleLocale === cleLocale);
    if (!etat) return;
    etat[liste].splice(index, 1);
    redessinerTraceTraque(etat);
    construireListesPoints(etat);
}

function assignerChasseurPoste(cleLocale, clePoste, chasseurId) {
    const etat = traquesEtat.find((t) => t.cleLocale === cleLocale);
    if (!etat) return;
    const poste = etat.postes.find((p) => p.cleLocale === clePoste);
    if (!poste) return;
    poste.chasseur_id = chasseurId || null;
    redessinerTraceTraque(etat);
}

function retirerPosteTraque(cleLocale, clePoste) {
    const etat = traquesEtat.find((t) => t.cleLocale === cleLocale);
    if (!etat) return;
    etat.postes = etat.postes.filter((p) => p.cleLocale !== clePoste);
    redessinerTraceTraque(etat);
    construireListePostes(etat);
}

// ----------------------------------------------------------------------------
// Enregistrement / suppression d'une traque
// ----------------------------------------------------------------------------

async function enregistrerTraque(etat) {
    const cle = etat.cleLocale;
    etat.nom = document.getElementById(`champ-nom-traque-${cle}`).value.trim() || null;
    etat.parcelle_id = document.getElementById(`champ-parcelle-traque-${cle}`).value || null;
    etat.notes = document.getElementById(`champ-notes-traque-${cle}`).value.trim() || null;

    const valeurs = {
        battue_id: battueCourante.id,
        numero: etat.numero,
        nom: etat.nom,
        parcelle_id: etat.parcelle_id,
        mouvement: etat.mouvement.length >= 2 ? etat.mouvement : null,
        ligne_rabatteurs: etat.ligne_rabatteurs.length >= 2 ? etat.ligne_rabatteurs : null,
        parkings: etat.parkings,
        acces: etat.acces,
        notes: etat.notes,
    };

    if (etat.id) {
        await clientSupabase.from("traques").update(valeurs).eq("id", etat.id);
    } else {
        const { data } = await clientSupabase.from("traques").insert(valeurs).select().single();
        etat.id = data.id;
    }

    await clientSupabase.from("postes_traque").delete().eq("traque_id", etat.id);
    if (etat.postes.length > 0) {
        const { data: posesInserees } = await clientSupabase.from("postes_traque").insert(
            etat.postes.map((p) => ({
                traque_id: etat.id,
                poste_id: p.poste_id,
                nom: p.nom,
                lat: p.lat,
                lng: p.lng,
                chasseur_id: p.chasseur_id,
            }))
        ).select();
        if (posesInserees) {
            posesInserees.forEach((inseree, index) => { etat.postes[index].id = inseree.id; });
        }
    }

    const message = document.getElementById(`message-traque-${cle}`);
    message.innerHTML = '<span style="color:#5a7d4a; font-size:13px;">Traque enregistrée.</span>';
    setTimeout(() => { message.innerHTML = ""; }, 2500);
}

async function supprimerTraque(cleLocale) {
    const index = traquesEtat.findIndex((t) => t.cleLocale === cleLocale);
    if (index === -1) return;
    const etat = traquesEtat[index];
    if (!confirm("Supprimer cette traque, son plan et ses postes ?")) return;

    if (etat.id) {
        await clientSupabase.from("postes_traque").delete().eq("traque_id", etat.id);
        await clientSupabase.from("prelevements").update({ traque_id: null }).eq("traque_id", etat.id);
        await clientSupabase.from("traques").delete().eq("id", etat.id);
    }

    traquesEtat.splice(index, 1);
    document.getElementById(`carte-traque-conteneur-${cleLocale}`).remove();
}

// ----------------------------------------------------------------------------
// Prélèvements par traque
// ----------------------------------------------------------------------------

async function ajouterPrelevementTraque(cleLocale) {
    const etat = traquesEtat.find((t) => t.cleLocale === cleLocale);
    if (!etat) return;
    if (!etat.id) {
        alert("Enregistre d'abord cette traque (bouton \"Enregistrer la traque\") avant d'ajouter un prélèvement.");
        return;
    }
    const especeId = document.getElementById(`champ-espece-traque-${cleLocale}`).value;
    if (!especeId) return;

    await clientSupabase.from("prelevements").insert({
        date_prelevement: battueCourante.date_battue,
        saison: saisonPourDate(battueCourante.date_battue),
        espece_id: especeId,
        chasseur_id: document.getElementById(`champ-chasseur-traque-${cleLocale}`).value || null,
        battue_id: battueCourante.id,
        traque_id: etat.id,
        sexe: document.getElementById(`champ-sexe-traque-${cleLocale}`).value,
        poids_kg: parseFloat(document.getElementById(`champ-poids-traque-${cleLocale}`).value) || null,
    });

    document.getElementById(`champ-poids-traque-${cleLocale}`).value = "";
    await rafraichirTallyPrelevements(etat);
}

async function rafraichirTallyPrelevements(etat) {
    if (!etat.id) return;
    const { data } = await clientSupabase.from("prelevements").select().eq("traque_id", etat.id);
    const zone = document.getElementById(`tally-prelevements-${etat.cleLocale}`);
    const liste = data || [];
    if (liste.length === 0) {
        zone.innerHTML = '<em style="color:#888; font-size:13px;">Aucun animal prélevé sur cette traque pour l\'instant.</em>';
        return;
    }
    const parEspece = {};
    liste.forEach((p) => {
        const nom = (especesCache.find((e) => e.id === p.espece_id) || {}).nom || "?";
        parEspece[nom] = (parEspece[nom] || 0) + 1;
    });
    zone.innerHTML = "<strong>Prélevés sur cette traque :</strong> " +
        Object.entries(parEspece).map(([nom, n]) => `${n} ${nom}`).join(", ");
}

// ----------------------------------------------------------------------------
// Bibliothèque de postes
// ----------------------------------------------------------------------------

function ouvrirBibliothequePostes() {
    rendreTableauBibliotheque();
    ouvrirModale("modale-bibliotheque");
}

function rendreTableauBibliotheque() {
    const corps = document.getElementById("corps-tableau-bibliotheque");
    if (postesChasseCache.length === 0) {
        corps.innerHTML = '<tr><td style="text-align:center; color:#888;">Aucun poste enregistré pour l\'instant. Ajoute un poste sur une traque et choisis de l\'enregistrer dans la bibliothèque.</td></tr>';
        return;
    }
    corps.innerHTML = postesChasseCache.map((p) => `
        <tr>
            <td>${p.nom}</td>
            <td style="text-align:right;"><button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerPosteBibliotheque('${p.id}')">Supprimer</button></td>
        </tr>
    `).join("");
}

async function supprimerPosteBibliotheque(id) {
    if (!confirm("Supprimer ce poste de la bibliothèque ? Les postes déjà placés sur une traque restent inchangés.")) return;
    await clientSupabase.from("postes_chasse").delete().eq("id", id);
    postesChasseCache = postesChasseCache.filter((p) => p.id !== id);
    rendreTableauBibliotheque();
    traquesEtat.forEach((etat) => {
        const select = document.getElementById(`select-bibliotheque-${etat.cleLocale}`);
        if (select) {
            select.innerHTML = '<option value="">— Choisir un poste enregistré —</option>' +
                postesChasseCache.map((p) => `<option value="${p.id}">${p.nom}</option>`).join("");
        }
    });
}
