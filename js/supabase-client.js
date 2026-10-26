/**
 * Initialise le client utilisé par toutes les pages : le vrai client
 * Supabase si config.js a été rempli, sinon le client de démonstration
 * (js/mode-demo.js) qui stocke tout dans ce navigateur.
 */
const clientSupabase = modeDemonstrationActif()
    ? new ClientSupabaseDemo()
    : window.supabase.createClient(CONFIG_SUPABASE_URL, CONFIG_SUPABASE_ANON_KEY);

function afficherBandeauDemoSiBesoin() {
    if (!modeDemonstrationActif()) return;
    const bandeau = document.createElement("div");
    bandeau.className = "sans-impression";
    bandeau.style.cssText =
        "background:#fff3cd; color:#7a5b00; text-align:center; padding:8px; font-size:12px; font-weight:600;";
    bandeau.textContent =
        `Mode démonstration — données conservées uniquement dans ce navigateur. Connexion : ${COMPTE_DEMO.email} / ${COMPTE_DEMO.motDePasse}`;
    document.body.prepend(bandeau);
}
