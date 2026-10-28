/**
 * Échange d'une battue entre deux appareils par un lien (ou un fichier), sans serveur.
 *
 * Le téléphone fabrique un « paquet » (la battue, son plan, ses prélèvements, avec les noms des
 * catégories et des chasseurs concernés), le compresse et le met dans la partie « # » d'une adresse.
 * Le PC ouvre l'adresse, affiche un aperçu, puis fusionne : les prélèvements absents sont ajoutés
 * (jamais de doublon : l'identifiant de chaque prélèvement est conservé), le plan est remplacé
 * seulement sur demande. Les suppressions ne se transmettent pas.
 */

const FORMAT_ECHANGE = "foret-chasse-echange";
const CLE_ECHANGE_EN_ATTENTE = "foret_echange_en_attente";
const LIMITE_LIEN_CONFORTABLE = 6000;   // au-delà, certaines messageries risquent de couper le lien

// ----------------------------------------------------------------------------
// Encodage : JSON, compression si possible, base64 « url »
// ----------------------------------------------------------------------------

function octetsEnBase64Url(octets) {
    let binaire = "";
    for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEnOctets(texte) {
    const b64 = texte.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texte.length + 3) % 4);
    const binaire = atob(b64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return octets;
}

async function fluxEnOctets(flux) {
    return new Uint8Array(await new Response(flux).arrayBuffer());
}

async function encoderPaquet(paquet) {
    const octets = new TextEncoder().encode(JSON.stringify(paquet));
    if (typeof CompressionStream === "function") {
        const compresse = await fluxEnOctets(new Blob([octets]).stream().pipeThrough(new CompressionStream("deflate-raw")));
        return "1." + octetsEnBase64Url(compresse);
    }
    return "0." + octetsEnBase64Url(octets);
}

async function decoderPaquet(code) {
    const texte = String(code || "").trim();
    const m = texte.match(/^([01])\.([A-Za-z0-9_-]+)$/);
    if (!m) throw new Error("ce code n'est pas un code d'échange valide");
    let octets = base64UrlEnOctets(m[2]);
    if (m[1] === "1") {
        if (typeof DecompressionStream !== "function") throw new Error("ce navigateur ne sait pas décompresser le code : utilise un navigateur récent");
        octets = await fluxEnOctets(new Blob([octets]).stream().pipeThrough(new DecompressionStream("deflate-raw")));
    }
    let paquet;
    try { paquet = JSON.parse(new TextDecoder().decode(octets)); } catch (e) { throw new Error("le contenu du code est illisible"); }
    if (!paquet || paquet.application !== FORMAT_ECHANGE || !paquet.battue) throw new Error("ce code n'est pas un échange de battue");
    return paquet;
}

