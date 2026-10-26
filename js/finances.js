/**
 * Module Finances et documents : cotisations, factures, baux de chasse
 * et documents (stockés via Supabase Storage, bucket "documents").
 */

let chasseursFinancesCache = [];
let chantiersFinancesCache = [];
let prestatairesFinancesCache = [];
let parcellesFinancesCache = [];
let cotisationEnEditionId = null;
let factureEnEditionId = null;
let bailEnEditionId = null;

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/finances.html");
    afficherBandeauDemoSiBesoin();

    await Promise.all([
        chargerChasseursFinances(),
        chargerChantiersFinances(),
        chargerPrestatairesFinances(),
        chargerParcellesFinances(),
    ]);
    await chargerCotisations();
    await chargerFactures();
    await chargerBaux();
    await chargerDocuments();

    document.getElementById("formulaire-cotisation").addEventListener("submit", enregistrerCotisation);
    document.getElementById("formulaire-facture").addEventListener("submit", enregistrerFacture);
    document.getElementById("formulaire-bail").addEventListener("submit", enregistrerBail);
    document.getElementById("formulaire-document").addEventListener("submit", enregistrerDocument);
})();

function onChangementOnglet(idOnglet) {
    const rafraichisseurs = {
        "onglet-cotisations": chargerCotisations,
        "onglet-factures": chargerFactures,
        "onglet-baux": chargerBaux,
        "onglet-documents": chargerDocuments,
    };
    if (rafraichisseurs[idOnglet]) rafraichisseurs[idOnglet]();
}

function nomAffichePersonne(personne) {
    return personne.prenom ? `${personne.prenom} ${personne.nom}` : personne.nom;
}

function saisonCourante() {
    const aujourdhui = new Date();
    const annee = aujourdhui.getFullYear();
    return aujourdhui.getMonth() + 1 >= 7 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}

// ----------------------------------------------------------------------------
// Listes de référence pour les sélecteurs
// ----------------------------------------------------------------------------

async function chargerChasseursFinances() {
    const { data } = await clientSupabase.from("chasseurs").select().order("nom");
    chasseursFinancesCache = data || [];
    const options = chasseursFinancesCache.map((c) => `<option value="${c.id}">${nomAffichePersonne(c)}</option>`).join("");
    document.getElementById("champ-chasseur-cotisation").innerHTML = options;
    document.getElementById("champ-chasseur-document").innerHTML = '<option value="">— Aucun —</option>' + options;
}

async function chargerChantiersFinances() {
    const { data } = await clientSupabase.from("chantiers").select().order("titre");
    chantiersFinancesCache = data || [];
    const options = '<option value="">— Non lié —</option>' + chantiersFinancesCache.map((c) => `<option value="${c.id}">${c.titre}</option>`).join("");
    document.getElementById("champ-chantier-facture").innerHTML = options;
    document.getElementById("champ-chantier-document").innerHTML = '<option value="">— Aucun —</option>' + chantiersFinancesCache.map((c) => `<option value="${c.id}">${c.titre}</option>`).join("");
}

async function chargerPrestatairesFinances() {
    const { data } = await clientSupabase.from("prestataires").select().order("nom");
    prestatairesFinancesCache = data || [];
    document.getElementById("champ-prestataire-facture").innerHTML =
        '<option value="">— Non lié —</option>' + prestatairesFinancesCache.map((p) => `<option value="${p.id}">${p.nom}</option>`).join("");
}

async function chargerParcellesFinances() {
    const { data } = await clientSupabase.from("parcelles").select().order("nom");
    parcellesFinancesCache = data || [];
    document.getElementById("champ-parcelle-document").innerHTML =
        '<option value="">— Aucune —</option>' + parcellesFinancesCache.map((p) => `<option value="${p.id}">${p.nom}</option>`).join("");
}

// ----------------------------------------------------------------------------
// Cotisations
// ----------------------------------------------------------------------------

async function chargerCotisations() {
    const { data } = await clientSupabase.from("cotisations").select().order("saison", { ascending: false });
    const cotisations = data || [];
    const corps = document.getElementById("corps-tableau-cotisations");
    if (cotisations.length === 0) {
        corps.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">Aucune cotisation</td></tr>`;
        return;
    }
    corps.innerHTML = cotisations.map((c) => {
        const chasseur = chasseursFinancesCache.find((ch) => ch.id === c.chasseur_id);
        const couleur = (c.statut === "En attente" || c.statut === "En retard") ? "color:#a3442f; font-weight:600;" : "";
        return `
            <tr>
                <td data-etiquette="Chasseur">${chasseur ? nomAffichePersonne(chasseur) : ""}</td>
                <td data-etiquette="Saison">${c.saison}</td>
                <td data-etiquette="Montant">${c.montant.toFixed(2)} €</td>
                <td data-etiquette="Statut" style="${couleur}">${c.statut}</td>
                <td data-etiquette=""><button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerCotisation('${c.id}')">Supprimer</button></td>
            </tr>
        `;
    }).join("");
}

