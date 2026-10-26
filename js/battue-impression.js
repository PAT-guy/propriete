/** Fiche de battue imprimable : récupère l'identifiant dans l'URL (?id=...). */

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;

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

    const [chasseurs, participants, parcelles, especes, plans, prelevements, traques] = await Promise.all([
        clientSupabase.from("chasseurs").select(),
        clientSupabase.from("participants_battue").select().eq("battue_id", idBattue),
        clientSupabase.from("parcelles").select(),
        clientSupabase.from("especes_gibier").select(),
        clientSupabase.from("plans_chasse").select(),
        clientSupabase.from("prelevements").select(),
        clientSupabase.from("traques").select().eq("battue_id", idBattue).order("numero"),
    ]);

    const nomAffiche = (p) => (p.prenom ? `${p.prenom} ${p.nom}` : p.nom);
    const trouverChasseur = (id) => (chasseurs.data || []).find((c) => c.id === id);
    const parcelle = (parcelles.data || []).find((p) => p.id === battue.parcelle_id);
    const listeTraques = traques.data || [];

    let postesParTraque = {};
    if (listeTraques.length > 0) {
        const { data: tousLesPostes } = await clientSupabase.from("postes_traque").select().in("traque_id", listeTraques.map((t) => t.id));
        (tousLesPostes || []).forEach((p) => {
            if (!postesParTraque[p.traque_id]) postesParTraque[p.traque_id] = [];
            postesParTraque[p.traque_id].push(p);
        });
    }

    // En-tête
    const dateFormatee = new Date(battue.date_battue).toLocaleDateString("fr-FR", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });
    document.getElementById("texte-date-secteur").textContent =
        dateFormatee + (battue.secteur ? " — " + battue.secteur : "");

    // Infos pratiques
    const responsable = trouverChasseur(battue.responsable_id);
    const infos = [
        ["Lieu de rendez-vous", battue.lieu_rdv || "—"],
        ["Heure de rendez-vous", battue.heure_rdv || "—"],
        ["Responsable", responsable ? nomAffiche(responsable) : "—"],
        ["Parcelle", parcelle ? parcelle.nom : (battue.secteur || "—")],
    ];
    document.getElementById("grille-infos-pratiques").innerHTML = infos.map(([etiquette, valeur]) => `
        <div class="champ-info">
            <div class="etiquette-info">${etiquette}</div>
            <div class="valeur-info">${valeur}</div>
        </div>
    `).join("");

    // Carte (parcelle(s) + parkings/accès/postes/tracés de toutes les traques)
    const aUneCarte = (parcelle && parcelle.contour) ||
        (battue.parkings && battue.parkings.length > 0) ||
        listeTraques.some((t) => (t.parkings && t.parkings.length) || (t.acces && t.acces.length) ||
            (t.mouvement && t.mouvement.length > 1) || (t.ligne_rabatteurs && t.ligne_rabatteurs.length > 1) ||
            (postesParTraque[t.id] && postesParTraque[t.id].length));
    if (aUneCarte) {
        document.getElementById("section-carte").style.display = "block";
    }

    // Détail des traques : postes affectés et prélèvements
    if (listeTraques.length > 0) {
        document.getElementById("section-traques").style.display = "block";
        document.getElementById("zone-traques-impression").innerHTML = listeTraques.map((traque) => {
            const parcelleTraque = (parcelles.data || []).find((p) => p.id === traque.parcelle_id);
            const postes = postesParTraque[traque.id] || [];
            const prelevementsTraque = (prelevements.data || []).filter((p) => p.traque_id === traque.id);
            const parEspece = {};
            prelevementsTraque.forEach((p) => {
                const nomEspece = (especes.data || []).find((e) => e.id === p.espece_id);
                const nom = nomEspece ? nomEspece.nom : "?";
                parEspece[nom] = (parEspece[nom] || 0) + 1;
            });
            const texteTally = Object.entries(parEspece).map(([nom, n]) => `${n} ${nom}`).join(", ") || "aucun";

            return `
                <div style="margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--couleur-bordure);">
                    <strong>${traque.nom || "Traque " + traque.numero}${parcelleTraque ? " — " + parcelleTraque.nom : ""}</strong>
                    ${postes.length > 0 ? `
                        <table class="tableau-donnees" style="margin-top:6px;">
                            <thead><tr><th>Poste</th><th>Chasseur</th></tr></thead>
                            <tbody>
                                ${postes.map((p) => {
                                    const chasseurPoste = trouverChasseur(p.chasseur_id);
                                    return `<tr><td>${p.nom}</td><td>${chasseurPoste ? nomAffiche(chasseurPoste) : "—"}</td></tr>`;
                                }).join("")}
                            </tbody>
                        </table>
                    ` : ""}
                    <div class="bloc-texte" style="margin-top:4px;"><strong>Prélevés :</strong> ${texteTally}</div>
                    ${traque.notes ? `<div class="bloc-texte">${traque.notes}</div>` : ""}
                </div>
            `;
        }).join("");
    }

    // Participants
    const corpsParticipants = document.getElementById("corps-tableau-participants");
    const listeParticipants = participants.data || [];
    if (listeParticipants.length === 0) {
        corpsParticipants.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#888;">Aucun participant renseigné</td></tr>`;
    } else {
        corpsParticipants.innerHTML = listeParticipants.map((p) => {
            const chasseur = trouverChasseur(p.chasseur_id);
            return `<tr><td>${chasseur ? nomAffiche(chasseur) : "—"}</td><td>${p.poste || ""}</td></tr>`;
        }).join("");
    }

    // Plan de chasse de la saison en cours
    const saison = saisonCourantePourImpression();
    const plansSaison = (plans.data || []).filter((p) => p.saison === saison);
    if (plansSaison.length > 0) {
        document.getElementById("section-plan").style.display = "block";
        document.getElementById("corps-tableau-plan-impression").innerHTML = plansSaison.map((plan) => {
            const espece = (especes.data || []).find((e) => e.id === plan.espece_id);
            const realise = (prelevements.data || []).filter((p) => p.espece_id === plan.espece_id && p.saison === saison).length;
            return `<tr><td>${espece ? espece.nom : ""}</td><td>${plan.attribution}</td><td>${realise}</td></tr>`;
        }).join("");
    }

    // Règles de sécurité / instructions / notes
    if (battue.regles_securite) {
        document.getElementById("section-securite").style.display = "block";
        document.getElementById("texte-securite").textContent = battue.regles_securite;
    }
    if (battue.instructions) {
        document.getElementById("section-instructions").style.display = "block";
        document.getElementById("texte-instructions").textContent = battue.instructions;
    }
    if (battue.notes) {
        document.getElementById("section-notes").style.display = "block";
        document.getElementById("texte-notes").textContent = battue.notes;
    }

    document.getElementById("zone-chargement").style.display = "none";
    document.getElementById("zone-fiche").style.display = "block";

    if (aUneCarte) {
        initialiserCarteImpression(parcelle, battue.parkings || [], listeTraques, postesParTraque, (parcelles.data || []), (chasseurs.data || []));
    }
})();

