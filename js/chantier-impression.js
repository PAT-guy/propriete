/** Carte de chantier imprimable : récupère l'identifiant dans l'URL (?id=...). */

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;

    const idChantier = new URLSearchParams(window.location.search).get("id");
    if (!idChantier) {
        document.getElementById("zone-chargement").textContent = "Aucun chantier indiqué.";
        return;
    }

    const { data: chantier } = await clientSupabase.from("chantiers").select().eq("id", idChantier).single();
    if (!chantier) {
        document.getElementById("zone-chargement").textContent = "Chantier introuvable.";
        return;
    }

    const [parcelles, prestataires] = await Promise.all([
        clientSupabase.from("parcelles").select(),
        clientSupabase.from("prestataires").select(),
    ]);
    const parcelle = (parcelles.data || []).find((p) => p.id === chantier.parcelle_id);
    const prestataire = (prestataires.data || []).find((p) => p.id === chantier.prestataire_id);

    document.getElementById("texte-titre-type").textContent = `${chantier.titre} — ${chantier.type_travaux}`;

    const formaterDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
    const infos = [
        ["Statut", chantier.statut],
        ["Parcelle", parcelle ? parcelle.nom : "—"],
        ["Prestataire", prestataire ? prestataire.nom : "—"],
        ["Date de début", formaterDate(chantier.date_debut)],
        ["Fin prévue", formaterDate(chantier.date_fin_prevue)],
    ];
    document.getElementById("grille-infos-pratiques").innerHTML = infos.map(([etiquette, valeur]) => `
        <div class="champ-info">
            <div class="etiquette-info">${etiquette}</div>
            <div class="valeur-info">${valeur}</div>
        </div>
    `).join("");

    if (chantier.description) {
        document.getElementById("section-description").style.display = "block";
        document.getElementById("texte-description").textContent = chantier.description;
    }

    const aUneCarte = (parcelle && parcelle.contour) || (chantier.points_interet && chantier.points_interet.length > 0);
    if (aUneCarte) {
        document.getElementById("section-carte").style.display = "block";
        initialiserCarteImpressionChantier(parcelle, chantier.points_interet || []);
    }

    document.getElementById("zone-chargement").style.display = "none";
    document.getElementById("zone-fiche").style.display = "block";
})();

function initialiserCarteImpressionChantier(parcelle, pointsInteret) {
    const carte = L.map("carte-impression", { zoomControl: false, dragging: true, scrollWheelZoom: false });
    const fonds = creerFondsCarteIGN();
    fonds.planIGN.addTo(carte);

    const groupe = L.featureGroup().addTo(carte);

    if (parcelle && parcelle.contour) {
        groupe.addLayer(L.polygon(parcelle.contour, { color: "#5a7d4a", weight: 2, fillOpacity: 0.2 }));
    }
    pointsInteret.forEach((point) => {
        groupe.addLayer(L.marker([point.lat, point.lng]).bindTooltip(point.nom, { permanent: true, direction: "top" }));
    });

    if (groupe.getLayers().length > 0) {
        carte.fitBounds(groupe.getBounds(), { padding: [20, 20], maxZoom: 15 });
    } else {
        carte.setView([46.6, 2.5], 6);
    }
    setTimeout(() => carte.invalidateSize(), 200);
}