function ouvrirCreationCotisation() {
    cotisationEnEditionId = null;
    document.getElementById("formulaire-cotisation").reset();
    document.getElementById("champ-saison-cotisation").value = saisonCourante();
    document.getElementById("message-modale-cotisation").innerHTML = "";
    ouvrirModale("modale-cotisation");
}

async function enregistrerCotisation(evenement) {
    evenement.preventDefault();
    const chasseurId = document.getElementById("champ-chasseur-cotisation").value;
    const saison = document.getElementById("champ-saison-cotisation").value.trim();
    const montant = parseFloat(document.getElementById("champ-montant-cotisation").value);
    if (!chasseurId || !saison || !montant) {
        document.getElementById("message-modale-cotisation").innerHTML = '<div class="message-alerte">Chasseur, saison et montant sont obligatoires.</div>';
        return;
    }
    const statut = document.getElementById("champ-statut-cotisation").value;
    await clientSupabase.from("cotisations").insert({
        chasseur_id: chasseurId, saison, montant, statut,
        date_paiement: statut === "Payée" ? new Date().toISOString().slice(0, 10) : null,
    });
    fermerModale("modale-cotisation");
    await chargerCotisations();
}

async function supprimerCotisation(id) {
    if (!confirm("Supprimer cette cotisation ?")) return;
    await clientSupabase.from("cotisations").delete().eq("id", id);
    await chargerCotisations();
}

// ----------------------------------------------------------------------------
// Factures
// ----------------------------------------------------------------------------

async function chargerFactures() {
    const { data } = await clientSupabase.from("factures").select().order("date_echeance", { ascending: false });
    const factures = data || [];
    const corps = document.getElementById("corps-tableau-factures");
    if (factures.length === 0) {
        corps.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888;">Aucune facture</td></tr>`;
        return;
    }
    corps.innerHTML = factures.map((f) => {
        const couleur = (f.statut === "En attente" || f.statut === "En retard") ? "color:#a3442f; font-weight:600;" : "";
        const echeance = f.date_echeance ? new Date(f.date_echeance).toLocaleDateString("fr-FR") : "";
        return `
            <tr>
                <td data-etiquette="Numéro">${f.numero || "#" + f.id.slice(0, 6)}</td>
                <td data-etiquette="Description">${f.description || ""}</td>
                <td data-etiquette="Montant">${f.montant.toFixed(2)} €</td>
                <td data-etiquette="Échéance">${echeance}</td>
                <td data-etiquette="Statut" style="${couleur}">${f.statut}</td>
                <td data-etiquette=""><button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerFacture('${f.id}')">Supprimer</button></td>
            </tr>
        `;
    }).join("");
}

function ouvrirCreationFacture() {
    factureEnEditionId = null;
    document.getElementById("formulaire-facture").reset();
    document.getElementById("message-modale-facture").innerHTML = "";
    ouvrirModale("modale-facture");
}

async function enregistrerFacture(evenement) {
    evenement.preventDefault();
    const montant = parseFloat(document.getElementById("champ-montant-facture").value);
    if (!montant || montant <= 0) {
        document.getElementById("message-modale-facture").innerHTML = '<div class="message-alerte">Le montant doit être supérieur à zéro.</div>';
        return;
    }
    await clientSupabase.from("factures").insert({
        numero: document.getElementById("champ-numero-facture").value.trim() || null,
        description: document.getElementById("champ-description-facture").value.trim() || null,
        montant,
        date_emission: document.getElementById("champ-emission-facture").value || null,
        date_echeance: document.getElementById("champ-echeance-facture").value || null,
        statut: document.getElementById("champ-statut-facture").value,
        chantier_id: document.getElementById("champ-chantier-facture").value || null,
        prestataire_id: document.getElementById("champ-prestataire-facture").value || null,
    });
    fermerModale("modale-facture");
    await chargerFactures();
}

async function supprimerFacture(id) {
    if (!confirm("Supprimer cette facture ?")) return;
    await clientSupabase.from("factures").delete().eq("id", id);
    await chargerFactures();
}

// ----------------------------------------------------------------------------
// Baux de chasse
// ----------------------------------------------------------------------------

async function chargerBaux() {
    const { data } = await clientSupabase.from("baux_chasse").select().order("date_fin", { ascending: false });
    const baux = data || [];
    const corps = document.getElementById("corps-tableau-baux");
    if (baux.length === 0) {
        corps.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">Aucun bail</td></tr>`;
        return;
    }
    corps.innerHTML = baux.map((b) => `
        <tr>
            <td data-etiquette="Locataire">${b.locataire}</td>
            <td data-etiquette="Début">${b.date_debut ? new Date(b.date_debut).toLocaleDateString("fr-FR") : ""}</td>
            <td data-etiquette="Fin">${b.date_fin ? new Date(b.date_fin).toLocaleDateString("fr-FR") : ""}</td>
            <td data-etiquette="Montant">${b.montant_annuel ? b.montant_annuel.toFixed(2) + " €" : ""}</td>
            <td data-etiquette=""><button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerBail('${b.id}')">Supprimer</button></td>
        </tr>
    `).join("");
}

