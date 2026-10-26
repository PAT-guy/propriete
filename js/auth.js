/**
 * Protection des pages et navigation commune.
 * Toutes les pages sauf index.html (connexion) appellent protegerPage()
 * au chargement : si personne n'est connecté, retour à l'écran de connexion.
 */

const PAGES_NAVIGATION = [
    { fichier: "tableau-de-bord.html", libelle: "Tableau de bord" },
    { fichier: "pages/parcelles.html", libelle: "Parcelles" },
    { fichier: "pages/chasse.html", libelle: "Chasse" },
    { fichier: "pages/travaux.html", libelle: "Travaux" },
    { fichier: "pages/finances.html", libelle: "Finances" },
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
            <span class="titre"><span class="icone">🌲</span>Forêt &amp; Chasse</span>
            <button class="bouton-deconnexion" onclick="deconnexion()">Déconnexion</button>
        </header>
        <nav class="navigation">${liensNav}</nav>
    `;
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
