/**
 * Mise en page des documents imprimés : cartons de battue (A5 paysage, 2 par feuille A4,
 * recto-verso) et fiche de gestion (A4 recto-verso).
 *
 * Un document est une configuration : un style (palette, police, taille du texte...) et, pour
 * chaque face, une liste de blocs (activables, réordonnables, réglables). Cette configuration
 * est un simple objet JSON, enregistrable dans la table modeles_impression.
 *
 * Contexte de rendu (ctx) : { battue, traques, postes, chasseurs, participants, parcelles,
 * especes, plans, prelevements }.
 */

const PALETTES = {
    sologne:   { libelle: "Sologne (vert sapin, ocre)", primaire: "#2f4a33", secondaire: "#6b4a2b", accent: "#b8892f", filet: "#c9b98f", papier: "#f7f1e3" },
    brique:    { libelle: "Brique de Sologne", primaire: "#7b3a2e", secondaire: "#4a5a3a", accent: "#c18a2e", filet: "#d4bfa0", papier: "#f8efe2" },
    etang:     { libelle: "Étang (gris bleu)", primaire: "#2f4f5a", secondaire: "#5a6b4a", accent: "#b08a3c", filet: "#b9c6c4", papier: "#eff3f1" },
    noirblanc: { libelle: "Noir et blanc (photocopie)", primaire: "#222222", secondaire: "#444444", accent: "#666666", filet: "#999999", papier: "#ffffff" },
};