function ouvrirCreationBail() {
    bailEnEditionId = null;
    document.getElementById("formulaire-bail").reset();
    document.getElementById("message-modale-bail").innerHTML = "";
    ouvrirModale("modale-bail");
}

async function enregistrerBail(evenement) {
    evenement.preventDefault();
    const locataire = document.getElementById("champ-locataire-bail").value.trim();
    if (!locataire) {
        document.getElementById("message-modale-bail").innerHTML = '<div class="message-alerte">Le nom du locataire est obligatoire.</div>';
        return;
    }
    await clientSupabase.from("baux_chasse").insert({
        locataire,
        perimetre: document.getElementById("champ-perimetre-bail").value.trim() || null,
        date_debut: document.getElementById("champ-debut-bail").value || null,
        date_fin: document.getElementById("champ-fin-bail").value || null,
        montant_annuel: parseFloat(document.getElementById("champ-montant-bail").value) || null,
    });
    fermerModale("modale-bail");
    await chargerBaux();
}

async function supprimerBail(id) {
    if (!confirm("Supprimer ce bail de chasse ?")) return;
    await clientSupabase.from("baux_chasse").delete().eq("id", id);
    await chargerBaux();
}

// ----------------------------------------------------------------------------
// Documents (Supabase Storage)
// ----------------------------------------------------------------------------

async function chargerDocuments() {
    const { data } = await clientSupabase.from("documents").select().order("date_ajout", { ascending: false });
    const documents = data || [];
    const corps = document.getElementById("corps-tableau-documents");
    if (documents.length === 0) {
        corps.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888;">Aucun document</td></tr>`;
        return;
    }
    corps.innerHTML = documents.map((d) => {
        const rattachements = [];
        const parcelle = parcellesFinancesCache.find((p) => p.id === d.parcelle_id);
        const chantier = chantiersFinancesCache.find((c) => c.id === d.chantier_id);
        const chasseur = chasseursFinancesCache.find((c) => c.id === d.chasseur_id);
        if (parcelle) rattachements.push("Parcelle : " + parcelle.nom);
        if (chantier) rattachements.push("Chantier : " + chantier.titre);
        if (chasseur) rattachements.push("Chasseur : " + nomAffichePersonne(chasseur));

        const { data: urlPublique } = clientSupabase.storage.from("documents").getPublicUrl(d.chemin_fichier);

        return `
            <tr>
                <td data-etiquette="Titre"><a href="${urlPublique.publicUrl}" target="_blank">${d.titre}</a></td>
                <td data-etiquette="Type">${d.type_document}</td>
                <td data-etiquette="Rattaché à">${rattachements.join(", ")}</td>
                <td data-etiquette=""><button class="bouton bouton-danger" style="padding:4px 8px;" onclick="supprimerDocument('${d.id}')">Supprimer</button></td>
            </tr>
        `;
    }).join("");
}

function ouvrirAjoutDocument() {
    document.getElementById("formulaire-document").reset();
    document.getElementById("message-modale-document").innerHTML = "";
    ouvrirModale("modale-document");
}

async function enregistrerDocument(evenement) {
    evenement.preventDefault();
    const titre = document.getElementById("champ-titre-document").value.trim();
    const fichierInput = document.getElementById("champ-fichier-document");
    const fichier = fichierInput.files[0];

    if (!titre || !fichier) {
        document.getElementById("message-modale-document").innerHTML = '<div class="message-alerte">Le titre et le fichier sont obligatoires.</div>';
        return;
    }

    const chemin = `${Date.now()}_${fichier.name}`;
    const { error: erreurEnvoi } = await clientSupabase.storage.from("documents").upload(chemin, fichier);
    if (erreurEnvoi) {
        document.getElementById("message-modale-document").innerHTML = `<div class="message-alerte">Échec de l'envoi : ${erreurEnvoi.message}</div>`;
        return;
    }

    await clientSupabase.from("documents").insert({
        titre,
        type_document: document.getElementById("champ-type-document").value,
        chemin_fichier: chemin,
        date_ajout: new Date().toISOString().slice(0, 10),
        parcelle_id: document.getElementById("champ-parcelle-document").value || null,
        chantier_id: document.getElementById("champ-chantier-document").value || null,
        chasseur_id: document.getElementById("champ-chasseur-document").value || null,
    });

    fermerModale("modale-document");
    await chargerDocuments();
}

async function supprimerDocument(id) {
    if (!confirm("Supprimer cette fiche document ? Le fichier envoyé sera aussi supprimé du stockage.")) return;
    const { data: fiche } = await clientSupabase.from("documents").select().eq("id", id).single();
    if (fiche) await clientSupabase.storage.from("documents").remove([fiche.chemin_fichier]);
    await clientSupabase.from("documents").delete().eq("id", id);
    await chargerDocuments();
}
