/**
 * Plan de battue : une grande carte pour toute la journée.
 *
 * Étape 1, on choisit un outil (point, ligne, courbe, polygone). Étape 2, on dessine
 * sur la carte. Étape 3, on décrit ce qu'on vient de tracer (poste, parking, accès,
 * mouvement, sens de la battue, zone...) et on le rattache à une traque.
 *
 * Données : chaque traque porte ses postes (postes_traque), ses parkings et accès
 * (listes de points) et ses tracés libres (traques.elements, voir dessin-carte.js).
 */

let battueCourante = null;
let chasseursCache = [];
let parcellesCache = [];
let especesCache = [];
let postesChasseCache = [];
let traquesEtat = [];
let traqueActiveCle = null;
let compteurCle = 0;
let modifie = false;
let idsTraquesASupprimer = [];
let idParCle = new Map();            // clé locale d'une traque -> identifiant en base (pour l'annulation)
let idsEnBase = new Set();          // identifiants des traques existant en base (pour l'annulation)
let pileAnnuler = [];
let pileRefaire = [];
let dernierGroupeAnnuler = null;
let dernierInstantAnnuler = 0;

let carte = null;
let coucheParcelles = null;
let coucheElements = null;
let coucheEdition = null;
let coucheApercu = null;

let outil = null;             // "point" | "ligne" | "courbe" | "polygone" | null
let pointsEnCours = [];
let positionSouris = null;
let edition = null;           // élément ouvert dans la fenêtre de description
let editionForme = null;      // élément dont on déplace les points

const AIDES_OUTIL = {
    point: "Outil Point : clique sur la carte pour placer un poste, un parking ou un accès. Échap pour arrêter.",
    ligne: "Outil Ligne : clique chaque angle du tracé. Double-clic ou « Terminer » pour finir.",
    courbe: "Outil Courbe : clique quelques points, la courbe lissée passe par chacun. Double-clic ou « Terminer » pour finir.",
    polygone: "Outil Polygone : clique chaque sommet. Clique sur le premier point, double-clic ou « Terminer » pour fermer la zone.",
};

const TYPES_POINT = {
    poste:   { libelle: "Poste", emoji: "🎯" },
    parking: { libelle: "Parking", emoji: "🅿️" },
    acces:   { libelle: "Accès", emoji: "🚪" },
};

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/battues.html");
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
    await chargerCategories();
    chasseursCache = chasseurs.data || [];
    parcellesCache = parcelles.data || [];
    especesCache = especes.data || [];
    postesChasseCache = postesChasse.data || [];

    prepareEntete(battue);

    document.getElementById("zone-chargement").style.display = "none";
    document.getElementById("zone-contenu").style.display = "block";

    for (const t of traquesExistantes.data || []) {
        await ajouterTraqueDepuisDB(t);
    }
    if (traquesEtat.length === 0) nouvelleTraque();
    traqueActiveCle = traquesEtat[0].cle;

    try {
        initialiserCarte();
    } catch (erreur) {
        console.error("Carte indisponible :", erreur);
        document.getElementById("carte-plan").innerHTML =
            '<div class="message-alerte" style="margin:0;">Carte indisponible (connexion internet nécessaire pour charger le fond de carte). Rien n\'est perdu : reviens quand tu as du réseau.</div>';
        document.querySelectorAll("#outils-dessin .outil").forEach((b) => { b.disabled = true; });
        carte = null;
    }

    brancherEvenements();
    redessinerTout();
    if (carte) ajusterVue();
    if (traquesExistantes.data && traquesExistantes.data.length > 0) modifie = false;
})();

function prepareEntete(battue) {
    const titre = document.getElementById("titre-page");
    if (battue.est_modele) {
        titre.textContent = `Modèle de battue : ${battue.nom_modele || ""}`;
        return;
    }
    const dateFormatee = new Date(battue.date_battue + "T00:00:00").toLocaleDateString("fr-FR");
    titre.textContent = `Plan de battue, ${dateFormatee}${battue.secteur ? " · " + battue.secteur : ""}`;
    const barre = document.querySelector(".entete-page .barre-outils");
    const lien = (libelle, doc) =>
        `<a class="bouton bouton-secondaire lien-impression" target="_blank" href="impression.html?id=${battue.id}&doc=${doc}">${libelle}</a>`;
    barre.insertAdjacentHTML("afterbegin",
        `<a class="bouton bouton-secondaire" href="saisie.html?id=${battue.id}">Saisie rapide</a>` + lien("Cartons de battue", "carton") + lien("Fiche de gestion", "fiche"));
    barre.querySelectorAll(".lien-impression").forEach((a) => {
        a.addEventListener("click", (e) => {
            if (modifie && !confirm("Le plan a des modifications non enregistrées. Imprimer quand même la dernière version enregistrée ?")) e.preventDefault();
        });
    });
}

function nomAffichePersonne(personne) {
    return personne.prenom ? `${personne.prenom} ${personne.nom}` : personne.nom;
}

function nouvelleCle() {
    compteurCle += 1;
    return `k${compteurCle}`;
}

function saisonPourDate(dateStr) {
    const d = new Date(dateStr);
    const annee = d.getFullYear();
    return d.getMonth() + 1 >= 7 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}

function marquerModifie() {
    modifie = true;
}

window.addEventListener("beforeunload", (e) => {
    if (modifie) { e.preventDefault(); e.returnValue = ""; }
});

// ----------------------------------------------------------------------------
// Traques (état en mémoire)
// ----------------------------------------------------------------------------

function nouvelEtatTraque() {
    const numero = traquesEtat.reduce((max, t) => Math.max(max, t.numero), 0) + 1;
    return {
        cle: nouvelleCle(), id: null, numero, nom: null, parcelle_id: null, notes: null,
        conducteur: null, chef_de_ligne: null, vehicules: null,
        elements: [], parkings: [], acces: [], postes: [],
    };
}

function nouvelleTraque() {
    const etat = nouvelEtatTraque();
    traquesEtat.push(etat);
    return etat;
}

async function ajouterTraqueDepuisDB(ligne) {
    const etat = nouvelEtatTraque();
    etat.id = ligne.id;
    idsEnBase.add(ligne.id);
    idParCle.set(etat.cle, ligne.id);
    etat.numero = ligne.numero;
    etat.nom = ligne.nom;
    etat.parcelle_id = ligne.parcelle_id;
    etat.notes = ligne.notes;
    etat.conducteur = ligne.conducteur;
    etat.chef_de_ligne = ligne.chef_de_ligne;
    etat.vehicules = ligne.vehicules;
    etat.elements = elementsDeTraque(ligne).map((e) => ({ ...e, cle: nouvelleCle() }));
    etat.parkings = (ligne.parkings || []).map((p) => ({ ...p, cle: nouvelleCle() }));
    etat.acces = (ligne.acces || []).map((a) => ({ ...a, cle: nouvelleCle() }));
    const { data: postes } = await clientSupabase.from("postes_traque").select().eq("traque_id", ligne.id);
    etat.postes = (postes || []).map((p) => ({
        cle: nouvelleCle(), id: p.id, poste_id: p.poste_id, nom: p.nom, lat: p.lat, lng: p.lng, chasseur_id: p.chasseur_id,
    }));
    traquesEtat.push(etat);
}

