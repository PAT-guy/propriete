/**
 * Service worker : permet d'ouvrir le site et de consulter les données déjà
 * chargées sans réseau (en forêt, par exemple).
 *
 * - Fichiers du site et bibliothèques (Leaflet, Supabase) : réponse du cache
 *   puis mise à jour en arrière-plan.
 * - Tuiles de carte IGN : cache d'abord. Elles y arrivent quand on les a
 *   affichées, ou via le bouton « Télécharger la zone hors ligne ».
 * - Lectures Supabase (GET /rest/v1/) : réseau d'abord, dernière réponse
 *   connue en secours. Les écritures ne passent jamais par le cache.
 *
 * Incrémenter VERSION_SITE à chaque déploiement qui doit forcer un rafraîchissement.
 */

const VERSION_SITE = "v1";
const CACHE_SITE = `foret-site-${VERSION_SITE}`;
const CACHE_TUILES = "foret-tuiles-v1";
const CACHE_DONNEES = "foret-donnees-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evenement) => {
    evenement.waitUntil((async () => {
        const noms = await caches.keys();
        await Promise.all(noms
            .filter((n) => n.startsWith("foret-site-") && n !== CACHE_SITE)
            .map((n) => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (evenement) => {
    const requete = evenement.request;
    if (requete.method !== "GET") return;
    const url = new URL(requete.url);

    if (url.hostname === "data.geopf.fr") {
        evenement.respondWith(tuileCacheDAbord(requete));
    } else if (url.hostname.endsWith(".supabase.co")) {
        if (url.pathname.startsWith("/rest/v1/")) evenement.respondWith(donneesReseauDAbord(requete));
    } else if (url.hostname === "unpkg.com") {
        evenement.respondWith(cacheDAbord(requete));
    } else if (url.origin === self.location.origin) {
        evenement.respondWith(siteRevalidation(requete));
    }
});

async function cacheDAbord(requete) {
    const cache = await caches.open(CACHE_SITE);
    const enCache = await cache.match(requete);
    if (enCache) return enCache;
    const reponse = await fetch(requete);
    if (reponse.ok) cache.put(requete, reponse.clone());
    return reponse;
}

async function siteRevalidation(requete) {
    const cache = await caches.open(CACHE_SITE);
    const enCache = await cache.match(requete, { ignoreSearch: true });
    const miseAJour = fetch(requete).then((reponse) => {
        if (reponse.ok) cache.put(requete, reponse.clone());
        return reponse;
    }).catch(() => null);
    if (enCache) return enCache;
    const reponse = await miseAJour;
    return reponse || new Response("Hors ligne : cette page n'a pas encore été ouverte avec du réseau.", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
}

async function tuileCacheDAbord(requete) {
    const cache = await caches.open(CACHE_TUILES);
    const enCache = await cache.match(requete.url, { ignoreVary: true });
    if (enCache) return enCache;
    try {
        const reponse = await fetch(requete.url, { mode: "cors" });
        if (reponse.ok) cache.put(requete.url, reponse.clone());
        return reponse;
    } catch (erreur) {
        return fetch(requete);
    }
}

async function donneesReseauDAbord(requete) {
    const cache = await caches.open(CACHE_DONNEES);
    try {
        const reponse = await fetch(requete);
        if (reponse.ok) cache.put(requete.url, reponse.clone());
        return reponse;
    } catch (erreur) {
        const enCache = await cache.match(requete.url);
        if (enCache) return enCache;
        throw erreur;
    }
}