const POLICES = {
    serif:   { libelle: "Classique (avec empattements)", pile: 'Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif' },
    sans:    { libelle: "Moderne (sans empattements)", pile: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
    machine: { libelle: "Machine à écrire", pile: '"Courier New", Courier, monospace' },
};

const SVG_FEUILLE_CHENE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c-.7 1.2-.6 2.4-.2 3.4-1-.6-2.2-.7-3.2-.3.3 1 1 1.7 1.8 2.1-1.2-.1-2.4.4-3 1.3.8.6 1.7.9 2.6.8-1.1.5-1.9 1.4-2.2 2.5.9.2 1.8.1 2.6-.3-.6.9-.8 2-.5 3 .8-.1 1.5-.5 2.1-1.1 0 .9.3 1.7.8 2.4V22h1.2v-5.5c.5-.7.8-1.5.8-2.4.6.6 1.3 1 2.1 1.1.3-1 .1-2.1-.5-3 .8.4 1.7.5 2.6.3-.3-1.1-1.1-2-2.2-2.5.9.1 1.8-.2 2.6-.8-.6-.9-1.8-1.4-3-1.3.8-.4 1.5-1.1 1.8-2.1-1-.4-2.2-.3-3.2.3.4-1 .5-2.2-.2-3.4z"/></svg>';

// ----------------------------------------------------------------------------
// Utilitaires de rendu
// ----------------------------------------------------------------------------

const esc = (v) => echapper(v);

function nomChasseurImpression(c) {
    return c.prenom ? `${c.prenom} ${c.nom}` : c.nom;
}

function libelleTraqueImpression(t) {
    return t.nom || `Traque ${t.numero}`;
}

function chasseurDeCtx(ctx, id) {
    return ctx.chasseurs.find((c) => c.id === id);
}

function postesDeTraque(ctx, traque) {
    return ctx.postes.filter((p) => p.traque_id === traque.id);
}

function parseDate(dateISO) {
    const [a, m, j] = dateISO.split("-").map(Number);
    return new Date(a, m - 1, j);
}

function dateLonguePour(ctx) {
    if (!ctx.battue.date_battue) return "";
    return parseDate(ctx.battue.date_battue).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function dateCourtePour(ctx) {
    return ctx.battue.date_battue ? parseDate(ctx.battue.date_battue).toLocaleDateString("fr-FR") : "";
}

function saisonDeLaBattuePour(ctx) {
    if (!ctx.battue.date_battue) return "";
    const [a, m] = ctx.battue.date_battue.split("-").map(Number);
    return m >= 7 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
}

function parcelleDeLaBattue(ctx) {
    return ctx.parcelles.find((p) => p.id === ctx.battue.parcelle_id);
}

/** Remplace {date}, {secteur}... dans un texte saisi par l'utilisateur. */
function remplacerVariables(texte, ctx) {
    const responsable = chasseurDeCtx(ctx, ctx.battue.responsable_id);
    const valeurs = {
        date: dateLonguePour(ctx), date_courte: dateCourtePour(ctx), secteur: ctx.battue.secteur || "",
        rdv_lieu: ctx.battue.lieu_rdv || "", rdv_heure: ctx.battue.heure_rdv || "",
        responsable: responsable ? nomChasseurImpression(responsable) : "", nb_traques: String(ctx.traques.length),
    };
    return String(texte || "").replace(/\{(\w+)\}/g, (m, cle) => (cle in valeurs ? valeurs[cle] : m));
}

function etatAssuranceImpression(ctx, c) {
    if (!c.assurance_assureur && !c.assurance_validite && !c.assurance_numero_contrat) return { texte: "Non renseignée", alerte: true };
    const morceaux = [c.assurance_assureur, c.assurance_numero_contrat ? "contrat " + c.assurance_numero_contrat : null].filter(Boolean);
    let alerte = false;
    if (c.assurance_validite) {
        morceaux.push("jusqu'au " + parseDate(c.assurance_validite).toLocaleDateString("fr-FR"));
        alerte = !!ctx.battue.date_battue && c.assurance_validite < ctx.battue.date_battue;
        if (alerte) morceaux.push("EXPIRÉE");
    } else {
        morceaux.push("validité non renseignée");
        alerte = true;
    }
    return { texte: morceaux.join(", "), alerte };
}

function chasseursPresents(ctx) {
    const ids = new Set(ctx.participants.map((p) => p.chasseur_id));
    ctx.postes.forEach((p) => { if (p.chasseur_id) ids.add(p.chasseur_id); });
    return [...ids].map((id) => chasseurDeCtx(ctx, id)).filter(Boolean)
        .sort((a, b) => nomChasseurImpression(a).localeCompare(nomChasseurImpression(b), "fr"));
}

function titreDuBloc(o, defaut) {
    const t = o.titre === undefined ? defaut : o.titre;
    return t ? `<div class="ib-bloc-titre">${esc(t)}</div>` : "";
}

function styleTexte(o) {
    return o.taillePolice ? `font-size:${Number(o.taillePolice)}pt;` : "";
}

function styleLigne(o) {
    return o.hauteurLigne ? `style="--ib-h-ligne:${Number(o.hauteurLigne)}mm"` : "";
}

function aucuneTraque() {
    return '<div class="ib-texte" style="color:#888;">Aucune traque : ajoute-les dans le plan de battue.</div>';
}

function lignesVidesTable(n, colonnes) {
    return Array.from({ length: n }, () => `<tr>${'<td class="libre"></td>'.repeat(colonnes)}</tr>`).join("");
}

// ----------------------------------------------------------------------------
// Catalogue des blocs
// ----------------------------------------------------------------------------

const BLOCS = {
    entete: {
        libelle: "En-tête",
        description: "Titre, date et secteur de la battue.",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Battue" },
            { cle: "style", type: "choix", libelle: "Style", defaut: "bandeau", choix: [["bandeau", "Bandeau coloré"], ["simple", "Simple, double filet"]] },
            { cle: "afficherDate", type: "bool", libelle: "Afficher la date", defaut: true },
            { cle: "afficherSecteur", type: "bool", libelle: "Afficher le secteur", defaut: true },
            { cle: "ornement", type: "bool", libelle: "Feuille de chêne", defaut: true },
        ],
        rendre(ctx, o) {
            const sousTitre = [o.afficherDate ? dateLonguePour(ctx) : "", o.afficherSecteur ? ctx.battue.secteur : ""].filter(Boolean).join(" · ");
            return `<header class="ib-entete ib-entete-${o.style === "simple" ? "simple" : "bandeau"}">
                ${o.ornement ? `<span class="ib-ornement">${SVG_FEUILLE_CHENE}</span>` : ""}
                <div><div class="ib-titre">${esc(remplacerVariables(o.titre, ctx))}</div>${sousTitre ? `<div class="ib-sous-titre">${esc(sousTitre)}</div>` : ""}</div>
            </header>`;
        },
    },

    infos: {
        libelle: "Informations pratiques",
        description: "Rendez-vous, responsable, secteur.",
        options: [
            { cle: "rdvLieu", type: "bool", libelle: "Lieu de rendez-vous", defaut: true },
            { cle: "rdvHeure", type: "bool", libelle: "Heure de rendez-vous", defaut: true },
            { cle: "responsable", type: "bool", libelle: "Responsable", defaut: true },
            { cle: "parcelle", type: "bool", libelle: "Parcelle", defaut: false },
            { cle: "nbParticipants", type: "bool", libelle: "Nombre de participants", defaut: false },
            { cle: "disposition", type: "choix", libelle: "Disposition", defaut: "ligne", choix: [["ligne", "En ligne"], ["colonne", "En colonne"]] },
        ],
        rendre(ctx, o) {
            const responsable = chasseurDeCtx(ctx, ctx.battue.responsable_id);
            const parcelle = parcelleDeLaBattue(ctx);
            const champs = [];
            if (o.rdvLieu) champs.push(["Rendez-vous", ctx.battue.lieu_rdv || "—"]);
            if (o.rdvHeure) champs.push(["Heure", ctx.battue.heure_rdv || "—"]);
            if (o.responsable) champs.push(["Responsable", responsable ? nomChasseurImpression(responsable) : "—"]);
            if (o.parcelle) champs.push(["Parcelle", parcelle ? parcelle.nom : "—"]);
            if (o.nbParticipants) champs.push(["Participants", String(chasseursPresents(ctx).length)]);
            return `<div class="ib-infos ${o.disposition === "colonne" ? "colonne" : ""}">${champs.map(([e, v]) => `<div class="ib-info"><span>${esc(e)}</span><strong>${esc(v)}</strong></div>`).join("")}</div>`;
        },
    },

    encart_postes: {
        libelle: "Encart des numéros de poste (à écrire)",
        description: "Une ligne par traque pour noter à la main les numéros de poste.",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Postes par traque" },
            { cle: "colonnes", type: "choix", libelle: "Colonnes", defaut: "2", choix: [["1", "1"], ["2", "2"], ["3", "3"]] },
            { cle: "lignes", type: "nombre", libelle: "Lignes d'écriture par traque", defaut: 1, min: 1, max: 4 },
            { cle: "hauteurLigne", type: "nombre", libelle: "Hauteur d'une ligne (mm)", defaut: 7, min: 4, max: 20 },
            { cle: "texteDevant", type: "texte", libelle: "Texte devant la ligne", defaut: "Postes n°" },
        ],
        rendre(ctx, o) {
            if (ctx.traques.length === 0) return titreDuBloc(o, "Postes par traque") + aucuneTraque();
            const colonnes = Number(o.colonnes) || 2;
            const lignes = Math.max(1, Number(o.lignes) || 1);
            return `${titreDuBloc(o, "Postes par traque")}
                <div class="ib-encart" style="grid-template-columns:repeat(${colonnes},1fr)">
                ${ctx.traques.map((t) => `<div class="ib-encart-traque">
                    <div class="ib-encart-nom"><i class="ib-pastille" style="background:${couleurTraque(t.numero)}"></i>${esc(libelleTraqueImpression(t))}</div>
                    ${Array.from({ length: lignes }, () => `<div class="ib-ecriture" style="height:${Number(o.hauteurLigne) || 7}mm">${esc(o.texteDevant)}</div>`).join("")}
                </div>`).join("")}</div>`;
        },
    },

    carte: {
        libelle: "Carte",
        description: "Les traques choisies, avec postes numérotés, parkings et accès. Plusieurs cartes possibles, chacune avec son cadrage.",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre (facultatif)", defaut: "" },
            { cle: "traques", type: "traques", libelle: "Traques affichées", defaut: [] },
            { cle: "fond", type: "choix", libelle: "Fond de carte", defaut: "plan", choix: [["plan", "Plan IGN"], ["satellite", "Photo aérienne"], ["aucun", "Aucun (tracés seuls)"]] },
            { cle: "etiquettes", type: "choix", libelle: "Étiquettes", defaut: "noms", choix: [["noms", "Noms des postes, parkings, accès"], ["numeros", "Numéros seulement"], ["aucune", "Aucune"]] },
            { cle: "legende", type: "bool", libelle: "Légende", defaut: true },
            { cle: "cadrage", type: "cadrage", libelle: "Cadrage", defaut: null },
        ],
        defautsBloc: { taille: "remplir" },
        rendre(ctx, o, bloc) {
            const traques = traquesDuBloc(ctx, o);
            if (traques.length === 0 && ctx.traques.length > 0) return titreDuBloc(o, "") + '<div class="ib-texte" style="color:#888;">Aucune traque cochée pour cette carte.</div>';
            const specification = esc(JSON.stringify({
                uid: bloc.uid, fond: o.fond, etiquettes: o.etiquettes, traques: traques.map((t) => t.numero), cadrage: o.cadrage || null,
            }));
            return `${titreDuBloc(o, "")}<div class="ib-bloc-carte" style="display:flex; flex-direction:column; flex:1 1 0; min-height:0;">
                <div class="ib-carte-zone"><div class="ib-carte-leaflet" data-carte="${specification}"></div></div>
                ${o.legende ? legendeCarte(ctx, traques) : ""}</div>`;
        },
    },

    plan_chasse_jour: {
        libelle: "Plan de chasse du jour (sonneries)",
        description: "Les catégories autorisées ce jour-là avec leur sonnerie (cochées dans la fiche de la battue).",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Plan de chasse du jour" },
            { cle: "colonneSonnerie", type: "texte", libelle: "En-tête de la colonne sonnerie", defaut: "Sonnerie" },
            { cle: "nombre", type: "bool", libelle: "Colonne « nombre autorisé »", defaut: false },
            { cle: "prelevement", type: "bool", libelle: "Colonne « prélevé » à remplir", defaut: false },
            { cle: "tailleSonnerie", type: "nombre", libelle: "Taille de la sonnerie (pt)", defaut: 14, min: 8, max: 30 },
            { cle: "hauteurLigne", type: "nombre", libelle: "Hauteur d'une ligne (mm)", defaut: 6, min: 4, max: 15 },
        ],
        rendre(ctx, o) {
            const plan = ctx.battue.plan_jour || [];
            const lignes = (ctx.categories || []).map((c) => ({ c, l: plan.find((x) => x.id === c.id) })).filter((x) => x.l && x.l.autorise);
            if (lignes.length === 0) {
                return titreDuBloc(o, "Plan de chasse du jour") + '<div class="ib-texte" style="color:#888;">Plan de chasse du jour non renseigné : coche les catégories dans la fiche de la battue.</div>';
            }
            const libelle = ({ c, l }) => (l.choix && l.choix.length ? l.choix.join(", ") : c.nom);
            return `${titreDuBloc(o, "Plan de chasse du jour")}
            <table class="ib-table" ${styleLigne(o)}><thead><tr><th>Gibier</th><th class="num" style="width:${o.colonneSonnerie ? "20mm" : "12mm"}">${esc(o.colonneSonnerie)}</th>${o.nombre ? '<th class="num" style="width:16mm">Nombre</th>' : ""}${o.prelevement ? '<th style="width:22mm">Prélevé</th>' : ""}</tr></thead><tbody>
            ${lignes.map((x) => `<tr><td class="libre">${esc(libelle(x))}</td><td class="num libre ib-sonnerie" style="font-size:${Number(o.tailleSonnerie) || 14}pt">${esc(x.c.sonnerie)}</td>${o.nombre ? `<td class="num libre">${x.l.nombre === null || x.l.nombre === undefined ? "" : esc(x.l.nombre)}</td>` : ""}${o.prelevement ? '<td class="libre"></td>' : ""}</tr>`).join("")}
            </tbody></table>`;
        },
    },

    consignes: {
        libelle: "Règles de sécurité",
        description: "Texte de la battue ou texte personnalisé.",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Règles de sécurité" },
            { cle: "source", type: "choix", libelle: "Texte", defaut: "battue", choix: [["battue", "Celui de la battue"], ["personnalise", "Texte personnalisé"]] },
            { cle: "texte", type: "zone", libelle: "Texte personnalisé", defaut: "" },
            { cle: "taillePolice", type: "nombre", libelle: "Taille du texte (pt, vide = automatique)", defaut: 0, min: 0, max: 14, pas: 0.5 },
            { cle: "colonnes", type: "choix", libelle: "Colonnes", defaut: "1", choix: [["1", "1"], ["2", "2"]] },
        ],
        rendre(ctx, o) { return blocTexteBattue(ctx, o, "regles_securite", "Règles de sécurité"); },
    },

    instructions: {
        libelle: "Instructions",
        description: "Consignes de déroulement de la battue.",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Instructions" },
            { cle: "source", type: "choix", libelle: "Texte", defaut: "battue", choix: [["battue", "Celui de la battue"], ["personnalise", "Texte personnalisé"]] },
            { cle: "texte", type: "zone", libelle: "Texte personnalisé", defaut: "" },
            { cle: "taillePolice", type: "nombre", libelle: "Taille du texte (pt, vide = automatique)", defaut: 0, min: 0, max: 14, pas: 0.5 },
            { cle: "colonnes", type: "choix", libelle: "Colonnes", defaut: "1", choix: [["1", "1"], ["2", "2"]] },
        ],
        rendre(ctx, o) { return blocTexteBattue(ctx, o, "instructions", "Instructions"); },
    },

    notes: {
        libelle: "Notes de la battue",
        description: "Les notes saisies sur la battue (masqué si vide).",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Notes" },
            { cle: "taillePolice", type: "nombre", libelle: "Taille du texte (pt, vide = automatique)", defaut: 0, min: 0, max: 14, pas: 0.5 },
        ],
        rendre(ctx, o) {
            if (!ctx.battue.notes) return "";
            return `${titreDuBloc(o, "Notes")}<div class="ib-texte" style="${styleTexte(o)}">${esc(ctx.battue.notes)}</div>`;
        },
    },

    postes_chasseurs: {
        libelle: "Postes et chasseurs, par traque",
        description: "Pour chaque traque : numéro, nom du poste, chasseur affecté.",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Postes et chasseurs" },
            { cle: "colonnes", type: "choix", libelle: "Traques côte à côte", defaut: "2", choix: [["1", "1 colonne"], ["2", "2 colonnes"]] },
            { cle: "permis", type: "bool", libelle: "N° de permis", defaut: false },
            { cle: "telephone", type: "bool", libelle: "Téléphone", defaut: false },
            { cle: "lignesVides", type: "nombre", libelle: "Lignes vides en plus", defaut: 1, min: 0, max: 10 },
            { cle: "hauteurLigne", type: "nombre", libelle: "Hauteur d'une ligne (mm)", defaut: 6, min: 4, max: 15 },
        ],
        rendre(ctx, o) {
            if (ctx.traques.length === 0) return titreDuBloc(o, "Postes et chasseurs") + aucuneTraque();
            const colonnesTable = 3 + (o.permis ? 1 : 0) + (o.telephone ? 1 : 0);
            return `${titreDuBloc(o, "Postes et chasseurs")}
            <div class="ib-sous-tableaux" style="grid-template-columns:repeat(${Number(o.colonnes) || 2},1fr)" ${styleLigne(o)}>
            ${ctx.traques.map((t) => {
                const parcelle = ctx.parcelles.find((p) => p.id === t.parcelle_id);
                const postes = postesDeTraque(ctx, t);
                return `<table class="ib-table"><thead>
                    <tr class="nom-traque"><td colspan="${colonnesTable}"><i class="ib-pastille" style="background:${couleurTraque(t.numero)}; margin-right:1.5mm; vertical-align:middle"></i>${esc(libelleTraqueImpression(t))}${parcelle ? " · " + esc(parcelle.nom) : ""}</td></tr>
                    <tr><th class="num">N°</th><th>Poste</th><th>Chasseur</th>${o.permis ? "<th>Permis</th>" : ""}${o.telephone ? "<th>Téléphone</th>" : ""}</tr></thead><tbody>
                    ${postes.map((p, i) => {
                        const c = chasseurDeCtx(ctx, p.chasseur_id);
                        return `<tr><td class="num libre">${i + 1}</td><td class="libre">${esc(p.nom)}</td><td class="libre">${c ? esc(nomChasseurImpression(c)) : ""}</td>${o.permis ? `<td class="libre">${c ? esc(c.numero_permis) : ""}</td>` : ""}${o.telephone ? `<td class="libre">${c ? esc(c.telephone) : ""}</td>` : ""}</tr>`;
                    }).join("")}
                    ${lignesVidesTable(Number(o.lignesVides) || 0, colonnesTable)}
                </tbody></table>`;
            }).join("")}</div>`;
        },
    },

    equipe_traques: {
        libelle: "Conducteurs, chefs de ligne, véhicules",
        description: "Par traque : conducteur, chef ou cheffe de ligne et véhicules (saisis dans le plan).",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Équipes des traques" },
            { cle: "hauteurLigne", type: "nombre", libelle: "Hauteur d'une ligne (mm)", defaut: 8, min: 5, max: 20 },
        ],
        rendre(ctx, o) {
            if (ctx.traques.length === 0) return titreDuBloc(o, "Équipes des traques") + aucuneTraque();
            return `${titreDuBloc(o, "Équipes des traques")}
            <table class="ib-table" ${styleLigne(o)}><thead><tr><th style="width:22%">Traque</th><th style="width:25%">Conducteur</th><th style="width:25%">Chef de ligne</th><th>Véhicules</th></tr></thead><tbody>
            ${ctx.traques.map((t) => `<tr>
                <td class="libre"><i class="ib-pastille" style="background:${couleurTraque(t.numero)}; margin-right:1.5mm; vertical-align:middle"></i><strong>${esc(libelleTraqueImpression(t))}</strong></td>
                <td class="libre">${esc(t.conducteur)}</td><td class="libre">${esc(t.chef_de_ligne)}</td><td class="libre">${esc(t.vehicules)}</td></tr>`).join("")}
            </tbody></table>`;
        },
    },

    saisie_prelevements: {
        libelle: "Tableau des prélèvements (à remplir)",
        description: "Une ligne par poste, avec cases pour noter les tirs et les animaux.",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Prélèvements" },
            { cle: "mode", type: "choix", libelle: "Lignes", defaut: "postes", choix: [["postes", "Une ligne par poste"], ["vide", "Lignes vides"]] },
            { cle: "lignesVides", type: "nombre", libelle: "Lignes vides (mode lignes vides, ou en plus)", defaut: 2, min: 0, max: 30 },
            { cle: "hauteurLigne", type: "nombre", libelle: "Hauteur d'une ligne (mm)", defaut: 8, min: 5, max: 20 },
        ],
        rendre(ctx, o) {
            const lignes = [];
            if (o.mode !== "vide") {
                ctx.traques.forEach((t) => postesDeTraque(ctx, t).forEach((p, i) => {
                    const c = chasseurDeCtx(ctx, p.chasseur_id);
                    lignes.push(`<tr><td class="libre"><i class="ib-pastille" style="background:${couleurTraque(t.numero)}; vertical-align:middle"></i> ${esc(libelleTraqueImpression(t))}</td><td class="num libre">${i + 1}</td><td class="libre">${c ? esc(nomChasseurImpression(c)) : ""}</td><td class="libre"></td><td class="libre"></td><td class="libre"></td></tr>`);
                }));
            }
            return `${titreDuBloc(o, "Prélèvements")}
            <table class="ib-table" ${styleLigne(o)}><thead><tr><th style="width:17%">Traque</th><th class="num">Poste</th><th style="width:20%">Chasseur</th><th style="width:7%">Tirs</th><th>Animaux prélevés</th><th style="width:20%">Observations</th></tr></thead><tbody>
            ${lignes.join("")}${lignesVidesTable(Number(o.lignesVides) || 0, 6)}</tbody></table>`;
        },
    },

    saisie_heures: {
        libelle: "Heures des traques (à remplir)",
        description: "Lancement, fin et nombre de chiens pour chaque traque.",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Déroulement" },
            { cle: "hauteurLigne", type: "nombre", libelle: "Hauteur d'une ligne (mm)", defaut: 7, min: 5, max: 20 },
        ],
        rendre(ctx, o) {
            if (ctx.traques.length === 0) return titreDuBloc(o, "Déroulement") + aucuneTraque();
            return `${titreDuBloc(o, "Déroulement")}
            <table class="ib-table" ${styleLigne(o)}><thead><tr><th>Traque</th><th style="width:15%">Lancement</th><th style="width:15%">Fin</th><th style="width:12%">Chiens</th><th style="width:30%">Remarques</th></tr></thead><tbody>
            ${ctx.traques.map((t) => `<tr><td class="libre"><i class="ib-pastille" style="background:${couleurTraque(t.numero)}; vertical-align:middle"></i> <strong>${esc(libelleTraqueImpression(t))}</strong></td><td class="libre"></td><td class="libre"></td><td class="libre"></td><td class="libre"></td></tr>`).join("")}
            </tbody></table>`;
        },
    },

    bilan: {
        libelle: "Bilan par espèce (à remplir)",
        description: "Plan de chasse de la saison et colonne à remplir pour la journée.",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Bilan de la journée" },
            { cle: "attribution", type: "bool", libelle: "Attribution et réalisé de la saison", defaut: true },
            { cle: "hauteurLigne", type: "nombre", libelle: "Hauteur d'une ligne (mm)", defaut: 7, min: 5, max: 20 },
        ],
        rendre(ctx, o) {
            const plans = ctx.plans.filter((p) => p.saison === saisonDeLaBattuePour(ctx));
            const lignes = plans.length ? plans.map((plan) => {
                const espece = ctx.especes.find((e) => e.id === plan.espece_id);
                const realise = ctx.prelevements.filter((p) => p.espece_id === plan.espece_id && p.saison === plan.saison).length;
                return `<tr><td class="libre">${espece ? esc(espece.nom) : ""}</td>${o.attribution ? `<td class="libre">${esc(plan.attribution)}</td><td class="libre">${realise}</td>` : ""}<td class="libre"></td></tr>`;
            }).join("") : lignesVidesTable(4, o.attribution ? 4 : 2);
            return `${titreDuBloc(o, "Bilan de la journée")}
            <table class="ib-table" ${styleLigne(o)}><thead><tr><th>Espèce</th>${o.attribution ? "<th>Attribution</th><th>Déjà réalisé</th>" : ""}<th>Prélevé aujourd'hui</th></tr></thead><tbody>${lignes}</tbody></table>`;
        },
    },

    presence: {
        libelle: "Présence et émargement",
        description: "Participants avec permis, assurance et case de signature.",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Présence et émargement" },
            { cle: "assurance", type: "bool", libelle: "Assurance de chasse", defaut: true },
            { cle: "mention", type: "zone", libelle: "Mention au-dessus du tableau", defaut: "En signant, chaque participant atteste avoir pris connaissance des règles de sécurité." },
            { cle: "lignesVides", type: "nombre", libelle: "Lignes vides en plus", defaut: 3, min: 0, max: 40 },
            { cle: "hauteurLigne", type: "nombre", libelle: "Hauteur d'une ligne (mm)", defaut: 8, min: 5, max: 20 },
        ],
        rendre(ctx, o) {
            const colonnes = 3 + (o.assurance ? 1 : 0);
            return `${titreDuBloc(o, "Présence et émargement")}
            ${o.mention ? `<div class="ib-texte" style="font-size:0.9em; margin-bottom:1mm;">${esc(o.mention)}</div>` : ""}
            <table class="ib-table" ${styleLigne(o)}><thead><tr><th style="width:24%">Nom</th><th style="width:12%">Permis</th>${o.assurance ? "<th>Assurance</th>" : ""}<th style="width:26%">Signature</th></tr></thead><tbody>
            ${chasseursPresents(ctx).map((c) => {
                const e = etatAssuranceImpression(ctx, c);
                return `<tr><td class="libre">${esc(nomChasseurImpression(c))}</td><td class="libre">${esc(c.numero_permis)}</td>${o.assurance ? `<td class="libre ${e.alerte ? "ib-expiree" : ""}">${esc(e.texte)}</td>` : ""}<td class="libre"></td></tr>`;
            }).join("")}
            ${lignesVidesTable(Number(o.lignesVides) || 0, colonnes + 0)}</tbody></table>`;
        },
    },

    incidents: {
        libelle: "Incidents et observations (lignes)",
        description: "Lignes pour écrire à la main.",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre", defaut: "Incidents" },
            { cle: "lignes", type: "nombre", libelle: "Nombre de lignes", defaut: 4, min: 1, max: 30 },
            { cle: "hauteurLigne", type: "nombre", libelle: "Hauteur d'une ligne (mm)", defaut: 7, min: 5, max: 20 },
        ],
        rendre(ctx, o) {
            return `${titreDuBloc(o, "Incidents")}<div class="ib-lignes-ecriture" ${styleLigne(o)}>${"<div></div>".repeat(Math.max(1, Number(o.lignes) || 1))}</div>`;
        },
    },

    signature: {
        libelle: "Signatures",
        description: "Cases de signature (une par ligne de texte).",
        options: [
            { cle: "libelles", type: "zone", libelle: "Une signature par ligne", defaut: "Signature du responsable\nDate et heure" },
        ],
        rendre(ctx, o) {
            const libelles = String(o.libelles || "").split("\n").map((l) => l.trim()).filter(Boolean);
            return `<div class="ib-signature">${libelles.map((l) => `<div>${esc(remplacerVariables(l, ctx))}</div>`).join("")}</div>`;
        },
    },

    texte_libre: {
        libelle: "Texte libre",
        description: "Un texte de ton choix ({date}, {secteur}, {rdv_lieu}, {rdv_heure}, {responsable} sont remplacés).",
        options: [
            { cle: "titre", type: "texte", libelle: "Titre (facultatif)", defaut: "" },
            { cle: "texte", type: "zone", libelle: "Texte", defaut: "" },
            { cle: "taillePolice", type: "nombre", libelle: "Taille du texte (pt, vide = automatique)", defaut: 0, min: 0, max: 24, pas: 0.5 },
            { cle: "alignement", type: "choix", libelle: "Alignement", defaut: "gauche", choix: [["gauche", "À gauche"], ["centre", "Centré"]] },
            { cle: "cadre", type: "bool", libelle: "Encadré", defaut: false },
        ],
        rendre(ctx, o) {
            return `${titreDuBloc(o, "")}<div class="ib-texte ${o.cadre ? "cadre" : ""} ${o.alignement === "centre" ? "centre" : ""}" style="${styleTexte(o)}">${esc(remplacerVariables(o.texte, ctx))}</div>`;
        },
    },

    espace: {
        libelle: "Espace ou filet",
        description: "Un blanc, avec ou sans trait.",
        options: [
            { cle: "filet", type: "bool", libelle: "Tracer un filet", defaut: false },
        ],
        defautsBloc: { taille: "fixe", hauteurMm: 6 },
        rendre(ctx, o) { return o.filet ? '<div class="ib-filet"></div>' : ""; },
    },
};

