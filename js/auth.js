/**
 * Protection des pages et navigation commune.
 * Toutes les pages sauf index.html (connexion) appellent protegerPage()
 * au chargement : si personne n'est connecté, retour à l'écran de connexion.
 */

const PAGES_NAVIGATION = [
    { fichier: "pages/battues.html", libelle: "Battues" },
    { fichier: "pages/parcelles.html", libelle: "Parcelles" },
    { fichier: "pages/chasse.html", libelle: "Chasse" },
    { fichier: "pages/travaux.html", libelle: "Travaux" },
    { fichier: "pages/sauvegarde.html", libelle: "Sauvegarde" },
    { fichier: "pages/aide.html", libelle: "Aide" },
];

async function protegerPage() {
    const { data } = await clientSupabase.auth.getSession();
    // Hors ligne, un jeton expiré ne peut pas être renouvelé : on laisse passer
    // quelqu'un qui s'est déjà connecté sur cet appareil (lecture seule de fait).
    const dejaConnecteIci = Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k));
    if (!data.session && !(!navigator.onLine && dejaConnecteIci)) {
        window.location.href = cheminRacine() + "index.html";
        return false;
    }
    return true;
}

/** Calcule le préfixe relatif vers la racine du site depuis la page courante. */
function cheminRacine() {
    return window.location.pathname.includes("/pages/") ? "../" : "";
}

async function deconnexion() {
    // Les données mises en cache pour le hors ligne ne doivent pas survivre à la session.
    if (window.caches) await caches.delete("foret-donnees-v1");
    await clientSupabase.auth.signOut();
    window.location.href = cheminRacine() + "index.html";
}

function injecterNavigation(pageActiveFichier) {
    const racine = cheminRacine();
    const zone = document.getElementById("zone-navigation");
    if (!zone) return;

    const liensNav = PAGES_NAVIGATION.map((page) => {
        const chemin = racine + page.fichier;
        const estActif = pageActiveFichier === page.fichier;
        return `<a href="${chemin}" class="${estActif ? "actif" : ""}">${page.libelle}</a>`;
    }).join("");

    zone.innerHTML = `
        <header class="barre-haut">
            <span class="titre"><img class="logo-barre" src="${racine}img/logo-bois.svg" alt="" width="34" height="34">Forêt &amp; Chasse</span>
            <button class="bouton-deconnexion" onclick="deconnexion()">Déconnexion</button>
        </header>
        <nav class="navigation">${liensNav}</nav>
    `;
}

/** Valeurs d'un champ à plusieurs entrées (une par ligne) : sans lignes vides. */
/** Véhicules enregistrés une ligne par véhicule, au format « nom|postes déposés » (postes facultatif). */
function vehiculesDepuisTexte(texte) {
    return listeDepuisTexte(texte).map((ligne) => {
        const i = ligne.indexOf("|");
        return i < 0 ? { nom: ligne, postes: "" } : { nom: ligne.slice(0, i).trim(), postes: ligne.slice(i + 1).trim() };
    });
}

function vehiculesVersTexte(liste) {
    return liste.map((v) => (v.postes ? `${v.nom}|${v.postes}` : v.nom)).join("\n");
}

function listeDepuisTexte(texte) {
    return String(texte || "").split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
}

/**
 * Trie des postes par leur nom en tenant compte des nombres (Poste 2 avant Poste 10).
 * La base ne garantit aucun ordre : sans ce tri, les numéros des marqueurs de la carte ne
 * correspondent plus aux noms des postes.
 */
function trierPostesParNom(postes) {
    return (postes || []).slice().sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { numeric: true, sensitivity: "base" }));
}

/**
 * Échappe une valeur saisie par un utilisateur avant de l'insérer dans du HTML
 * (innerHTML, gabarits, infobulles Leaflet). Une valeur absente donne "".
 */
function echapper(valeur) {
    if (valeur === null || valeur === undefined) return "";
    return String(valeur)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