function traqueActive() {
    return traquesEtat.find((t) => t.cle === traqueActiveCle) || traquesEtat[0];
}

function libelleTraque(t) {
    return t.nom || `Traque ${t.numero}`;
}

// ----------------------------------------------------------------------------
// Carte et événements
// ----------------------------------------------------------------------------

function initialiserCarte() {
    carte = L.map("carte-plan", { doubleClickZoom: true }).setView([46.6, 2.5], 6);
    const fonds = creerFondsCarteIGN();
    brancherBoutonsFondCarte(carte, fonds, "bouton-fond-plan", "bouton-fond-satellite");
    coucheParcelles = L.featureGroup().addTo(carte);
    coucheElements = L.featureGroup().addTo(carte);
    coucheApercu = L.featureGroup().addTo(carte);
    coucheEdition = L.featureGroup().addTo(carte);

    carte.on("click", (e) => clicCarte(e.latlng));
    carte.on("dblclick", () => { if (outil && outil !== "point") terminerDessin(); });
    carte.on("mousemove", (e) => {
        if (!outil || outil === "point" || pointsEnCours.length === 0) return;
        positionSouris = [e.latlng.lat, e.latlng.lng];
        redessinerApercu();
    });
    setTimeout(() => carte.invalidateSize(), 150);
}

function brancherEvenements() {
    document.querySelectorAll("#outils-dessin .outil").forEach((bouton) => {
        bouton.addEventListener("click", () => choisirOutil(bouton.dataset.outil));
    });
    document.getElementById("bouton-terminer-dessin").addEventListener("click", terminerDessin);
    document.getElementById("bouton-annuler-point").addEventListener("click", annulerDernierPoint);
    document.getElementById("bouton-abandonner-dessin").addEventListener("click", abandonnerDessin);
    document.getElementById("bouton-fin-edition-forme").addEventListener("click", terminerEditionForme);
    document.getElementById("bouton-enregistrer-plan").addEventListener("click", enregistrerPlan);
    document.getElementById("bouton-versions").addEventListener("click", ouvrirVersions);
    document.getElementById("bouton-creer-version").addEventListener("click", creerVersion);
    document.getElementById("bouton-annuler-action").addEventListener("click", annulerAction);
    document.getElementById("bouton-refaire-action").addEventListener("click", refaireAction);
    document.getElementById("bouton-ajouter-traque").addEventListener("click", () => {
        memoriser();
        const t = nouvelleTraque();
        traqueActiveCle = t.cle;
        marquerModifie();
        redessinerTout();
    });
    document.getElementById("formulaire-element").addEventListener("submit", validerElement);
    document.getElementById("bouton-annuler-element").addEventListener("click", fermerElementSansValider);
    document.getElementById("bouton-supprimer-element").addEventListener("click", supprimerElementEnEdition);
    document.getElementById("bouton-modifier-forme").addEventListener("click", () => {
        const element = edition && edition.item;
        fermerModale("modale-element");
        edition = null;
        if (element) demarrerEditionForme(element);
    });
    document.getElementById("bouton-inverser-element").addEventListener("click", () => {
        if (edition && edition.points) edition.points = edition.points.slice().reverse();
        document.getElementById("message-modale-element").innerHTML = '<div class="message-info">Sens inversé.</div>';
    });
    document.addEventListener("keydown", (e) => {
        const enSaisie = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || "");
        if (enSaisie) return;
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
            const touche = e.key.toLowerCase();
            if (touche === "z" && !e.shiftKey) { e.preventDefault(); annulerAction(); return; }
            if (touche === "y" || (touche === "z" && e.shiftKey)) { e.preventDefault(); refaireAction(); return; }
        }
        if (e.key === "Escape") { if (editionForme) terminerEditionForme(); else abandonnerDessin(); }
        if (e.key === "Enter" && outil && outil !== "point") terminerDessin();
        if (e.key === "Backspace" && outil && pointsEnCours.length) { e.preventDefault(); annulerDernierPoint(); }
    });
}

function majEtape(numero) {
    [1, 2, 3].forEach((n) => {
        const li = document.getElementById(`etape-${n}`);
        li.classList.toggle("actif", n === numero);
        li.classList.toggle("fait", n < numero);
    });
}

function definirAide(texte) {
    document.getElementById("texte-aide").textContent = texte;
}

// ----------------------------------------------------------------------------
// Dessin
// ----------------------------------------------------------------------------

function choisirOutil(nom) {
    if (!carte) return;
    if (editionForme) terminerEditionForme();
    if (outil === nom) { abandonnerDessin(); return; }
    outil = nom;
    pointsEnCours = [];
    positionSouris = null;
    coucheApercu.clearLayers();
    document.querySelectorAll("#outils-dessin .outil").forEach((b) => b.classList.toggle("actif", b.dataset.outil === nom));
    document.getElementById("carte-plan").classList.add("dessin-actif");
    carte.doubleClickZoom.disable();
    document.getElementById("actions-dessin").style.display = nom === "point" ? "none" : "";
    definirAide(AIDES_OUTIL[nom]);
    majEtape(2);
}

function quitterOutil() {
    outil = null;
    pointsEnCours = [];
    majBoutonsHistorique();
    positionSouris = null;
    if (carte) {
        coucheApercu.clearLayers();
        carte.doubleClickZoom.enable();
    }
    document.querySelectorAll("#outils-dessin .outil").forEach((b) => b.classList.remove("actif"));
    document.getElementById("carte-plan").classList.remove("dessin-actif");
    document.getElementById("actions-dessin").style.display = "none";
    definirAide("Choisis un outil ci-dessus pour dessiner. Clique sur un élément déjà dessiné pour le modifier.");
    majEtape(1);
}

function abandonnerDessin() {
    if (outil) quitterOutil();
}

function distancePixels(a, b) {
    const pa = carte.latLngToContainerPoint(a);
    const pb = carte.latLngToContainerPoint(b);
    return pa.distanceTo(pb);
}

function clicCarte(latlng) {
    if (!outil || editionForme) return;
    const point = [latlng.lat, latlng.lng];
    if (outil === "point") {
        ouvrirDescription({ nouveau: true, forme: "point", points: [point] });
        return;
    }
    const dernier = pointsEnCours[pointsEnCours.length - 1];
    if (dernier && distancePixels(dernier, latlng) < 5) return;   // 2e clic d'un double-clic
    if (outil === "polygone" && pointsEnCours.length >= 3 && distancePixels(pointsEnCours[0], latlng) < 12) {
        terminerDessin();
        return;
    }
    pointsEnCours.push(point);
    redessinerApercu();
}