function blocTexteBattue(ctx, o, champ, titreDefaut) {
    const texte = o.source === "personnalise" ? remplacerVariables(o.texte, ctx) : ctx.battue[champ];
    if (!texte) return "";
    const colonnes = Number(o.colonnes) || 1;
    const style = `${styleTexte(o)}${colonnes > 1 ? `column-count:${colonnes}; column-gap:5mm;` : ""}`;
    return `${titreDuBloc(o, titreDefaut)}<div class="ib-texte" style="${style}">${esc(texte)}</div>`;
}

/** Traques affichées par un bloc carte (aucune case cochée = toutes). */
function traquesDuBloc(ctx, o) {
    const numeros = Array.isArray(o.traques) ? o.traques : [];
    return numeros.length === 0 ? ctx.traques : ctx.traques.filter((t) => numeros.includes(t.numero));
}

function legendeCarte(ctx, traques) {
    const utilises = new Set();
    traques.forEach((t) => elementsDeTraque(t).forEach((e) => utilises.add(e.type)));
    return `<div class="ib-legende">${traques.map((t) => `<span><i style="border-color:${couleurTraque(t.numero)}"></i>${esc(libelleTraqueImpression(t))}</span>`).join("")}
        ${utilises.has("sens") ? '<span><i style="border-color:#222; border-top-width:1.4mm"></i>Sens de la battue</span>' : ""}
        ${utilises.has("rabatteurs") ? '<span><i style="border-color:#444; border-top-style:dashed"></i>Rabatteurs</span>' : ""}
        <span>🎯 poste · 🅿️ parking · 🚪 accès</span></div>`;
}

