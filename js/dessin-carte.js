/**
 * Utilitaires de dessin partagés pour les plans de battue détaillés :
 * icônes de points (poste, parking, accès) et lignes avec flèche de
 * direction (mouvement de la traque, ligne de départ des rabatteurs).
 */

function iconePointCarte(emoji, couleurFond) {
    // chaque entité a sa forme : parking = carré bleu « P », accès = losange brun « ➜ », poste = rond numéroté
    const forme = emoji === "🅿️" ? "forme-parking" : "forme-acces";
    const symbole = emoji === "🅿️" ? "P" : '<b style="display:block; transform:rotate(-45deg); font-size:10px;">●</b>';
    return L.divIcon({
        className: "icone-point-carte " + forme,
        html: `<span style="background:${couleurFond};">${symbole}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

function iconePosteAssigne(numero, assigne) {
    return L.divIcon({
        className: "icone-point-carte",
        html: `<span style="background:${assigne ? "#5a7d4a" : "#b08968"};">${numero}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

/** Poste numéroté, à la couleur de sa traque (cartes imprimées : le n° 1 de deux traques ne se confond pas). */
function iconePosteCouleur(numero, couleur, taille) {
    const d = taille || 26;
    return L.divIcon({
        className: "icone-point-carte",
        html: `<span style="background:${couleur}; width:${d}px; height:${d}px; font-size:${d < 24 ? 11 : 13}px;">${numero}</span>`,
        iconSize: [d, d],
        iconAnchor: [d / 2, d / 2],
    });
}

/** Angle (en degrés, 0° = est/droite) entre deux points [lat,lng], pour une flèche écran. */
function angleEntreDeuxPoints(depart, arrivee) {
    const latMoyenne = (depart[0] + arrivee[0]) / 2;
    const dLng = (arrivee[1] - depart[1]) * Math.cos((latMoyenne * Math.PI) / 180);
    const dLat = arrivee[0] - depart[0];
    return (Math.atan2(-dLat, dLng) * 180) / Math.PI;
}

function iconeFleche(angleDegres, couleur) {
    return L.divIcon({
        className: "icone-fleche-carte",
        html: `<div style="transform: rotate(${angleDegres}deg); border-left-color:${couleur};"></div>`,
        iconSize: [16, 14],
        iconAnchor: [5, 7],
    });
}

/**
 * Dessine une ligne brisée avec une flèche de direction à son extrémité
 * finale sur la couche Leaflet fournie. Retourne le groupe créé (ou null
 * si moins de deux points).
 */
function dessinerLigneAvecFleche(couche, points, couleur, pointille) {
    if (!points || points.length < 2) return null;
    const groupe = L.featureGroup();
    const ligne = L.polyline(points, { color: couleur, weight: 3, dashArray: pointille ? "8 6" : null });
    groupe.addLayer(ligne);

    const depart = points[points.length - 2];
    const arrivee = points[points.length - 1];
    const angle = angleEntreDeuxPoints(depart, arrivee);
    const fleche = L.marker(arrivee, { icon: iconeFleche(angle, couleur), interactive: false });
    groupe.addLayer(fleche);

    couche.addLayer(groupe);
    return groupe;
}

// ----------------------------------------------------------------------------
// Éléments libres d'une traque (lignes, courbes, polygones) : voir traques.elements
// ----------------------------------------------------------------------------

const COULEURS_TRAQUES = ["#a3442f", "#3a6b8a", "#5a7d4a", "#8a3a6b", "#c28a1f", "#2f7a7a"];

function couleurTraque(numero) {
    return COULEURS_TRAQUES[((numero || 1) - 1) % COULEURS_TRAQUES.length];
}

/** Types proposés après le dessin, selon la forme tracée. */
const TYPES_ELEMENT = {
    mouvement:  { libelle: "Mouvement de la traque", formes: ["ligne", "courbe"], fleche: true,  pointille: false, couleurTraque: true },
    rabatteurs: { libelle: "Ligne des rabatteurs",   formes: ["ligne", "courbe"], fleche: true,  pointille: true,  couleurTraque: true },
    poste_mouvant: { libelle: "Poste mouvant",       formes: ["ligne", "courbe"], fleche: true,  mouvant: true, couleur: "#c2410c", epais: true },
    sens:       { libelle: "Sens de la battue",      formes: ["ligne", "courbe"], fleche: true,  pointille: false, couleur: "#222222", epais: true },
    trace:      { libelle: "Autre tracé",            formes: ["ligne", "courbe"], fleche: false, pointille: false, couleur: "#6b6b60" },
    zone:       { libelle: "Zone de battue",         formes: ["polygone"],        couleurTraque: true },
    interdite:  { libelle: "Zone interdite de tir",  formes: ["polygone"],        couleur: "#b00020" },
    rapproche:  { libelle: "Zone de rapproché",      formes: ["polygone"],        couleur: "#d97706", etiquette: "Rapproché" },
};

/** Numéro (1, 2, 3...) de chaque poste mouvant d'une traque, dans l'ordre des éléments : { idElement: n }. */
function indicesMouvants(elements) {
    const indices = {};
    let n = 0;
    (elements || []).forEach((e) => { if (e.type === "poste_mouvant") { n += 1; indices[e.id || e.cle] = n; } });
    return indices;
}

/** Pastille carrée « M1 » au départ d'un poste mouvant (différente des ronds numérotés des postes fixes). */
function iconeMouvant(numero) {
    return L.divIcon({
        className: "icone-mouvant",
        html: `<span>M${numero}</span>`,
        iconSize: [30, 22],
        iconAnchor: [15, 11],
    });
}

function typesPourForme(forme) {
    return Object.entries(TYPES_ELEMENT).filter(([, t]) => t.formes.includes(forme)).map(([cle]) => cle);
}

/**
 * Courbe lissée passant par tous les points (spline de Catmull-Rom, convertie en
 * courbes de Bézier cubiques puis échantillonnée). Le résultat est une suite de points
 * [lat, lng] : il se redessine à l'identique à l'impression.
 */
function lisserPoints(points, pasParSegment) {
    if (!points || points.length < 3) return points || [];
    const pas = pasParSegment || 14;
    const resultat = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(i + 2, points.length - 1)];
        // Points de contrôle de la courbe de Bézier cubique équivalente.
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        for (let k = 1; k <= pas; k++) {
            const t = k / pas;
            const u = 1 - t;
            resultat.push([
                u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
                u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
            ]);
        }
    }
    return resultat;
}

function pointsAffiches(element) {
    return element.forme === "courbe" ? lisserPoints(element.points) : element.points;
}

/** Éléments d'une traque, en convertissant l'ancien format (mouvement, ligne_rabatteurs). */
function elementsDeTraque(traque) {
    if (Array.isArray(traque.elements)) return traque.elements;
    const anciens = [];
    if (traque.mouvement && traque.mouvement.length >= 2) {
        anciens.push({ id: "ancien-mouvement", type: "mouvement", forme: "ligne", points: traque.mouvement, nom: null, notes: null, fleche: true });
    }
    if (traque.ligne_rabatteurs && traque.ligne_rabatteurs.length >= 2) {
        anciens.push({ id: "ancien-rabatteurs", type: "rabatteurs", forme: "ligne", points: traque.ligne_rabatteurs, nom: null, notes: null, fleche: true });
    }
    return anciens;
}

function styleElement(element, numeroTraque) {
    const type = TYPES_ELEMENT[element.type] || TYPES_ELEMENT.trace;
    const couleur = type.couleurTraque ? couleurTraque(numeroTraque) : (type.couleur || "#6b6b60");
    return { type, couleur };
}

/**
 * Dessine un élément (ligne, courbe ou polygone) sur la couche fournie.
 * Retourne le groupe Leaflet créé, ou null si l'élément est incomplet.
 */
function dessinerElement(couche, element, numeroTraque, options) {
    const pts = element.points || [];
    const { type, couleur } = styleElement(element, numeroTraque);
    const groupe = L.featureGroup();
    const libelle = element.nom ? `${type.libelle} : ${element.nom}` : type.libelle;

    if (element.forme === "polygone") {
        if (pts.length < 3) return null;
        const polygone = L.polygon(pts, {
            color: couleur, weight: 3, fillColor: couleur,
            fillOpacity: element.type === "interdite" ? 0.25 : element.type === "rapproche" ? 0.2 : 0.12,
            dashArray: element.type === "interdite" ? "6 4" : element.type === "rapproche" ? "10 6" : null,
        });
        groupe.addLayer(polygone);
        if (element.type === "interdite") {
            groupe.addLayer(L.marker(polygone.getBounds().getCenter(), { icon: iconeInterdit(), interactive: false }));
        }
    } else {
        const trace = pointsAffiches(element);
        if (!trace || trace.length < 2) return null;
        const epaisseur = type.epais ? 6 : 3;
        groupe.addLayer(L.polyline(trace, type.mouvant
            ? { color: couleur, weight: 6, dashArray: "1 10", lineCap: "round" }
            : { color: couleur, weight: epaisseur, dashArray: type.pointille ? "8 6" : null }));
        if (type.mouvant) {
            const n = options && options.numeroMouvant;
            groupe.addLayer(L.marker(trace[0], { icon: iconeEchelle(iconeMouvant(n || ""), options && options.echelle), interactive: false }));
        }
        if (element.fleche) {
            const depart = trace[Math.max(trace.length - 4, 0)];
            const arrivee = trace[trace.length - 1];
            groupe.addLayer(L.marker(arrivee, { icon: iconeFleche(angleEntreDeuxPoints(depart, arrivee), couleur), interactive: false }));
        }
    }
    if (!(options && options.sansInfobulle)) groupe.eachLayer((c) => { if (c.bindTooltip && c.options.interactive !== false && !(c.getTooltip && c.getTooltip())) c.bindTooltip(echapper(libelle), { sticky: true }); });
    if (couche) couche.addLayer(groupe);
    return groupe;
}


/** Figuré de zone interdite de tir : disque rouge barré, lisible en noir et blanc. */
function iconeInterdit() {
    return L.divIcon({
        className: "icone-interdit",
        html: '<span></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
    });
}

/** Symboles de légende (mêmes formes que sur la carte), en HTML en ligne pour l'écran comme pour l'impression. */
function symbolesLegendeHtml() {
    const base = "display:inline-block; width:12px; height:12px; box-sizing:border-box; vertical-align:middle; margin-right:3px;";
    return `<span><span style="${base} border-radius:50%; background:#5a7d4a;"></span>Poste</span>` +
        `<span><span style="${base} border-radius:2px; background:#3a6b8a;"></span>Parking</span>` +
        `<span><span style="${base} width:10px; height:10px; transform:rotate(45deg); background:#8a6d3a; margin:0 5px 0 2px;"></span>Accès</span>`;
}


/** Agrandit ou réduit un figuré (icône Leaflet) d'un facteur k, sans changer son point d'ancrage. */
function iconeEchelle(icone, k) {
    if (!k || k === 1) return icone;
    const o = icone.options;
    return L.divIcon({
        className: o.className, iconSize: o.iconSize, iconAnchor: o.iconAnchor,
        html: `<div style="transform:scale(${k}); transform-origin:${o.iconAnchor[0]}px ${o.iconAnchor[1]}px; width:100%; height:100%;">${o.html}</div>`,
    });
}
