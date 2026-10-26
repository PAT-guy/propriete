-- ============================================================================
-- Schéma de la base "Gestion de propriété forestière" pour Supabase.
-- À coller dans l'éditeur SQL de ton projet Supabase (onglet "SQL Editor"),
-- puis "Run". Ce script est rejouable sans danger (IF NOT EXISTS partout).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Cadastre
-- ----------------------------------------------------------------------------

create table if not exists proprietaires (
    id uuid primary key default gen_random_uuid(),
    nom text not null,
    prenom text,
    adresse text,
    telephone text,
    email text,
    notes text,
    created_at timestamptz default now()
);

create table if not exists parcelles (
    id uuid primary key default gen_random_uuid(),
    nom text not null,
    reference_cadastrale text,
    commune text,
    lieu_dit text,
    surface_ha numeric,
    type_peuplement text,
    date_acquisition date,
    proprietaire_id uuid references proprietaires(id) on delete set null,
    contour jsonb,              -- polygone [[lat, lng], ...] tracé à la main sur la carte
    centre jsonb,                -- {"lat":..., "lng":...} pour centrer la carte rapidement
    notes text,
    created_at timestamptz default now()
);

create table if not exists essences_parcelle (
    id uuid primary key default gen_random_uuid(),
    parcelle_id uuid not null references parcelles(id) on delete cascade,
    essence text not null,
    surface_ha numeric,
    age_moyen int,
    notes text
);

-- ----------------------------------------------------------------------------
-- Chasse
-- ----------------------------------------------------------------------------

create table if not exists chasseurs (
    id uuid primary key default gen_random_uuid(),
    nom text not null,
    prenom text,
    telephone text,
    email text,
    numero_permis text,
    date_adhesion date,
    actif boolean default true,
    notes text,
    created_at timestamptz default now()
);

create table if not exists especes_gibier (
    id uuid primary key default gen_random_uuid(),
    nom text not null unique
);

create table if not exists plans_chasse (
    id uuid primary key default gen_random_uuid(),
    saison text not null,
    espece_id uuid not null references especes_gibier(id),
    attribution int default 0,
    notes text
);

create table if not exists battues (
    id uuid primary key default gen_random_uuid(),
    date_battue date not null,
    secteur text,
    parcelle_id uuid references parcelles(id) on delete set null,
    responsable_id uuid references chasseurs(id) on delete set null,
    lieu_rdv text,
    heure_rdv text,
    contour jsonb,               -- zone battue tracée sur la carte
    parkings jsonb,               -- [{"nom":"Parking entrée nord","lat":...,"lng":...}, ...]
    postes jsonb,                 -- [{"nom":"Poste 1","lat":...,"lng":...}, ...]
    regles_securite text,
    instructions text,
    notes text,
    created_at timestamptz default now()
);

create table if not exists participants_battue (
    id uuid primary key default gen_random_uuid(),
    battue_id uuid not null references battues(id) on delete cascade,
    chasseur_id uuid not null references chasseurs(id) on delete cascade,
    poste text
);

create table if not exists prelevements (
    id uuid primary key default gen_random_uuid(),
    date_prelevement date not null,
    saison text not null,
    espece_id uuid not null references especes_gibier(id),
    chasseur_id uuid references chasseurs(id) on delete set null,
    battue_id uuid references battues(id) on delete set null,
    sexe text,
    poids_kg numeric,
    commentaire text
);

-- ----------------------------------------------------------------------------
-- Plans de battue détaillés : plusieurs traques par journée de battue,
-- chacune avec son propre tracé (mouvement, ligne des rabatteurs, parkings,
-- accès) et ses postes affectés à un chasseur.
-- ----------------------------------------------------------------------------

create table if not exists postes_chasse (
    -- Bibliothèque de postes réutilisables d'une traque à l'autre.
    id uuid primary key default gen_random_uuid(),
    nom text not null,
    lat double precision not null,
    lng double precision not null,
    notes text,
    created_at timestamptz default now()
);

create table if not exists traques (
    id uuid primary key default gen_random_uuid(),
    battue_id uuid not null references battues(id) on delete cascade,
    numero int not null default 1,
    nom text,
    parcelle_id uuid references parcelles(id) on delete set null,
    mouvement jsonb,              -- [[lat,lng], ...] ligne du mouvement de la traque
    ligne_rabatteurs jsonb,        -- [[lat,lng], ...] ligne de départ des rabatteurs
    parkings jsonb,                 -- [{"nom":...,"lat":...,"lng":...}, ...]
    acces jsonb,                     -- [{"nom":...,"lat":...,"lng":...}, ...]
    notes text,
    created_at timestamptz default now()
);