// ----------------------------------------------------------------------------
// Configurations
// ----------------------------------------------------------------------------

let compteurUid = 0;

function nouveauBloc(cle, surcharges) {
    const def = BLOCS[cle];
    const options = {};
    def.options.forEach((opt) => { options[opt.cle] = opt.defaut; });
    compteurUid += 1;
    return {
        uid: `b${Date.now().toString(36)}${compteurUid}`, bloc: cle, actif: true,
        largeur: "pleine", taille: "auto", hauteurMm: 30,
        ...(def.defautsBloc || {}), ...(surcharges || {}).generaux,
        options: { ...options, ...((surcharges || {}).options || {}) },
    };
}

function configParDefaut(type) {
    const b = (cle, options, generaux) => nouveauBloc(cle, { options, generaux });
    if (type === "carton") {
        return {
            version: 1, type: "carton", nom: "Carton Sologne",
            style: { palette: "sologne", police: "serif", tailleBase: 9.5, fondPapier: false, cadre: true, marge: 8 },
            faces: {
                recto: [
                    b("entete", { titre: "Battue" }),
                    b("infos", {}),
                    b("encart_postes", { lignes: 1, colonnes: "1", hauteurLigne: 8 }, { largeur: "moitie" }),
                    b("plan_chasse_jour", { tailleSonnerie: 12, hauteurLigne: 5.5 }, { largeur: "moitie" }),
                    b("consignes", { taillePolice: 8, colonnes: "2" }),
                ],
                verso: [b("carte", { etiquettes: "numeros" }, { taille: "remplir" })],
            },
        };
    }
    return {
        version: 1, type: "fiche", nom: "Fiche de gestion Sologne",
        style: { palette: "sologne", police: "serif", tailleBase: 10, fondPapier: false, cadre: true, marge: 10 },
        faces: {
            recto: [
                b("entete", { titre: "Fiche de gestion" }),
                b("infos", { parcelle: true, nbParticipants: true }),
                b("plan_chasse_jour", { nombre: true, prelevement: true }),
                b("equipe_traques", { hauteurLigne: 9 }),
                b("postes_chasseurs", { colonnes: "2", permis: false, lignesVides: 1, hauteurLigne: 7 }),
                b("notes", {}),
            ],
            verso: [
                b("carte", {}, { taille: "remplir" }),
                b("saisie_prelevements", { mode: "postes", lignesVides: 2, hauteurLigne: 7 }),
                b("saisie_heures", {}),
                b("incidents", { lignes: 2 }),
                b("signature", {}),
            ],
        },
    };
}

