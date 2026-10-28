/**
 * Page « Recevoir une battue » : lit un lien, un code ou un fichier, montre ce qui serait ajouté,
 * puis fusionne après confirmation. Le lien arrive dans la partie « # » de l'adresse ; s'il faut
 * d'abord se connecter, il est gardé sur l'appareil le temps de la connexion.
 */

let paquetCourant = null;
let analyseCourante = null;

(async () => {
    // Garder le code avant une éventuelle redirection vers la connexion.
    const dansAdresse = extraireCode(window.location.hash);
    if (/^[01]\./.test(dansAdresse)) {
        try { localStorage.setItem(CLE_ECHANGE_EN_ATTENTE, dansAdresse); } catch (e) { /* stockage indisponible */ }
    }
    const estConnecte = await protegerPage();
    if (!estConnecte) return;
    injecterNavigation("pages/battues.html");
    afficherBandeauDemoSiBesoin();

    document.getElementById("bouton-analyser").addEventListener("click", () => analyser(document.getElementById("champ-code").value));
    document.getElementById("champ-fichier").addEventListener("change", lireFichier);
    document.getElementById("bouton-importer").addEventListener("click", importer);
    document.getElementById("bouton-annuler-import").addEventListener("click", annuler);

    // Un second lien ouvert dans le même onglet ne recharge pas la page : seule la partie « # » change.
    window.addEventListener("hashchange", async () => {
        const code = extraireCode(window.location.hash);
        if (!/^[01]\./.test(code)) return;
        try { localStorage.setItem(CLE_ECHANGE_EN_ATTENTE, code); } catch (e) { /* stockage indisponible */ }
        document.getElementById("champ-code").value = code;
        await analyser(code);
    });

    let enAttente = null;
    try { enAttente = localStorage.getItem(CLE_ECHANGE_EN_ATTENTE); } catch (e) { /* aucun */ }
    if (enAttente) {
        document.getElementById("champ-code").value = enAttente;
        await analyser(enAttente);
    }
})();

function oublierCodeEnAttente() {
    try { localStorage.removeItem(CLE_ECHANGE_EN_ATTENTE); } catch (e) { /* aucun */ }
}

function alerteEchange(texte) {
    document.getElementById("message-echange").innerHTML = texte ? `<div class="message-alerte" style="margin-top:12px;">${echapper(texte)}</div>` : "";
}

function lireFichier(evenement) {
    const fichier = evenement.target.files[0];
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.onload = async () => {
        const contenu = String(lecteur.result).trim();
        // Un fichier d'échange est soit le paquet en JSON, soit le code.
        if (contenu.startsWith("{")) {
            try {
                const paquet = JSON.parse(contenu);
                document.getElementById("champ-code").value = await encoderPaquet(paquet);
                await analyser(document.getElementById("champ-code").value);
            } catch (e) { alerteEchange("Fichier illisible : " + e.message); }
        } else {
            document.getElementById("champ-code").value = contenu;
            await analyser(contenu);
        }
    };
    lecteur.readAsText(fichier);
}

async function analyser(texte) {
    alerteEchange("");
    document.getElementById("resultat-echange").innerHTML = "";
    document.getElementById("bloc-apercu").style.display = "none";
    const code = extraireCode(texte);
    if (!code) { alerteEchange("Colle d'abord un lien ou un code."); return; }
    try {
        paquetCourant = await decoderPaquet(code);
        analyseCourante = await analyserPaquet(paquetCourant);
    } catch (erreur) {
        paquetCourant = null;
        alerteEchange("Impossible de lire cet échange : " + erreur.message + ".");
        return;
    }
    afficherApercu();
}

