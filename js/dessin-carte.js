/**
 * Utilitaires de dessin partagés pour les plans de battue détaillés :
 * icônes de points (poste, parking, accès) et lignes avec flèche de
 * direction (mouvement de la traque, ligne de départ des rabatteurs).
 */

function iconePointCarte(emoji, couleurFond) {
    return L.divIcon({
        className: "icone-point-carte",
        html: `<span style="background:${couleurFond};">${emoji}</span>`,
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