/** Complète une configuration enregistrée (anciennes versions, options manquantes) et retire les blocs inconnus. */
function normaliserConfig(config, type) {
    const base = configParDefaut(type);
    const c = {
        version: 1, type, nom: (config && config.nom) || base.nom,
        style: { ...base.style, ...((config && config.style) || {}) },
        faces: { recto: [], verso: [] },
    };
    delete c.style.traitsCoupe;   // option supprimée : plus de trait de coupe
    ["recto", "verso"].forEach((face) => {
        ((config && config.faces && config.faces[face]) || []).forEach((bloc) => {
            if (!BLOCS[bloc.bloc]) return;
            const neuf = nouveauBloc(bloc.bloc, { options: bloc.options });
            c.faces[face].push({
                ...neuf, uid: bloc.uid || neuf.uid, actif: bloc.actif !== false,
                largeur: bloc.largeur === "moitie" ? "moitie" : "pleine",
                taille: ["auto", "remplir", "fixe"].includes(bloc.taille) ? bloc.taille : neuf.taille,
                hauteurMm: Number(bloc.hauteurMm) > 0 ? Number(bloc.hauteurMm) : neuf.hauteurMm,
            });
        });
    });
    return c;
}

// ----------------------------------------------------------------------------
// Rendu d'un document
// ----------------------------------------------------------------------------

