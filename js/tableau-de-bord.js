(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("tableau-de-bord.html");
    afficherBandeauDemoSiBesoin();

    document.getElementById("texte-date").textContent =
        "Aujourd'hui, " + new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

    const [parcelles, chasseurs, chantiers, battues, factures, cotisations] = await Promise.all([
        clientSupabase.from("parcelles").select("surface_ha"),
        clientSupabase.from("chasseurs").select("id").eq("actif", true),
        clientSupabase.from("chantiers").select("id").eq("statut", "En cours"),
        clientSupabase.from("battues").select("date_battue, secteur").gte("date_battue", new Date().toISOString().slice(0, 10)).order("date_battue").limit(1),
        clientSupabase.from("factures").select("id").in("statut", ["En attente", "En retard"]),
        clientSupabase.from("cotisations").select("id").eq("statut", "En attente"),
    ]);

    const nbParcelles = parcelles.data ? parcelles.data.length : 0;
    const surfaceTotale = (parcelles.data || []).reduce((total, p) => total + (p.surface_ha || 0), 0);
    const nbChasseurs = chasseurs.data ? chasseurs.data.length : 0;
    const nbChantiers = chantiers.data ? chantiers.data.length : 0;

    document.getElementById("grille-stats").innerHTML = `
        <div class="carte carte-stat"><div class="valeur">${nbParcelles}</div><div class="libelle">Parcelles</div></div>
        <div class="carte carte-stat"><div class="valeur">${surfaceTotale.toFixed(1)} ha</div><div class="libelle">Surface totale</div></div>
        <div class="carte carte-stat"><div class="valeur">${nbChasseurs}</div><div class="libelle">Chasseurs actifs</div></div>
        <div class="carte carte-stat"><div class="valeur">${nbChantiers}</div><div class="libelle">Chantiers en cours</div></div>
    `;

    const lignesAlertes = [];

    if (battues.data && battues.data.length > 0) {
        const prochaine = battues.data[0];
        const dateFormatee = new Date(prochaine.date_battue).toLocaleDateString("fr-FR");
        lignesAlertes.push(`Prochaine battue : ${dateFormatee}${prochaine.secteur ? " — " + echapper(prochaine.secteur) : ""}`);
    }

    const nbFactures = factures.data ? factures.data.length : 0;
    if (nbFactures > 0) lignesAlertes.push(`${nbFactures} facture(s) en attente de paiement`);

    const nbCotisations = cotisations.data ? cotisations.data.length : 0;
    if (nbCotisations > 0) lignesAlertes.push(`${nbCotisations} cotisation(s) non réglée(s)`);

    if (lignesAlertes.length === 0) lignesAlertes.push("Rien à signaler pour le moment.");

    document.getElementById("zone-alertes").innerHTML = lignesAlertes.map((l) => `<div>•&nbsp; ${l}</div>`).join("");
})();
