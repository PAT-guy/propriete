/**
 * Sauvegarde complète des données dans un fichier JSON, et restauration.
 * Les tables sont listées dans l'ordre où elles peuvent être recréées (les clés étrangères
 * pointent toujours vers une table qui précède) ; la suppression se fait dans l'ordre inverse.
 */

const TABLES_SAUVEGARDE = [
    ["proprietaires", "Propriétaires"], ["especes_gibier", "Espèces de gibier"], ["chasseurs", "Chasseurs"],
    ["parcelles", "Parcelles"], ["essences_parcelle", "Essences"], ["plans_chasse", "Plan de chasse"], ["categories_chasse", "Catégories et sonneries"],
    ["battues", "Battues et modèles"], ["participants_battue", "Participants aux battues"],
    ["traques", "Traques"], ["postes_chasse", "Bibliothèque de postes"], ["postes_traque", "Postes placés"],
    ["versions_plan", "Versions de plans"], ["modeles_impression", "Mises en page d'impression"], ["prelevements", "Prélèvements"], ["prestataires", "Prestataires"],
    ["chantiers", "Chantiers"], ["cotisations", "Cotisations"], ["factures", "Factures"],
    ["baux_chasse", "Baux de chasse"], ["documents", "Documents (références)"],
];
const CLE_DERNIERE_SAUVEGARDE = "foret_derniere_sauvegarde";
const FORMAT_SAUVEGARDE = "foret-chasse-sauvegarde";
const UUID_NUL = "00000000-0000-0000-0000-000000000000";
const TAILLE_LOT = 200;

let sauvegardeLue = null;

(async () => {
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/sauvegarde.html");
    afficherBandeauDemoSiBesoin();

    document.getElementById("bouton-sauvegarder").addEventListener("click", telechargerSauvegarde);
    document.getElementById("champ-fichier").addEventListener("change", lireFichier);
    document.getElementById("bouton-restaurer").addEventListener("click", restaurer);
    afficherDerniereSauvegarde();
    await afficherContenu();
})();

function afficherDerniereSauvegarde() {
    let derniere = null;
    try { derniere = localStorage.getItem(CLE_DERNIERE_SAUVEGARDE); } catch (e) { /* stockage indisponible */ }
    document.getElementById("texte-derniere-sauvegarde").textContent = derniere
        ? "Dernière sauvegarde téléchargée depuis cet appareil : " + new Date(derniere).toLocaleString("fr-FR") + "."
        : "Aucune sauvegarde n'a encore été téléchargée depuis cet appareil.";
}

async function lireToutesLesLignes(table) {
    const lignes = [];
    for (let debut = 0; ; debut += 1000) {
        const { data, error } = await clientSupabase.from(table).select().order("id").range(debut, debut + 999);
        if (error) throw new Error(`${table} : ${error.message}`);
        lignes.push(...(data || []));
        if (!data || data.length < 1000) break;
    }
    return lignes;
}

async function afficherContenu() {
    const corps = document.getElementById("corps-contenu");
    corps.innerHTML = "";
    for (const [table, libelle] of TABLES_SAUVEGARDE) {
        try {
            const { data } = await clientSupabase.from(table).select("id");
            const n = (data || []).length;
            if (n > 0) corps.insertAdjacentHTML("beforeend", `<tr><td>${echapper(libelle)}</td><td style="text-align:right;">${n}</td></tr>`);
        } catch (erreur) { /* table absente : ignorée */ }
    }
    if (!corps.innerHTML) corps.innerHTML = '<tr><td style="color:#888;">Aucune donnée pour l\'instant.</td></tr>';
}

async function construireSauvegarde() {
    const tables = {};
    for (const [table] of TABLES_SAUVEGARDE) tables[table] = await lireToutesLesLignes(table);
    return { application: FORMAT_SAUVEGARDE, version: 1, date: new Date().toISOString(), tables };
}

function telechargerFichier(nom, objet) {
    const blob = new Blob([JSON.stringify(objet)], { type: "application/json" });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = nom;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 5000);
}