function annulerDernierPoint() {
    pointsEnCours.pop();
    redessinerApercu();
}

function redessinerApercu() {
    majBoutonsHistorique();
    coucheApercu.clearLayers();
    if (pointsEnCours.length === 0) return;
    const avecSouris = positionSouris ? [...pointsEnCours, positionSouris] : pointsEnCours;
    const style = { color: "#222", weight: 3, dashArray: "4 6" };
    if (outil === "polygone" && avecSouris.length >= 3) {
        coucheApercu.addLayer(L.polygon(avecSouris, { ...style, fillOpacity: 0.1 }));
    } else if (avecSouris.length >= 2) {
        const trace = outil === "courbe" ? lisserPoints(avecSouris) : avecSouris;
        coucheApercu.addLayer(L.polyline(trace, style));
    }
    pointsEnCours.forEach((p, i) => {
        coucheApercu.addLayer(L.circleMarker(p, {
            radius: i === 0 && outil === "polygone" ? 7 : 5, color: "#222", weight: 2,
            fillColor: i === 0 ? "#f5c542" : "#fff", fillOpacity: 1, interactive: false,
        }));
    });
}

function terminerDessin() {
    if (!outil || outil === "point") return;
    const minimum = outil === "polygone" ? 3 : 2;
    if (pointsEnCours.length < minimum) {
        definirAide(`Il faut au moins ${minimum} points. ${AIDES_OUTIL[outil]}`);
        return;
    }
    const forme = outil;
    const points = pointsEnCours.slice();
    coucheApercu.clearLayers();
    pointsEnCours = [];
    positionSouris = null;
    ouvrirDescription({ nouveau: true, forme, points });
}

// ----------------------------------------------------------------------------
// Étape 3 : description de l'élément (fenêtre)
// ----------------------------------------------------------------------------

/** Retrouve un élément (poste, parking, accès ou tracé) et sa traque à partir de sa clé. */
function trouverItem(cle) {
    for (const t of traquesEtat) {
        for (const [categorie, liste] of [["poste", t.postes], ["parking", t.parkings], ["acces", t.acces], ["element", t.elements]]) {
            const item = liste.find((x) => x.cle === cle);
            if (item) return { traque: t, categorie, liste, item };
        }
    }
    return null;
}

function ouvrirDescriptionItem(cle) {
    const trouve = trouverItem(cle);
    if (!trouve) return;
    const { traque, categorie, item } = trouve;
    const forme = categorie === "element" ? item.forme : "point";
    const type = categorie === "element" ? item.type : categorie;
    const points = categorie === "element" ? item.points.map((p) => [...p]) : [[item.lat, item.lng]];
    ouvrirDescription({ nouveau: false, item, categorie, forme, type, points, traque, ancienneTraque: traque });
}

function ouvrirDescription(contexte) {
    edition = contexte;
    majEtape(3);
    const traque = contexte.traque || traqueActive();
    const forme = contexte.forme;
    const choix = forme === "point" ? Object.keys(TYPES_POINT) : typesPourForme(forme);
    const typeInitial = contexte.type || choix[0];

    document.getElementById("titre-modale-element").textContent = contexte.nouveau ? "Décrire ce que tu viens de tracer" : "Modifier cet élément";
    document.getElementById("message-modale-element").innerHTML = "";
    document.getElementById("choix-type").innerHTML = choix.map((cle) => {
        const libelle = forme === "point" ? `${TYPES_POINT[cle].emoji} ${TYPES_POINT[cle].libelle}` : TYPES_ELEMENT[cle].libelle;
        return `<label><input type="radio" name="type-element" value="${cle}" ${cle === typeInitial ? "checked" : ""}>${libelle}</label>`;
    }).join("");
    document.querySelectorAll('input[name="type-element"]').forEach((r) => r.addEventListener("change", majChampsSelonType));

    document.getElementById("champ-traque-element").innerHTML = traquesEtat.map((t) =>
        `<option value="${t.cle}" ${t.cle === traque.cle ? "selected" : ""}>${echapper(libelleTraque(t))}</option>`).join("");
    document.getElementById("champ-chasseur-element").innerHTML = '<option value="">— Non affecté —</option>' +
        chasseursCache.filter((c) => c.actif).map((c) =>
            `<option value="${c.id}">${echapper(nomAffichePersonne(c))}</option>`).join("");

    const item = contexte.item || {};
    document.getElementById("champ-nom-element").value = item.nom || "";
    document.getElementById("champ-notes-element").value = item.notes || "";
    document.getElementById("champ-chasseur-element").value = item.chasseur_id || "";
    document.getElementById("champ-bibliotheque-element").checked = false;
    document.getElementById("champ-fleche-element").checked = contexte.nouveau
        ? !!(TYPES_ELEMENT[typeInitial] || {}).fleche
        : !!item.fleche;

    document.getElementById("bouton-supprimer-element").style.display = contexte.nouveau ? "none" : "";
    document.getElementById("bouton-modifier-forme").style.display = !contexte.nouveau && forme !== "point" ? "" : "none";
    majChampsSelonType(true);
    ouvrirModale("modale-element");
    setTimeout(() => document.getElementById("champ-nom-element").focus(), 50);
}

function typeChoisi() {
    const coche = document.querySelector('input[name="type-element"]:checked');
    return coche ? coche.value : null;
}

function majChampsSelonType(initial) {
    const type = typeChoisi();
    const estPoint = edition.forme === "point";
    const estLigne = edition.forme === "ligne" || edition.forme === "courbe";
    document.getElementById("bloc-chasseur-element").style.display = type === "poste" ? "" : "none";
    document.getElementById("bloc-bibliotheque-element").style.display = type === "poste" && edition.nouveau ? "" : "none";
    document.getElementById("bloc-fleche-element").style.display = estLigne ? "" : "none";
    document.getElementById("champ-notes-element").previousElementSibling.style.display = estPoint && type !== "poste" ? "none" : "";
    document.getElementById("champ-notes-element").style.display = estPoint && type !== "poste" ? "none" : "";
    const champNom = document.getElementById("champ-nom-element");
    if (initial !== true && edition.nouveau && estLigne) {
        document.getElementById("champ-fleche-element").checked = !!(TYPES_ELEMENT[type] || {}).fleche;
    }
    if (estPoint) {
        const traque = traquesEtat.find((t) => t.cle === document.getElementById("champ-traque-element").value) || traqueActive();
        const nombre = type === "poste" ? traque.postes.length : type === "parking" ? traque.parkings.length : traque.acces.length;
        champNom.placeholder = `${TYPES_POINT[type].libelle} ${nombre + (edition.nouveau ? 1 : 0)}`;
    } else {
        champNom.placeholder = "ex : battue du matin, zone sud (facultatif)";
    }
}

