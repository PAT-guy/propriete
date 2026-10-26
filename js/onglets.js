/** Gestion générique des onglets (.onglets > button[data-onglet] / .panneau-onglet). */

function initialiserOnglets() {
    document.querySelectorAll(".onglets button[data-onglet]").forEach((bouton) => {
        bouton.addEventListener("click", () => {
            document.querySelectorAll(".onglets button").forEach((b) => b.classList.remove("actif"));
            document.querySelectorAll(".panneau-onglet").forEach((p) => p.classList.remove("actif"));
            bouton.classList.add("actif");
            document.getElementById(bouton.dataset.onglet).classList.add("actif");
            if (typeof onChangementOnglet === "function") onChangementOnglet(bouton.dataset.onglet);
        });
    });
}

document.addEventListener("DOMContentLoaded", initialiserOnglets);