function nomFichierSauvegarde(prefixe) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${prefixe}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}.json`;
}

async function telechargerSauvegarde() {
    const bouton = document.getElementById("bouton-sauvegarder");
    const message = document.getElementById("message-sauvegarde");
    bouton.disabled = true;
    message.textContent = "Préparation du fichier…";
    try {
        const sauvegarde = await construireSauvegarde();
        telechargerFichier(nomFichierSauvegarde("foret-sauvegarde"), sauvegarde);
        try { localStorage.setItem(CLE_DERNIERE_SAUVEGARDE, new Date().toISOString()); } catch (e) { /* stockage indisponible */ }
        const total = Object.values(sauvegarde.tables).reduce((n, l) => n + l.length, 0);
        message.textContent = `Fichier téléchargé (${total} éléments).`;
        afficherDerniereSauvegarde();
    } catch (erreur) {
        message.innerHTML = `<span style="color:#a3442f;">Échec : ${echapper(erreur.message)}</span>`;
    } finally {
        bouton.disabled = false;
    }
}

// ----------------------------------------------------------------------------
// Restauration
// ----------------------------------------------------------------------------

function lireFichier(evenement) {
    const fichier = evenement.target.files[0];
    sauvegardeLue = null;
    document.getElementById("bouton-restaurer").disabled = true;
    document.getElementById("message-restauration").innerHTML = "";
    const resume = document.getElementById("resume-fichier");
    resume.textContent = "";
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.onload = () => {
        try {
            const contenu = JSON.parse(lecteur.result);
            if (contenu.application !== FORMAT_SAUVEGARDE || !contenu.tables) throw new Error("ce fichier n'est pas une sauvegarde de ce site");
            for (const [table] of TABLES_SAUVEGARDE) {
                if (contenu.tables[table] !== undefined && !Array.isArray(contenu.tables[table])) throw new Error(`contenu de « ${table} » invalide`);
            }
            sauvegardeLue = contenu;
            const total = TABLES_SAUVEGARDE.reduce((n, [t]) => n + (contenu.tables[t] || []).length, 0);
            resume.textContent = `Sauvegarde du ${new Date(contenu.date).toLocaleString("fr-FR")} : ${total} éléments.`;
            document.getElementById("bouton-restaurer").disabled = false;
        } catch (erreur) {
            document.getElementById("message-restauration").innerHTML =
                `<div class="message-alerte">Fichier illisible : ${echapper(erreur.message)}.</div>`;
        }
    };
    lecteur.readAsText(fichier);
}

async function supprimerToutesLesLignes(table) {
    const { error } = await clientSupabase.from(table).delete().neq("id", UUID_NUL);
    if (error) throw new Error(`suppression de ${table} : ${error.message}`);
}

async function insererParLots(table, lignes) {
    for (let i = 0; i < lignes.length; i += TAILLE_LOT) {
        const { error } = await clientSupabase.from(table).insert(lignes.slice(i, i + TAILLE_LOT));
        if (error) throw new Error(`${table} : ${error.message}`);
    }
}

async function restaurer() {
    if (!sauvegardeLue) return;
    const mode = document.querySelector('input[name="mode-restauration"]:checked').value;
    const progression = document.getElementById("progression-restauration");
    const message = document.getElementById("message-restauration");
    const bouton = document.getElementById("bouton-restaurer");
    message.innerHTML = "";

    if (mode === "remplacer" && !confirm("Toutes les données actuelles vont être effacées puis remplacées par celles du fichier. Une copie de sécurité des données actuelles sera d'abord téléchargée. Continuer ?")) return;
    if (mode === "ajouter" && !confirm("Les éléments du fichier qui n'existent pas encore seront ajoutés. Continuer ?")) return;

    bouton.disabled = true;
    try {
        if (mode === "remplacer") {
            progression.textContent = "Copie de sécurité…";
            telechargerFichier(nomFichierSauvegarde("foret-avant-restauration"), await construireSauvegarde());
            for (const [table] of [...TABLES_SAUVEGARDE].reverse()) {
                progression.textContent = `Suppression : ${table}…`;
                await supprimerToutesLesLignes(table);
            }
        }
        let ajoutes = 0;
        for (const [table] of TABLES_SAUVEGARDE) {
            let lignes = sauvegardeLue.tables[table] || [];
            if (mode === "ajouter" && lignes.length > 0) {
                const existantes = new Set((await lireToutesLesLignes(table)).map((l) => l.id));
                lignes = lignes.filter((l) => !existantes.has(l.id));
            }
            if (lignes.length === 0) continue;
            progression.textContent = `Restauration : ${table} (${lignes.length})…`;
            await insererParLots(table, lignes);
            ajoutes += lignes.length;
        }
        progression.textContent = "";
        message.innerHTML = `<div class="message-info" style="background:#e8f0e2; padding:10px; border-radius:8px;">Sauvegarde rouverte : ${ajoutes} éléments ${mode === "remplacer" ? "restaurés" : "ajoutés"}.</div>`;
        await afficherContenu();
    } catch (erreur) {
        progression.textContent = "";
        message.innerHTML = `<div class="message-alerte">La restauration s'est arrêtée : ${echapper(erreur.message)}. ${mode === "remplacer" ? "Une copie de sécurité a été téléchargée avant la suppression : tu peux la rouvrir avec « Tout remplacer »." : ""}</div>`;
    } finally {
        bouton.disabled = false;
    }
}