function fermerElementSansValider() {
    fermerModale("modale-element");
    const etaitNouveau = edition && edition.nouveau;
    edition = null;
    if (etaitNouveau && outil === "point") { majEtape(2); return; }
    if (!outil) majEtape(1);
}

function validerElement(evenement) {
    evenement.preventDefault();
    if (!edition) return;
    memoriser();
    const type = typeChoisi();
    const traqueCible = traquesEtat.find((t) => t.cle === document.getElementById("champ-traque-element").value) || traqueActive();
    const nomSaisi = document.getElementById("champ-nom-element").value.trim();
    const notes = document.getElementById("champ-notes-element").value.trim() || null;
    const forme = edition.forme;

    // En modification, on retire l'ancien élément puis on le recrée : permet de changer de type ou de traque.
    const ancien = edition.item || {};
    if (!edition.nouveau) {
        const trouve = trouverItem(ancien.cle);
        if (trouve) trouve.liste.splice(trouve.liste.indexOf(ancien), 1);
    }

    if (forme === "point") {
        const [lat, lng] = edition.points[0];
        if (type === "poste") {
            const nom = nomSaisi || `Poste ${traqueCible.postes.length + 1}`;
            const poste = {
                cle: ancien.cle || nouvelleCle(), id: ancien.id || null, poste_id: ancien.poste_id || null, nom, lat, lng,
                chasseur_id: document.getElementById("champ-chasseur-element").value || null,
            };
            traqueCible.postes.push(poste);
            if (edition.nouveau && document.getElementById("champ-bibliotheque-element").checked) enregistrerNouveauPosteBibliotheque(poste);
        } else {
            const liste = type === "parking" ? traqueCible.parkings : traqueCible.acces;
            liste.push({ cle: ancien.cle || nouvelleCle(), nom: nomSaisi || `${TYPES_POINT[type].libelle} ${liste.length + 1}`, lat, lng });
        }
    } else {
        traqueCible.elements.push({
            cle: ancien.cle || nouvelleCle(), id: ancien.id || `e${Date.now()}${compteurCle}`,
            type, forme, points: edition.points, nom: nomSaisi || null, notes,
            fleche: forme !== "polygone" && document.getElementById("champ-fleche-element").checked,
        });
    }

    const etaitNouveauPoint = edition.nouveau && forme === "point";
    traqueActiveCle = traqueCible.cle;
    fermerModale("modale-element");
    edition = null;
    marquerModifie();
    if (etaitNouveauPoint && outil === "point") majEtape(2);
    else { quitterOutil(); majEtape(1); }
    redessinerTout();
}

function supprimerElementEnEdition() {
    if (!edition || edition.nouveau) return;
    if (!confirm("Supprimer cet élément ?")) return;
    memoriser();
    const trouve = trouverItem(edition.item.cle);
    if (trouve) trouve.liste.splice(trouve.liste.indexOf(edition.item), 1);
    fermerModale("modale-element");
    edition = null;
    marquerModifie();
    majEtape(1);
    redessinerTout();
}

// ----------------------------------------------------------------------------
// Modification de la forme (déplacer, ajouter, retirer des points)
// ----------------------------------------------------------------------------

function demarrerEditionForme(element) {
    if (!carte) return;
    quitterOutil();
    editionForme = element;
    document.getElementById("actions-edition-forme").style.display = "";
    definirAide("Déplace les points noirs. Clique un point pâle pour en ajouter un, double-clique un point noir pour le retirer.");
    majEtape(2);
    redessinerPoignees();
}

function terminerEditionForme() {
    if (!editionForme) return;
    editionForme = null;
    coucheEdition.clearLayers();
    document.getElementById("actions-edition-forme").style.display = "none";
    definirAide("Choisis un outil ci-dessus pour dessiner. Clique sur un élément déjà dessiné pour le modifier.");
    majEtape(1);
}

function redessinerPoignees() {
    coucheEdition.clearLayers();
    if (!editionForme) return;
    const element = editionForme;
    const icone = (milieu) => L.divIcon({ className: `poignee-forme${milieu ? " milieu" : ""}`, html: "<span></span>", iconSize: milieu ? [10, 10] : [14, 14], iconAnchor: milieu ? [5, 5] : [7, 7] });
    const minimum = element.forme === "polygone" ? 3 : 2;

    element.points.forEach((p, i) => {
        const poignee = L.marker(p, { icon: icone(false), draggable: true, bubblingMouseEvents: false });
        poignee.on("dragstart", () => memoriser());
        poignee.on("drag", (e) => {
            element.points[i] = [e.latlng.lat, e.latlng.lng];
            marquerModifie();
            redessinerElements();
        });
        poignee.on("dblclick", () => {
            if (element.points.length <= minimum) return;
            memoriser();
            element.points.splice(i, 1);
            marquerModifie();
            redessinerElements();
            redessinerPoignees();
        });
        coucheEdition.addLayer(poignee);
    });

    const nbSegments = element.forme === "polygone" ? element.points.length : element.points.length - 1;
    for (let i = 0; i < nbSegments; i++) {
        const a = element.points[i];
        const b = element.points[(i + 1) % element.points.length];
        const milieu = L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { icon: icone(true), bubblingMouseEvents: false });
        milieu.on("click", () => {
            memoriser();
            element.points.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
            marquerModifie();
            redessinerElements();
            redessinerPoignees();
        });
        coucheEdition.addLayer(milieu);
    }
}

// ----------------------------------------------------------------------------
// Rendu de la carte et du panneau
// ----------------------------------------------------------------------------

function redessinerTout() {
    redessinerElements();
    redessinerPanneau();
    redessinerLegende();
}

function marqueurPoint(item, icone, texte, categorie) {
    const marqueur = L.marker([item.lat, item.lng], { icon: icone, draggable: true, bubblingMouseEvents: false })
        .bindTooltip(echapper(texte), { permanent: true, direction: categorie === "poste" ? "right" : "top", offset: categorie === "poste" ? [14, 0] : [0, -12] });
    marqueur.on("click", () => {
        if (outil) { clicCarte(marqueur.getLatLng()); return; }
        ouvrirDescriptionItem(item.cle);
    });
    marqueur.on("dragstart", () => memoriser());
    marqueur.on("dragend", () => {
        const pos = marqueur.getLatLng();
        item.lat = pos.lat;
        item.lng = pos.lng;
        marquerModifie();
    });
    return marqueur;
}