function rendreBloc(bloc, ctx) {
    const def = BLOCS[bloc.bloc];
    const interieur = def.rendre(ctx, bloc.options, bloc);
    if (!interieur) return null;
    const style = bloc.taille === "fixe" ? `flex:none; height:${Number(bloc.hauteurMm) || 30}mm;` : "";
    return { bloc, html: `<div class="ib-bloc ${bloc.taille === "remplir" ? "remplir" : ""}" style="${style}">${interieur}</div>` };
}

function rendreFace(blocs, ctx) {
    const lignes = [];
    let pendante = null;
    blocs.filter((b) => b.actif).forEach((bloc) => {
        const rendu = rendreBloc(bloc, ctx);
        if (!rendu) return;
        if (bloc.largeur === "moitie") {
            if (pendante) { pendante.push(rendu); lignes.push(pendante); pendante = null; } else pendante = [rendu];
        } else {
            if (pendante) { lignes.push(pendante); pendante = null; }
            lignes.push([rendu]);
        }
    });
    if (pendante) lignes.push(pendante);
    return lignes.map((ligne) => {
        const remplir = ligne.some((x) => x.bloc.taille === "remplir");
        const seulMoitie = ligne.length === 1 && ligne[0].bloc.largeur === "moitie";
        return `<div class="ib-ligne ${remplir ? "remplir" : ""} ${seulMoitie ? "moitie-seule" : ""}">${ligne.map((x) => x.html).join("")}</div>`;
    }).join("");
}