function formaterDate(dateISO) {
    if (!dateISO) return "";
    const [a, m, j] = dateISO.split("-").map(Number);
    return new Date(a, m - 1, j).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function afficherApercu() {
    const p = paquetCourant;
    const a = analyseCourante;
    const b = p.battue;
    document.getElementById("titre-apercu").textContent = `Battue du ${formaterDate(b.date_battue)}${b.secteur ? " · " + b.secteur : ""}`;
    const noms = (id) => (p.categories.find((c) => c.id === id) || {}).nom || "?";
    const parCategorie = {};
    a.nouveaux.forEach((x) => { const n = noms(x.categorie_id); parCategorie[n] = (parCategorie[n] || 0) + 1; });
    const liste = Object.entries(parCategorie).map(([n, k]) => `${k} ${echapper(n)}`).join(", ");
    document.getElementById("detail-apercu").innerHTML = `
        <div>Envoyé le ${echapper(new Date(p.date).toLocaleString("fr-FR"))}.</div>
        <div><strong>${p.prelevements.length}</strong> prélèvement(s) dans ce lien :
            <strong>${a.nouveaux.length} nouveau(x)</strong>${liste ? " (" + liste + ")" : ""}, ${a.dejaPresents} déjà présent(s) sur cet appareil.</div>
        <div>Plan de la battue dans le lien : ${p.avecPlan ? `oui (${p.traques.length} traque(s), ${p.postes.length} poste(s))` : "non"}.</div>`;

    const cible = document.getElementById("options-cible");
    if (a.cibleParId) {
        cible.innerHTML = '<div>Cette battue existe sur cet appareil : les prélèvements y seront ajoutés.</div>';
    } else if (a.candidate) {
        cible.innerHTML = `<label style="display:block; font-weight:400;"><input type="radio" name="cible" value="candidate" checked> Ajouter à la battue déjà présente du ${echapper(formaterDate(a.candidate.date_battue))}${a.candidate.secteur ? " · " + echapper(a.candidate.secteur) : ""} (même date et même secteur)</label>
            <label style="display:block; font-weight:400;"><input type="radio" name="cible" value="nouvelle"> La créer comme une nouvelle battue</label>`;
    } else {
        cible.innerHTML = "<div>Cette battue n'existe pas sur cet appareil : elle sera créée, avec son plan si le lien en contient un.</div>";
    }

    const optionPlan = document.getElementById("option-plan");
    const peutRemplacer = p.avecPlan && !a.battueAbsente;
    optionPlan.style.display = peutRemplacer ? "" : "none";
    if (peutRemplacer) {
        optionPlan.innerHTML = `<label style="font-weight:400;"><input type="checkbox" id="case-plan" ${a.planDifferent ? "checked" : ""}> Remplacer le plan de la battue (traques, tracés, postes) par celui du lien</label>
            <div style="font-size:12px; color:#6b6b60;">${a.planDifferent ? "Le plan du lien est différent de celui de cet appareil." : "Le plan du lien est identique à celui de cet appareil."} Le plan actuel serait écrasé.</div>`;
    }
    document.getElementById("bloc-apercu").style.display = "block";
}

async function importer() {
    if (!paquetCourant) return;
    const bouton = document.getElementById("bouton-importer");
    bouton.disabled = true;
    try {
        const choix = document.querySelector('input[name="cible"]:checked');
        let cibleId = analyseCourante.cibleParId ? analyseCourante.cibleParId.id : null;
        if (!cibleId && analyseCourante.candidate && (!choix || choix.value === "candidate")) cibleId = analyseCourante.candidate.id;
        const casePlan = document.getElementById("case-plan");
        const resultat = await importerPaquet(paquetCourant, { cibleId, remplacerPlan: !!(casePlan && casePlan.checked) });
        oublierCodeEnAttente();
        document.getElementById("bloc-apercu").style.display = "none";
        document.getElementById("resultat-echange").innerHTML = `
            <div class="carte" style="margin-top:14px; background:#e8f0e2;">
                <strong>Échange terminé.</strong>
                <div>${resultat.ajoutes} prélèvement(s) ajouté(s), ${resultat.dejaPresents} déjà présent(s).
                ${resultat.creeBattue ? "La battue a été créée." : ""} ${resultat.planRemplace ? "Le plan a été remplacé." : ""}</div>
                <div style="margin-top:8px;">
                    <a class="bouton bouton-principal" href="saisie.html?id=${resultat.battueId}">Voir la saisie</a>
                    <a class="bouton bouton-secondaire" href="plan-battue.html?id=${resultat.battueId}">Plan de la battue</a>
                    <a class="bouton bouton-secondaire" href="battues.html">Retour aux battues</a>
                </div>
            </div>`;
        history.replaceState(null, "", window.location.pathname);
    } catch (erreur) {
        alerteEchange("L'import a échoué : " + erreur.message);
    } finally {
        bouton.disabled = false;
    }
}

function annuler() {
    oublierCodeEnAttente();
    paquetCourant = null;
    document.getElementById("bloc-apercu").style.display = "none";
    document.getElementById("champ-code").value = "";
    history.replaceState(null, "", window.location.pathname);
}