function redessinerElements() {
    if (!carte) return;
    coucheParcelles.clearLayers();
    coucheElements.clearLayers();

    const parcellesVues = new Set();
    const idsParcelles = [battueCourante.parcelle_id, ...traquesEtat.map((t) => t.parcelle_id)].filter(Boolean);
    idsParcelles.forEach((id) => {
        if (parcellesVues.has(id)) return;
        parcellesVues.add(id);
        const parcelle = parcellesCache.find((p) => p.id === id);
        if (!parcelle || !parcelle.contour) return;
        const polygone = L.polygon(parcelle.contour, { color: "#5a7d4a", weight: 2, fillOpacity: 0.06, interactive: false });
        polygone.bindTooltip(echapper(parcelle.nom), { permanent: true, direction: "center", className: "etiquette-parcelle" });
        coucheParcelles.addLayer(polygone);
    });

    // Éléments de la traque active en dernier (donc au-dessus).
    const ordre = [...traquesEtat.filter((t) => t.cle !== traqueActiveCle), ...traquesEtat.filter((t) => t.cle === traqueActiveCle)];
    ordre.forEach((t) => {
        t.elements.forEach((element) => {
            const groupe = dessinerElement(coucheElements, element, t.numero);
            if (!groupe) return;
            groupe.on("click", () => { if (!outil && !editionForme) ouvrirDescriptionItem(element.cle); });
        });
        t.parkings.forEach((p) => coucheElements.addLayer(marqueurPoint(p, iconePointCarte("🅿️", "#3a6b8a"), p.nom, "parking")));
        t.acces.forEach((a) => coucheElements.addLayer(marqueurPoint(a, iconePointCarte("🚪", "#8a6d3a"), a.nom, "acces")));
        t.postes.forEach((poste, index) => {
            const chasseur = chasseursCache.find((c) => c.id === poste.chasseur_id);
            const texte = chasseur ? `${poste.nom} · ${nomAffichePersonne(chasseur)}` : `${poste.nom} · non affecté`;
            coucheElements.addLayer(marqueurPoint(poste, iconePosteAssigne(index + 1, !!poste.chasseur_id), texte, "poste"));
        });
    });
}

function ajusterVue() {
    const groupe = L.featureGroup();
    coucheElements.eachLayer((c) => groupe.addLayer(c));
    coucheParcelles.eachLayer((c) => groupe.addLayer(c));
    if (groupe.getLayers().length > 0) carte.fitBounds(groupe.getBounds(), { maxZoom: 16, padding: [30, 30] });
}

function redessinerLegende() {
    const zone = document.getElementById("legende-plan");
    const traces = traquesEtat.map((t) => `<span><i style="border-color:${couleurTraque(t.numero)}"></i>${echapper(libelleTraque(t))}</span>`).join("");
    zone.innerHTML = traces +
        '<span><i style="border-color:#222; border-top-width:5px"></i>Sens de la battue</span>' +
        '<span><i style="border-color:#444; border-top-style:dashed"></i>Rabatteurs</span>' +
        '<span>🎯 poste · 🅿️ parking · 🚪 accès</span>';
}

function libelleItem(categorie, item) {
    if (categorie === "poste") return `🎯 ${item.nom}`;
    if (categorie === "parking") return `🅿️ ${item.nom}`;
    if (categorie === "acces") return `🚪 ${item.nom}`;
    return `${(TYPES_ELEMENT[item.type] || {}).libelle || "Tracé"}${item.nom ? " : " + item.nom : ""}`;
}

function redessinerPanneau() {
    // Liste des traques
    document.getElementById("liste-traques").innerHTML = traquesEtat.map((t) =>
        `<button type="button" class="pastille-traque ${t.cle === traqueActiveCle ? "actif" : ""}" onclick="choisirTraque('${t.cle}')">
            <i style="background:${couleurTraque(t.numero)}"></i>${echapper(libelleTraque(t))}</button>`).join("");

    const t = traqueActive();
    const optionsParcelles = '<option value="">— Non précisé —</option>' +
        parcellesCache.map((p) => `<option value="${p.id}" ${t.parcelle_id === p.id ? "selected" : ""}>${echapper(p.nom)}</option>`).join("");
    const lignes = [
        ...t.postes.map((x) => ["poste", x]), ...t.parkings.map((x) => ["parking", x]),
        ...t.acces.map((x) => ["acces", x]), ...t.elements.map((x) => ["element", x]),
    ];
    const optionsEspeces = optionsCategories();
    const optionsChasseurs = '<option value="">— Non précisé —</option>' +
        chasseursCache.filter((c) => c.actif).map((c) => `<option value="${c.id}">${echapper(nomAffichePersonne(c))}</option>`).join("");
    const estModele = !!battueCourante.est_modele;

    document.getElementById("fiche-traque").innerHTML = `
        <div class="titre-bloc">${echapper(libelleTraque(t))}</div>
        <label class="etiquette" style="margin-top:0;">Nom de la traque</label>
        <input type="text" value="${echapper(t.nom)}" placeholder="Traque ${t.numero}" oninput="majChampTraque('nom', this.value)">
        <label class="etiquette">Parcelle / secteur</label>
        <select onchange="majChampTraque('parcelle_id', this.value)">${optionsParcelles}</select>

        <div class="titre-bloc" style="margin-top:14px;">Équipe de la traque</div>
        <label class="etiquette" style="margin-top:0;">Conducteur</label>
        <input type="text" list="liste-noms-chasseurs" value="${echapper(t.conducteur)}" oninput="majChampTraque('conducteur', this.value)">
        <label class="etiquette">Chef ou cheffe de ligne</label>
        <input type="text" list="liste-noms-chasseurs" value="${echapper(t.chef_de_ligne)}" oninput="majChampTraque('chef_de_ligne', this.value)">
        <label class="etiquette">Véhicules</label>
        <input type="text" value="${echapper(t.vehicules)}" placeholder="ex : Hilux blanche, remorque à chiens" oninput="majChampTraque('vehicules', this.value)">
        <datalist id="liste-noms-chasseurs">${chasseursCache.map((c) => `<option value="${echapper(nomAffichePersonne(c))}"></option>`).join("")}</datalist>

        <div class="titre-bloc" style="margin-top:14px;">Contenu de cette traque</div>
        <div class="liste-elements">
            ${lignes.length === 0 ? '<em style="color:#888;">Rien de dessiné pour l\'instant.</em>' : lignes.map(([categorie, item]) => `
                <div class="ligne-element" onclick="ouvrirDescriptionItem('${item.cle}')">
                    <span class="libelle">${echapper(libelleItem(categorie, item))}</span>
                    ${categorie === "poste" ? `<select onclick="event.stopPropagation()" onchange="affecterChasseur('${item.cle}', this.value)">
                        <option value="">— chasseur —</option>
                        ${chasseursCache.filter((c) => c.actif).map((c) => `<option value="${c.id}" ${item.chasseur_id === c.id ? "selected" : ""}>${echapper(nomAffichePersonne(c))}</option>`).join("")}
                    </select>` : ""}
                </div>`).join("")}
        </div>

        <label class="etiquette">Poste de la bibliothèque</label>
        <div style="display:flex; gap:6px;">
            <select id="select-bibliotheque" style="flex:1;">
                <option value="">— Choisir —</option>
                ${postesChasseCache.map((p) => `<option value="${p.id}">${echapper(p.nom)}</option>`).join("")}
            </select>
            <button type="button" class="bouton bouton-secondaire" onclick="ajouterPosteDepuisBibliotheque()">Placer</button>
        </div>
        <button type="button" class="bouton bouton-secondaire" style="margin-top:6px;" onclick="ouvrirBibliothequePostes()">Gérer la bibliothèque</button>

        <label class="etiquette">Notes pour cette traque</label>
        <textarea rows="2" oninput="majChampTraque('notes', this.value)">${echapper(t.notes)}</textarea>
        <button type="button" class="bouton bouton-danger" style="margin-top:8px;" onclick="supprimerTraque()">Supprimer cette traque</button>

        ${estModele ? "" : `
        <div class="titre-bloc" style="margin-top:16px;">Prélèvements de cette traque</div>
        <div class="ligne-champs">
            <select id="champ-espece-traque">${optionsEspeces}</select>
            <select id="champ-chasseur-traque">${optionsChasseurs}</select>
        </div>
        <div class="ligne-champs" style="margin-top:6px;">
            <select id="champ-sexe-traque"><option>Indéterminé</option><option>Mâle</option><option>Femelle</option></select>
            <input type="number" step="0.1" min="0" placeholder="Poids (kg)" id="champ-poids-traque">
        </div>
        <button type="button" class="bouton bouton-secondaire" style="margin-top:6px;" onclick="ajouterPrelevementTraque()">Enregistrer un prélèvement</button>
        <div id="tally-prelevements" style="margin-top:8px; font-size:13px;"></div>`}
    `;
    if (!estModele) rafraichirTallyPrelevements(t);
}