function attributsRacine(config) {
    const p = PALETTES[config.style.palette] || PALETTES.sologne;
    const police = (POLICES[config.style.police] || POLICES.serif).pile;
    const style = `--ib-primaire:${p.primaire}; --ib-secondaire:${p.secondaire}; --ib-accent:${p.accent}; --ib-filet:${p.filet}; --ib-papier:${p.papier}; `
        + `--ib-police:${police}; --ib-base:${Number(config.style.tailleBase) || 9}pt; --ib-marge:${Number(config.style.marge) || 8}mm;`;
    const classes = `ib-racine ${config.style.fondPapier ? "fond-papier" : ""} ${config.style.cadre === false ? "ib-sans-cadre" : ""}`;
    return { style, classes };
}

/** Retourne le HTML des feuilles A4 du document : [{ nom, html }] (recto puis verso). */
function rendreDocument(config, ctx) {
    const surface = (face) => `<div class="ib-cadre"></div><div class="ib-face-contenu" data-face="${face}">${rendreFace(config.faces[face], ctx)}</div>`;
    const feuilles = [];
    ["recto", "verso"].forEach((face) => {
        let interieur;
        if (config.type === "carton") {
            interieur = `<section class="ib-carton">${surface(face)}</section><section class="ib-carton">${surface(face)}</section>`;
        } else {
            interieur = `<section class="ib-page">${surface(face)}</section>`;
        }
        feuilles.push({ nom: face, html: `<div class="ib-feuille" data-face="${face}">${interieur}</div>` });
    });
    return feuilles;
}

/** Faces dont le contenu dépasse la page (à signaler : le texte serait coupé à l'impression). */
function detecterDebordements(racine) {
    const faces = [];
    racine.querySelectorAll(".ib-face-contenu").forEach((zone) => {
        const deborde = zone.scrollHeight > zone.clientHeight + 2 || zone.scrollWidth > zone.clientWidth + 2;
        zone.classList.toggle("deborde", deborde);
        if (deborde && !faces.includes(zone.dataset.face)) faces.push(zone.dataset.face);
    });
    return faces;
}

// ----------------------------------------------------------------------------
// Cartes
// ----------------------------------------------------------------------------

let cartesImpression = [];   // [{ uid, carte }]

function detruireCartesImpression() {
    cartesImpression.forEach((c) => { try { c.carte.remove(); } catch (e) { /* déjà retirée */ } });
    cartesImpression = [];
}

/** Dessine les cartes présentes dans la racine. Retourne une promesse résolue quand les fonds sont chargés. */
function initialiserCartesImpression(racine, ctx) {
    detruireCartesImpression();
    const attentes = [];
    racine.querySelectorAll(".ib-carte-leaflet").forEach((zone) => {
        const spec = JSON.parse(zone.dataset.carte);
        try {
            attentes.push(dessinerCarteImpression(zone, spec, ctx));
        } catch (erreur) {
            console.error("Carte indisponible :", erreur);
            zone.innerHTML = '<div style="padding:4mm; font-size:8pt; color:#a3442f;">Carte indisponible (connexion internet nécessaire).</div>';
        }
    });
    return Promise.all(attentes);
}

