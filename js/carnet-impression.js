/**
 * Carnets imprimables d'une battue (?id=...&type=battue|chasseurs).
 *  - type=battue : carnet du responsable (consignes, présence et émargement, une page par
 *    traque avec cases de saisie des prélèvements, bilan de la journée).
 *  - type=chasseurs : un carnet individuel par participant (son poste, la carte de sa
 *    traque, les consignes, un tableau pour noter ses tirs).
 */

let donnees = null;
let cartesAInitialiser = [];

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;

    const parametres = new URLSearchParams(window.location.search);
    const idBattue = parametres.get("id");
    const type = parametres.get("type") === "chasseurs" ? "chasseurs" : "battue";
    const zoneChargement = document.getElementById("zone-chargement");
    if (!idBattue) { zoneChargement.textContent = "Aucune battue indiquée."; return; }

    const { data: battue } = await clientSupabase.from("battues").select().eq("id", idBattue).single();
    if (!battue || battue.est_modele) { zoneChargement.textContent = "Battue introuvable."; return; }
    document.getElementById("lien-plan").href = `pages/plan-battue.html?id=${idBattue}`;

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
    donnees = {
        battue, type,
        chasseurs: chasseurs.data || [], participants: participants.data || [], parcelles: parcelles.data || [],
        especes: especes.data || [], plans: plans.data || [], prelevements: prelevements.data || [],
        traques: listeTraques, postes,
    };

    document.getElementById("zone-carnet").innerHTML = type === "chasseurs" ? pagesChasseurs() : pagesBattue();
    zoneChargement.style.display = "none";
    document.getElementById("zone-carnet").style.display = "block";
    document.title = type === "chasseurs" ? "Carnets des chasseurs" : "Carnet de battue";
    setTimeout(initialiserCartes, 100);
})();

// ----------------------------------------------------------------------------
// Utilitaires
// ----------------------------------------------------------------------------

function nomAffiche(c) {
    return c.prenom ? `${c.prenom} ${c.nom}` : c.nom;
}

function chasseurParId(id) {
    return donnees.chasseurs.find((c) => c.id === id);
}

function libelleTraque(t) {
    return t.nom || `Traque ${t.numero}`;
}

