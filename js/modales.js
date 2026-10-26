/** Ouverture/fermeture générique des fenêtres modales (.fond-modale). */

function ouvrirModale(id) {
    document.getElementById(id).classList.add("ouverte");
}

function fermerModale(id) {
    document.getElementById(id).classList.remove("ouverte");
}

// Ferme la modale si on clique en dehors de la boîte.
document.addEventListener("click", (evenement) => {
    if (evenement.target.classList.contains("fond-modale")) {
        evenement.target.classList.remove("ouverte");
    }
});