function dessinerCarteImpression(zone, spec, ctx) {
    const carte = L.map(zone, {
        zoomControl: false, scrollWheelZoom: false, dragging: false, doubleClickZoom: false, boxZoom: false,
        keyboard: false, touchZoom: false, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5,
    });
    carte.attributionControl.setPrefix(false);
    cartesImpression.push({ uid: spec.uid, carte });
    const fonds = creerFondsCarteIGN();
    const fond = spec.fond === "satellite" ? fonds.satelliteIGN : spec.fond === "aucun" ? null : fonds.planIGN;
    if (fond) fond.addTo(carte);
    else zone.style.background = "#fbfaf5";
    const groupe = L.featureGroup().addTo(carte);
    const avecNoms = spec.etiquettes === "noms";
    const traques = ctx.traques.filter((t) => spec.traques.includes(t.numero));

    const idsParcelles = new Set([ctx.battue.parcelle_id, ...traques.map((t) => t.parcelle_id)].filter(Boolean));
    idsParcelles.forEach((id) => {
        const parcelle = ctx.parcelles.find((p) => p.id === id);
        if (!parcelle || !parcelle.contour) return;
        const polygone = L.polygon(parcelle.contour, { color: "#5a7d4a", weight: 2, fillOpacity: 0.08 });
        if (spec.etiquettes !== "aucune") polygone.bindTooltip(echapper(parcelle.nom), { permanent: true, direction: "center", className: "etiquette-parcelle" });
        groupe.addLayer(polygone);
    });
    traques.forEach((t) => {
        elementsDeTraque(t).forEach((e) => dessinerElement(groupe, e, t.numero, { sansInfobulle: true }));
        (t.parkings || []).forEach((p) => {
            const m = L.marker([p.lat, p.lng], { icon: iconePointCarte("🅿️", "#3a6b8a") });
            if (avecNoms) m.bindTooltip(echapper(p.nom), { permanent: true, direction: "top", offset: [0, -12] });
            groupe.addLayer(m);
        });
        (t.acces || []).forEach((a) => {
            const m = L.marker([a.lat, a.lng], { icon: iconePointCarte("🚪", "#8a6d3a") });
            if (avecNoms) m.bindTooltip(echapper(a.nom), { permanent: true, direction: "top", offset: [0, -12] });
            groupe.addLayer(m);
        });
        postesDeTraque(ctx, t).forEach((poste, index) => {
            const m = L.marker([poste.lat, poste.lng], { icon: iconePosteCouleur(index + 1, couleurTraque(t.numero)) });
            if (avecNoms) m.bindTooltip(echapper(poste.nom), { permanent: true, direction: "right", offset: [14, 0] });
            groupe.addLayer(m);
        });
    });

    carte.invalidateSize();
    if (spec.cadrage && Array.isArray(spec.cadrage.centre)) carte.setView(spec.cadrage.centre, spec.cadrage.zoom, { animate: false });
    else if (groupe.getLayers().length > 0) carte.fitBounds(groupe.getBounds(), { padding: [22, 22], maxZoom: 17 });
    else carte.setView([46.6, 2.5], 6);

    if (!fond) return Promise.resolve();
    return new Promise((resolve) => {
        let termine = false;
        const fin = () => { if (!termine) { termine = true; resolve(); } };
        fond.once("load", fin);
        setTimeout(fin, 9000);
    });
}

// ----------------------------------------------------------------------------
// Cadrage manuel : « Cadrer » rend les cartes d'un bloc déplaçables et zoomables, « Figer » les verrouille
// ----------------------------------------------------------------------------

let cadrageEnCours = null;   // uid du bloc en cours de cadrage
let synchroCadrage = false;

function cartesDuBloc(uid) {
    return cartesImpression.filter((c) => c.uid === uid).map((c) => c.carte);
}

function interactionCarte(carte, active) {
    ["dragging", "scrollWheelZoom", "doubleClickZoom", "boxZoom", "keyboard", "touchZoom"].forEach((h) => {
        if (carte[h]) carte[h][active ? "enable" : "disable"]();
    });
    if (active && !carte._zoomControlCadrage) {
        carte._zoomControlCadrage = L.control.zoom({ position: "topleft" }).addTo(carte);
    }
    if (!active && carte._zoomControlCadrage) {
        carte._zoomControlCadrage.remove();
        carte._zoomControlCadrage = null;
    }
    carte.getContainer().style.cursor = active ? "grab" : "";
}

function activerCadrage(uid) {
    terminerCadrage();
    const cartes = cartesDuBloc(uid);
    if (cartes.length === 0) return false;
    cadrageEnCours = uid;
    cartes.forEach((carte) => {
        interactionCarte(carte, true);
        carte.on("moveend", () => {
            if (synchroCadrage) return;
            synchroCadrage = true;
            cartes.forEach((autre) => { if (autre !== carte) autre.setView(carte.getCenter(), carte.getZoom(), { animate: false }); });
            synchroCadrage = false;
        });
    });
    return true;
}

function terminerCadrage() {
    if (!cadrageEnCours) return;
    cartesDuBloc(cadrageEnCours).forEach((carte) => { carte.off("moveend"); interactionCarte(carte, false); });
    cadrageEnCours = null;
}

/** Verrouille les cartes du bloc et retourne le cadrage à enregistrer : { centre: [lat, lng], zoom }. */
function figerCadrage(uid) {
    const cartes = cartesDuBloc(uid);
    const reference = cartes[0];
    terminerCadrage();
    if (!reference) return null;
    const c = reference.getCenter();
    return { centre: [Number(c.lat.toFixed(6)), Number(c.lng.toFixed(6))], zoom: reference.getZoom() };
}