function choisirTraque(cle) {
    traqueActiveCle = cle;
    redessinerTout();
    const t = traqueActive();
    if (!carte) return;
    const groupe = L.featureGroup();
    t.elements.forEach((e) => (e.points || []).forEach((p) => groupe.addLayer(L.marker(p))));
    [...t.postes, ...t.parkings, ...t.acces].forEach((p) => groupe.addLayer(L.marker([p.lat, p.lng])));
    if (groupe.getLayers().length > 0) carte.fitBounds(groupe.getBounds(), { maxZoom: 16, padding: [40, 40] });
}

function majChampTraque(champ, valeur) {
    const t = traqueActive();
    memoriser(`champ:${t.cle}:${champ}`);
    t[champ] = valeur.trim ? (valeur.trim() === "" ? null : valeur) : valeur;
    if (champ === "parcelle_id") {
        t.parcelle_id = valeur || null;
        redessinerElements();
        const parcelle = parcellesCache.find((p) => p.id === t.parcelle_id);
        if (carte && parcelle && parcelle.contour) carte.fitBounds(L.polygon(parcelle.contour).getBounds(), { maxZoom: 16, padding: [30, 30] });
    }
    if (champ === "nom") {
        document.querySelectorAll(".pastille-traque.actif").forEach((b) => { b.lastChild.textContent = libelleTraque(t); });
        redessinerLegende();
    }
    marquerModifie();
}

function affecterChasseur(cle, chasseurId) {
    const trouve = trouverItem(cle);
    if (!trouve) return;
    memoriser();
    trouve.item.chasseur_id = chasseurId || null;
    marquerModifie();
    redessinerElements();
}

// ----------------------------------------------------------------------------
// Bibliothèque de postes
// ----------------------------------------------------------------------------

function ajouterPosteDepuisBibliotheque() {
    const select = document.getElementById("select-bibliotheque");
    const poste = postesChasseCache.find((p) => p.id === select.value);
    if (!poste) return;
    const t = traqueActive();
    memoriser();
    t.postes.push({ cle: nouvelleCle(), id: null, poste_id: poste.id, nom: poste.nom, lat: poste.lat, lng: poste.lng, chasseur_id: null });
    marquerModifie();
    redessinerTout();
}

async function enregistrerNouveauPosteBibliotheque(poste) {
    const { data } = await clientSupabase.from("postes_chasse").insert({ nom: poste.nom, lat: poste.lat, lng: poste.lng }).select().single();
    if (!data) return;
    poste.poste_id = data.id;
    postesChasseCache.push(data);
    redessinerPanneau();
}

function ouvrirBibliothequePostes() {
    rendreTableauBibliotheque();
    ouvrirModale("modale-bibliotheque");
}

function rendreTableauBibliotheque() {
    const corps = document.getElementById("corps-tableau-bibliotheque");
    if (postesChasseCache.length === 0) {
        corps.innerHTML = '<tr><td style="text-align:center; color:#888;">Aucun poste enregistré pour l\'instant. Coche « Enregistrer dans la bibliothèque » en décrivant un poste.</td></tr>';
        return;
    }
    corps.innerHTML = postesChasseCache.map((p) => `
        <tr>
            <td>${echapper(p.nom)}</td>
            <td style="text-align:right;"><button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerPosteBibliotheque('${p.id}')">Supprimer</button></td>
        </tr>
    `).join("");
}

async function supprimerPosteBibliotheque(id) {
    if (!confirm("Supprimer ce poste de la bibliothèque ? Les postes déjà placés sur une traque restent inchangés.")) return;
    await clientSupabase.from("postes_chasse").delete().eq("id", id);
    postesChasseCache = postesChasseCache.filter((p) => p.id !== id);
    rendreTableauBibliotheque();
    redessinerPanneau();
}

// ----------------------------------------------------------------------------
// Enregistrement
// ----------------------------------------------------------------------------

async function enregistrerPlan() {
    const bouton = document.getElementById("bouton-enregistrer-plan");
    const texteInitial = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = "Enregistrement…";
    try {
        // Traques retirées par une restauration de version : supprimées maintenant, pas avant.
        for (const id of idsTraquesASupprimer) { await supprimerTraqueEnBase(id); idsEnBase.delete(id); }
        idsTraquesASupprimer = [];
        for (const etat of traquesEtat) { await enregistrerTraque(etat); idsEnBase.add(etat.id); idParCle.set(etat.cle, etat.id); }
        modifie = false;
        bouton.textContent = "Plan enregistré ✓";
        redessinerPanneau();
        setTimeout(() => { bouton.textContent = texteInitial; }, 2200);
    } catch (erreur) {
        console.error(erreur);
        alert("L'enregistrement a échoué : " + (erreur.message || erreur));
        bouton.textContent = texteInitial;
    } finally {
        bouton.disabled = false;
    }
}

