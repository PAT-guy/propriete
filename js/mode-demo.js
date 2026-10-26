/**
 * Mode démonstration : simule l'API Supabase utilisée par l'application,
 * avec des données conservées uniquement dans ce navigateur (localStorage).
 *
 * S'active automatiquement tant que js/config.js contient encore les
 * valeurs par défaut (projet Supabase non configuré). Permet de prendre
 * en main l'application avant de créer un vrai projet Supabase.
 *
 * Ce fichier couvre uniquement les opérations utilisées par l'application :
 * from().select/insert/update/delete, avec eq/in/gte/lte/order/limit/single,
 * ainsi qu'un auth minimal (un seul compte de démonstration) et un storage
 * minimal (fichiers encodés en base64 dans localStorage).
 */

const CLE_STOCKAGE_DEMO = "foret_demo_donnees_v1";
const CLE_SESSION_DEMO = "foret_demo_session_v1";
const COMPTE_DEMO = { email: "demo@foret.local", motDePasse: "demo" };

function genererIdentifiant() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function chargerDonneesDemo() {
    const brut = localStorage.getItem(CLE_STOCKAGE_DEMO);
    if (brut) return JSON.parse(brut);

    const especesDepart = ["Chevreuil", "Sanglier", "Cerf", "Daim", "Renard", "Lièvre", "Faisan"]
        .map((nom) => ({ id: genererIdentifiant(), nom }));

    const donnees = {
        proprietaires: [], parcelles: [], essences_parcelle: [],
        chasseurs: [], especes_gibier: especesDepart, plans_chasse: [],
        battues: [], participants_battue: [], prelevements: [],
        prestataires: [], chantiers: [],
        cotisations: [], factures: [], baux_chasse: [], documents: [],
    };
    sauvegarderDonneesDemo(donnees);
    return donnees;
}

function sauvegarderDonneesDemo(donnees) {
    localStorage.setItem(CLE_STOCKAGE_DEMO, JSON.stringify(donnees));
}

class RequeteTableDemo {
    constructor(nomTable) {
        this.nomTable = nomTable;
        this.filtres = [];
        this.triColonne = null;
        this.triDescendant = false;
        this.limiteLignes = null;
        this.veutUnSeul = false;
        this.plage = null;
        this.operation = "select";
        this.payload = null;
    }

    select() { return this; }

    eq(colonne, valeur) { this.filtres.push((l) => l[colonne] === valeur); return this; }
    neq(colonne, valeur) { this.filtres.push((l) => l[colonne] !== valeur); return this; }
    in(colonne, valeurs) { this.filtres.push((l) => valeurs.includes(l[colonne])); return this; }
    gte(colonne, valeur) { this.filtres.push((l) => l[colonne] >= valeur); return this; }
    lte(colonne, valeur) { this.filtres.push((l) => l[colonne] <= valeur); return this; }
    order(colonne, options) {
        this.triColonne = colonne;
        this.triDescendant = options && options.ascending === false;
        return this;
    }
    limit(n) { this.limiteLignes = n; return this; }
    range(de, a) { this.plage = [de, a]; return this; }
    single() { this.veutUnSeul = true; return this; }
    maybeSingle() { this.veutUnSeul = true; return this; }

    insert(objetOuTableau) { this.operation = "insert"; this.payload = objetOuTableau; return this; }
    update(objet) { this.operation = "update"; this.payload = objet; return this; }
    delete() { this.operation = "delete"; return this; }

    _executer() {
        const donnees = chargerDonneesDemo();
        if (!donnees[this.nomTable]) donnees[this.nomTable] = [];
        let lignes = donnees[this.nomTable];

        if (this.operation === "insert") {
            const nouveaux = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((o) => ({
                id: genererIdentifiant(),
                created_at: new Date().toISOString(),
                ...o,
            }));
            donnees[this.nomTable] = lignes.concat(nouveaux);
            sauvegarderDonneesDemo(donnees);
            const resultat = this.veutUnSeul ? nouveaux[0] : nouveaux;
            return { data: resultat, error: null };
        }

        // Applique les filtres pour select / update / delete
        const correspondent = lignes.filter((l) => this.filtres.every((f) => f(l)));

        if (this.operation === "update") {
            const idsAMettreAJour = new Set(correspondent.map((l) => l.id));
            donnees[this.nomTable] = lignes.map((l) =>
                idsAMettreAJour.has(l.id) ? { ...l, ...this.payload } : l
            );
            sauvegarderDonneesDemo(donnees);
            return { data: correspondent.map((l) => ({ ...l, ...this.payload })), error: null };
        }

        if (this.operation === "delete") {
            const idsASupprimer = new Set(correspondent.map((l) => l.id));
            donnees[this.nomTable] = lignes.filter((l) => !idsASupprimer.has(l.id));
            sauvegarderDonneesDemo(donnees);
            return { data: correspondent, error: null };
        }

        // select
        let resultat = [...correspondent];
        if (this.triColonne) {
            resultat.sort((a, b) => {
                const va = a[this.triColonne], vb = b[this.triColonne];
                if (va === vb) return 0;
                const sens = va > vb ? 1 : -1;
                return this.triDescendant ? -sens : sens;
            });
        }
        if (this.plage) resultat = resultat.slice(this.plage[0], this.plage[1] + 1);
        if (this.limiteLignes !== null) resultat = resultat.slice(0, this.limiteLignes);

        if (this.veutUnSeul) return { data: resultat[0] || null, error: null };
        return { data: resultat, error: null };
    }

    then(onResolve, onReject) {
        try {
            const resultat = this._executer();
            return Promise.resolve(resultat).then(onResolve, onReject);
        } catch (erreur) {
            return Promise.resolve({ data: null, error: { message: String(erreur) } }).then(onResolve, onReject);
        }
    }
}

class StorageDemo {
    from() { return this; }
    async upload(chemin, fichier) {
        const lecture = await new Promise((resolve) => {
            const lecteur = new FileReader();
            lecteur.onload = () => resolve(lecteur.result);
            lecteur.readAsDataURL(fichier);
        });
        const cle = "foret_demo_fichier_" + chemin;
        localStorage.setItem(cle, lecture);
        return { data: { path: chemin }, error: null };
    }
    getPublicUrl(chemin) {
        const cle = "foret_demo_fichier_" + chemin;
        return { data: { publicUrl: localStorage.getItem(cle) || "" } };
    }
    remove() { return { data: null, error: null }; }
}

class ClientSupabaseDemo {
    constructor() {
        this.auth = {
            getSession: async () => {
                const brut = localStorage.getItem(CLE_SESSION_DEMO);
                return { data: { session: brut ? JSON.parse(brut) : null } };
            },
            signInWithPassword: async ({ email, password }) => {
                if (email === COMPTE_DEMO.email && password === COMPTE_DEMO.motDePasse) {
                    const session = { user: { email } };
                    localStorage.setItem(CLE_SESSION_DEMO, JSON.stringify(session));
                    return { data: { session }, error: null };
                }
                return {
                    data: { session: null },
                    error: { message: `En mode démonstration, utilise ${COMPTE_DEMO.email} / ${COMPTE_DEMO.motDePasse}` },
                };
            },
            signOut: async () => {
                localStorage.removeItem(CLE_SESSION_DEMO);
                return { error: null };
            },
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        };
        this.storage = new StorageDemo();
    }

    from(nomTable) {
        return new RequeteTableDemo(nomTable);
    }
}

function modeDemonstrationActif() {
    return CONFIG_SUPABASE_URL.includes("VOTRE-PROJET") || CONFIG_SUPABASE_ANON_KEY.includes("VOTRE_CLE");
}