function dateLongue() {
    const [a, m, j] = donnees.battue.date_battue.split("-").map(Number);
    return new Date(a, m - 1, j).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function saisonDeLaBattue() {
    const [a, m] = donnees.battue.date_battue.split("-").map(Number);
    return m >= 7 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
}

/** Texte de l'état de l'assurance d'un chasseur, et indicateur d'expiration à la date de la battue. */
function etatAssurance(c) {
    if (!c.assurance_assureur && !c.assurance_validite && !c.assurance_numero_contrat) return { texte: "Non renseignée", alerte: true };
    const morceaux = [c.assurance_assureur, c.assurance_numero_contrat ? "contrat " + c.assurance_numero_contrat : null].filter(Boolean);
    let alerte = false;
    if (c.assurance_validite) {
        const [a, m, j] = c.assurance_validite.split("-").map(Number);
        morceaux.push("valable jusqu'au " + new Date(a, m - 1, j).toLocaleDateString("fr-FR"));
        alerte = c.assurance_validite < donnees.battue.date_battue;
        if (alerte) morceaux.push("EXPIRÉE à la date de la battue");
    } else {
        morceaux.push("validité non renseignée");
        alerte = true;
    }
    return { texte: morceaux.join(", "), alerte };
}

function celluleAssurance(c) {
    const e = etatAssurance(c);
    return `<span class="${e.alerte ? "expiree" : ""}">${echapper(e.texte)}</span>`;
}

function entete(titre) {
    const b = donnees.battue;
    const responsable = chasseurParId(b.responsable_id);
    return `
        <div class="entete-carnet">
            <h1>${echapper(titre)}</h1>
            <p>${echapper(dateLongue())}${b.secteur ? " · " + echapper(b.secteur) : ""}${b.lieu_rdv ? " · RDV : " + echapper(b.lieu_rdv) + (b.heure_rdv ? " à " + echapper(b.heure_rdv) : "") : ""}${responsable ? " · Responsable : " + echapper(nomAffiche(responsable)) : ""}</p>
        </div>`;
}

function blocConsignes() {
    const b = donnees.battue;
    return `
        ${b.regles_securite ? `<h2>Règles de sécurité</h2><div class="bloc-texte">${echapper(b.regles_securite)}</div>` : ""}
        ${b.instructions ? `<h2>Instructions</h2><div class="bloc-texte">${echapper(b.instructions)}</div>` : ""}`;
}

function lignesVides(n, colonnes) {
    return Array.from({ length: n }, () => `<tr>${colonnes.map(() => '<td class="libre"></td>').join("")}</tr>`).join("");
}

function legende(traques) {
    return `<div class="legende-plan">${traques.map((t) =>
        `<span><i style="border-color:${couleurTraque(t.numero)}"></i>${echapper(libelleTraque(t))}</span>`).join("")}
        <span><i style="border-color:#222; border-top-width:5px"></i>Sens de la battue</span>
        <span><i style="border-color:#444; border-top-style:dashed"></i>Rabatteurs</span>
        <span>🎯 poste · 🅿️ parking · 🚪 accès</span></div>`;
}

function emplacementCarte(traques, surligner) {
    const id = `carte-${cartesAInitialiser.length}`;
    cartesAInitialiser.push({ id, traques, surligner: surligner || [] });
    return `<div id="${id}" class="conteneur-carte carte-carnet"></div>`;
}

// ----------------------------------------------------------------------------
// Carnet de battue (responsable)
// ----------------------------------------------------------------------------

function participantsEtPostes() {
    const ids = new Set(donnees.participants.map((p) => p.chasseur_id));
    donnees.postes.forEach((p) => { if (p.chasseur_id) ids.add(p.chasseur_id); });
    return [...ids].map(chasseurParId).filter(Boolean).sort((a, b) => nomAffiche(a).localeCompare(nomAffiche(b), "fr"));
}

function postesDuChasseur(idChasseur) {
    return donnees.postes.filter((p) => p.chasseur_id === idChasseur).map((p) => {
        const traque = donnees.traques.find((t) => t.id === p.traque_id);
        const numero = donnees.postes.filter((x) => x.traque_id === p.traque_id).indexOf(p) + 1;
        return { poste: p, traque, numero };
    });
}

function pagesBattue() {
    const pages = [];
    const gens = participantsEtPostes();

    pages.push(`<section class="page-carnet">
        ${entete("Carnet de battue")}
        ${donnees.traques.length ? `<h2>Plan de la journée</h2>${emplacementCarte(donnees.traques)}${legende(donnees.traques)}` : ""}
        ${blocConsignes()}
    </section>`);

    pages.push(`<section class="page-carnet">
        ${entete("Présence et émargement")}
        <p style="font-size:12px;">En signant, chaque participant atteste avoir pris connaissance des règles de sécurité et des instructions de la battue, et être couvert par une assurance de chasse en cours de validité.</p>
        <table class="saisie">
            <thead><tr><th style="width:20%">Nom</th><th style="width:11%">N° de permis</th><th style="width:27%">Assurance de chasse</th><th style="width:16%">Poste</th><th>Signature</th></tr></thead>
            <tbody>
                ${gens.map((c) => {
                    const postes = postesDuChasseur(c.id).map((x) => `${libelleTraque(x.traque)} : ${x.poste.nom}`).join("<br>") || "";
                    return `<tr><td class="libre-haute">${echapper(nomAffiche(c))}</td><td>${echapper(c.numero_permis)}</td><td>${celluleAssurance(c)}</td><td>${postes.split("<br>").map(echapper).join("<br>")}</td><td></td></tr>`;
                }).join("")}
                ${lignesVides(3, [1, 2, 3, 4, 5])}
            </tbody>
        </table>
        <div class="zone-signature"><div>Heure de début de battue :</div><div>Heure de fin de battue :</div><div>Signature du responsable :</div></div>
    </section>`);

    donnees.traques.forEach((t) => {
        const postes = donnees.postes.filter((p) => p.traque_id === t.id);
        pages.push(`<section class="page-carnet">
            ${entete(`${libelleTraque(t)}`)}
            ${emplacementCarte([t])}
            <table class="saisie">
                <thead><tr><th style="width:5%">N°</th><th style="width:16%">Poste</th><th style="width:20%">Chasseur</th><th style="width:8%">Tirs</th><th>Animaux prélevés (espèce, sexe, poids)</th><th style="width:20%">Observations</th></tr></thead>
                <tbody>
                    ${postes.length ? postes.map((p, i) => {
                        const c = chasseurParId(p.chasseur_id);
                        return `<tr><td>${i + 1}</td><td>${echapper(p.nom)}</td><td>${c ? echapper(nomAffiche(c)) : ""}</td><td></td><td class="libre-haute"></td><td></td></tr>`;
                    }).join("") : lignesVides(4, [1, 2, 3, 4, 5, 6])}
                </tbody>
            </table>
            <div class="zone-signature"><div>Lancement :</div><div>Fin de traque :</div><div>Nombre de chiens :</div></div>
            ${t.notes ? `<h2>Notes</h2><div class="bloc-texte">${echapper(t.notes)}</div>` : ""}
        </section>`);
    });

    const plansSaison = donnees.plans.filter((p) => p.saison === saisonDeLaBattue());
    const lignesBilan = plansSaison.length
        ? plansSaison.map((plan) => {
            const espece = donnees.especes.find((e) => e.id === plan.espece_id);
            const realise = donnees.prelevements.filter((p) => p.espece_id === plan.espece_id && p.saison === plan.saison).length;
            return `<tr><td>${espece ? echapper(espece.nom) : ""}</td><td>${plan.attribution}</td><td>${realise}</td><td class="libre"></td></tr>`;
        }).join("")
        : lignesVides(5, [1, 2, 3, 4]);
    pages.push(`<section class="page-carnet">
        ${entete("Bilan de la battue")}
        <table class="saisie">
            <thead><tr><th>Espèce</th><th style="width:18%">Attribution de la saison</th><th style="width:18%">Déjà réalisé (avant la battue)</th><th style="width:22%">Prélevé aujourd'hui</th></tr></thead>
            <tbody>${lignesBilan}</tbody>
        </table>
        <h2>Incidents, observations</h2>
        <table class="saisie"><tbody>${lignesVides(5, [1])}</tbody></table>
        <div class="zone-signature"><div>Date et heure :</div><div>Signature du responsable :</div></div>
    </section>`);
    return pages.join("");
}

// ----------------------------------------------------------------------------
// Carnets individuels
// ----------------------------------------------------------------------------

function pagesChasseurs() {
    const gens = participantsEtPostes();
    if (gens.length === 0) {
        return `<div class="carte" style="text-align:center; color:#666;">Aucun participant : coche les participants dans la fiche de la battue ou affecte des chasseurs aux postes, puis reviens ici.</div>`;
    }
    return gens.map((c) => {
        const mesPostes = postesDuChasseur(c.id);
        const traquesConcernees = [...new Map(mesPostes.map((x) => [x.traque.id, x.traque])).values()];
        const cartes = traquesConcernees.length ? traquesConcernees : donnees.traques;
        const surligner = mesPostes.map((x) => x.poste.id);
        return `<section class="page-carnet">
            ${entete(`Carnet de chasse : ${nomAffiche(c)}`)}
            <div class="grille-infos">
                <div><div class="etiquette-info">N° de permis</div><div class="valeur-info">${echapper(c.numero_permis) || "—"}</div></div>
                <div><div class="etiquette-info">Téléphone</div><div class="valeur-info">${echapper(c.telephone) || "—"}</div></div>
                <div style="grid-column: span 2;"><div class="etiquette-info">Assurance de chasse</div><div class="valeur-info" style="font-size:12px;">${celluleAssurance(c)}</div></div>
            </div>
            <h2>${mesPostes.length ? "Mon poste" : "Poste"}</h2>
            ${mesPostes.length
                ? `<div style="font-size:15px; font-weight:700;">${mesPostes.map((x) => `${echapper(libelleTraque(x.traque))} · poste n° ${x.numero} : ${echapper(x.poste.nom)}`).join("<br>")}</div>`
                : '<div style="color:#666;">Poste non attribué : à voir avec le responsable.</div>'}
            ${cartes.length ? emplacementCarte(cartes, surligner) + legende(cartes) : ""}
            ${blocConsignes()}
            <h2>Mes tirs</h2>
            <table class="saisie">
                <thead><tr><th style="width:12%">Heure</th><th style="width:16%">Poste</th><th style="width:26%">Espèce</th><th style="width:14%">Sexe</th><th>Animal touché ? Commentaire</th></tr></thead>
                <tbody>${lignesVides(6, [1, 2, 3, 4, 5])}</tbody>
            </table>
            <div class="zone-signature"><div>Signature du chasseur :</div><div>Visa du responsable :</div></div>
        </section>`;
    }).join("");
}

// ----------------------------------------------------------------------------
// Cartes
// ----------------------------------------------------------------------------

function initialiserCartes() {
    cartesAInitialiser.forEach((spec) => {
        const zone = document.getElementById(spec.id);
        if (!zone) return;
        try {
            dessinerCarteCarnet(spec);
        } catch (erreur) {
            console.error("Carte indisponible :", erreur);
            zone.innerHTML = '<div class="message-alerte" style="margin:0;">Carte indisponible (connexion internet nécessaire).</div>';
        }
    });
}

function dessinerCarteCarnet(spec) {
    const carte = L.map(spec.id, { zoomControl: false, scrollWheelZoom: false });
    creerFondsCarteIGN().planIGN.addTo(carte);
    const groupe = L.featureGroup().addTo(carte);

    const idsParcelles = new Set([donnees.battue.parcelle_id, ...spec.traques.map((t) => t.parcelle_id)].filter(Boolean));
    idsParcelles.forEach((id) => {
        const parcelle = donnees.parcelles.find((p) => p.id === id);
        if (!parcelle || !parcelle.contour) return;
        const polygone = L.polygon(parcelle.contour, { color: "#5a7d4a", weight: 2, fillOpacity: 0.08 });
        polygone.bindTooltip(echapper(parcelle.nom), { permanent: true, direction: "center", className: "etiquette-parcelle" });
        groupe.addLayer(polygone);
    });

    spec.traques.forEach((t) => {
        elementsDeTraque(t).forEach((e) => dessinerElement(groupe, e, t.numero, { sansInfobulle: true }));
        (t.parkings || []).forEach((p) => groupe.addLayer(L.marker([p.lat, p.lng], { icon: iconePointCarte("🅿️", "#3a6b8a") })
            .bindTooltip(echapper(p.nom), { permanent: true, direction: "top", offset: [0, -12] })));
        (t.acces || []).forEach((a) => groupe.addLayer(L.marker([a.lat, a.lng], { icon: iconePointCarte("🚪", "#8a6d3a") })
            .bindTooltip(echapper(a.nom), { permanent: true, direction: "top", offset: [0, -12] })));
        donnees.postes.filter((p) => p.traque_id === t.id).forEach((poste, index) => {
            const chasseur = chasseurParId(poste.chasseur_id);
            const mien = spec.surligner.includes(poste.id);
            if (mien) groupe.addLayer(L.circleMarker([poste.lat, poste.lng], { radius: 20, color: "#b00020", weight: 3, fillOpacity: 0, interactive: false }));
            groupe.addLayer(L.marker([poste.lat, poste.lng], { icon: iconePosteAssigne(index + 1, !!poste.chasseur_id) })
                .bindTooltip(echapper(chasseur ? `${poste.nom} · ${nomAffiche(chasseur)}` : poste.nom), { permanent: true, direction: "right", offset: [14, 0] }));
        });
    });

    if (groupe.getLayers().length > 0) carte.fitBounds(groupe.getBounds(), { padding: [25, 25], maxZoom: 16 });
    else carte.setView([46.6, 2.5], 6);
    setTimeout(() => carte.invalidateSize(), 200);
}