const sansCle = ({ cle, ...reste }) => reste;

async function enregistrerTraque(etat) {
    const valeurs = {
        battue_id: battueCourante.id,
        numero: etat.numero,
        nom: etat.nom,
        parcelle_id: etat.parcelle_id,
        conducteur: etat.conducteur,
        chef_de_ligne: etat.chef_de_ligne,
        vehicules: etat.vehicules,
        // Les anciens champs sont remplacés par les tracés libres (elements).
        mouvement: null,
        ligne_rabatteurs: null,
        elements: etat.elements.map(sansCle),
        parkings: etat.parkings.map(sansCle),
        acces: etat.acces.map(sansCle),
        notes: etat.notes,
    };
    if (etat.id) {
        const { error } = await clientSupabase.from("traques").update(valeurs).eq("id", etat.id);
        if (error) throw new Error(error.message);
    } else {
        const { data, error } = await clientSupabase.from("traques").insert(valeurs).select().single();
        if (error || !data) throw new Error((error && error.message) || "Création de la traque impossible");
        etat.id = data.id;
    }

    await clientSupabase.from("postes_traque").delete().eq("traque_id", etat.id);
    if (etat.postes.length > 0) {
        const { data: inseres } = await clientSupabase.from("postes_traque").insert(
            etat.postes.map((p) => ({
                traque_id: etat.id, poste_id: p.poste_id, nom: p.nom, lat: p.lat, lng: p.lng, chasseur_id: p.chasseur_id,
            }))
        ).select();
        if (inseres) inseres.forEach((ins, i) => { etat.postes[i].id = ins.id; });
    }
}

async function supprimerTraqueEnBase(id) {
    await clientSupabase.from("postes_traque").delete().eq("traque_id", id);
    await clientSupabase.from("prelevements").update({ traque_id: null }).eq("traque_id", id);
    await clientSupabase.from("traques").delete().eq("id", id);
}

async function supprimerTraque() {
    const etat = traqueActive();
    if (!confirm(`Supprimer « ${libelleTraque(etat)} » avec son plan et ses postes ? (Annulable avec Ctrl+Z tant que le plan n'est pas enregistré.)`)) return;
    memoriser();
    // La suppression en base n'a lieu qu'à « Enregistrer le plan » : on peut donc l'annuler (Ctrl+Z).
    if (etat.id) idsTraquesASupprimer.push(etat.id);
    traquesEtat = traquesEtat.filter((t) => t.cle !== etat.cle);
    if (traquesEtat.length === 0) nouvelleTraque();
    traqueActiveCle = traquesEtat[0].cle;
    marquerModifie();
    redessinerTout();
}

// ----------------------------------------------------------------------------
// Prélèvements par traque
// ----------------------------------------------------------------------------

async function ajouterPrelevementTraque() {
    const etat = traqueActive();
    if (!etat.id) {
        alert("Enregistre d'abord le plan (bouton « Enregistrer le plan ») avant d'ajouter un prélèvement.");
        return;
    }
    const categorieId = document.getElementById("champ-espece-traque").value;
    if (!categorieId) return;

    await clientSupabase.from("prelevements").insert({
        date_prelevement: battueCourante.date_battue,
        saison: saisonPourDate(battueCourante.date_battue),
        categorie_id: categorieId,
        chasseur_id: document.getElementById("champ-chasseur-traque").value || null,
        battue_id: battueCourante.id,
        traque_id: etat.id,
        sexe: document.getElementById("champ-sexe-traque").value,
        poids_kg: parseFloat(document.getElementById("champ-poids-traque").value) || null,
    });
    document.getElementById("champ-poids-traque").value = "";
    await rafraichirTallyPrelevements(etat);
}

async function rafraichirTallyPrelevements(etat) {
    const zone = document.getElementById("tally-prelevements");
    if (!zone) return;
    if (!etat.id) {
        zone.innerHTML = '<em style="color:#888;">Enregistre le plan pour pouvoir noter des prélèvements.</em>';
        return;
    }
    const { data } = await clientSupabase.from("prelevements").select().eq("traque_id", etat.id);
    const liste = data || [];
    if (liste.length === 0) {
        zone.innerHTML = '<em style="color:#888;">Aucun animal prélevé sur cette traque pour l\'instant.</em>';
        return;
    }
    const parEspece = {};
    liste.forEach((p) => {
        const nom = nomGibierDe(p, categoriesCache, especesCache);
        parEspece[nom] = (parEspece[nom] || 0) + 1;
    });
    zone.innerHTML = "<strong>Prélevés :</strong> " + Object.entries(parEspece).map(([nom, n]) => `${n} ${echapper(nom)}`).join(", ");
}

// ----------------------------------------------------------------------------
// Versions du plan
// ----------------------------------------------------------------------------

function instantane() {
    return {
        traques: traquesEtat.map((t) => ({
            numero: t.numero, nom: t.nom, parcelle_id: t.parcelle_id, notes: t.notes,
            conducteur: t.conducteur, chef_de_ligne: t.chef_de_ligne, vehicules: t.vehicules,
            elements: t.elements.map(sansCle),
            parkings: t.parkings.map(sansCle),
            acces: t.acces.map(sansCle),
            postes: t.postes.map((p) => ({ poste_id: p.poste_id, nom: p.nom, lat: p.lat, lng: p.lng, chasseur_id: p.chasseur_id })),
        })),
    };
}

function resumeVersion(contenu) {
    const traques = (contenu && contenu.traques) || [];
    const elements = traques.reduce((n, t) => n + (t.elements || []).length + (t.postes || []).length + (t.parkings || []).length + (t.acces || []).length, 0);
    return `${traques.length} traque(s), ${elements} élément(s)`;
}

async function ouvrirVersions() {
    document.getElementById("message-versions").innerHTML = "";
    document.getElementById("champ-nom-version").value = "";
    ouvrirModale("modale-versions");
    await rafraichirVersions();
}

async function rafraichirVersions() {
    const { data } = await clientSupabase.from("versions_plan").select().eq("battue_id", battueCourante.id);
    const versions = (data || []).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    const corps = document.getElementById("corps-versions");
    if (versions.length === 0) {
        corps.innerHTML = '<tr><td style="text-align:center; color:#888;">Aucune version enregistrée.</td></tr>';
        return;
    }
    corps.innerHTML = versions.map((v) => `
        <tr>
            <td><strong>${echapper(v.nom)}</strong><br><small style="color:#888;">${echapper(new Date(v.created_at).toLocaleString("fr-FR"))} · ${echapper(resumeVersion(v.contenu))}</small></td>
            <td style="text-align:right; white-space:nowrap;">
                <button class="bouton bouton-secondaire" style="padding:4px 8px;" onclick="restaurerVersion('${v.id}')">Rouvrir</button>
                <button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerVersion('${v.id}')">Supprimer</button>
            </td>
        </tr>`).join("");
}

