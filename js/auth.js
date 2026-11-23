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
/**
 * Véhicules : une ligne par véhicule, au format « nom|postes déposés|conducteur » (postes et conducteur facultatifs).
 * gardeVides conserve les lignes vides (saisie en cours dans l'éditeur).
 */
function vehiculesDepuisTexte(texte, gardeVides) {
    const lignes = gardeVides ? String(texte || "").split(/\r?\n/) : listeDepuisTexte(texte);
    return lignes.map((ligne) => {
        const [nom, postes, conducteur] = ligne.split("|");
        return { nom: (nom || "").trim(), postes: (postes || "").trim(), conducteur: (conducteur || "").trim() };
    });
}

function vehiculesVersTexte(liste) {
    return liste.map((v) => (v.postes || v.conducteur ? `${v.nom}|${v.postes || ""}${v.conducteur ? "|" + v.conducteur : ""}` : v.nom)).join("\n");
}

/** « 1 à 8, 12, 15-17 » devient l'ensemble des numéros de postes concernés. */
function numerosDepuisSpec(spec) {
    const numeros = new Set();
    String(spec || "").toLowerCase().split(/[,;]|\bet\b/).forEach((morceau) => {
        const m = morceau.match(/(\d+)\s*(?:à|a|au|-|–)\s*(\d+)/);
        if (m) { for (let i = Number(m[1]); i <= Number(m[2]) && i < 500; i++) numeros.add(i); return; }
        const n = morceau.match(/\d+/);
        if (n) numeros.add(Number(n[0]));
    });
    return numeros;
}

/** Véhicule qui dépose le poste de ce numéro (d'après la liste « postes déposés » des véhicules), ou null. */
function vehiculePourPoste(vehiculesTexte, numero) {
    return vehiculesDepuisTexte(vehiculesTexte).find((v) => v.postes && numerosDepuisSpec(v.postes).has(numero)) || null;
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