function saisonCourantePourImpression() {
    const aujourdhui = new Date();
    const annee = aujourdhui.getFullYear();
    return aujourdhui.getMonth() + 1 >= 7 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}

function initialiserCarteImpression(parcelle, parkings, listeTraques, postesParTraque, toutesLesParcelles, tousLesChasseurs) {
    const carte = L.map("carte-impression", { zoomControl: false, dragging: true, scrollWheelZoom: false });
    const fonds = creerFondsCarteIGN();
    fonds.planIGN.addTo(carte);

    const groupeElements = L.featureGroup().addTo(carte);

    if (parcelle && parcelle.contour) {
        const polygone = L.polygon(parcelle.contour, { color: "#5a7d4a", weight: 2, fillOpacity: 0.2 });
        polygone.bindTooltip(parcelle.nom, { permanent: true, direction: "center", className: "etiquette-parcelle" });
        groupeElements.addLayer(polygone);
    }

    parkings.forEach((parking) => {
        const marqueur = L.marker([parking.lat, parking.lng], { icon: iconePointCarte("🅿️", "#3a6b8a") })
            .bindTooltip(parking.nom, { permanent: true, direction: "top" });
        groupeElements.addLayer(marqueur);
    });

    (listeTraques || []).forEach((traque) => {
        const parcelleTraque = (toutesLesParcelles || []).find((p) => p.id === traque.parcelle_id);
        if (parcelleTraque && parcelleTraque.contour) {
            const polygone = L.polygon(parcelleTraque.contour, { color: "#5a7d4a", weight: 2, fillOpacity: 0.1 });
            polygone.bindTooltip(parcelleTraque.nom, { permanent: true, direction: "center", className: "etiquette-parcelle" });
            groupeElements.addLayer(polygone);
        }

        const groupeMouvement = dessinerLigneAvecFleche(groupeElements, traque.mouvement, "#a3442f", false);
        if (groupeMouvement && traque.nom) groupeMouvement.eachLayer((c) => { if (c.bindTooltip) c.bindTooltip(traque.nom); });
        dessinerLigneAvecFleche(groupeElements, traque.ligne_rabatteurs, "#3a6b8a", true);

        (traque.parkings || []).forEach((parking) => {
            const marqueur = L.marker([parking.lat, parking.lng], { icon: iconePointCarte("🅿️", "#3a6b8a") }).bindTooltip(parking.nom, { permanent: true, direction: "top" });
            groupeElements.addLayer(marqueur);
        });
        (traque.acces || []).forEach((acces) => {
            const marqueur = L.marker([acces.lat, acces.lng], { icon: iconePointCarte("🚪", "#8a6d3a") }).bindTooltip(acces.nom, { permanent: true, direction: "top" });
            groupeElements.addLayer(marqueur);
        });

        (postesParTraque[traque.id] || []).forEach((poste, index) => {
            const chasseurPoste = (tousLesChasseurs || []).find((c) => c.id === poste.chasseur_id);
            const texte = chasseurPoste ? `${poste.nom} — ${chasseurPoste.prenom ? chasseurPoste.prenom + " " : ""}${chasseurPoste.nom}` : poste.nom;
            const marqueur = L.marker([poste.lat, poste.lng], { icon: iconePosteAssigne(index + 1, !!poste.chasseur_id) })
                .bindTooltip(texte, { permanent: true, direction: "right" });
            groupeElements.addLayer(marqueur);
        });
    });

    if (groupeElements.getLayers().length > 0) {
        carte.fitBounds(groupeElements.getBounds(), { padding: [20, 20], maxZoom: 15 });
    } else {
        carte.setView([46.6, 2.5], 6);
    }

    setTimeout(() => carte.invalidateSize(), 200);
}