/** Retrouve un code dans un lien complet, un fragment « #c=... » ou un code nu. */
function extraireCode(texte) {
    const brut = String(texte || "").trim();
    const m = brut.match(/[#&?]c=([^&\s]+)/);
    return m ? decodeURIComponent(m[1]) : brut;
}

// ----------------------------------------------------------------------------
// Fabrication du paquet (côté téléphone)
// ----------------------------------------------------------------------------

/**
 * donnees : { battue, traques, postes, chasseurs, prelevements } (voir saisie.js)
 * avecPlan : inclut les traques, les tracés et les postes.
 */
function construirePaquet(donnees, categories, avecPlan) {
    const idsCategories = new Set(donnees.prelevements.map((p) => p.categorie_id).filter(Boolean));
    const idsChasseurs = new Set(donnees.prelevements.map((p) => p.chasseur_id).filter(Boolean));
    if (avecPlan) donnees.postes.forEach((p) => { if (p.chasseur_id) idsChasseurs.add(p.chasseur_id); });
    (donnees.battue.plan_jour || []).forEach((l) => idsCategories.add(l.id));
    if (donnees.battue.responsable_id) idsChasseurs.add(donnees.battue.responsable_id);

    const { created_at: _c, ...battue } = donnees.battue;
    return {
        application: FORMAT_ECHANGE, version: 1, date: new Date().toISOString(), avecPlan: !!avecPlan,
        battue,
        categories: categories.filter((c) => idsCategories.has(c.id)).map((c) => ({ id: c.id, nom: c.nom, sonnerie: c.sonnerie, precisions: c.precisions || [] })),
        chasseurs: donnees.chasseurs.filter((c) => idsChasseurs.has(c.id)).map((c) => ({ id: c.id, nom: c.nom, prenom: c.prenom || null })),
        traques: donnees.traques.map((t) => (avecPlan ? t : { id: t.id, numero: t.numero, nom: t.nom })),
        postes: avecPlan ? donnees.postes : [],
        prelevements: donnees.prelevements,
    };
}

function adresseEchange(code) {
    const base = new URL("echange.html", window.location.href);
    return `${base.origin}${base.pathname}#c=${code}`;
}

// ----------------------------------------------------------------------------
// Aperçu et fusion (côté PC)
// ----------------------------------------------------------------------------

function nomComplet(c) {
    return c.prenom ? `${c.prenom} ${c.nom}` : c.nom;
}

/** Compare le paquet à la base : retourne ce qui serait ajouté, sans rien écrire. */
async function analyserPaquet(paquet) {
    const [battues, prelevements] = await Promise.all([
        clientSupabase.from("battues").select(),
        clientSupabase.from("prelevements").select(),
    ]);
    const toutes = battues.data || [];
    const parId = toutes.find((b) => b.id === paquet.battue.id) || null;
    const candidate = parId ? null : toutes.find((b) => !b.est_modele && b.date_battue === paquet.battue.date_battue && (b.secteur || "") === (paquet.battue.secteur || "")) || null;
    const idsExistants = new Set((prelevements.data || []).map((p) => p.id));
    const nouveaux = paquet.prelevements.filter((p) => !idsExistants.has(p.id));

    let planDifferent = false;
    let cible = parId || candidate;
    if (cible && paquet.avecPlan) {
        const { data: traques } = await clientSupabase.from("traques").select().eq("battue_id", cible.id);
        const { data: postes } = await clientSupabase.from("postes_traque").select();
        const mine = JSON.stringify((traques || []).map((t) => [t.numero, t.nom, t.elements, t.parkings, t.acces]).sort());
        const sien = JSON.stringify(paquet.traques.map((t) => [t.numero, t.nom, t.elements, t.parkings, t.acces]).sort());
        const nbPostes = (postes || []).filter((p) => (traques || []).some((t) => t.id === p.traque_id)).length;
        planDifferent = mine !== sien || nbPostes !== paquet.postes.length;
    }
    return { cibleParId: parId, candidate, nouveaux, dejaPresents: paquet.prelevements.length - nouveaux.length, planDifferent, battueAbsente: !parId && !candidate };
}

/** Table de correspondance : identifiant du paquet -> identifiant local (créé si absent). */
async function correspondances(paquet) {
    const [{ data: cats }, { data: chas }] = await Promise.all([
        clientSupabase.from("categories_chasse").select(), clientSupabase.from("chasseurs").select(),
    ]);
    const categories = cats || [];
    const chasseurs = chas || [];
    const parCategorie = {};
    for (const c of paquet.categories) {
        let local = categories.find((x) => x.id === c.id) || categories.find((x) => x.nom.toLowerCase() === c.nom.toLowerCase());
        if (!local) {
            const ordre = categories.reduce((m, x) => Math.max(m, x.ordre || 0), 0) + 1;
            const { data } = await clientSupabase.from("categories_chasse").insert({ nom: c.nom, sonnerie: c.sonnerie || null, precisions: c.precisions || [], ordre }).select().single();
            local = data; if (local) categories.push(local);
        }
        parCategorie[c.id] = local ? local.id : null;
    }
    const parChasseur = {};
    for (const c of paquet.chasseurs) {
        let local = chasseurs.find((x) => x.id === c.id) ||
            chasseurs.find((x) => x.nom.toLowerCase() === c.nom.toLowerCase() && (x.prenom || "").toLowerCase() === (c.prenom || "").toLowerCase());
        if (!local) {
            const { data } = await clientSupabase.from("chasseurs").insert({ nom: c.nom, prenom: c.prenom, actif: true }).select().single();
            local = data; if (local) chasseurs.push(local);
        }
        parChasseur[c.id] = local ? local.id : null;
    }
    return { parCategorie, parChasseur };
}

/**
 * Fusionne le paquet. options : { cibleId (battue existante ou null pour créer), remplacerPlan }.
 * Retourne { battueId, ajoutes, dejaPresents, creeBattue, planRemplace }.
 */
async function importerPaquet(paquet, options) {
    const { parCategorie, parChasseur } = await correspondances(paquet);
    let battueId = options.cibleId || null;
    let creeBattue = false;
    if (!battueId) {
        const { created_at: _c, ...b } = paquet.battue;
        const { data, error } = await clientSupabase.from("battues").insert({ ...b, responsable_id: parChasseur[b.responsable_id] || null, parcelle_id: await parcelleExistante(b.parcelle_id),
            plan_jour: (b.plan_jour || []).map((l) => ({ ...l, id: parCategorie[l.id] || l.id })) }).select().single();
        if (error || !data) throw new Error((error && error.message) || "création de la battue impossible");
        battueId = data.id;
        creeBattue = true;
    }

    // Plan : seulement s'il est dans le paquet ET (battue créée ou remplacement demandé)
    let planRemplace = false;
    const correspondanceTraque = {};
    const { data: traquesCible } = await clientSupabase.from("traques").select().eq("battue_id", battueId);
    if (paquet.avecPlan && (creeBattue || options.remplacerPlan)) {
        const gardees = new Set();
        for (const t of paquet.traques) {
            const { id: idPaquet, created_at: _c, ...champs } = t;
            champs.battue_id = battueId;
            champs.parcelle_id = await parcelleExistante(champs.parcelle_id);
            const existante = (traquesCible || []).find((x) => x.id === idPaquet) || (traquesCible || []).find((x) => x.numero === t.numero);
            let idLocal;
            if (existante) {
                await clientSupabase.from("traques").update(champs).eq("id", existante.id);
                idLocal = existante.id;
            } else {
                const { data } = await clientSupabase.from("traques").insert({ id: idPaquet, ...champs }).select().single();
                idLocal = data.id;
            }
            gardees.add(idLocal);
            correspondanceTraque[idPaquet] = idLocal;
            await clientSupabase.from("postes_traque").delete().eq("traque_id", idLocal);
            const postes = paquet.postes.filter((p) => p.traque_id === idPaquet).map(({ id: _i, created_at: _c2, ...p }) => ({ ...p, traque_id: idLocal, chasseur_id: parChasseur[p.chasseur_id] || null }));
            if (postes.length) await clientSupabase.from("postes_traque").insert(postes);
        }
        for (const t of traquesCible || []) {
            if (gardees.has(t.id)) continue;
            await clientSupabase.from("postes_traque").delete().eq("traque_id", t.id);
            await clientSupabase.from("prelevements").update({ traque_id: null }).eq("traque_id", t.id);
            await clientSupabase.from("traques").delete().eq("id", t.id);
        }
        planRemplace = true;
    } else {
        for (const t of paquet.traques) {
            const locale = (traquesCible || []).find((x) => x.id === t.id) || (traquesCible || []).find((x) => x.numero === t.numero);
            if (locale) correspondanceTraque[t.id] = locale.id;
        }
    }

    // Prélèvements : seulement ceux dont l'identifiant est inconnu
    const { data: existants } = await clientSupabase.from("prelevements").select();
    const idsExistants = new Set((existants || []).map((p) => p.id));
    const aAjouter = paquet.prelevements.filter((p) => !idsExistants.has(p.id)).map((p) => ({
        ...p, battue_id: battueId,
        categorie_id: p.categorie_id ? (parCategorie[p.categorie_id] || null) : null,
        chasseur_id: p.chasseur_id ? (parChasseur[p.chasseur_id] || null) : null,
        traque_id: p.traque_id ? (correspondanceTraque[p.traque_id] || null) : null,
    }));
    for (let i = 0; i < aAjouter.length; i += 100) {
        const { error } = await clientSupabase.from("prelevements").insert(aAjouter.slice(i, i + 100));
        if (error) throw new Error(error.message);
    }
    return { battueId, ajoutes: aAjouter.length, dejaPresents: paquet.prelevements.length - aAjouter.length, creeBattue, planRemplace };
}

async function parcelleExistante(id) {
    if (!id) return null;
    const { data } = await clientSupabase.from("parcelles").select().eq("id", id);
    return data && data.length ? id : null;
}