create table if not exists postes_traque (
    -- Un poste placé sur la carte pour une traque précise, éventuellement
    -- rattaché à un poste de la bibliothèque, et affecté à un chasseur.
    id uuid primary key default gen_random_uuid(),
    traque_id uuid not null references traques(id) on delete cascade,
    poste_id uuid references postes_chasse(id) on delete set null,
    nom text not null,
    lat double precision not null,
    lng double precision not null,
    chasseur_id uuid references chasseurs(id) on delete set null,
    created_at timestamptz default now()
);

alter table prelevements add column if not exists traque_id uuid references traques(id) on delete set null;

-- ----------------------------------------------------------------------------
-- Travaux forestiers
-- ----------------------------------------------------------------------------

create table if not exists prestataires (
    id uuid primary key default gen_random_uuid(),
    nom text not null,
    specialite text,
    contact text,
    telephone text,
    email text,
    notes text
);

create table if not exists chantiers (
    id uuid primary key default gen_random_uuid(),
    titre text not null,
    type_travaux text not null,
    statut text default 'Planifié',
    parcelle_id uuid references parcelles(id) on delete set null,
    prestataire_id uuid references prestataires(id) on delete set null,
    date_debut date,
    date_fin_prevue date,
    date_fin_reelle date,
    cout_estime numeric,
    cout_reel numeric,
    description text,
    contour jsonb,                -- zone de chantier tracée sur la carte
    points_interet jsonb,         -- [{"nom":"Accès engins","lat":...,"lng":...}, ...]
    created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Finances et documents
-- ----------------------------------------------------------------------------

create table if not exists cotisations (
    id uuid primary key default gen_random_uuid(),
    chasseur_id uuid not null references chasseurs(id) on delete cascade,
    saison text not null,
    montant numeric not null,
    date_paiement date,
    statut text default 'En attente',
    notes text
);

create table if not exists factures (
    id uuid primary key default gen_random_uuid(),
    numero text,
    description text,
    montant numeric not null,
    date_emission date,
    date_echeance date,
    statut text default 'En attente',
    chantier_id uuid references chantiers(id) on delete set null,
    prestataire_id uuid references prestataires(id) on delete set null
);

create table if not exists baux_chasse (
    id uuid primary key default gen_random_uuid(),
    locataire text not null,
    perimetre text,
    date_debut date,
    date_fin date,
    montant_annuel numeric,
    notes text
);

create table if not exists documents (
    id uuid primary key default gen_random_uuid(),
    titre text not null,
    type_document text default 'Autre',
    chemin_fichier text not null,     -- chemin dans le bucket Supabase Storage "documents"
    date_ajout date default current_date,
    parcelle_id uuid references parcelles(id) on delete set null,
    chantier_id uuid references chantiers(id) on delete set null,
    chasseur_id uuid references chasseurs(id) on delete set null
);

-- ----------------------------------------------------------------------------
-- Sécurité (RLS) : accès réservé à l'unique compte partagé.
-- Toute personne connectée avec ce compte peut tout lire et tout écrire ;
-- personne d'autre (anonyme, sans connexion) ne peut rien faire.
-- ----------------------------------------------------------------------------

do $$
declare
    table_name text;
begin
    for table_name in
        select unnest(array[
            'proprietaires', 'parcelles', 'essences_parcelle',
            'chasseurs', 'especes_gibier', 'plans_chasse', 'battues',
            'participants_battue', 'prelevements',
            'postes_chasse', 'traques', 'postes_traque',
            'prestataires', 'chantiers',
            'cotisations', 'factures', 'baux_chasse', 'documents'
        ])
    loop
        execute format('alter table %I enable row level security;', table_name);
        execute format('drop policy if exists acces_authentifie on %I;', table_name);
        execute format(
            'create policy acces_authentifie on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
            table_name
        );
    end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Données de référence (espèces de gibier courantes)
-- ----------------------------------------------------------------------------

insert into especes_gibier (nom)
select nom from (values ('Chevreuil'), ('Sanglier'), ('Cerf'), ('Daim'), ('Renard'), ('Lièvre'), ('Faisan')) as v(nom)
where not exists (select 1 from especes_gibier where especes_gibier.nom = v.nom);

-- ----------------------------------------------------------------------------
-- Stockage des documents : bucket privé "documents"
-- (le bucket lui-même se crée depuis l'onglet Storage de Supabase, voir README)
-- ----------------------------------------------------------------------------
