/**
 * Initialise le client utilisé par toutes les pages : le vrai client
 * Supabase si config.js a été rempli, sinon le client de démonstration
 * (js/mode-demo.js) qui stocke tout dans ce navigateur.
 */
const clientSupabase = modeDemonstrationActif()
    ? new ClientSupabaseDemo()
    : window.supabase.createClient(CONFIG_SUPABASE_URL, CONFIG_SUPABASE_ANON_KEY, { global: { fetch: fetchSansEcritureHorsLigne } });

/**
 * Hors ligne, les lectures peuvent être servies par le cache (voir sw.js) mais
 * une écriture ne peut pas aboutir : on le dit clairement plutôt que de laisser
 * croire que la saisie a été enregistrée.
 */
function fetchSansEcritureHorsLigne(url, options) {
    const methode = ((options && options.method) || "GET").toUpperCase();
    if (!navigator.onLine && methode !== "GET" && methode !== "HEAD") {
        alert("Pas de réseau : cette modification n'a pas été enregistrée. Réessaie quand la connexion est revenue.");
        return Promise.reject(new TypeError("Hors ligne"));
    }
    return fetch(url, options).then(async (reponse) => {
        if (!reponse.ok && methode !== "GET" && methode !== "HEAD") await signalerEchecEcriture(reponse);
        return reponse;
    });
}

/** Une écriture refusée par la base ne doit jamais passer inaperçue (le code appelant ignore souvent l'erreur). */
async function signalerEchecEcriture(reponse) {
    let detail = "";
    try { detail = (await reponse.clone().json()).message || ""; } catch (e) { /* réponse sans JSON */ }
    const baseObsolete = /column|schema cache|does not exist|relation/i.test(detail);
    alert("L'enregistrement a échoué" + (detail ? " : " + detail : ` (erreur ${reponse.status})`) +
        (baseObsolete ? "\n\nLa base de données n'est probablement pas à jour : recopie le fichier schema.sql dans l'éditeur SQL de Supabase puis clique sur Run." : ""));
}

/** Enregistre le service worker (mode hors ligne) : seulement en https ou sur localhost. */
if ("serviceWorker" in navigator) {
    const racine = window.location.pathname.includes("/pages/") ? "../" : "";
    navigator.serviceWorker.register(racine + "sw.js").catch((erreur) => console.warn("Mode hors ligne indisponible :", erreur));
}

function afficherBandeauHorsLigne() {
    const bandeau = document.createElement("div");
    bandeau.id = "bandeau-hors-ligne";
    bandeau.className = "sans-impression";
    bandeau.style.cssText = "display:none; background:#f8d7da; color:#842029; text-align:center; padding:8px; font-size:12px; font-weight:600;";
    bandeau.textContent = "Hors ligne : consultation des données déjà chargées uniquement, les modifications ne sont pas enregistrées.";
    document.body.prepend(bandeau);
    const maj = () => { bandeau.style.display = navigator.onLine ? "none" : "block"; };
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    maj();
}

function afficherBandeauDemoSiBesoin() {
    afficherBandeauHorsLigne();
    if (!modeDemonstrationActif()) return;
    const bandeau = document.createElement("div");
    bandeau.className = "sans-impression";
    bandeau.style.cssText =
        "background:#fff3cd; color:#7a5b00; text-align:center; padding:8px; font-size:12px; font-weight:600;";
    bandeau.textContent =
        `Mode démonstration — données conservées uniquement dans ce navigateur. Connexion : ${COMPTE_DEMO.email} / ${COMPTE_DEMO.motDePasse}`;
    document.body.prepend(bandeau);
}