async function enregistrerVersion(nom) {
    const { error } = await clientSupabase.from("versions_plan").insert({ battue_id: battueCourante.id, nom, contenu: instantane() });
    if (error) throw new Error(error.message);
}

async function creerVersion() {
    const champ = document.getElementById("champ-nom-version");
    const nom = champ.value.trim() || `Version du ${new Date().toLocaleString("fr-FR")}`;
    try {
        await enregistrerVersion(nom);
        champ.value = "";
        document.getElementById("message-versions").innerHTML = `<div class="message-info" style="background:#e8f0e2; padding:8px; border-radius:8px; margin-bottom:8px;">Version « ${echapper(nom)} » enregistrée.</div>`;
        await rafraichirVersions();
    } catch (erreur) {
        document.getElementById("message-versions").innerHTML = `<div class="message-alerte">Échec : ${echapper(erreur.message)}</div>`;
    }
}

async function supprimerVersion(id) {
    if (!confirm("Supprimer cette version ?")) return;
    await clientSupabase.from("versions_plan").delete().eq("id", id);
    await rafraichirVersions();
}

/**
 * Remplace le contenu de l'éditeur par celui d'une version. Rien n'est écrit dans les traques tant
 * que « Enregistrer le plan » n'est pas cliqué. Une traque de même numéro garde son identifiant
 * (donc ses prélèvements) ; l'état actuel est gardé automatiquement dans une version de secours.
 */
async function restaurerVersion(id) {
    const { data: version } = await clientSupabase.from("versions_plan").select().eq("id", id).single();
    if (!version) return;
    if (!confirm(`Rouvrir « ${version.nom} » ? Le contenu actuel de l'éditeur sera remplacé (une version « Avant réouverture » est gardée automatiquement).`)) return;
    try {
        await enregistrerVersion(`Avant réouverture de « ${version.nom} »`);
    } catch (erreur) {
        alert("Impossible de garder une copie de l'état actuel : " + erreur.message);
        return;
    }
    const existantes = traquesEtat;
    const nouvelles = ((version.contenu && version.contenu.traques) || []).map((vt) => {
        const correspondante = existantes.find((e) => e.numero === vt.numero && e.id);
        return {
            cle: nouvelleCle(), id: correspondante ? correspondante.id : null,
            numero: vt.numero, nom: vt.nom, parcelle_id: vt.parcelle_id, notes: vt.notes,
            conducteur: vt.conducteur || null, chef_de_ligne: vt.chef_de_ligne || null, vehicules: vt.vehicules || null,
            elements: (vt.elements || []).map((e) => ({ ...e, cle: nouvelleCle() })),
            parkings: (vt.parkings || []).map((p) => ({ ...p, cle: nouvelleCle() })),
            acces: (vt.acces || []).map((a) => ({ ...a, cle: nouvelleCle() })),
            postes: (vt.postes || []).map((p) => ({ ...p, cle: nouvelleCle(), id: null })),
        };
    });
    memoriser();
    idsTraquesASupprimer.push(...existantes.filter((e) => e.id && !nouvelles.some((n) => n.id === e.id)).map((e) => e.id));
    traquesEtat = nouvelles;
    if (traquesEtat.length === 0) nouvelleTraque();
    traqueActiveCle = traquesEtat[0].cle;
    marquerModifie();
    fermerModale("modale-versions");
    quitterOutil();
    redessinerTout();
    if (carte) ajusterVue();
}

// ----------------------------------------------------------------------------
// Annuler / rétablir (Ctrl+Z, Ctrl+Y)
// ----------------------------------------------------------------------------

function instantanePlanEditeur() {
    return JSON.stringify({ traques: traquesEtat, active: traqueActiveCle, aSupprimer: idsTraquesASupprimer });
}

/**
 * À appeler juste AVANT une modification : garde l'état actuel pour pouvoir y revenir.
 * Avec un groupe (saisie d'un champ), les frappes successives ne comptent que pour une action.
 */
function memoriser(groupe) {
    const maintenant = Date.now();
    const regroupe = groupe && groupe === dernierGroupeAnnuler && maintenant - dernierInstantAnnuler < 2000;
    dernierGroupeAnnuler = groupe || null;
    dernierInstantAnnuler = maintenant;
    if (regroupe) return;
    pileAnnuler.push(instantanePlanEditeur());
    if (pileAnnuler.length > 100) pileAnnuler.shift();
    pileRefaire = [];
    majBoutonsHistorique();
}

function majBoutonsHistorique() {
    const annuler = document.getElementById("bouton-annuler-action");
    const refaire = document.getElementById("bouton-refaire-action");
    if (annuler) annuler.disabled = pileAnnuler.length === 0 && pointsEnCours.length === 0;
    if (refaire) refaire.disabled = pileRefaire.length === 0;
}

function restaurerInstantane(json) {
    const etat = JSON.parse(json);
    terminerEditionForme();
    traquesEtat = etat.traques;
    // Une traque enregistrée depuis cet instantané garde son identifiant en base (pas de doublon, prélèvements conservés).
    traquesEtat.forEach((t) => { if (!t.id && idParCle.has(t.cle)) t.id = idParCle.get(t.cle); });
    traqueActiveCle = traquesEtat.some((t) => t.cle === etat.active) ? etat.active : (traquesEtat[0] && traquesEtat[0].cle);
    idsTraquesASupprimer = etat.aSupprimer;
    // Une traque enregistrée depuis, absente de cet état, doit disparaître de la base au prochain enregistrement.
    const presentes = new Set(traquesEtat.map((t) => t.id).filter(Boolean));
    idsEnBase.forEach((id) => { if (!presentes.has(id) && !idsTraquesASupprimer.includes(id)) idsTraquesASupprimer.push(id); });
    if (traquesEtat.length === 0) { const t = nouvelleTraque(); traqueActiveCle = t.cle; }
    marquerModifie();
    redessinerTout();
    majBoutonsHistorique();
}

function annulerAction() {
    if (document.querySelector(".fond-modale.ouverte")) return;
    // Pendant un tracé : annuler = retirer le dernier point posé.
    if (outil && pointsEnCours.length > 0) { annulerDernierPoint(); majBoutonsHistorique(); return; }
    if (pileAnnuler.length === 0) return;
    pileRefaire.push(instantanePlanEditeur());
    dernierGroupeAnnuler = null;
    restaurerInstantane(pileAnnuler.pop());
}

function refaireAction() {
    if (document.querySelector(".fond-modale.ouverte")) return;
    if (pileRefaire.length === 0) return;
    pileAnnuler.push(instantanePlanEditeur());
    dernierGroupeAnnuler = null;
    restaurerInstantane(pileRefaire.pop());
}
