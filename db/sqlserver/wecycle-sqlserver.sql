/*═══════════════════════════════════════════════════════════════════════════════
  WECYCLE — MICROSOFT SQL SERVER SCHEMA
  One script. Run it on an empty server and you have the whole database.

  Converted from the live PostgreSQL 17 database (Supabase project
  oxqnwqaumrqdiwrlvfel) as it stood on 2026-09-18. The Postgres original is
  supabase/migrations/ — 52 files, still the history of how the schema got
  here. This is the SQL Server equivalent, not a replacement for that.

  ── WHAT THIS CREATES ───────────────────────────────────────────────────────

    auth.*   identity — users, sessions, one-time codes. Replaces Supabase
             GoTrue, which does not exist outside Supabase.
    app.*    everything else — 34 tables, 3 views, the triggers that keep
             counters and notifications true, and the stored procedures that
             replace the Postgres RPCs the app calls.

  ── HOW TO RUN ──────────────────────────────────────────────────────────────

    sqlcmd -S <server> -U sa -P '<password>' -i wecycle-sqlserver.sql

  Or open it in Azure Data Studio / SSMS and Execute. It is split into batches
  with GO, so it needs a tool that understands GO — a plain driver (mssql,
  JDBC) will not. tools/run.mjs runs it without sqlcmd if that is easier.

  The script is IDEMPOTENT: running it twice is safe and changes nothing the
  second time. It never drops a table and never touches data you have loaded.

  Requires SQL Server 2017 or newer (CREATE OR ALTER, STRING_AGG, TRIM).
  Azure SQL Database works too — see the note at SECTION 0.

  ── DATA ────────────────────────────────────────────────────────────────────

  This file carries only reference data: the categories, the communities, the
  moderation word list. It deliberately carries NO member data. The 99 real
  accounts, their listings and the SIGCHI roster are exported separately by
  tools/export-data.mjs into a file that is NOT in this repository, because
  this repository is public and that data is 99 students' names, email
  addresses and password hashes. See db/README.md.

  ── WHAT CHANGED IN TRANSLATION, AND WHY ────────────────────────────────────

  The decisions that are not one-to-one are written down where they happen,
  in the section they affect. The four that change how you WRITE code against
  this database, all in one place so nobody meets them by surprise:

    1. DELETE does not cascade. Postgres cleaned up children automatically;
       here every foreign key is NO ACTION and you call app.usp_delete_user,
       app.usp_delete_listing and friends (SECTION 8). SQL Server rejects the
       cascade graph this schema has — see the note above SECTION 3.

    2. auth.uid() is now app.current_user_id(), which reads SESSION_CONTEXT.
       The connection must set it on every checkout. Nothing else works:
       every ownership check and every RPC reads it. See SECTION 5.

    3. Row Level Security is not enforced by the database by default. The
       policies are reproduced as predicate functions in SECTION 9 and can be
       switched on, but the server-side data layer is what enforces access.
       Postgres could be exposed to browsers; SQL Server cannot be, so there
       is always a server in front of it.

    4. Postgres arrays (photo_urls, tags, badges, video_urls) are JSON arrays
       in nvarchar(max), validated by ISJSON. Read them with OPENJSON.
═══════════════════════════════════════════════════════════════════════════════*/

SET NOCOUNT ON;
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 0 — DATABASE, SCHEMAS, SETTINGS
═══════════════════════════════════════════════════════════════════════════════*/

/* On Azure SQL Database you cannot CREATE DATABASE from inside a script and
   there is no USE. Create the database in the portal, connect to it, and
   delete this batch before running. Everything after it is portable. */
IF DB_ID(N'Wecycle') IS NULL
BEGIN
    DECLARE @create nvarchar(200) = N'CREATE DATABASE [Wecycle]';
    EXEC sys.sp_executesql @create;
END;
GO

USE [Wecycle];
GO

/* READ_COMMITTED_SNAPSHOT is not a preference, it is what makes this database
   behave like the Postgres one it came from. Postgres readers never block on
   writers; SQL Server readers do, under the default locking model. A feed
   query would sit behind whoever is editing a listing. With RCSI, readers see
   the last committed row and carry on, which is the behaviour every query in
   this application was written against. */
IF EXISTS (SELECT 1 FROM sys.databases WHERE name = N'Wecycle' AND is_read_committed_snapshot_on = 0)
BEGIN
    ALTER DATABASE [Wecycle] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
END;
GO

IF SCHEMA_ID(N'app')  IS NULL EXEC(N'CREATE SCHEMA [app]');
GO
IF SCHEMA_ID(N'auth') IS NULL EXEC(N'CREATE SCHEMA [auth]');
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 1 — AUTH

  Supabase authentication is GoTrue, a Go service with its own schema. It does
  not come with the database, so this is the part that has to be rebuilt rather
  than translated. What is kept is the part that matters: the password hashes.

  Supabase stores bcrypt ($2a$10$...) in auth.users.encrypted_password. bcrypt
  is bcrypt — Node's bcryptjs verifies those hashes unchanged. So every one of
  the 99 existing members keeps the password they already have, and nobody is
  asked to reset anything because the database moved. That is the single most
  important thing about this section, and the reason encrypted_password is
  carried across verbatim rather than regenerated.

  What GoTrue did that now has to be done by the server in front of this:

    • hashing a new password (bcrypt, cost 10 — match the existing hashes)
    • issuing and checking session tokens (auth.sessions below)
    • sending the one-time codes (auth.one_time_codes below)
    • refusing a non-Manipal signup (auth.tf_users_email_gate below)

  ── TOKENS ARE STORED AS HASHES ─────────────────────────────────────────────

  auth.sessions holds SHA-256 of the token, never the token. A session table
  in plaintext is a table of live passwords: anyone who can read one row can
  be that member until it expires. The server hashes the bearer token it was
  given and looks up the hash. Same for the one-time codes.
═══════════════════════════════════════════════════════════════════════════════*/

IF OBJECT_ID(N'auth.users', N'U') IS NULL
CREATE TABLE auth.users
(
    id                  uniqueidentifier NOT NULL CONSTRAINT df_users_id DEFAULT NEWID(),

    /* Citext in Postgres. SQL Server's default collation is already
       case-insensitive, so 'A@B.com' and 'a@b.com' collide here the same way
       they did there — which is what the unique index has to mean. */
    email               nvarchar(320)    NULL,
    encrypted_password  nvarchar(200)    NULL,   /* bcrypt, 60 chars; room to spare */

    email_confirmed_at  datetime2(3)     NULL,
    phone               nvarchar(32)     NULL,
    phone_confirmed_at  datetime2(3)     NULL,

    /* raw_user_meta_data in Supabase: what the signup form sent — full_name,
       college, course, graduating_year. app.tf_profiles_from_user reads it
       exactly as the Postgres trigger did. */
    raw_user_meta_data  nvarchar(max)    NOT NULL CONSTRAINT df_users_meta DEFAULT N'{}',

    last_sign_in_at     datetime2(3)     NULL,
    banned_until        datetime2(3)     NULL,
    deleted_at          datetime2(3)     NULL,
    created_at          datetime2(3)     NOT NULL CONSTRAINT df_users_created DEFAULT SYSUTCDATETIME(),
    updated_at          datetime2(3)     NOT NULL CONSTRAINT df_users_updated DEFAULT SYSUTCDATETIME(),

    CONSTRAINT pk_users       PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ck_users_meta  CHECK (ISJSON(raw_user_meta_data) = 1)
);
GO

/* Filtered, so the soft-deleted and the null-email rows do not collide.
   Postgres allowed many NULLs in a unique column; SQL Server does not, hence
   the filter rather than a plain UNIQUE constraint. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_users_email' AND object_id = OBJECT_ID(N'auth.users'))
CREATE UNIQUE INDEX ux_users_email ON auth.users (email) WHERE email IS NOT NULL AND deleted_at IS NULL;
GO

IF OBJECT_ID(N'auth.sessions', N'U') IS NULL
CREATE TABLE auth.sessions
(
    id            uniqueidentifier NOT NULL CONSTRAINT df_sessions_id DEFAULT NEWID(),
    user_id       uniqueidentifier NOT NULL,

    /* SHA-256 of the bearer token, hex. Never the token. */
    token_hash    char(64)         NOT NULL,

    issued_at     datetime2(3)     NOT NULL CONSTRAINT df_sessions_issued DEFAULT SYSUTCDATETIME(),
    expires_at    datetime2(3)     NOT NULL,
    last_seen_at  datetime2(3)     NOT NULL CONSTRAINT df_sessions_seen DEFAULT SYSUTCDATETIME(),
    revoked_at    datetime2(3)     NULL,
    user_agent    nvarchar(400)    NULL,
    ip            nvarchar(64)     NULL,

    CONSTRAINT pk_sessions     PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ux_sessions_tok UNIQUE (token_hash),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES auth.users (id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_sessions_user' AND object_id = OBJECT_ID(N'auth.sessions'))
CREATE INDEX ix_sessions_user ON auth.sessions (user_id, expires_at DESC);
GO

/* Signup confirmation, password reset, email change. One table rather than the
   eight token columns Supabase carried on auth.users, because they were eight
   columns doing one job and every one of them was a NULL trap. */
IF OBJECT_ID(N'auth.one_time_codes', N'U') IS NULL
CREATE TABLE auth.one_time_codes
(
    id          uniqueidentifier NOT NULL CONSTRAINT df_otc_id DEFAULT NEWID(),
    user_id     uniqueidentifier NULL,          /* null for a signup not yet made */
    email       nvarchar(320)    NOT NULL,
    purpose     nvarchar(20)     NOT NULL,
    code_hash   char(64)         NOT NULL,      /* SHA-256 of the 6 digits */
    expires_at  datetime2(3)     NOT NULL,
    consumed_at datetime2(3)     NULL,
    attempts    int              NOT NULL CONSTRAINT df_otc_attempts DEFAULT 0,
    created_at  datetime2(3)     NOT NULL CONSTRAINT df_otc_created DEFAULT SYSUTCDATETIME(),

    CONSTRAINT pk_otc         PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ck_otc_purpose CHECK (purpose IN (N'signup', N'recovery', N'email_change', N'magic_link')),
    CONSTRAINT fk_otc_user    FOREIGN KEY (user_id) REFERENCES auth.users (id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_otc_lookup' AND object_id = OBJECT_ID(N'auth.one_time_codes'))
CREATE INDEX ix_otc_lookup ON auth.one_time_codes (email, purpose, expires_at DESC) WHERE consumed_at IS NULL;
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 2 — TABLES

  ── FOUR CONVERSIONS APPLIED THROUGHOUT ─────────────────────────────────────

  ENUMS → nvarchar + CHECK. Postgres had 19 enum types. SQL Server has none.
  A CHECK constraint holds the same values, reads the same in a query, and
  gains something the enum did not have: you can add a value with ALTER TABLE
  instead of ALTER TYPE, and the stored value is the readable string in every
  client that ever looks at this database. The enum ORDER is lost — nothing in
  this schema ordered by an enum, which was checked before making the swap.

  uuid → uniqueidentifier, DEFAULT NEWID(). Every primary key is declared
  PRIMARY KEY NONCLUSTERED. This is deliberate and it is not a detail: the
  default is CLUSTERED, and a clustered index on a random GUID means every
  insert lands in the middle of the table and splits a page. The tables are
  small today; the habit is what keeps them fast. Clustering, where it earns
  its keep, is on the date column the feed actually reads in order.

  timestamptz → datetime2(3), ALWAYS UTC, defaulting to SYSUTCDATETIME().
  Not datetimeoffset: no row in the source carried a meaningful offset, the
  application has always sent and parsed ISO-8601 UTC, and datetime2 indexes
  and compares without the offset baggage. The rule for anyone writing against
  this: never use GETDATE(), it is server-local. SYSUTCDATETIME() or nothing.

  text[] → nvarchar(max) holding a JSON array, CHECK (ISJSON(...) = 1).
  photo_urls, video_urls, tags, badges. Read them with OPENJSON:
      SELECT value FROM OPENJSON(l.photo_urls)
  The alternative was a child table per array, which is tidier in theory and
  four extra joins on the hottest query in the application.

  ── LENGTHS ─────────────────────────────────────────────────────────────────

  Postgres text is unbounded; nvarchar needs a number, and a number chosen too
  small silently truncates real data on import. So: where Postgres had a CHECK
  on length, that length is used exactly. Where it did not, the bound is set
  well above the longest value in the live data (measured, not guessed — the
  longest username is 46, the longest photo URL 132, the longest push endpoint
  188). tools/export-data.mjs re-checks every value against these bounds and
  refuses to write the file if anything would be cut.
═══════════════════════════════════════════════════════════════════════════════*/

/*── Reference data ─────────────────────────────────────────────────────────*/

IF OBJECT_ID(N'app.categories', N'U') IS NULL
CREATE TABLE app.categories
(
    id          nvarchar(64)  NOT NULL,
    label       nvarchar(100) NOT NULL,
    icon        nvarchar(16)  NULL,
    sort_order  int           NOT NULL CONSTRAINT df_cat_sort   DEFAULT 100,
    is_active   bit           NOT NULL CONSTRAINT df_cat_active DEFAULT 1,
    created_at  datetime2(3)  NOT NULL CONSTRAINT df_cat_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_categories PRIMARY KEY CLUSTERED (id)
);
GO

IF OBJECT_ID(N'app.communities', N'U') IS NULL
CREATE TABLE app.communities
(
    id                uniqueidentifier NOT NULL CONSTRAINT df_comm_id DEFAULT NEWID(),
    slug              nvarchar(100)    NOT NULL,
    name              nvarchar(200)    NOT NULL,
    type              nvarchar(20)     NOT NULL CONSTRAINT df_comm_type DEFAULT N'campus',
    location          nvarchar(200)    NULL,
    description       nvarchar(max)    NULL,
    cover_url         nvarchar(500)    NULL,
    member_count      int              NOT NULL CONSTRAINT df_comm_members DEFAULT 0,
    items_circulated  int              NOT NULL CONSTRAINT df_comm_items   DEFAULT 0,
    co2_saved_kg      decimal(12, 2)   NOT NULL CONSTRAINT df_comm_co2     DEFAULT 0,
    is_public         bit              NOT NULL CONSTRAINT df_comm_public  DEFAULT 1,
    active_since      date             NOT NULL CONSTRAINT df_comm_since   DEFAULT CAST(SYSUTCDATETIME() AS date),
    created_at        datetime2(3)     NOT NULL CONSTRAINT df_comm_created DEFAULT SYSUTCDATETIME(),
    updated_at        datetime2(3)     NOT NULL CONSTRAINT df_comm_updated DEFAULT SYSUTCDATETIME(),

    CONSTRAINT pk_communities   PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ux_communities_slug UNIQUE (slug),
    CONSTRAINT ck_comm_type CHECK (type IN (N'campus', N'apartment', N'office', N'neighborhood'))
);
GO

/*── Members ────────────────────────────────────────────────────────────────*/

IF OBJECT_ID(N'app.profiles', N'U') IS NULL
CREATE TABLE app.profiles
(
    id                        uniqueidentifier NOT NULL,
    username                  nvarchar(100)    NOT NULL,
    full_name                 nvarchar(200)    NULL,
    avatar_url                nvarchar(500)    NULL,
    avatar_color              nvarchar(20)     NULL CONSTRAINT df_prof_color DEFAULT N'#6C63FF',
    initials                  nvarchar(8)      NULL,
    bio                       nvarchar(1000)   NULL,
    role                      nvarchar(50)     NULL,
    community_id              uniqueidentifier NULL,

    badges                    nvarchar(max)    NOT NULL CONSTRAINT df_prof_badges DEFAULT N'[]',

    impact_score              int              NOT NULL CONSTRAINT df_prof_score    DEFAULT 0,
    items_shared_count        int              NOT NULL CONSTRAINT df_prof_shared   DEFAULT 0,
    items_received_count      int              NOT NULL CONSTRAINT df_prof_received DEFAULT 0,
    repairs_helped_count      int              NOT NULL CONSTRAINT df_prof_repairs  DEFAULT 0,
    co2_saved_kg              decimal(10, 2)   NOT NULL CONSTRAINT df_prof_co2      DEFAULT 0,
    money_saved               decimal(12, 2)   NOT NULL CONSTRAINT df_prof_money    DEFAULT 0,

    is_online                 bit              NOT NULL CONSTRAINT df_prof_online DEFAULT 0,
    last_active_at            datetime2(3)     NULL CONSTRAINT df_prof_active DEFAULT SYSUTCDATETIME(),
    joined_at                 datetime2(3)     NOT NULL CONSTRAINT df_prof_joined  DEFAULT SYSUTCDATETIME(),
    updated_at                datetime2(3)     NOT NULL CONSTRAINT df_prof_updated DEFAULT SYSUTCDATETIME(),

    email                     nvarchar(320)    NULL,
    phone                     nvarchar(32)     NULL,

    college_id                nvarchar(100)    NULL,
    college                   nvarchar(16)     NULL,
    graduating_year           int              NULL,
    course                    nvarchar(120)    NULL,
    department                nvarchar(120)    NULL,
    residence                 nvarchar(20)     NULL,

    contact_email_enabled     bit              NOT NULL CONSTRAINT df_prof_cemail DEFAULT 1,
    contact_whatsapp_enabled  bit              NOT NULL CONSTRAINT df_prof_cwa    DEFAULT 0,
    show_online_status        bit              NOT NULL CONSTRAINT df_prof_showon DEFAULT 1,
    allow_dms                 bit              NOT NULL CONSTRAINT df_prof_dms    DEFAULT 1,
    show_phone_on_profile     bit              NOT NULL CONSTRAINT df_prof_phone  DEFAULT 0,
    hide_listings_from_search bit              NOT NULL CONSTRAINT df_prof_hide   DEFAULT 0,
    hide_prices_on_feed       bit              NOT NULL CONSTRAINT df_prof_prices DEFAULT 0,
    larger_text               bit              NOT NULL CONSTRAINT df_prof_larger DEFAULT 0,
    theme                     nvarchar(10)     NOT NULL CONSTRAINT df_prof_theme  DEFAULT N'system',

    notification_prefs        nvarchar(max)    NOT NULL CONSTRAINT df_prof_notif DEFAULT
        N'{"channels":{"inApp":true,"sound":true,"email":true,"sms":false},"categories":{"messages":true,"matches":true,"events":true,"marketplace":true,"lostFound":true,"community":true,"digest":true},"emailFrequency":"realtime","quietHours":{"enabled":false,"from":"22:00","to":"07:00"}}',

    suspended_until           datetime2(3)     NULL,
    suspended_reason          nvarchar(500)    NULL,

    CONSTRAINT pk_profiles          PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ux_profiles_username UNIQUE (username),
    CONSTRAINT fk_profiles_user      FOREIGN KEY (id)           REFERENCES auth.users (id),
    CONSTRAINT fk_profiles_community FOREIGN KEY (community_id) REFERENCES app.communities (id),
    CONSTRAINT ck_prof_badges CHECK (ISJSON(badges) = 1),
    CONSTRAINT ck_prof_notif  CHECK (ISJSON(notification_prefs) = 1),
    CONSTRAINT ck_prof_theme  CHECK (theme IN (N'light', N'dark', N'system')),
    CONSTRAINT ck_prof_resid  CHECK (residence IS NULL OR residence IN (N'day_scholar', N'hosteler')),
    CONSTRAINT ck_prof_year   CHECK (graduating_year IS NULL OR (graduating_year BETWEEN 1980 AND 2100)),
    CONSTRAINT ck_prof_college CHECK (college IS NULL OR college IN (N'SMI', N'MIT', N'TAPMI', N'MLHS', N'MIRM', N'MLS', N'DOC'))
);
GO

IF OBJECT_ID(N'app.community_members', N'U') IS NULL
CREATE TABLE app.community_members
(
    community_id uniqueidentifier NOT NULL,
    user_id      uniqueidentifier NOT NULL,
    role         nvarchar(20)     NOT NULL CONSTRAINT df_cm_role DEFAULT N'member',
    joined_at    datetime2(3)     NOT NULL CONSTRAINT df_cm_joined DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_community_members PRIMARY KEY CLUSTERED (community_id, user_id),
    CONSTRAINT fk_cm_community FOREIGN KEY (community_id) REFERENCES app.communities (id),
    CONSTRAINT fk_cm_user      FOREIGN KEY (user_id)      REFERENCES app.profiles (id),
    CONSTRAINT ck_cm_role CHECK (role IN (N'member', N'moderator', N'admin'))
);
GO

/*── Listings ───────────────────────────────────────────────────────────────
  The centre of the application. Two shapes share this table, told apart by
  `kind`: an item someone is passing on, and an opportunity (a gig, a role).
  The opportunity columns — comp, rate_period, opp_role, price_band — are NULL
  for an item, which is why none of them can be NOT NULL.                    */

IF OBJECT_ID(N'app.listings', N'U') IS NULL
CREATE TABLE app.listings
(
    id                   uniqueidentifier NOT NULL CONSTRAINT df_lst_id DEFAULT NEWID(),
    user_id              uniqueidentifier NOT NULL,
    community_id         uniqueidentifier NOT NULL,
    category_id          nvarchar(64)     NULL,

    title                nvarchar(200)    NOT NULL,
    description          nvarchar(2000)   NULL,
    location             nvarchar(200)    NULL,

    kind                 nvarchar(20)     NOT NULL CONSTRAINT df_lst_kind DEFAULT N'item',
    listing_type         nvarchar(20)     NOT NULL,
    condition            nvarchar(20)     NOT NULL CONSTRAINT df_lst_cond   DEFAULT N'good',
    status               nvarchar(20)     NOT NULL CONSTRAINT df_lst_status DEFAULT N'active',

    price                decimal(10, 2)   NULL,
    price_max            decimal(18, 2)   NULL,
    price_band           nvarchar(20)     NULL,
    deposit              decimal(18, 2)   NULL,
    rate_period          nvarchar(20)     NULL,
    comp                 nvarchar(20)     NULL,
    opp_role             nvarchar(20)     NULL,
    swap_for             nvarchar(280)    NULL,

    link_url             nvarchar(500)    NULL,
    link_on_photo        bit              NOT NULL CONSTRAINT df_lst_linkphoto DEFAULT 0,

    photo_urls           nvarchar(max)    NOT NULL CONSTRAINT df_lst_photos DEFAULT N'[]',
    video_urls           nvarchar(max)    NOT NULL CONSTRAINT df_lst_videos DEFAULT N'[]',
    tags                 nvarchar(max)    NOT NULL CONSTRAINT df_lst_tags   DEFAULT N'[]',
    photo_color          nvarchar(20)     NULL,
    photo_icon           nvarchar(50)     NULL,

    is_featured          bit              NOT NULL CONSTRAINT df_lst_feat  DEFAULT 0,
    notify_on_engagement bit              NULL CONSTRAINT df_lst_notify DEFAULT 1,

    response_count       int              NOT NULL CONSTRAINT df_lst_resp  DEFAULT 0,
    save_count           int              NOT NULL CONSTRAINT df_lst_saves DEFAULT 0,
    view_count           int              NOT NULL CONSTRAINT df_lst_views DEFAULT 0,

    posted_at            datetime2(3)     NOT NULL CONSTRAINT df_lst_posted  DEFAULT SYSUTCDATETIME(),
    updated_at           datetime2(3)     NOT NULL CONSTRAINT df_lst_updated DEFAULT SYSUTCDATETIME(),

    CONSTRAINT pk_listings PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_lst_user      FOREIGN KEY (user_id)      REFERENCES app.profiles (id),
    CONSTRAINT fk_lst_community FOREIGN KEY (community_id) REFERENCES app.communities (id),
    CONSTRAINT fk_lst_category  FOREIGN KEY (category_id)  REFERENCES app.categories (id),

    CONSTRAINT ck_lst_photos CHECK (ISJSON(photo_urls) = 1),
    CONSTRAINT ck_lst_videos CHECK (ISJSON(video_urls) = 1),
    CONSTRAINT ck_lst_tags   CHECK (ISJSON(tags) = 1),
    CONSTRAINT ck_lst_kind   CHECK (kind IN (N'item', N'opportunity')),
    CONSTRAINT ck_lst_type   CHECK (listing_type IN (N'free', N'swap', N'borrow', N'sell')),
    CONSTRAINT ck_lst_cond   CHECK (condition IN (N'like_new', N'good', N'fair')),
    CONSTRAINT ck_lst_status CHECK (status IN (N'active', N'pending', N'completed', N'hidden', N'removed')),
    CONSTRAINT ck_lst_title  CHECK (LEN(title) BETWEEN 2 AND 200),
    CONSTRAINT ck_lst_price  CHECK (price IS NULL OR price >= 0),
    CONSTRAINT ck_lst_deposit CHECK (deposit IS NULL OR deposit >= 0),
    CONSTRAINT ck_lst_pricemax CHECK (price_max IS NULL OR (price_max >= 0 AND (price IS NULL OR price_max >= price))),
    CONSTRAINT ck_lst_band   CHECK (price_band IS NULL OR price_band IN (N'under_200', N'200_500', N'500_1000', N'over_1000')),
    CONSTRAINT ck_lst_rate   CHECK (rate_period IS NULL OR rate_period IN (N'hour', N'session', N'day', N'week', N'month', N'year', N'project')),
    CONSTRAINT ck_lst_comp   CHECK (comp IS NULL OR comp IN (N'volunteer', N'free', N'paid')),
    CONSTRAINT ck_lst_opprole CHECK (opp_role IS NULL OR opp_role IN (N'offering', N'hiring')),

    /* Postgres used a case-insensitive regex here: ^https?://\S+$. SQL Server
       has no regex, so this is the LIKE equivalent — a scheme, at least one
       more character, and no whitespace of any kind. It accepts everything the
       regex accepted and rejects the same javascript: and data: URLs, which is
       the whole point of the constraint. */
    CONSTRAINT ck_lst_link CHECK (
        link_url IS NULL OR (
            LEN(link_url) BETWEEN 8 AND 500
            AND (link_url LIKE N'http://_%' OR link_url LIKE N'https://_%')
            AND CHARINDEX(N' ',     link_url) = 0
            AND CHARINDEX(CHAR(9),  link_url) = 0
            AND CHARINDEX(CHAR(10), link_url) = 0
            AND CHARINDEX(CHAR(13), link_url) = 0
        )
    )
);
GO

IF OBJECT_ID(N'app.requests', N'U') IS NULL
CREATE TABLE app.requests
(
    id                   uniqueidentifier NOT NULL CONSTRAINT df_req_id DEFAULT NEWID(),
    user_id              uniqueidentifier NOT NULL,
    community_id         uniqueidentifier NOT NULL,
    category_id          nvarchar(64)     NULL,

    title                nvarchar(200)    NOT NULL,
    description          nvarchar(2000)   NULL,
    urgency              nvarchar(20)     NOT NULL CONSTRAINT df_req_urg    DEFAULT N'normal',
    status               nvarchar(20)     NOT NULL CONSTRAINT df_req_status DEFAULT N'open',
    need_by_date         date             NULL,

    photo_urls           nvarchar(max)    NOT NULL CONSTRAINT df_req_photos DEFAULT N'[]',
    video_urls           nvarchar(max)    NOT NULL CONSTRAINT df_req_videos DEFAULT N'[]',

    offer_count          int              NOT NULL CONSTRAINT df_req_offers DEFAULT 0,
    notify_on_engagement bit              NULL CONSTRAINT df_req_notify DEFAULT 1,

    posted_at            datetime2(3)     NOT NULL CONSTRAINT df_req_posted  DEFAULT SYSUTCDATETIME(),
    updated_at           datetime2(3)     NOT NULL CONSTRAINT df_req_updated DEFAULT SYSUTCDATETIME(),
    expires_at           datetime2(3)     NULL,

    CONSTRAINT pk_requests PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_req_user      FOREIGN KEY (user_id)      REFERENCES app.profiles (id),
    CONSTRAINT fk_req_community FOREIGN KEY (community_id) REFERENCES app.communities (id),
    CONSTRAINT fk_req_category  FOREIGN KEY (category_id)  REFERENCES app.categories (id),
    CONSTRAINT ck_req_photos CHECK (ISJSON(photo_urls) = 1),
    CONSTRAINT ck_req_videos CHECK (ISJSON(video_urls) = 1),
    CONSTRAINT ck_req_title  CHECK (LEN(title) BETWEEN 2 AND 200),
    CONSTRAINT ck_req_urg    CHECK (urgency IN (N'normal', N'urgent')),
    CONSTRAINT ck_req_status CHECK (status IN (N'open', N'fulfilled', N'expired', N'cancelled'))
);
GO

IF OBJECT_ID(N'app.events', N'U') IS NULL
CREATE TABLE app.events
(
    id               uniqueidentifier NOT NULL CONSTRAINT df_evt_id DEFAULT NEWID(),
    organizer_id     uniqueidentifier NOT NULL,
    community_id     uniqueidentifier NOT NULL,

    title            nvarchar(200)    NOT NULL,
    description      nvarchar(3000)   NULL,
    event_type       nvarchar(20)     NOT NULL CONSTRAINT df_evt_type   DEFAULT N'community',
    status           nvarchar(20)     NOT NULL CONSTRAINT df_evt_status DEFAULT N'pending_review',
    color_accent     nvarchar(20)     NULL,
    location         nvarchar(200)    NULL,
    cover_url        nvarchar(500)    NULL,

    starts_at        datetime2(3)     NOT NULL,
    ends_at          datetime2(3)     NULL,
    time_unspecified bit              NOT NULL CONSTRAINT df_evt_timeuns DEFAULT 0,
    max_attendees    int              NULL,

    photo_urls       nvarchar(max)    NOT NULL CONSTRAINT df_evt_photos DEFAULT N'[]',
    video_urls       nvarchar(max)    NOT NULL CONSTRAINT df_evt_videos DEFAULT N'[]',

    attendee_count   int              NOT NULL CONSTRAINT df_evt_att   DEFAULT 0,
    save_count       int              NOT NULL CONSTRAINT df_evt_saves DEFAULT 0,
    view_count       int              NOT NULL CONSTRAINT df_evt_views DEFAULT 0,

    created_at       datetime2(3)     NOT NULL CONSTRAINT df_evt_created DEFAULT SYSUTCDATETIME(),
    updated_at       datetime2(3)     NOT NULL CONSTRAINT df_evt_updated DEFAULT SYSUTCDATETIME(),

    CONSTRAINT pk_events PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_evt_organizer FOREIGN KEY (organizer_id) REFERENCES app.profiles (id),
    CONSTRAINT fk_evt_community FOREIGN KEY (community_id) REFERENCES app.communities (id),
    CONSTRAINT ck_evt_photos CHECK (ISJSON(photo_urls) = 1),
    CONSTRAINT ck_evt_videos CHECK (ISJSON(video_urls) = 1),
    CONSTRAINT ck_evt_title  CHECK (LEN(title) BETWEEN 2 AND 200),
    CONSTRAINT ck_evt_max    CHECK (max_attendees IS NULL OR max_attendees > 0),
    CONSTRAINT ck_evt_ends   CHECK (ends_at IS NULL OR ends_at > starts_at),
    CONSTRAINT ck_evt_status CHECK (status IN (N'pending_review', N'published', N'completed', N'cancelled')),
    CONSTRAINT ck_evt_type   CHECK (event_type IN (
        N'swap', N'repair', N'cleanup', N'workshop', N'drive', N'challenge', N'stalls',
        N'community', N'food', N'film', N'exhibition', N'performance', N'talk',
        N'sports', N'fest', N'other'))
);
GO

IF OBJECT_ID(N'app.lost_found_reports', N'U') IS NULL
CREATE TABLE app.lost_found_reports
(
    id                   uniqueidentifier NOT NULL CONSTRAINT df_lf_id DEFAULT NEWID(),
    user_id              uniqueidentifier NOT NULL,
    community_id         uniqueidentifier NOT NULL,
    category_id          nvarchar(64)     NULL,

    title                nvarchar(200)    NOT NULL,
    description          nvarchar(2000)   NULL,
    status               nvarchar(20)     NOT NULL,
    last_seen            nvarchar(300)    NULL,
    last_seen_date       date             NULL,
    reward               nvarchar(200)    NULL,

    photo_urls           nvarchar(max)    NOT NULL CONSTRAINT df_lf_photos DEFAULT N'[]',
    video_urls           nvarchar(max)    NOT NULL CONSTRAINT df_lf_videos DEFAULT N'[]',
    photo_color          nvarchar(20)     NULL,
    photo_icon           nvarchar(50)     NULL,

    contact_phone        nvarchar(32)     NULL,
    contact_email        nvarchar(320)    NULL,

    verified             bit              NOT NULL CONSTRAINT df_lf_verified DEFAULT 0,
    notify_on_engagement bit              NULL CONSTRAINT df_lf_notify DEFAULT 1,

    claimed_by           uniqueidentifier NULL,
    claimed_at           datetime2(3)     NULL,

    posted_at            datetime2(3)     NOT NULL CONSTRAINT df_lf_posted  DEFAULT SYSUTCDATETIME(),
    updated_at           datetime2(3)     NOT NULL CONSTRAINT df_lf_updated DEFAULT SYSUTCDATETIME(),

    CONSTRAINT pk_lost_found PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_lf_user      FOREIGN KEY (user_id)      REFERENCES app.profiles (id),
    CONSTRAINT fk_lf_claimed   FOREIGN KEY (claimed_by)   REFERENCES app.profiles (id),
    CONSTRAINT fk_lf_community FOREIGN KEY (community_id) REFERENCES app.communities (id),
    CONSTRAINT fk_lf_category  FOREIGN KEY (category_id)  REFERENCES app.categories (id),
    CONSTRAINT ck_lf_photos CHECK (ISJSON(photo_urls) = 1),
    CONSTRAINT ck_lf_videos CHECK (ISJSON(video_urls) = 1),
    CONSTRAINT ck_lf_title  CHECK (LEN(title) BETWEEN 2 AND 200),
    CONSTRAINT ck_lf_status CHECK (status IN (N'lost', N'found', N'claimed', N'returned'))
);
GO

/*── Engagement ─────────────────────────────────────────────────────────────*/

IF OBJECT_ID(N'app.saves', N'U') IS NULL
CREATE TABLE app.saves
(
    user_id    uniqueidentifier NOT NULL,
    listing_id uniqueidentifier NOT NULL,
    saved_at   datetime2(3)     NOT NULL CONSTRAINT df_sav_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_saves PRIMARY KEY CLUSTERED (user_id, listing_id),
    CONSTRAINT fk_sav_user    FOREIGN KEY (user_id)    REFERENCES app.profiles (id),
    CONSTRAINT fk_sav_listing FOREIGN KEY (listing_id) REFERENCES app.listings (id)
);
GO

IF OBJECT_ID(N'app.listing_responses', N'U') IS NULL
CREATE TABLE app.listing_responses
(
    id         uniqueidentifier NOT NULL CONSTRAINT df_lr_id DEFAULT NEWID(),
    listing_id uniqueidentifier NOT NULL,
    user_id    uniqueidentifier NOT NULL,
    message    nvarchar(1000)   NULL,
    created_at datetime2(3)     NOT NULL CONSTRAINT df_lr_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_listing_responses PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_lr_listing FOREIGN KEY (listing_id) REFERENCES app.listings (id),
    CONSTRAINT fk_lr_user    FOREIGN KEY (user_id)    REFERENCES app.profiles (id)
);
GO

IF OBJECT_ID(N'app.request_offers', N'U') IS NULL
CREATE TABLE app.request_offers
(
    id         uniqueidentifier NOT NULL CONSTRAINT df_ro_id DEFAULT NEWID(),
    request_id uniqueidentifier NOT NULL,
    user_id    uniqueidentifier NOT NULL,
    message    nvarchar(1000)   NULL,
    created_at datetime2(3)     NOT NULL CONSTRAINT df_ro_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_request_offers PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ux_ro_request_user UNIQUE (request_id, user_id),
    CONSTRAINT fk_ro_request FOREIGN KEY (request_id) REFERENCES app.requests (id),
    CONSTRAINT fk_ro_user    FOREIGN KEY (user_id)    REFERENCES app.profiles (id)
);
GO

IF OBJECT_ID(N'app.event_rsvps', N'U') IS NULL
CREATE TABLE app.event_rsvps
(
    event_id  uniqueidentifier NOT NULL,
    user_id   uniqueidentifier NOT NULL,
    status    nvarchar(20)     NOT NULL CONSTRAINT df_rsvp_status DEFAULT N'going',
    rsvped_at datetime2(3)     NOT NULL CONSTRAINT df_rsvp_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_event_rsvps PRIMARY KEY CLUSTERED (event_id, user_id),
    CONSTRAINT fk_rsvp_event FOREIGN KEY (event_id) REFERENCES app.events (id),
    CONSTRAINT fk_rsvp_user  FOREIGN KEY (user_id)  REFERENCES app.profiles (id),
    CONSTRAINT ck_rsvp_status CHECK (status IN (N'going', N'maybe', N'declined'))
);
GO

IF OBJECT_ID(N'app.event_saves', N'U') IS NULL
CREATE TABLE app.event_saves
(
    event_id uniqueidentifier NOT NULL,
    user_id  uniqueidentifier NOT NULL,
    saved_at datetime2(3)     NOT NULL CONSTRAINT df_es_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_event_saves PRIMARY KEY CLUSTERED (event_id, user_id),
    CONSTRAINT fk_es_event FOREIGN KEY (event_id) REFERENCES app.events (id),
    CONSTRAINT fk_es_user  FOREIGN KEY (user_id)  REFERENCES app.profiles (id)
);
GO

IF OBJECT_ID(N'app.event_forms', N'U') IS NULL
CREATE TABLE app.event_forms
(
    id         uniqueidentifier NOT NULL CONSTRAINT df_ef_id DEFAULT NEWID(),
    event_id   uniqueidentifier NOT NULL,
    fields     nvarchar(max)    NOT NULL CONSTRAINT df_ef_fields DEFAULT N'[]',
    created_at datetime2(3)     NOT NULL CONSTRAINT df_ef_created DEFAULT SYSUTCDATETIME(),
    updated_at datetime2(3)     NOT NULL CONSTRAINT df_ef_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_event_forms PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ux_ef_event UNIQUE (event_id),
    CONSTRAINT fk_ef_event FOREIGN KEY (event_id) REFERENCES app.events (id),
    CONSTRAINT ck_ef_fields CHECK (ISJSON(fields) = 1)
);
GO

IF OBJECT_ID(N'app.event_form_responses', N'U') IS NULL
CREATE TABLE app.event_form_responses
(
    id           uniqueidentifier NOT NULL CONSTRAINT df_efr_id DEFAULT NEWID(),
    form_id      uniqueidentifier NOT NULL,
    event_id     uniqueidentifier NOT NULL,
    user_id      uniqueidentifier NOT NULL,
    answers      nvarchar(max)    NOT NULL CONSTRAINT df_efr_answers DEFAULT N'{}',
    submitted_at datetime2(3)     NOT NULL CONSTRAINT df_efr_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_event_form_responses PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ux_efr_event_user UNIQUE (event_id, user_id),
    CONSTRAINT fk_efr_form  FOREIGN KEY (form_id)  REFERENCES app.event_forms (id),
    CONSTRAINT fk_efr_event FOREIGN KEY (event_id) REFERENCES app.events (id),
    CONSTRAINT fk_efr_user  FOREIGN KEY (user_id)  REFERENCES app.profiles (id),
    CONSTRAINT ck_efr_answers CHECK (ISJSON(answers) = 1)
);
GO

/* entity_type/entity_id is a polymorphic pointer — it names one of listings,
   requests, events, lost_found_reports, announcements. There is no foreign key
   because no one column can reference five tables, which is exactly how it was
   in Postgres. app.usp_delete_* is what keeps these from dangling. */
IF OBJECT_ID(N'app.comments', N'U') IS NULL
CREATE TABLE app.comments
(
    id                uniqueidentifier NOT NULL CONSTRAINT df_cmt_id DEFAULT NEWID(),
    entity_type       nvarchar(20)     NOT NULL,
    entity_id         uniqueidentifier NOT NULL,
    user_id           uniqueidentifier NOT NULL,
    parent_comment_id uniqueidentifier NULL,
    body              nvarchar(2000)   NOT NULL,
    is_edited         bit              NOT NULL CONSTRAINT df_cmt_edited DEFAULT 0,
    like_count        int              NOT NULL CONSTRAINT df_cmt_likes   DEFAULT 0,
    reply_count       int              NOT NULL CONSTRAINT df_cmt_replies DEFAULT 0,
    created_at        datetime2(3)     NOT NULL CONSTRAINT df_cmt_created DEFAULT SYSUTCDATETIME(),
    updated_at        datetime2(3)     NOT NULL CONSTRAINT df_cmt_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_comments PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_cmt_user   FOREIGN KEY (user_id)           REFERENCES app.profiles (id),
    CONSTRAINT fk_cmt_parent FOREIGN KEY (parent_comment_id) REFERENCES app.comments (id),
    CONSTRAINT ck_cmt_body   CHECK (LEN(body) BETWEEN 1 AND 2000),
    CONSTRAINT ck_cmt_entity CHECK (entity_type IN (N'listing', N'request', N'event', N'lost_found', N'milestone', N'announcement', N'alert'))
);
GO

IF OBJECT_ID(N'app.reactions', N'U') IS NULL
CREATE TABLE app.reactions
(
    id          uniqueidentifier NOT NULL CONSTRAINT df_rx_id DEFAULT NEWID(),
    user_id     uniqueidentifier NOT NULL,
    entity_type nvarchar(20)     NOT NULL,
    entity_id   uniqueidentifier NOT NULL,
    kind        nvarchar(20)     NOT NULL CONSTRAINT df_rx_kind DEFAULT N'like',
    created_at  datetime2(3)     NOT NULL CONSTRAINT df_rx_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_reactions PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ux_rx_one_per_user UNIQUE (user_id, entity_type, entity_id, kind),
    CONSTRAINT fk_rx_user FOREIGN KEY (user_id) REFERENCES app.profiles (id),
    CONSTRAINT ck_rx_kind   CHECK (kind = N'like'),
    CONSTRAINT ck_rx_entity CHECK (entity_type IN (N'listing', N'request', N'event', N'lost_found', N'milestone', N'announcement', N'alert'))
);
GO

/*── Notifications, alerts, push ────────────────────────────────────────────*/

IF OBJECT_ID(N'app.notifications', N'U') IS NULL
CREATE TABLE app.notifications
(
    id          uniqueidentifier NOT NULL CONSTRAINT df_ntf_id DEFAULT NEWID(),
    user_id     uniqueidentifier NOT NULL,
    actor_id    uniqueidentifier NULL,
    type        nvarchar(40)     NOT NULL,
    entity_type nvarchar(20)     NULL,
    entity_id   uniqueidentifier NULL,
    title       nvarchar(300)    NOT NULL,
    body        nvarchar(1000)   NULL,
    is_read     bit              NOT NULL CONSTRAINT df_ntf_read DEFAULT 0,
    read_at     datetime2(3)     NULL,
    created_at  datetime2(3)     NOT NULL CONSTRAINT df_ntf_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_notifications PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_ntf_user  FOREIGN KEY (user_id)  REFERENCES app.profiles (id),
    CONSTRAINT fk_ntf_actor FOREIGN KEY (actor_id) REFERENCES app.profiles (id),
    CONSTRAINT ck_ntf_entity CHECK (entity_type IS NULL OR entity_type IN (N'listing', N'request', N'event', N'lost_found', N'milestone', N'announcement', N'alert')),
    CONSTRAINT ck_ntf_type CHECK (type IN (
        N'response_received', N'request_help_offered', N'event_rsvp', N'event_starting_soon',
        N'item_liked', N'item_commented', N'lost_found_match', N'milestone_reached',
        N'community_announcement', N'alert_match', N'alert_expired', N'content_reported',
        N'user_blocked'))
);
GO

IF OBJECT_ID(N'app.alerts', N'U') IS NULL
CREATE TABLE app.alerts
(
    id              uniqueidentifier NOT NULL CONSTRAINT df_alr_id DEFAULT NEWID(),
    user_id         uniqueidentifier NOT NULL,
    community_id    uniqueidentifier NULL,
    category_id     nvarchar(64)     NULL,
    title           nvarchar(200)    NOT NULL,
    description     nvarchar(1000)   NOT NULL,
    condition       nvarchar(20)     NULL,
    max_price       decimal(10, 2)   NULL,
    location_pref   nvarchar(200)    NULL,
    notify          nvarchar(20)     NOT NULL CONSTRAINT df_alr_notify DEFAULT N'email',
    status          nvarchar(20)     NOT NULL CONSTRAINT df_alr_status DEFAULT N'active',
    duration_hours  int              NOT NULL,
    match_count     int              NOT NULL CONSTRAINT df_alr_matches DEFAULT 0,
    last_matched_at datetime2(3)     NULL,
    created_at      datetime2(3)     NOT NULL CONSTRAINT df_alr_created DEFAULT SYSUTCDATETIME(),
    expires_at      datetime2(3)     NOT NULL,
    CONSTRAINT pk_alerts PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_alr_user      FOREIGN KEY (user_id)      REFERENCES app.profiles (id),
    CONSTRAINT fk_alr_community FOREIGN KEY (community_id) REFERENCES app.communities (id),
    CONSTRAINT fk_alr_category  FOREIGN KEY (category_id)  REFERENCES app.categories (id),
    CONSTRAINT ck_alr_title  CHECK (LEN(title) BETWEEN 2 AND 200),
    CONSTRAINT ck_alr_desc   CHECK (LEN(description) BETWEEN 5 AND 1000),
    CONSTRAINT ck_alr_hours  CHECK (duration_hours BETWEEN 1 AND 240),
    CONSTRAINT ck_alr_price  CHECK (max_price IS NULL OR max_price >= 0),
    CONSTRAINT ck_alr_window CHECK (expires_at > created_at),
    CONSTRAINT ck_alr_cond   CHECK (condition IS NULL OR condition IN (N'like_new', N'good', N'fair')),
    CONSTRAINT ck_alr_notify CHECK (notify IN (N'email', N'phone', N'both')),
    CONSTRAINT ck_alr_status CHECK (status IN (N'active', N'matched', N'expired', N'cancelled'))
);
GO

IF OBJECT_ID(N'app.push_subscriptions', N'U') IS NULL
CREATE TABLE app.push_subscriptions
(
    id           uniqueidentifier NOT NULL CONSTRAINT df_psub_id DEFAULT NEWID(),
    user_id      uniqueidentifier NOT NULL,
    endpoint     nvarchar(450)    NOT NULL,   /* 450 is the nvarchar index-key ceiling */
    p256dh       nvarchar(200)    NOT NULL,
    auth         nvarchar(100)    NOT NULL,
    user_agent   nvarchar(400)    NULL,
    created_at   datetime2(3)     NOT NULL CONSTRAINT df_psub_created DEFAULT SYSUTCDATETIME(),
    last_seen_at datetime2(3)     NOT NULL CONSTRAINT df_psub_seen    DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_push_subscriptions PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ux_psub_endpoint UNIQUE (endpoint),
    CONSTRAINT fk_psub_user FOREIGN KEY (user_id) REFERENCES auth.users (id)
);
GO

IF OBJECT_ID(N'app.push_queue', N'U') IS NULL
CREATE TABLE app.push_queue
(
    id         uniqueidentifier NOT NULL CONSTRAINT df_pq_id DEFAULT NEWID(),
    user_id    uniqueidentifier NOT NULL,
    channel    nvarchar(20)     NOT NULL,
    payload    nvarchar(max)    NOT NULL,
    status     nvarchar(20)     NOT NULL CONSTRAINT df_pq_status   DEFAULT N'pending',
    attempts   int              NOT NULL CONSTRAINT df_pq_attempts DEFAULT 0,
    last_error nvarchar(1000)   NULL,
    created_at datetime2(3)     NOT NULL CONSTRAINT df_pq_created DEFAULT SYSUTCDATETIME(),
    sent_at    datetime2(3)     NULL,
    CONSTRAINT pk_push_queue PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_pq_user FOREIGN KEY (user_id) REFERENCES app.profiles (id),
    CONSTRAINT ck_pq_payload CHECK (ISJSON(payload) = 1),
    CONSTRAINT ck_pq_channel CHECK (channel IN (N'email', N'phone', N'both')),
    CONSTRAINT ck_pq_status  CHECK (status IN (N'pending', N'sent', N'failed', N'skipped'))
);
GO

IF OBJECT_ID(N'app.saved_searches', N'U') IS NULL
CREATE TABLE app.saved_searches
(
    id         uniqueidentifier NOT NULL CONSTRAINT df_ss_id DEFAULT NEWID(),
    user_id    uniqueidentifier NOT NULL,
    query      nvarchar(80)     NOT NULL,
    scope      nvarchar(20)     NOT NULL CONSTRAINT df_ss_scope DEFAULT N'requests',
    created_at datetime2(3)     NOT NULL CONSTRAINT df_ss_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_saved_searches PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ux_ss_user_query UNIQUE (user_id, query, scope),
    CONSTRAINT fk_ss_user FOREIGN KEY (user_id) REFERENCES auth.users (id),
    CONSTRAINT ck_ss_query CHECK (LEN(query) BETWEEN 1 AND 80),
    CONSTRAINT ck_ss_scope CHECK (scope IN (N'requests', N'listings', N'all'))
);
GO

/*── Direct messages ────────────────────────────────────────────────────────
  user_a is always the lower UUID of the pair. That is what makes a two-person
  conversation findable with one lookup instead of two, and it is enforced by
  ck_conv_ordered rather than trusted to the caller.

  ┌─ A DIFFERENCE THAT WOULD BITE IF THIS TABLE HAD ROWS ────────────────────┐
  │ "Lower" does not mean the same thing in both databases. Postgres compares │
  │ a uuid as a plain string of bytes, left to right. SQL Server compares     │
  │ uniqueidentifier in its own order — the LAST six bytes first, then        │
  │ backwards through the rest. For a given pair the two can disagree about   │
  │ which id is smaller.                                                      │
  │                                                                          │
  │ So rows ordered by Postgres can violate this CHECK on import. It is safe  │
  │ here only because app.conversations has zero rows at migration time; the  │
  │ export was checked. If that ever stops being true, the import must swap   │
  │ user_a/user_b to SQL Server's ordering rather than trusting the old one.  │
  │                                                                          │
  │ Nothing else is affected: usp_get_or_create_conversation computes the     │
  │ pair with SQL Server's own <, so it agrees with this constraint always.   │
  └──────────────────────────────────────────────────────────────────────────┘ */

IF OBJECT_ID(N'app.conversations', N'U') IS NULL
CREATE TABLE app.conversations
(
    id              uniqueidentifier NOT NULL CONSTRAINT df_conv_id DEFAULT NEWID(),
    user_a          uniqueidentifier NOT NULL,
    user_b          uniqueidentifier NOT NULL,
    listing_id      uniqueidentifier NULL,
    subject         nvarchar(300)    NULL,
    last_message    nvarchar(200)    NULL,
    last_message_at datetime2(3)     NULL,
    last_sender_id  uniqueidentifier NULL,
    created_at      datetime2(3)     NOT NULL CONSTRAINT df_conv_created DEFAULT SYSUTCDATETIME(),

    /* Postgres put COALESCE(listing_id, '000…') straight in the unique index.
       SQL Server cannot index an expression, so the expression becomes a
       persisted computed column and the index sits on that. Same rule, same
       effect: one conversation per pair per listing, and one more for the pair
       with no listing attached. */
    listing_key AS ISNULL(listing_id, CONVERT(uniqueidentifier, N'00000000-0000-0000-0000-000000000000')) PERSISTED,

    CONSTRAINT pk_conversations PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_conv_a       FOREIGN KEY (user_a)         REFERENCES auth.users (id),
    CONSTRAINT fk_conv_b       FOREIGN KEY (user_b)         REFERENCES auth.users (id),
    CONSTRAINT fk_conv_sender  FOREIGN KEY (last_sender_id) REFERENCES auth.users (id),
    CONSTRAINT fk_conv_listing FOREIGN KEY (listing_id)     REFERENCES app.listings (id),
    CONSTRAINT ck_conv_ordered CHECK (user_a < user_b)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_conv_pair_listing' AND object_id = OBJECT_ID(N'app.conversations'))
CREATE UNIQUE INDEX ux_conv_pair_listing ON app.conversations (user_a, user_b, listing_key);
GO

IF OBJECT_ID(N'app.messages', N'U') IS NULL
CREATE TABLE app.messages
(
    id              uniqueidentifier NOT NULL CONSTRAINT df_msg_id DEFAULT NEWID(),
    conversation_id uniqueidentifier NOT NULL,
    sender_id       uniqueidentifier NOT NULL,
    body            nvarchar(4000)   NOT NULL,
    read_at         datetime2(3)     NULL,
    created_at      datetime2(3)     NOT NULL CONSTRAINT df_msg_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_messages PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_msg_conv   FOREIGN KEY (conversation_id) REFERENCES app.conversations (id),
    CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id)       REFERENCES auth.users (id),
    CONSTRAINT ck_msg_body CHECK (LEN(body) BETWEEN 1 AND 4000)
);
GO

/*── Safety and moderation ──────────────────────────────────────────────────*/

IF OBJECT_ID(N'app.user_blocks', N'U') IS NULL
CREATE TABLE app.user_blocks
(
    blocker_id uniqueidentifier NOT NULL,
    target_id  uniqueidentifier NOT NULL,
    created_at datetime2(3)     NOT NULL CONSTRAINT df_ub_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_user_blocks PRIMARY KEY CLUSTERED (blocker_id, target_id),
    CONSTRAINT fk_ub_blocker FOREIGN KEY (blocker_id) REFERENCES auth.users (id),
    CONSTRAINT fk_ub_target  FOREIGN KEY (target_id)  REFERENCES auth.users (id),
    CONSTRAINT ck_ub_no_self CHECK (blocker_id <> target_id)
);
GO

/* target_id is nvarchar, not uniqueidentifier: a report can point at a comment,
   a message, a whole user, or a listing, and Postgres stored it as text for
   exactly that reason. Kept as text so nothing is lost in translation. */
IF OBJECT_ID(N'app.content_reports', N'U') IS NULL
CREATE TABLE app.content_reports
(
    id             uniqueidentifier NOT NULL CONSTRAINT df_cr_id DEFAULT NEWID(),
    reporter_id    uniqueidentifier NOT NULL,
    target_type    nvarchar(20)     NOT NULL,
    target_id      nvarchar(64)     NOT NULL,
    target_user_id uniqueidentifier NULL,
    reason         nvarchar(60)     NOT NULL,
    details        nvarchar(1000)   NULL,
    status         nvarchar(20)     NOT NULL CONSTRAINT df_cr_status DEFAULT N'open',
    reviewed_by    uniqueidentifier NULL,
    reviewed_at    datetime2(3)     NULL,
    created_at     datetime2(3)     NOT NULL CONSTRAINT df_cr_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_content_reports PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_cr_reporter FOREIGN KEY (reporter_id)    REFERENCES auth.users (id),
    CONSTRAINT fk_cr_target   FOREIGN KEY (target_user_id) REFERENCES auth.users (id),
    CONSTRAINT fk_cr_reviewer FOREIGN KEY (reviewed_by)    REFERENCES auth.users (id),
    CONSTRAINT ck_cr_reason  CHECK (LEN(reason) BETWEEN 1 AND 60),
    CONSTRAINT ck_cr_status  CHECK (status IN (N'open', N'reviewing', N'actioned', N'dismissed')),
    CONSTRAINT ck_cr_target  CHECK (target_type IN (N'listing', N'request', N'lostfound', N'event', N'comment', N'message', N'user'))
);
GO

IF OBJECT_ID(N'app.moderation_terms', N'U') IS NULL
CREATE TABLE app.moderation_terms
(
    term     nvarchar(100) NOT NULL,
    category nvarchar(50)  NOT NULL CONSTRAINT df_mt_cat DEFAULT N'profanity',
    added_at datetime2(3)  NOT NULL CONSTRAINT df_mt_at  DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_moderation_terms PRIMARY KEY CLUSTERED (term)
);
GO

/*── Community: inventory, impact, announcements, milestones ────────────────*/

IF OBJECT_ID(N'app.inventory_items', N'U') IS NULL
CREATE TABLE app.inventory_items
(
    id                uniqueidentifier NOT NULL CONSTRAINT df_inv_id DEFAULT NEWID(),
    community_id      uniqueidentifier NOT NULL,
    owner_id          uniqueidentifier NULL,
    category_id       nvarchar(64)     NULL,
    title             nvarchar(200)    NOT NULL,
    description       nvarchar(1000)   NULL,
    photo_url         nvarchar(500)    NULL,
    photo_color       nvarchar(20)     NULL,
    photo_icon        nvarchar(50)     NULL,
    status            nvarchar(20)     NOT NULL CONSTRAINT df_inv_status DEFAULT N'available',
    borrowed_by       uniqueidentifier NULL,
    borrow_started_at datetime2(3)     NULL,
    due_date          date             NULL,
    total_borrows     int              NOT NULL CONSTRAINT df_inv_borrows DEFAULT 0,
    created_at        datetime2(3)     NOT NULL CONSTRAINT df_inv_created DEFAULT SYSUTCDATETIME(),
    updated_at        datetime2(3)     NOT NULL CONSTRAINT df_inv_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_inventory_items PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_inv_community FOREIGN KEY (community_id) REFERENCES app.communities (id),
    CONSTRAINT fk_inv_owner     FOREIGN KEY (owner_id)     REFERENCES app.profiles (id),
    CONSTRAINT fk_inv_borrower  FOREIGN KEY (borrowed_by)  REFERENCES app.profiles (id),
    CONSTRAINT fk_inv_category  FOREIGN KEY (category_id)  REFERENCES app.categories (id),
    CONSTRAINT ck_inv_title  CHECK (LEN(title) BETWEEN 2 AND 200),
    CONSTRAINT ck_inv_status CHECK (status IN (N'available', N'borrowed', N'maintenance', N'retired'))
);
GO

IF OBJECT_ID(N'app.impact_log', N'U') IS NULL
CREATE TABLE app.impact_log
(
    id                 uniqueidentifier NOT NULL CONSTRAINT df_imp_id DEFAULT NEWID(),
    user_id            uniqueidentifier NOT NULL,
    community_id       uniqueidentifier NOT NULL,
    action_type        nvarchar(50)     NOT NULL,
    points             int              NOT NULL CONSTRAINT df_imp_points DEFAULT 0,
    co2_kg             decimal(10, 2)   NOT NULL CONSTRAINT df_imp_co2    DEFAULT 0,
    money_saved        decimal(12, 2)   NOT NULL CONSTRAINT df_imp_money  DEFAULT 0,
    related_listing_id uniqueidentifier NULL,
    related_request_id uniqueidentifier NULL,
    related_event_id   uniqueidentifier NULL,
    notes              nvarchar(1000)   NULL,
    created_at         datetime2(3)     NOT NULL CONSTRAINT df_imp_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_impact_log PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_imp_user      FOREIGN KEY (user_id)            REFERENCES app.profiles (id),
    CONSTRAINT fk_imp_community FOREIGN KEY (community_id)       REFERENCES app.communities (id),
    CONSTRAINT fk_imp_listing   FOREIGN KEY (related_listing_id) REFERENCES app.listings (id),
    CONSTRAINT fk_imp_request   FOREIGN KEY (related_request_id) REFERENCES app.requests (id),
    CONSTRAINT fk_imp_event     FOREIGN KEY (related_event_id)   REFERENCES app.events (id)
);
GO

IF OBJECT_ID(N'app.announcements', N'U') IS NULL
CREATE TABLE app.announcements
(
    id           uniqueidentifier NOT NULL CONSTRAINT df_ann_id DEFAULT NEWID(),
    community_id uniqueidentifier NOT NULL,
    author_id    uniqueidentifier NOT NULL,
    title        nvarchar(300)    NOT NULL,
    body         nvarchar(max)    NOT NULL,
    is_pinned    bit              NOT NULL CONSTRAINT df_ann_pinned DEFAULT 0,
    created_at   datetime2(3)     NOT NULL CONSTRAINT df_ann_created DEFAULT SYSUTCDATETIME(),
    updated_at   datetime2(3)     NOT NULL CONSTRAINT df_ann_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_announcements PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_ann_community FOREIGN KEY (community_id) REFERENCES app.communities (id),
    CONSTRAINT fk_ann_author    FOREIGN KEY (author_id)    REFERENCES app.profiles (id)
);
GO

IF OBJECT_ID(N'app.community_milestones', N'U') IS NULL
CREATE TABLE app.community_milestones
(
    id            uniqueidentifier NOT NULL CONSTRAINT df_mil_id DEFAULT NEWID(),
    community_id  uniqueidentifier NOT NULL,
    metric        nvarchar(50)     NOT NULL,
    title         nvarchar(300)    NOT NULL,
    description   nvarchar(1000)   NULL,
    value_display nvarchar(100)    NOT NULL,
    value_numeric decimal(14, 2)   NULL,
    is_pinned     bit              NOT NULL CONSTRAINT df_mil_pinned DEFAULT 0,
    reached_at    datetime2(3)     NOT NULL CONSTRAINT df_mil_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_community_milestones PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT fk_mil_community FOREIGN KEY (community_id) REFERENCES app.communities (id)
);
GO

/*── The UXINDIA / SIGCHI offer ─────────────────────────────────────────────
  sigchi_members is 57 students' personal email addresses. It is readable by
  nobody: the check runs inside app.usp_claim_sigchi_offer, which answers one
  question about one address and never returns the list. SECTION 9 withholds
  SELECT on this table from the application role for that reason.            */

IF OBJECT_ID(N'app.sigchi_members', N'U') IS NULL
CREATE TABLE app.sigchi_members
(
    email     nvarchar(320) NOT NULL,
    full_name nvarchar(200) NOT NULL CONSTRAINT df_sig_name DEFAULT N'',
    added_at  datetime2(3)  NOT NULL CONSTRAINT df_sig_at   DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_sigchi_members PRIMARY KEY CLUSTERED (email)
);
GO

IF OBJECT_ID(N'app.sigchi_offer_config', N'U') IS NULL
CREATE TABLE app.sigchi_offer_config
(
    [key]  nvarchar(64)  NOT NULL,
    value  nvarchar(200) NOT NULL,
    CONSTRAINT pk_sigchi_offer_config PRIMARY KEY CLUSTERED ([key])
);
GO

IF OBJECT_ID(N'app.sigchi_claim_attempts', N'U') IS NULL
CREATE TABLE app.sigchi_claim_attempts
(
    id          bigint           IDENTITY(1, 1) NOT NULL,
    user_id     uniqueidentifier NULL,
    email_tried nvarchar(320)    NOT NULL,
    matched     bit              NOT NULL,
    at          datetime2(3)     NOT NULL CONSTRAINT df_sca_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_sigchi_claim_attempts PRIMARY KEY CLUSTERED (id)
);
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 3 — INDEXES

  All 75 from the Postgres database. Three kinds needed a decision:

  PARTIAL INDEXES carried over as-is. Postgres `WHERE status = 'active'` is a
  SQL Server filtered index with the same clause and the same benefit — most
  of this schema's indexes only ever serve queries about live rows, and the
  filter keeps the dead ones out of the tree.

  GIN TRIGRAM (profiles.email, profiles.full_name, saved_searches.query) has
  NO equivalent. Those three backed "contains" search — LIKE '%maya%' — which
  a B-tree cannot accelerate. They are replaced by ordinary indexes, which help
  a prefix search and nothing else, so member search will scan. At 99 profiles
  that is invisible. Worth revisiting near ~50k rows; the options then are a
  full-text index with CONTAINS, or a computed reversed column for suffix
  search. Written down here so the day it gets slow, the reason is not a
  mystery.

  GIN FULL-TEXT on listings (title + description) becomes a real SQL Server
  full-text index at the end of this section, because listing search is the one
  place where the scan would actually hurt. It is guarded: Full-Text Search is
  an optional feature and on a server without it, CREATE FULLTEXT CATALOG is a
  hard error that would take the whole script down. If it is skipped the
  application still works — the fallback is LIKE.
═══════════════════════════════════════════════════════════════════════════════*/

/*── Clustering ──
  The primary keys are all NONCLUSTERED (random GUIDs), which leaves each of
  these tables a heap unless told otherwise. The feed reads them newest-first,
  so that is what gets the clustered index: rows land at the end on insert and
  come back in order without a sort. */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'cx_listings_posted' AND object_id = OBJECT_ID(N'app.listings'))
CREATE CLUSTERED INDEX cx_listings_posted ON app.listings (posted_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'cx_requests_posted' AND object_id = OBJECT_ID(N'app.requests'))
CREATE CLUSTERED INDEX cx_requests_posted ON app.requests (posted_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'cx_events_starts' AND object_id = OBJECT_ID(N'app.events'))
CREATE CLUSTERED INDEX cx_events_starts ON app.events (starts_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'cx_lf_posted' AND object_id = OBJECT_ID(N'app.lost_found_reports'))
CREATE CLUSTERED INDEX cx_lf_posted ON app.lost_found_reports (posted_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'cx_notifications_user' AND object_id = OBJECT_ID(N'app.notifications'))
CREATE CLUSTERED INDEX cx_notifications_user ON app.notifications (user_id, created_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'cx_comments_entity' AND object_id = OBJECT_ID(N'app.comments'))
CREATE CLUSTERED INDEX cx_comments_entity ON app.comments (entity_type, entity_id, created_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'cx_messages_conversation' AND object_id = OBJECT_ID(N'app.messages'))
CREATE CLUSTERED INDEX cx_messages_conversation ON app.messages (conversation_id, created_at);
GO

/*── Listings ──*/
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_listings_active_posted' AND object_id = OBJECT_ID(N'app.listings'))
CREATE INDEX ix_listings_active_posted ON app.listings (status, posted_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_listings_category_active' AND object_id = OBJECT_ID(N'app.listings'))
CREATE INDEX ix_listings_category_active ON app.listings (category_id, status, posted_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_listings_community_active' AND object_id = OBJECT_ID(N'app.listings'))
CREATE INDEX ix_listings_community_active ON app.listings (community_id, status, posted_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_listings_user_posted' AND object_id = OBJECT_ID(N'app.listings'))
CREATE INDEX ix_listings_user_posted ON app.listings (user_id, posted_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_listings_live_posted' AND object_id = OBJECT_ID(N'app.listings'))
CREATE INDEX ix_listings_live_posted ON app.listings (posted_at DESC) WHERE status = N'active';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_listings_live_type' AND object_id = OBJECT_ID(N'app.listings'))
CREATE INDEX ix_listings_live_type ON app.listings (listing_type, posted_at DESC) WHERE status = N'active';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_listings_opportunity' AND object_id = OBJECT_ID(N'app.listings'))
CREATE INDEX ix_listings_opportunity ON app.listings (opp_role, posted_at DESC) WHERE kind = N'opportunity';
GO

/*── Requests ──*/
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_requests_open_posted' AND object_id = OBJECT_ID(N'app.requests'))
CREATE INDEX ix_requests_open_posted ON app.requests (status, posted_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_requests_community_open' AND object_id = OBJECT_ID(N'app.requests'))
CREATE INDEX ix_requests_community_open ON app.requests (community_id, posted_at DESC) WHERE status = N'open';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_requests_urgency' AND object_id = OBJECT_ID(N'app.requests'))
CREATE INDEX ix_requests_urgency ON app.requests (urgency, posted_at DESC) WHERE status = N'open';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_requests_user_posted' AND object_id = OBJECT_ID(N'app.requests'))
CREATE INDEX ix_requests_user_posted ON app.requests (user_id, posted_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_requests_expires' AND object_id = OBJECT_ID(N'app.requests'))
CREATE INDEX ix_requests_expires ON app.requests (expires_at);
GO

/*── Events ──*/
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_events_status_starts' AND object_id = OBJECT_ID(N'app.events'))
CREATE INDEX ix_events_status_starts ON app.events (status, starts_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_events_organizer_starts' AND object_id = OBJECT_ID(N'app.events'))
CREATE INDEX ix_events_organizer_starts ON app.events (organizer_id, starts_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_events_published' AND object_id = OBJECT_ID(N'app.events'))
CREATE INDEX ix_events_published ON app.events (community_id, starts_at) WHERE status = N'published';
GO

/*── Lost & found ──*/
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_lf_status_posted' AND object_id = OBJECT_ID(N'app.lost_found_reports'))
CREATE INDEX ix_lf_status_posted ON app.lost_found_reports (status, posted_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_lf_community_status' AND object_id = OBJECT_ID(N'app.lost_found_reports'))
CREATE INDEX ix_lf_community_status ON app.lost_found_reports (community_id, status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_lf_user' AND object_id = OBJECT_ID(N'app.lost_found_reports'))
CREATE INDEX ix_lf_user ON app.lost_found_reports (user_id);
GO

/*── Profiles and membership ──*/
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_profiles_community' AND object_id = OBJECT_ID(N'app.profiles'))
CREATE INDEX ix_profiles_community ON app.profiles (community_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_profiles_impact' AND object_id = OBJECT_ID(N'app.profiles'))
CREATE INDEX ix_profiles_impact ON app.profiles (impact_score DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_profiles_college_id' AND object_id = OBJECT_ID(N'app.profiles'))
CREATE INDEX ix_profiles_college_id ON app.profiles (college_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_profiles_department' AND object_id = OBJECT_ID(N'app.profiles'))
CREATE INDEX ix_profiles_department ON app.profiles (department);
GO
/* Was a trigram index. Serves a prefix search now; see the note at the top. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_profiles_email' AND object_id = OBJECT_ID(N'app.profiles'))
CREATE INDEX ix_profiles_email ON app.profiles (email);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_profiles_full_name' AND object_id = OBJECT_ID(N'app.profiles'))
CREATE INDEX ix_profiles_full_name ON app.profiles (full_name);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_community_members_user' AND object_id = OBJECT_ID(N'app.community_members'))
CREATE INDEX ix_community_members_user ON app.community_members (user_id);
GO

/*── Engagement ──*/
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_saves_user' AND object_id = OBJECT_ID(N'app.saves'))
CREATE INDEX ix_saves_user ON app.saves (user_id, saved_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_listing_responses_listing' AND object_id = OBJECT_ID(N'app.listing_responses'))
CREATE INDEX ix_listing_responses_listing ON app.listing_responses (listing_id, created_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_listing_responses_user' AND object_id = OBJECT_ID(N'app.listing_responses'))
CREATE INDEX ix_listing_responses_user ON app.listing_responses (user_id, created_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_request_offers_request' AND object_id = OBJECT_ID(N'app.request_offers'))
CREATE INDEX ix_request_offers_request ON app.request_offers (request_id, created_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_rsvps_user' AND object_id = OBJECT_ID(N'app.event_rsvps'))
CREATE INDEX ix_rsvps_user ON app.event_rsvps (user_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_efr_event' AND object_id = OBJECT_ID(N'app.event_form_responses'))
CREATE INDEX ix_efr_event ON app.event_form_responses (event_id, submitted_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_comments_user' AND object_id = OBJECT_ID(N'app.comments'))
CREATE INDEX ix_comments_user ON app.comments (user_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_comments_parent' AND object_id = OBJECT_ID(N'app.comments'))
CREATE INDEX ix_comments_parent ON app.comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_reactions_entity' AND object_id = OBJECT_ID(N'app.reactions'))
CREATE INDEX ix_reactions_entity ON app.reactions (entity_type, entity_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_reactions_user' AND object_id = OBJECT_ID(N'app.reactions'))
CREATE INDEX ix_reactions_user ON app.reactions (user_id, created_at DESC);
GO

/*── Notifications, alerts, push ──*/
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_notifications_unread' AND object_id = OBJECT_ID(N'app.notifications'))
CREATE INDEX ix_notifications_unread ON app.notifications (user_id, created_at DESC) WHERE is_read = 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_alerts_user_status' AND object_id = OBJECT_ID(N'app.alerts'))
CREATE INDEX ix_alerts_user_status ON app.alerts (user_id, status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_alerts_active_by_cat' AND object_id = OBJECT_ID(N'app.alerts'))
CREATE INDEX ix_alerts_active_by_cat ON app.alerts (category_id) WHERE status = N'active';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_alerts_expiring' AND object_id = OBJECT_ID(N'app.alerts'))
CREATE INDEX ix_alerts_expiring ON app.alerts (expires_at) WHERE status = N'active';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_push_queue_pending' AND object_id = OBJECT_ID(N'app.push_queue'))
CREATE INDEX ix_push_queue_pending ON app.push_queue (created_at) WHERE status = N'pending';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_push_subscriptions_user' AND object_id = OBJECT_ID(N'app.push_subscriptions'))
CREATE INDEX ix_push_subscriptions_user ON app.push_subscriptions (user_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_saved_searches_user' AND object_id = OBJECT_ID(N'app.saved_searches'))
CREATE INDEX ix_saved_searches_user ON app.saved_searches (user_id);
GO

/*── Messaging, moderation, community ──*/
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_conversations_a' AND object_id = OBJECT_ID(N'app.conversations'))
CREATE INDEX ix_conversations_a ON app.conversations (user_a, last_message_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_conversations_b' AND object_id = OBJECT_ID(N'app.conversations'))
CREATE INDEX ix_conversations_b ON app.conversations (user_b, last_message_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_messages_unread' AND object_id = OBJECT_ID(N'app.messages'))
CREATE INDEX ix_messages_unread ON app.messages (conversation_id) WHERE read_at IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_user_blocks_target' AND object_id = OBJECT_ID(N'app.user_blocks'))
CREATE INDEX ix_user_blocks_target ON app.user_blocks (target_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_content_reports_status' AND object_id = OBJECT_ID(N'app.content_reports'))
CREATE INDEX ix_content_reports_status ON app.content_reports (status, created_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_content_reports_target' AND object_id = OBJECT_ID(N'app.content_reports'))
CREATE INDEX ix_content_reports_target ON app.content_reports (target_type, target_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_content_reports_target_user' AND object_id = OBJECT_ID(N'app.content_reports'))
CREATE INDEX ix_content_reports_target_user ON app.content_reports (target_user_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_inventory_community' AND object_id = OBJECT_ID(N'app.inventory_items'))
CREATE INDEX ix_inventory_community ON app.inventory_items (community_id, status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_inventory_owner' AND object_id = OBJECT_ID(N'app.inventory_items'))
CREATE INDEX ix_inventory_owner ON app.inventory_items (owner_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_impact_user' AND object_id = OBJECT_ID(N'app.impact_log'))
CREATE INDEX ix_impact_user ON app.impact_log (user_id, created_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_impact_community' AND object_id = OBJECT_ID(N'app.impact_log'))
CREATE INDEX ix_impact_community ON app.impact_log (community_id, created_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_impact_action' AND object_id = OBJECT_ID(N'app.impact_log'))
CREATE INDEX ix_impact_action ON app.impact_log (action_type);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_announcements_community' AND object_id = OBJECT_ID(N'app.announcements'))
CREATE INDEX ix_announcements_community ON app.announcements (community_id, created_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_milestones_community' AND object_id = OBJECT_ID(N'app.community_milestones'))
CREATE INDEX ix_milestones_community ON app.community_milestones (community_id, reached_at DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_sigchi_attempts_user' AND object_id = OBJECT_ID(N'app.sigchi_claim_attempts'))
CREATE INDEX ix_sigchi_attempts_user ON app.sigchi_claim_attempts (user_id, at DESC);
GO

/*── Full-text search on listings ──
  The one index that is NOT portable and NOT optional-in-spirit: it replaces
  the GIN tsvector index that made listing search fast. Everything below is
  wrapped in a guard because Full-Text Search is a separate feature at install
  time, and on a server without it the CREATE is a hard error — which, in a
  single script, would take the rest of the schema down with it. Skipping it
  costs search speed and nothing else. To add it later, re-run this script.

  A full-text index needs a single-column unique index to key on, which is
  ux_listings_ft below. */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_listings_ft' AND object_id = OBJECT_ID(N'app.listings'))
CREATE UNIQUE INDEX ux_listings_ft ON app.listings (id);
GO

IF SERVERPROPERTY(N'IsFullTextInstalled') = 1
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'wecycle_ft')
        EXEC(N'CREATE FULLTEXT CATALOG wecycle_ft AS DEFAULT');

    IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'app.listings'))
        EXEC(N'CREATE FULLTEXT INDEX ON app.listings (title LANGUAGE 1033, description LANGUAGE 1033)
               KEY INDEX ux_listings_ft ON wecycle_ft WITH CHANGE_TRACKING AUTO');
END
ELSE
BEGIN
    PRINT N'NOTE: Full-Text Search is not installed on this server. Listing search';
    PRINT N'      will fall back to LIKE. Install the feature and re-run to add it.';
END;
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 4 — WHO IS ASKING

  Every ownership rule in the Postgres schema was written against auth.uid(),
  a function GoTrue populated from the JWT. There is no JWT here, so the
  equivalent is SESSION_CONTEXT — a per-connection key/value bag that a query
  can read but cannot forge from inside SQL.

  ── THE CONTRACT THE SERVER MUST KEEP ───────────────────────────────────────

  On EVERY connection checkout, before any other statement:

      EXEC sys.sp_set_session_context @key = N'user_id', @value = <uuid|NULL>;

  Every time. Including for an anonymous request, where the value is NULL.
  This is not a formality: connections are pooled, session context survives
  being returned to the pool, and a request that forgets to set it inherits
  whoever used that connection last. That is a privilege escalation with no
  error message. The data layer in server/sqlserver/db.ts makes it impossible
  to get a connection without going through the code that sets it, which is
  the only safe way to hold this.

  @read_only is deliberately NOT set. Read-only session context cannot be
  changed for the life of the connection, which would mean one connection per
  user forever — useless with a pool.
═══════════════════════════════════════════════════════════════════════════════*/

CREATE OR ALTER FUNCTION app.current_user_id()
RETURNS uniqueidentifier
AS
BEGIN
    RETURN CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id'));
END;
GO

/* The admin roster, kept in the script rather than in a table so that adding
   an admin is a reviewed commit and not an UPDATE somebody ran at night.
   Mirrors public.wecycle_admin_emails() and ADMIN_EMAILS in lib/emailDomain.ts
   — three places, one list, and they have to be changed together. */
CREATE OR ALTER FUNCTION app.admin_emails()
RETURNS TABLE
AS RETURN
(
    SELECT email FROM (VALUES
        (N'wecycle.page@gmail.com'),
        (N'madhav.n.rathi@gmail.com'),
        (N'madhav.smiblr2024@learner.manipal.edu'),   -- Madhav Rathi
        (N'vidhi.smiblr2025@learner.manipal.edu'),    -- Vidhi Nirzar Shah
        (N'kshama.smiblr2024@learner.manipal.edu')    -- kshama
    ) AS e (email)
);
GO

/* Onboarded partners: allowed to sign in without a Manipal address. Mirrors
   public.wecycle_partner_emails() and PARTNER_EMAILS in lib/emailDomain.ts. */
CREATE OR ALTER FUNCTION app.partner_emails()
RETURNS TABLE
AS RETURN
(
    SELECT email FROM (VALUES
        (N'noolucollective.team@gmail.com')           -- Noolu Collective
    ) AS e (email)
);
GO

CREATE OR ALTER FUNCTION app.is_wecycle_admin()
RETURNS bit
AS
BEGIN
    DECLARE @me uniqueidentifier = CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id'));
    IF @me IS NULL RETURN 0;
    RETURN CASE WHEN EXISTS (
        SELECT 1 FROM app.profiles p
        JOIN app.admin_emails a ON a.email = p.email   /* CI collation: LOWER not needed */
        WHERE p.id = @me
    ) THEN 1 ELSE 0 END;
END;
GO

CREATE OR ALTER FUNCTION app.is_suspended(@uid uniqueidentifier)
RETURNS bit
AS
BEGIN
    RETURN CASE WHEN EXISTS (
        SELECT 1 FROM app.profiles
        WHERE id = @uid AND suspended_until > SYSUTCDATETIME()
    ) THEN 1 ELSE 0 END;
END;
GO

CREATE OR ALTER FUNCTION app.is_community_member(@community_id uniqueidentifier)
RETURNS bit
AS
BEGIN
    DECLARE @me uniqueidentifier = CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id'));
    IF @me IS NULL RETURN 0;
    RETURN CASE WHEN EXISTS (
            SELECT 1 FROM app.community_members WHERE community_id = @community_id AND user_id = @me
        ) OR EXISTS (
            SELECT 1 FROM app.profiles WHERE id = @me AND community_id = @community_id
        ) THEN 1 ELSE 0 END;
END;
GO

CREATE OR ALTER FUNCTION app.is_community_admin(@community_id uniqueidentifier)
RETURNS bit
AS
BEGIN
    DECLARE @me uniqueidentifier = CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id'));
    IF @me IS NULL RETURN 0;
    RETURN CASE WHEN EXISTS (
        SELECT 1 FROM app.community_members
        WHERE community_id = @community_id AND user_id = @me AND role IN (N'moderator', N'admin')
    ) THEN 1 ELSE 0 END;
END;
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 5 — CONTENT RULES

  Word folding, the blocked-term check, category normalisation and the Manipal
  email gate. All four existed in Postgres as regex; SQL Server has no regex at
  all, so each one is rebuilt from LIKE, TRANSLATE and a loop. These are the
  functions where a sloppy translation quietly stops enforcing something, so
  what each one has to accept and reject is written next to it.
═══════════════════════════════════════════════════════════════════════════════*/

/* fold_word — the anti-evasion fold. "$hit", "shiiit" and "5h1t" all have to
   land on the same string as "shit" or the word list is decoration.

   Three steps, the same three Postgres did:
     1. lower, then substitute the lookalike characters  (TRANSLATE)
     2. drop everything that is not a-z                  (the loop)
     3. collapse runs of the same letter to one          (the loop)

   Steps 2 and 3 were regexp_replace in Postgres and are one pass of a loop
   here, which is why this reads longer than the original while doing exactly
   the same thing. The @prev test is the run-collapse. */
CREATE OR ALTER FUNCTION app.fold_word(@w nvarchar(400))
RETURNS nvarchar(400)
WITH SCHEMABINDING
AS
BEGIN
    IF @w IS NULL RETURN N'';

    DECLARE @s nvarchar(400) = TRANSLATE(LOWER(@w), N'0134578@$!|+', N'oieastbasiit');
    DECLARE @out nvarchar(400) = N'';
    DECLARE @i int = 1;
    DECLARE @n int = LEN(@s);
    DECLARE @c nchar(1);
    DECLARE @prev nchar(1) = NCHAR(0);

    WHILE @i <= @n
    BEGIN
        SET @c = SUBSTRING(@s, @i, 1);
        /* UNICODE(), not a range comparison: under a case-insensitive
           collation 'A' <= 'z' is true, and accented letters sort inside the
           a-z range. The code point is unambiguous. */
        IF UNICODE(@c) BETWEEN 97 AND 122 AND @c <> @prev
        BEGIN
            SET @out = @out + @c;
            SET @prev = @c;
        END
        ELSE IF UNICODE(@c) BETWEEN 97 AND 122
            SET @prev = @c;          /* a repeat: skipped, but still the prev */
        SET @i = @i + 1;
    END

    RETURN @out;
END;
GO

/* find_objectionable — returns the first blocked term the text contains, or
   NULL. Word-by-word against the folded list, never a substring match on the
   whole string: a substring rule is how a word list ends up rejecting
   "Scunthorpe" and "assignment". */
CREATE OR ALTER FUNCTION app.find_objectionable(@txt nvarchar(max))
RETURNS nvarchar(100)
AS
BEGIN
    IF @txt IS NULL OR LEN(@txt) = 0 RETURN NULL;

    /* Postgres split on \s+; STRING_SPLIT takes one separator, so every kind
       of whitespace becomes a space first and the empties are dropped. */
    DECLARE @flat nvarchar(max) =
        REPLACE(REPLACE(REPLACE(REPLACE(@txt, CHAR(9), N' '), CHAR(10), N' '), CHAR(13), N' '), NCHAR(160), N' ');

    DECLARE @hit nvarchar(100);

    SELECT TOP (1) @hit = t.term
    FROM STRING_SPLIT(@flat, N' ') AS w
    JOIN app.moderation_terms AS t
      ON app.fold_word(t.term) = app.fold_word(CONVERT(nvarchar(400), w.value))
    WHERE LEN(w.value) > 0;

    RETURN @hit;
END;
GO

/* normalize_category_id — the same fallback ladder as normalize_category_id()
   in Postgres and LEGACY in lib/categories.ts. A post with an unrecognised
   category lands in 'hobbies' rather than failing: losing the post is worse
   than filing it imperfectly. */
CREATE OR ALTER FUNCTION app.normalize_category_id(@raw nvarchar(200))
RETURNS nvarchar(64)
AS
BEGIN
    DECLARE @r nvarchar(200) = LTRIM(RTRIM(ISNULL(@raw, N'')));
    IF @r = N'' RETURN NULL;

    DECLARE @v nvarchar(200) = LOWER(@r);

    IF EXISTS (SELECT 1 FROM app.categories WHERE id = @v) RETURN CONVERT(nvarchar(64), @v);

    /* Ids retired by the rewrite, and single-word labels folded into a merged
       category. Matches the first word only, as Postgres did. */
    DECLARE @head nvarchar(200) =
        CASE WHEN CHARINDEX(N' ', @v) > 0 THEN LEFT(@v, CHARINDEX(N' ', @v) - 1) ELSE @v END;

    SET @v = CASE @head
        WHEN N'stationery' THEN N'art'
        WHEN N'clothing'   THEN N'fashion'
        WHEN N'lab'        THEN N'books'
        WHEN N'tools'      THEN N'hobbies'
        WHEN N'other'      THEN N'hobbies'
        ELSE @v END;

    IF EXISTS (SELECT 1 FROM app.categories WHERE id = @v) RETURN CONVERT(nvarchar(64), @v);

    /* A full visible label — "Furniture & Room Essentials" — which is what the
       older forms submitted before they were changed to send ids. */
    DECLARE @byLabel nvarchar(64);
    SELECT TOP (1) @byLabel = id FROM app.categories WHERE label = @r;
    IF @byLabel IS NOT NULL RETURN @byLabel;

    RETURN N'hobbies';
END;
GO

/* is_hostname — what the Postgres gate used a regex for:
       ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$
   Every label must be non-empty, start and end alphanumeric, and contain only
   alphanumerics and hyphens. Rebuilt label by label.

   This exists for one specific attack: without it, an exact-suffix test on
   '.manipal.edu' accepts the domain '.manipal.edu' itself — an empty first
   label, which cannot exist in DNS and so can never receive a confirmation
   code. Mirrors HOSTNAME in lib/emailDomain.ts. */
CREATE OR ALTER FUNCTION app.is_hostname(@d nvarchar(320))
RETURNS bit
AS
BEGIN
    IF @d IS NULL OR LEN(@d) = 0 OR LEN(@d) > 253 RETURN 0;
    IF CHARINDEX(N'..', @d) > 0 OR LEFT(@d, 1) = N'.' OR RIGHT(@d, 1) = N'.' RETURN 0;

    DECLARE @rest nvarchar(320) = @d + N'.';
    DECLARE @label nvarchar(320);
    DECLARE @dot int;

    WHILE LEN(@rest) > 0
    BEGIN
        SET @dot = CHARINDEX(N'.', @rest);
        IF @dot = 0 BREAK;
        SET @label = LEFT(@rest, @dot - 1);
        SET @rest  = SUBSTRING(@rest, @dot + 1, LEN(@rest));

        IF LEN(@label) = 0 OR LEN(@label) > 63 RETURN 0;
        /* First and last character alphanumeric; nothing but alphanumerics and
           hyphens in between. Binary collation so the ranges mean code points,
           not whatever the server collation thinks sorts near 'a'. */
        IF  @label COLLATE Latin1_General_BIN2 LIKE N'[^a-z0-9]%' RETURN 0;
        IF  @label COLLATE Latin1_General_BIN2 LIKE N'%[^a-z0-9]' RETURN 0;
        IF  @label COLLATE Latin1_General_BIN2 LIKE N'%[^a-z0-9-]%' RETURN 0;
    END

    RETURN 1;
END;
GO

/* is_signup_email_allowed — the Manipal gate. Mirrors
   enforce_manipal_signup_email() and lib/emailDomain.ts.

   The rule that matters is the LAST one: an exact suffix test, never a
   "contains". A contains-rule accepts manipal.edu.attacker.net, which is an
   attacker-controlled domain that receives the confirmation code. */
CREATE OR ALTER FUNCTION app.is_signup_email_allowed(@email nvarchar(320))
RETURNS bit
AS
BEGIN
    DECLARE @a nvarchar(320) = LOWER(LTRIM(RTRIM(ISNULL(@email, N''))));

    IF @a = N'' RETURN 1;                     /* no email — nothing to police */

    DECLARE @at int = CHARINDEX(N'@', @a);
    IF @at = 0 RETURN 1;
    DECLARE @domain nvarchar(320) = SUBSTRING(@a, @at + 1, LEN(@a));
    IF @domain = N'' RETURN 1;

    /* Play Console's reviewer, plus the two admin accounts. Mirrors
       DOMAIN_EXEMPT_EMAILS in lib/emailDomain.ts. */
    IF @a IN (N'playreview@wecycle.page', N'wecycle.page@gmail.com', N'madhav.n.rathi@gmail.com')
        RETURN 1;

    IF EXISTS (SELECT 1 FROM app.partner_emails WHERE email = @a) RETURN 1;

    IF app.is_hostname(@domain) = 0 RETURN 0;

    IF  @domain = N'manipal.edu'  OR @domain LIKE N'%.manipal.edu'
     OR @domain = N'manipal.com'  OR @domain LIKE N'%.manipal.com'
        RETURN 1;

    RETURN 0;
END;
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 6 — REMOTE CONFIG AND BANNERS

  These two tables are NEW — they have no Postgres original. They exist to
  answer a question that has nothing to do with SQL Server and everything to do
  with shipping: a change made on the website does not reach the installed
  Android and iOS apps, because those apps run a copy of the web build that was
  frozen when the store build was made.

  The distinction that decides how long a change takes to land:

      CODE   lives in the app bundle. Changing it needs a new build, a new
             store submission, and Apple's review. Days.
      DATA   lives here. The app reads it over the network on launch.
             Changing it reaches every installed app on the next launch.
             Minutes, and no review.

  A banner, a promo, a discount code, which categories exist, whether a feature
  is on — every one of those is a thing somebody will want to change on a
  Tuesday afternoon. None of them should be code. That is what these are for:
  move the decision out of the bundle and into a row, and the same change
  reaches web, Android and iOS at once.

  What this CANNOT do is change the app's own chrome — a bundled SVG icon
  component, the launcher icon, the splash screen, a new screen. Those are
  code, and code needs a release. See db/README.md for the full picture.
═══════════════════════════════════════════════════════════════════════════════*/

IF OBJECT_ID(N'app.app_config', N'U') IS NULL
CREATE TABLE app.app_config
(
    [key]        nvarchar(100) NOT NULL,
    value        nvarchar(max) NOT NULL,          /* JSON — object, array or scalar */
    description  nvarchar(500) NULL,

    /* Targeting. NULL means "everyone". min_build lets a value be held back
       from older installs that would not understand it, which is the thing
       that makes remote config safe to use on a native app: the 1.2.3 build
       in someone's pocket in six months still has to render whatever is in
       this row, and it can only render shapes it already knows. */
    platform     nvarchar(20)  NULL,
    min_build    int           NULL,

    updated_at   datetime2(3)  NOT NULL CONSTRAINT df_cfg_updated DEFAULT SYSUTCDATETIME(),
    updated_by   uniqueidentifier NULL,

    CONSTRAINT pk_app_config PRIMARY KEY CLUSTERED ([key]),
    CONSTRAINT fk_cfg_user  FOREIGN KEY (updated_by) REFERENCES app.profiles (id),
    CONSTRAINT ck_cfg_json  CHECK (ISJSON(value) = 1),
    CONSTRAINT ck_cfg_plat  CHECK (platform IS NULL OR platform IN (N'web', N'ios', N'android'))
);
GO

IF OBJECT_ID(N'app.banners', N'U') IS NULL
CREATE TABLE app.banners
(
    id            uniqueidentifier NOT NULL CONSTRAINT df_bnr_id DEFAULT NEWID(),
    slot          nvarchar(50)     NOT NULL,      /* 'home_top' today; room for more */

    title         nvarchar(200)    NOT NULL,
    subtitle      nvarchar(300)    NULL,
    eyebrow       nvarchar(100)    NULL,
    cta_label     nvarchar(60)     NULL,

    /* A URL, not a bundled asset, so the artwork can change without a build.
       An https URL the app fetches — never a local path, which would only
       exist in whichever build happened to ship it. */
    image_url     nvarchar(500)    NULL,
    bg_color      nvarchar(20)     NULL,
    text_color    nvarchar(20)     NULL,

    /* Where tapping it goes. 'screen' names a screen the app already has;
       'url' opens a link. A banner can only ever point at something the
       installed build can already render — see min_build. */
    action_kind   nvarchar(20)     NOT NULL CONSTRAINT df_bnr_action DEFAULT N'none',
    action_value  nvarchar(500)    NULL,

    priority      int              NOT NULL CONSTRAINT df_bnr_priority DEFAULT 100,
    is_active     bit              NOT NULL CONSTRAINT df_bnr_active   DEFAULT 1,
    starts_at     datetime2(3)     NULL,
    ends_at       datetime2(3)     NULL,
    platform      nvarchar(20)     NULL,
    min_build     int              NULL,

    created_at    datetime2(3)     NOT NULL CONSTRAINT df_bnr_created DEFAULT SYSUTCDATETIME(),
    updated_at    datetime2(3)     NOT NULL CONSTRAINT df_bnr_updated DEFAULT SYSUTCDATETIME(),

    CONSTRAINT pk_banners PRIMARY KEY NONCLUSTERED (id),
    CONSTRAINT ck_bnr_action CHECK (action_kind IN (N'none', N'screen', N'url', N'event')),
    CONSTRAINT ck_bnr_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
    CONSTRAINT ck_bnr_plat   CHECK (platform IS NULL OR platform IN (N'web', N'ios', N'android'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_banners_live' AND object_id = OBJECT_ID(N'app.banners'))
CREATE INDEX ix_banners_live ON app.banners (slot, priority) WHERE is_active = 1;
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 7 — VIEWS

  feed_view is the one that carries weight: it is how six different kinds of
  post become one ordered stream. Its `data` column was jsonb_build_object in
  Postgres — the per-kind fields the card needs, packed into one column so the
  union can line up. Here that is FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, which
  produces the same object.

  One thing to watch: the columns already holding JSON (photo_urls, tags) are
  wrapped in JSON_QUERY. Without it, SQL Server treats the string as a string
  and escapes every quote in it, and the client gets "[\"a.jpg\"]" instead of
  ["a.jpg"] — a bug that looks like corrupt data and is really just a missing
  four-letter function.
═══════════════════════════════════════════════════════════════════════════════*/

CREATE OR ALTER VIEW app.feed_view
AS
SELECT
    l.id,
    CONVERT(nvarchar(20), N'listing') AS entity_type,
    l.user_id      AS author_id,
    l.community_id,
    l.title,
    l.description  AS body,
    l.posted_at,
    l.response_count,
    l.save_count,
    (SELECT l.listing_type          AS listing_type,
            l.condition             AS [condition],
            l.price                 AS price,
            l.location              AS location,
            JSON_QUERY(l.photo_urls) AS photo_urls,
            l.photo_color           AS photo_color,
            l.photo_icon            AS photo_icon,
            l.category_id           AS category_id,
            JSON_QUERY(l.tags)      AS tags
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS data
FROM app.listings AS l
WHERE l.status = N'active'

UNION ALL
SELECT
    r.id,
    CONVERT(nvarchar(20), N'request'),
    r.user_id,
    r.community_id,
    r.title,
    r.description,
    r.posted_at,
    r.offer_count,
    0,
    (SELECT r.urgency      AS urgency,
            r.need_by_date AS need_by_date,
            r.category_id  AS category_id
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
FROM app.requests AS r
WHERE r.status = N'open'

UNION ALL
SELECT
    e.id,
    CONVERT(nvarchar(20), N'event'),
    e.organizer_id,
    e.community_id,
    e.title,
    e.description,
    e.created_at,
    e.attendee_count,
    0,
    (SELECT e.event_type    AS event_type,
            e.color_accent  AS color_accent,
            e.starts_at     AS starts_at,
            e.ends_at       AS ends_at,
            e.location      AS location,
            e.max_attendees AS max_attendees,
            e.cover_url     AS cover_url
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
FROM app.events AS e
WHERE e.status = N'published'

UNION ALL
SELECT
    lf.id,
    CONVERT(nvarchar(20), N'lost_found'),
    lf.user_id,
    lf.community_id,
    lf.title,
    lf.description,
    lf.posted_at,
    0,
    0,
    (SELECT lf.status                 AS status,
            lf.last_seen              AS last_seen,
            lf.last_seen_date         AS last_seen_date,
            JSON_QUERY(lf.photo_urls) AS photo_urls,
            lf.photo_color            AS photo_color,
            lf.photo_icon             AS photo_icon,
            lf.reward                 AS reward,
            lf.verified               AS verified
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
FROM app.lost_found_reports AS lf

UNION ALL
SELECT
    cm.id,
    CONVERT(nvarchar(20), N'milestone'),
    NULL,
    cm.community_id,
    cm.title,
    cm.description,
    cm.reached_at,
    0,
    0,
    (SELECT cm.metric        AS metric,
            cm.value_display AS value_display,
            cm.value_numeric AS value_numeric,
            cm.is_pinned     AS is_pinned
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
FROM app.community_milestones AS cm

UNION ALL
SELECT
    a.id,
    CONVERT(nvarchar(20), N'announcement'),
    a.author_id,
    a.community_id,
    a.title,
    a.body,
    a.created_at,
    0,
    0,
    (SELECT a.is_pinned AS is_pinned
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
FROM app.announcements AS a;
GO

CREATE OR ALTER VIEW app.leaderboard_view
AS
SELECT
    p.id AS user_id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.avatar_color,
    p.initials,
    p.role,
    p.community_id,
    p.impact_score,
    p.items_shared_count,
    p.items_received_count,
    p.co2_saved_kg,
    RANK() OVER (PARTITION BY p.community_id ORDER BY p.impact_score DESC) AS community_rank,
    RANK() OVER (ORDER BY p.impact_score DESC)                             AS global_rank
FROM app.profiles AS p
WHERE p.impact_score > 0;
GO

/* The one-screen answer to "how is Wecycle actually doing". Every figure is a
   count over a small table; it is read by hand, not by the app, so the cost of
   the scans does not matter. */
CREATE OR ALTER VIEW app.founder_metrics
AS
SELECT
    b.members,
    b.members_active_7d,
    b.members_active_30d,
    b.listings_total,
    b.listings_active,
    b.listings_free,
    b.listings_last_7d,
    b.members_who_posted,
    b.requests,
    b.events,
    b.rsvps,
    b.lost_found,
    b.comments,
    b.saves,
    b.listing_views,
    ROUND(100.0 * b.members_who_posted / NULLIF(b.members, 0), 1)         AS pct_members_posting,
    ROUND(100.0 * b.listings_free      / NULLIF(b.listings_total, 0), 1)  AS pct_listings_free,
    ROUND(1.0   * b.listings_total     / NULLIF(b.members_who_posted, 0), 2) AS listings_per_poster,
    ROUND(1.0   * b.listing_views      / NULLIF(b.listings_total, 0), 1)  AS views_per_listing,
    ROUND(100.0 * b.members_active_7d  / NULLIF(b.members, 0), 1)         AS pct_active_7d
FROM (
    SELECT
        (SELECT COUNT(*) FROM app.profiles) AS members,
        (SELECT COUNT(*) FROM app.profiles WHERE last_active_at > DATEADD(day,  -7, SYSUTCDATETIME())) AS members_active_7d,
        (SELECT COUNT(*) FROM app.profiles WHERE last_active_at > DATEADD(day, -30, SYSUTCDATETIME())) AS members_active_30d,
        (SELECT COUNT(*) FROM app.listings) AS listings_total,
        (SELECT COUNT(*) FROM app.listings WHERE status = N'active') AS listings_active,
        (SELECT COUNT(*) FROM app.listings WHERE listing_type = N'free') AS listings_free,
        (SELECT COUNT(*) FROM app.listings WHERE posted_at > DATEADD(day, -7, SYSUTCDATETIME())) AS listings_last_7d,
        (SELECT COUNT(DISTINCT user_id) FROM app.listings) AS members_who_posted,
        (SELECT COUNT(*) FROM app.requests) AS requests,
        (SELECT COUNT(*) FROM app.events) AS events,
        (SELECT COUNT(*) FROM app.event_rsvps WHERE status = N'going') AS rsvps,
        (SELECT COUNT(*) FROM app.lost_found_reports) AS lost_found,
        (SELECT COUNT(*) FROM app.comments) AS comments,
        (SELECT COUNT(*) FROM app.saves) AS saves,
        (SELECT ISNULL(SUM(CONVERT(bigint, view_count)), 0) FROM app.listings) AS listing_views
) AS b;
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 8 — TRIGGERS

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  READ THIS BEFORE EDITING ANY TRIGGER IN THIS SECTION                    │
  │                                                                          │
  │  A Postgres trigger declared FOR EACH ROW runs once per row and gets      │
  │  `new` and `old`. A SQL Server trigger runs ONCE PER STATEMENT and gets   │
  │  two tables, `inserted` and `deleted`, holding EVERY affected row.        │
  │                                                                          │
  │  Translating one to the other by pulling a single row out of `inserted`   │
  │  — SELECT @x = col FROM inserted — works perfectly in every hand test and │
  │  then silently does one row's worth of work the first time real code      │
  │  updates two rows at once. Counters drift, notifications go missing, and  │
  │  nothing errors.                                                         │
  │                                                                          │
  │  So every trigger below is written as a set operation over `inserted`     │
  │  and `deleted`. No local row variables, no cursors, no loops.             │
  └─────────────────────────────────────────────────────────────────────────┘

  Two more differences that shaped what is here:

  THERE IS NO BEFORE TRIGGER. Postgres validated in BEFORE INSERT and simply
  refused the row. SQL Server has AFTER (the row is already in; THROW rolls the
  transaction back) and INSTEAD OF (replaces the statement). AFTER + THROW is
  used, because the outcome is identical — nothing is committed — and it keeps
  the trigger readable.

  COUNTERS CLAMP AT ZERO. Every `+ delta` is wrapped in a CASE that floors it,
  exactly as Postgres used greatest(0, …). A counter that goes negative renders
  as "-1 saves" forever, and no later correct insert repairs it.
═══════════════════════════════════════════════════════════════════════════════*/

/*── updated_at ──
  Postgres had one set_updated_at() shared by ten tables. SQL Server binds a
  trigger to one table, so it is ten near-identical triggers. They do not
  recurse: RECURSIVE_TRIGGERS is off by default, so the UPDATE a trigger runs
  against its own table does not fire it again. */

CREATE OR ALTER TRIGGER app.tr_communities_touch ON app.communities AFTER UPDATE
AS BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(updated_at)
        UPDATE c SET updated_at = SYSUTCDATETIME()
        FROM app.communities AS c JOIN inserted AS i ON i.id = c.id;
END;
GO

CREATE OR ALTER TRIGGER app.tr_profiles_touch ON app.profiles AFTER UPDATE
AS BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(updated_at)
        UPDATE p SET updated_at = SYSUTCDATETIME()
        FROM app.profiles AS p JOIN inserted AS i ON i.id = p.id;
END;
GO

CREATE OR ALTER TRIGGER app.tr_inventory_touch ON app.inventory_items AFTER UPDATE
AS BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(updated_at)
        UPDATE t SET updated_at = SYSUTCDATETIME()
        FROM app.inventory_items AS t JOIN inserted AS i ON i.id = t.id;
END;
GO

CREATE OR ALTER TRIGGER app.tr_announcements_touch ON app.announcements AFTER UPDATE
AS BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(updated_at)
        UPDATE t SET updated_at = SYSUTCDATETIME()
        FROM app.announcements AS t JOIN inserted AS i ON i.id = t.id;
END;
GO

CREATE OR ALTER TRIGGER app.tr_event_forms_touch ON app.event_forms AFTER UPDATE
AS BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(updated_at)
        UPDATE t SET updated_at = SYSUTCDATETIME()
        FROM app.event_forms AS t JOIN inserted AS i ON i.id = t.id;
END;
GO

/*── Counters ──
  One shape, six tables: build a per-parent delta from inserted (+1) and
  deleted (-1), aggregate it, apply it once. This is correct for a single-row
  insert, a bulk insert, a bulk delete, and an UPDATE that moves rows between
  parents — all of which produce the right delta without special-casing. */

CREATE OR ALTER TRIGGER app.tr_saves_count ON app.saves AFTER INSERT, DELETE
AS BEGIN
    SET NOCOUNT ON;
    UPDATE l
       SET save_count = CASE WHEN l.save_count + d.delta < 0 THEN 0 ELSE l.save_count + d.delta END
    FROM app.listings AS l
    JOIN (
        SELECT listing_id, SUM(delta) AS delta
        FROM (SELECT listing_id, 1 AS delta FROM inserted
              UNION ALL
              SELECT listing_id, -1      FROM deleted) AS x
        GROUP BY listing_id
    ) AS d ON d.listing_id = l.id
    WHERE d.delta <> 0;
END;
GO

CREATE OR ALTER TRIGGER app.tr_event_saves_count ON app.event_saves AFTER INSERT, DELETE
AS BEGIN
    SET NOCOUNT ON;
    UPDATE e
       SET save_count = CASE WHEN e.save_count + d.delta < 0 THEN 0 ELSE e.save_count + d.delta END
    FROM app.events AS e
    JOIN (
        SELECT event_id, SUM(delta) AS delta
        FROM (SELECT event_id, 1 AS delta FROM inserted
              UNION ALL
              SELECT event_id, -1       FROM deleted) AS x
        GROUP BY event_id
    ) AS d ON d.event_id = e.id
    WHERE d.delta <> 0;
END;
GO

/* Only 'going' counts, so an RSVP changed from going to maybe is -1 and the
   reverse is +1 — which falls out of the filter rather than needing the
   three-branch IF the Postgres version had. */
CREATE OR ALTER TRIGGER app.tr_rsvps_count ON app.event_rsvps AFTER INSERT, UPDATE, DELETE
AS BEGIN
    SET NOCOUNT ON;
    UPDATE e
       SET attendee_count = CASE WHEN e.attendee_count + d.delta < 0 THEN 0 ELSE e.attendee_count + d.delta END
    FROM app.events AS e
    JOIN (
        SELECT event_id, SUM(delta) AS delta
        FROM (SELECT event_id, 1 AS delta FROM inserted WHERE status = N'going'
              UNION ALL
              SELECT event_id, -1       FROM deleted  WHERE status = N'going') AS x
        GROUP BY event_id
    ) AS d ON d.event_id = e.id
    WHERE d.delta <> 0;
END;
GO

CREATE OR ALTER TRIGGER app.tr_listing_responses_count ON app.listing_responses AFTER INSERT, DELETE
AS BEGIN
    SET NOCOUNT ON;
    UPDATE l
       SET response_count = CASE WHEN l.response_count + d.delta < 0 THEN 0 ELSE l.response_count + d.delta END
    FROM app.listings AS l
    JOIN (
        SELECT listing_id, SUM(delta) AS delta
        FROM (SELECT listing_id, 1 AS delta FROM inserted
              UNION ALL
              SELECT listing_id, -1      FROM deleted) AS x
        GROUP BY listing_id
    ) AS d ON d.listing_id = l.id
    WHERE d.delta <> 0;
END;
GO

CREATE OR ALTER TRIGGER app.tr_request_offers_count ON app.request_offers AFTER INSERT, DELETE
AS BEGIN
    SET NOCOUNT ON;
    UPDATE r
       SET offer_count = CASE WHEN r.offer_count + d.delta < 0 THEN 0 ELSE r.offer_count + d.delta END
    FROM app.requests AS r
    JOIN (
        SELECT request_id, SUM(delta) AS delta
        FROM (SELECT request_id, 1 AS delta FROM inserted
              UNION ALL
              SELECT request_id, -1      FROM deleted) AS x
        GROUP BY request_id
    ) AS d ON d.request_id = r.id
    WHERE d.delta <> 0;
END;
GO

CREATE OR ALTER TRIGGER app.tr_members_count ON app.community_members AFTER INSERT, DELETE
AS BEGIN
    SET NOCOUNT ON;
    UPDATE c
       SET member_count = CASE WHEN c.member_count + d.delta < 0 THEN 0 ELSE c.member_count + d.delta END
    FROM app.communities AS c
    JOIN (
        SELECT community_id, SUM(delta) AS delta
        FROM (SELECT community_id, 1 AS delta FROM inserted
              UNION ALL
              SELECT community_id, -1      FROM deleted) AS x
        GROUP BY community_id
    ) AS d ON d.community_id = c.id
    WHERE d.delta <> 0;
END;
GO

/* Replies, plus updated_at and the blocked-word check, in one trigger on
   comments — they all have to run on the same statement and this keeps the
   order visible instead of leaving it to trigger-firing order. */
CREATE OR ALTER TRIGGER app.tr_comments_biz ON app.comments AFTER INSERT, UPDATE, DELETE
AS BEGIN
    SET NOCOUNT ON;

    DECLARE @is_insert bit = CASE WHEN EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) THEN 1 ELSE 0 END;

    IF EXISTS (SELECT 1 FROM inserted)
    BEGIN
        DECLARE @bad nvarchar(100);
        SELECT TOP (1) @bad = app.find_objectionable(i.body) FROM inserted AS i
        WHERE app.find_objectionable(i.body) IS NOT NULL;
        IF @bad IS NOT NULL
            THROW 50010, N'That wording isn''t allowed on Wecycle. Please reword and try again.', 1;
    END

    IF @is_insert = 1 AND EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN app.profiles AS p ON p.id = i.user_id
        WHERE p.suspended_until > SYSUTCDATETIME())
        THROW 50011, N'Your account is suspended. Contact wecycle.page@gmail.com if you believe this is a mistake.', 1;

    UPDATE c
       SET reply_count = CASE WHEN c.reply_count + d.delta < 0 THEN 0 ELSE c.reply_count + d.delta END
    FROM app.comments AS c
    JOIN (
        SELECT parent_comment_id, SUM(delta) AS delta
        FROM (SELECT parent_comment_id, 1 AS delta FROM inserted WHERE parent_comment_id IS NOT NULL
              UNION ALL
              SELECT parent_comment_id, -1      FROM deleted  WHERE parent_comment_id IS NOT NULL) AS x
        GROUP BY parent_comment_id
    ) AS d ON d.parent_comment_id = c.id
    WHERE d.delta <> 0;

    IF @is_insert = 0 AND EXISTS (SELECT 1 FROM inserted) AND NOT UPDATE(updated_at)
        UPDATE c SET updated_at = SYSUTCDATETIME()
        FROM app.comments AS c JOIN inserted AS i ON i.id = c.id;
END;
GO

/*── Content rules: blocked words, suspended authors, updated_at ──

  ┌─ ONE BEHAVIOUR MOVED, ON PURPOSE ───────────────────────────────────────┐
  │ Postgres normalised category_id in a BEFORE trigger, so a post carrying  │
  │ a retired id ("stationery") or a full label ("Furniture & Room           │
  │ Essentials") was quietly repaired on its way in and landed safely. That  │
  │ was a product decision — land the post rather than lose it — and it is   │
  │ worth keeping.                                                          │
  │                                                                          │
  │ It cannot be a trigger here. SQL Server checks foreign keys BEFORE AFTER │
  │ triggers run, so by the time a trigger could repair the value, the FK to │
  │ app.categories has already rejected the row. There is no BEFORE trigger  │
  │ to move it to.                                                          │
  │                                                                          │
  │ So it moved INTO THE WRITE PATH: app.usp_create_listing and the other    │
  │ write procedures call app.normalize_category_id() before inserting, and  │
  │ those procedures are the supported way to write. A raw INSERT that skips │
  │ them does not lose the post silently — it fails loudly on the foreign    │
  │ key, which is the safe direction to fail in.                            │
  └──────────────────────────────────────────────────────────────────────────┘

  The blocked-word check reproduces reject_objectionable_content(): the same
  columns per table, the same fold, the same refusal. */

CREATE OR ALTER TRIGGER app.tr_listings_biz ON app.listings AFTER INSERT, UPDATE
AS BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    IF EXISTS (SELECT 1 FROM inserted AS i
               WHERE app.find_objectionable(i.title)       IS NOT NULL
                  OR app.find_objectionable(i.description) IS NOT NULL
                  OR app.find_objectionable(i.location)    IS NOT NULL)
        THROW 50010, N'That wording isn''t allowed on Wecycle. Please reword and try again.', 1;

    IF NOT EXISTS (SELECT 1 FROM deleted)
       AND EXISTS (SELECT 1 FROM inserted AS i
                   JOIN app.profiles AS p ON p.id = i.user_id
                   WHERE p.suspended_until > SYSUTCDATETIME())
        THROW 50011, N'Your account is suspended. Contact wecycle.page@gmail.com if you believe this is a mistake.', 1;

    IF EXISTS (SELECT 1 FROM deleted) AND NOT UPDATE(updated_at)
        UPDATE l SET updated_at = SYSUTCDATETIME()
        FROM app.listings AS l JOIN inserted AS i ON i.id = l.id;
END;
GO

CREATE OR ALTER TRIGGER app.tr_requests_biz ON app.requests AFTER INSERT, UPDATE
AS BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    IF EXISTS (SELECT 1 FROM inserted AS i
               WHERE app.find_objectionable(i.title)       IS NOT NULL
                  OR app.find_objectionable(i.description) IS NOT NULL)
        THROW 50010, N'That wording isn''t allowed on Wecycle. Please reword and try again.', 1;

    IF NOT EXISTS (SELECT 1 FROM deleted)
       AND EXISTS (SELECT 1 FROM inserted AS i
                   JOIN app.profiles AS p ON p.id = i.user_id
                   WHERE p.suspended_until > SYSUTCDATETIME())
        THROW 50011, N'Your account is suspended. Contact wecycle.page@gmail.com if you believe this is a mistake.', 1;

    IF EXISTS (SELECT 1 FROM deleted) AND NOT UPDATE(updated_at)
        UPDATE r SET updated_at = SYSUTCDATETIME()
        FROM app.requests AS r JOIN inserted AS i ON i.id = r.id;
END;
GO

CREATE OR ALTER TRIGGER app.tr_events_biz ON app.events AFTER INSERT, UPDATE
AS BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    IF EXISTS (SELECT 1 FROM inserted AS i
               WHERE app.find_objectionable(i.title)       IS NOT NULL
                  OR app.find_objectionable(i.description) IS NOT NULL
                  OR app.find_objectionable(i.location)    IS NOT NULL)
        THROW 50010, N'That wording isn''t allowed on Wecycle. Please reword and try again.', 1;

    IF NOT EXISTS (SELECT 1 FROM deleted)
       AND EXISTS (SELECT 1 FROM inserted AS i
                   JOIN app.profiles AS p ON p.id = i.organizer_id
                   WHERE p.suspended_until > SYSUTCDATETIME())
        THROW 50011, N'Your account is suspended. Contact wecycle.page@gmail.com if you believe this is a mistake.', 1;

    IF EXISTS (SELECT 1 FROM deleted) AND NOT UPDATE(updated_at)
        UPDATE e SET updated_at = SYSUTCDATETIME()
        FROM app.events AS e JOIN inserted AS i ON i.id = e.id;
END;
GO

CREATE OR ALTER TRIGGER app.tr_lost_found_biz ON app.lost_found_reports AFTER INSERT, UPDATE
AS BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    IF EXISTS (SELECT 1 FROM inserted AS i
               WHERE app.find_objectionable(i.title)       IS NOT NULL
                  OR app.find_objectionable(i.description) IS NOT NULL
                  OR app.find_objectionable(i.last_seen)   IS NOT NULL
                  OR app.find_objectionable(i.reward)      IS NOT NULL)
        THROW 50010, N'That wording isn''t allowed on Wecycle. Please reword and try again.', 1;

    IF NOT EXISTS (SELECT 1 FROM deleted)
       AND EXISTS (SELECT 1 FROM inserted AS i
                   JOIN app.profiles AS p ON p.id = i.user_id
                   WHERE p.suspended_until > SYSUTCDATETIME())
        THROW 50011, N'Your account is suspended. Contact wecycle.page@gmail.com if you believe this is a mistake.', 1;

    IF EXISTS (SELECT 1 FROM deleted) AND NOT UPDATE(updated_at)
        UPDATE t SET updated_at = SYSUTCDATETIME()
        FROM app.lost_found_reports AS t JOIN inserted AS i ON i.id = t.id;
END;
GO

/* Profiles: the word check runs on the two fields a member can write freely,
   and the community sync mirrors sync_profile_to_member(). */
CREATE OR ALTER TRIGGER app.tr_profiles_biz ON app.profiles AFTER INSERT, UPDATE
AS BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    IF EXISTS (SELECT 1 FROM inserted AS i
               WHERE app.find_objectionable(i.full_name) IS NOT NULL
                  OR app.find_objectionable(i.bio)       IS NOT NULL)
        THROW 50010, N'That wording isn''t allowed on Wecycle. Please reword and try again.', 1;

    /* Joining a community also makes you a member of it. The NOT EXISTS is the
       ON CONFLICT DO NOTHING the Postgres version had. */
    INSERT INTO app.community_members (community_id, user_id, role)
    SELECT i.community_id, i.id, N'member'
    FROM inserted AS i
    LEFT JOIN deleted AS d ON d.id = i.id
    WHERE i.community_id IS NOT NULL
      AND (d.id IS NULL OR d.community_id IS NULL OR d.community_id <> i.community_id)
      AND NOT EXISTS (SELECT 1 FROM app.community_members AS m
                      WHERE m.community_id = i.community_id AND m.user_id = i.id);
END;
GO

/*── Impact accrual ──
  Postgres ran this once per impact_log row. Here one statement's worth of rows
  is aggregated per member and per community first, then applied in two UPDATEs
  — same arithmetic, one pass. */
CREATE OR ALTER TRIGGER app.tr_impact_accrue ON app.impact_log AFTER INSERT
AS BEGIN
    SET NOCOUNT ON;

    UPDATE p
       SET impact_score         = p.impact_score         + a.points,
           co2_saved_kg         = p.co2_saved_kg         + a.co2,
           money_saved          = p.money_saved          + a.money,
           items_shared_count   = p.items_shared_count   + a.shared,
           items_received_count = p.items_received_count + a.received,
           repairs_helped_count = p.repairs_helped_count + a.repairs
    FROM app.profiles AS p
    JOIN (
        SELECT user_id,
               SUM(points)      AS points,
               SUM(co2_kg)      AS co2,
               SUM(money_saved) AS money,
               SUM(CASE WHEN action_type = N'item_shared'   THEN 1 ELSE 0 END) AS shared,
               SUM(CASE WHEN action_type = N'item_received' THEN 1 ELSE 0 END) AS received,
               SUM(CASE WHEN action_type = N'repair_helped' THEN 1 ELSE 0 END) AS repairs
        FROM inserted GROUP BY user_id
    ) AS a ON a.user_id = p.id;

    UPDATE c
       SET items_circulated = c.items_circulated + a.circulated,
           co2_saved_kg     = c.co2_saved_kg     + a.co2
    FROM app.communities AS c
    JOIN (
        SELECT community_id,
               SUM(CASE WHEN action_type IN (N'item_shared', N'item_received') THEN 1 ELSE 0 END) AS circulated,
               SUM(co2_kg) AS co2
        FROM inserted GROUP BY community_id
    ) AS a ON a.community_id = c.id;
END;
GO

/*── Conversations keep their own summary line ──*/
CREATE OR ALTER TRIGGER app.tr_messages_touch ON app.messages AFTER INSERT
AS BEGIN
    SET NOCOUNT ON;
    /* A batch could hold several messages for one conversation; only the
       newest should become the preview. ROW_NUMBER picks it. */
    UPDATE c
       SET last_message    = LEFT(n.body, 140),
           last_message_at = n.created_at,
           last_sender_id  = n.sender_id
    FROM app.conversations AS c
    JOIN (
        SELECT conversation_id, body, created_at, sender_id,
               ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at DESC, id DESC) AS rn
        FROM inserted
    ) AS n ON n.conversation_id = c.id AND n.rn = 1;
END;
GO

/*── Notifications ──
  Seven triggers, one rule they all share: never notify someone about their own
  action. Postgres put that rule in create_notification(), which returned early
  when _user_id = _actor_id. Here it is a WHERE clause on each INSERT…SELECT —
  same rule, and visible at every site rather than hidden one call away. */

CREATE OR ALTER TRIGGER app.tr_notify_listing_response ON app.listing_responses AFTER INSERT
AS BEGIN
    SET NOCOUNT ON;
    INSERT INTO app.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    SELECT l.user_id, i.user_id, N'response_received', N'listing', i.listing_id,
           COALESCE(p.full_name, p.username, N'Someone') + N' is interested in your item',
           l.title
    FROM inserted AS i
    JOIN app.listings  AS l ON l.id = i.listing_id
    LEFT JOIN app.profiles AS p ON p.id = i.user_id
    WHERE l.user_id <> i.user_id;
END;
GO

CREATE OR ALTER TRIGGER app.tr_notify_request_offer ON app.request_offers AFTER INSERT
AS BEGIN
    SET NOCOUNT ON;
    INSERT INTO app.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    SELECT r.user_id, i.user_id, N'request_help_offered', N'request', i.request_id,
           COALESCE(p.full_name, p.username, N'Someone') + N' offered to help',
           r.title
    FROM inserted AS i
    JOIN app.requests  AS r ON r.id = i.request_id
    LEFT JOIN app.profiles AS p ON p.id = i.user_id
    WHERE r.user_id <> i.user_id;
END;
GO

CREATE OR ALTER TRIGGER app.tr_notify_rsvp ON app.event_rsvps AFTER INSERT
AS BEGIN
    SET NOCOUNT ON;
    INSERT INTO app.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    SELECT e.organizer_id, i.user_id, N'event_rsvp', N'event', i.event_id,
           COALESCE(p.full_name, p.username, N'Someone') + N' is going to your event',
           e.title
    FROM inserted AS i
    JOIN app.events    AS e ON e.id = i.event_id
    LEFT JOIN app.profiles AS p ON p.id = i.user_id
    WHERE i.status = N'going' AND e.organizer_id <> i.user_id;
END;
GO

/* entity_type points at one of five tables, so the owner and the title come
   from a five-way LEFT JOIN collapsed with COALESCE. Exactly one of the five
   matches, because entity_type says which. */
CREATE OR ALTER TRIGGER app.tr_notify_comment ON app.comments AFTER INSERT
AS BEGIN
    SET NOCOUNT ON;
    INSERT INTO app.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    SELECT t.owner_id, t.actor_id, N'item_commented', t.entity_type, t.entity_id,
           COALESCE(ap.full_name, ap.username, N'Someone') + N' commented on your post',
           t.title
    FROM (
        SELECT i.user_id AS actor_id, i.entity_type, i.entity_id,
               COALESCE(l.user_id, r.user_id, e.organizer_id, lf.user_id, an.author_id) AS owner_id,
               COALESCE(l.title,   r.title,   e.title,        lf.title,   an.title)     AS title
        FROM inserted AS i
        LEFT JOIN app.listings           AS l  ON i.entity_type = N'listing'      AND l.id  = i.entity_id
        LEFT JOIN app.requests           AS r  ON i.entity_type = N'request'      AND r.id  = i.entity_id
        LEFT JOIN app.events             AS e  ON i.entity_type = N'event'        AND e.id  = i.entity_id
        LEFT JOIN app.lost_found_reports AS lf ON i.entity_type = N'lost_found'   AND lf.id = i.entity_id
        LEFT JOIN app.announcements      AS an ON i.entity_type = N'announcement' AND an.id = i.entity_id
    ) AS t
    LEFT JOIN app.profiles AS ap ON ap.id = t.actor_id
    WHERE t.owner_id IS NOT NULL AND t.owner_id <> t.actor_id;
END;
GO

CREATE OR ALTER TRIGGER app.tr_notify_reaction ON app.reactions AFTER INSERT
AS BEGIN
    SET NOCOUNT ON;
    INSERT INTO app.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    SELECT t.owner_id, t.actor_id, N'item_liked', t.entity_type, t.entity_id,
           COALESCE(ap.full_name, ap.username, N'Someone') +
           CASE t.entity_type
               WHEN N'listing'    THEN N' liked your item'
               WHEN N'request'    THEN N' liked your request'
               WHEN N'event'      THEN N' liked your event'
               WHEN N'lost_found' THEN N' boosted your report'
               ELSE N' liked your post'
           END,
           t.title
    FROM (
        SELECT i.user_id AS actor_id, i.entity_type, i.entity_id,
               COALESCE(l.user_id, r.user_id, e.organizer_id, lf.user_id) AS owner_id,
               COALESCE(l.title,   r.title,   e.title,        lf.title)   AS title
        FROM inserted AS i
        LEFT JOIN app.listings           AS l  ON i.entity_type = N'listing'    AND l.id  = i.entity_id
        LEFT JOIN app.requests           AS r  ON i.entity_type = N'request'    AND r.id  = i.entity_id
        LEFT JOIN app.events             AS e  ON i.entity_type = N'event'      AND e.id  = i.entity_id
        LEFT JOIN app.lost_found_reports AS lf ON i.entity_type = N'lost_found' AND lf.id = i.entity_id
    ) AS t
    LEFT JOIN app.profiles AS ap ON ap.id = t.actor_id
    WHERE t.owner_id IS NOT NULL AND t.owner_id <> t.actor_id;
END;
GO

/* Moderation reaches every admin. The cross join to app.admin_emails is how
   "tell all admins" is expressed set-based; the two <> clauses stop an admin
   being told about their own report, or about themselves. */
CREATE OR ALTER TRIGGER app.tr_notify_report ON app.content_reports AFTER INSERT
AS BEGIN
    SET NOCOUNT ON;
    INSERT INTO app.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    SELECT adm.id, i.reporter_id, N'content_reported',
           CASE i.target_type
               WHEN N'listing'   THEN N'listing'
               WHEN N'request'   THEN N'request'
               WHEN N'event'     THEN N'event'
               WHEN N'lostfound' THEN N'lost_found'
               ELSE NULL
           END,
           TRY_CONVERT(uniqueidentifier, i.target_id),
           N'Content reported',
           COALESCE(NULLIF(rp.full_name, N''), NULLIF(rp.username, N''), N'A member')
             + N' reported a ' + i.target_type + N' — ' + i.reason
    FROM inserted AS i
    CROSS JOIN app.profiles AS adm
    LEFT JOIN app.profiles AS rp ON rp.id = i.reporter_id
    WHERE adm.email IN (SELECT email FROM app.admin_emails)
      AND adm.id <> i.reporter_id;
END;
GO

CREATE OR ALTER TRIGGER app.tr_notify_block ON app.user_blocks AFTER INSERT
AS BEGIN
    SET NOCOUNT ON;
    INSERT INTO app.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    SELECT adm.id, i.blocker_id, N'user_blocked', NULL, NULL,
           N'Member blocked',
           COALESCE(NULLIF(tp.full_name, N''), NULLIF(tp.username, N''), N'A member')
             + N' has been blocked by ' + CONVERT(nvarchar(20), c.total) + N' member'
             + CASE WHEN c.total = 1 THEN N'' ELSE N's' END
    FROM inserted AS i
    CROSS APPLY (SELECT COUNT(*) AS total FROM app.user_blocks AS b WHERE b.target_id = i.target_id) AS c
    CROSS JOIN app.profiles AS adm
    LEFT JOIN app.profiles AS tp ON tp.id = i.target_id
    WHERE adm.email IN (SELECT email FROM app.admin_emails)
      AND adm.id <> i.blocker_id
      AND adm.id <> i.target_id;
END;
GO

/*── A new listing wakes matching alerts ──

  One thing from the Postgres version is deliberately NOT here: it had a third
  text test using to_tsvector/websearch_to_tsquery, which matched an alert for
  "bike" against a listing titled "bicycle" by stemming. SQL Server's
  equivalent is CONTAINS, and CONTAINS cannot be used in this trigger — full-
  text indexes only cover committed base-table rows and update asynchronously,
  so the row being inserted is not searchable yet. The two substring tests are
  kept, which is what caught the overwhelming majority of matches anyway. An
  alert that would only have matched by stemming now waits for the next
  listing. Written down because it is a real, if small, loss. */

CREATE OR ALTER TRIGGER app.tr_listings_match_alerts ON app.listings AFTER INSERT
AS BEGIN
    SET NOCOUNT ON;

    DECLARE @m TABLE (
        alert_id       uniqueidentifier,
        alert_user     uniqueidentifier,
        alert_title    nvarchar(200),
        notify         nvarchar(20),
        listing_id     uniqueidentifier,
        listing_title  nvarchar(200),
        listing_user   uniqueidentifier,
        community_id   uniqueidentifier
    );

    INSERT INTO @m
    SELECT a.id, a.user_id, a.title, a.notify, i.id, i.title, i.user_id, i.community_id
    FROM inserted AS i
    JOIN app.alerts AS a
      ON a.status = N'active'
     AND a.expires_at > SYSUTCDATETIME()
     AND a.user_id <> i.user_id
     AND (a.community_id  IS NULL OR a.community_id = i.community_id)
     AND (a.category_id   IS NULL OR a.category_id  = i.category_id)
     AND (a.condition     IS NULL OR a.condition    = i.condition)
     AND (a.max_price     IS NULL OR i.listing_type <> N'sell' OR ISNULL(i.price, 0) <= a.max_price)
     AND (a.location_pref IS NULL OR i.location LIKE N'%' + a.location_pref + N'%')
     AND (i.title LIKE N'%' + a.title + N'%' OR i.description LIKE N'%' + a.title + N'%')
    WHERE i.status = N'active';

    IF NOT EXISTS (SELECT 1 FROM @m) RETURN;

    UPDATE a
       SET match_count = a.match_count + x.hits,
           last_matched_at = SYSUTCDATETIME()
    FROM app.alerts AS a
    JOIN (SELECT alert_id, COUNT(*) AS hits FROM @m GROUP BY alert_id) AS x ON x.alert_id = a.id;

    INSERT INTO app.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    SELECT alert_user, listing_user, N'alert_match', N'listing', listing_id,
           N'Match for "' + alert_title + N'"', listing_title
    FROM @m;

    /* STRING_ESCAPE, not plain concatenation: a listing titled  He said "hi"
       would otherwise write a payload that is not valid JSON, and the CHECK
       constraint on push_queue.payload would reject the whole insert — taking
       the listing down with it. */
    INSERT INTO app.push_queue (user_id, channel, payload)
    SELECT alert_user, notify,
           N'{"kind":"alert_match"'
         + N',"alert_id":"'        + CONVERT(nvarchar(36), alert_id)     + N'"'
         + N',"alert_title":"'     + STRING_ESCAPE(alert_title, 'json')  + N'"'
         + N',"listing_id":"'      + CONVERT(nvarchar(36), listing_id)   + N'"'
         + N',"listing_title":"'   + STRING_ESCAPE(listing_title, 'json')+ N'"'
         + N',"listing_user_id":"' + CONVERT(nvarchar(36), listing_user) + N'"'
         + N',"community_id":"'    + CONVERT(nvarchar(36), community_id) + N'"}'
    FROM @m
    WHERE notify IS NOT NULL;
END;
GO

/*── A new account gets a profile ──

  handle_new_auth_user() in Postgres, and the one trigger where being faithful
  matters more than being tidy: it decides what every member's first profile
  looks like, and 99 existing profiles were built by it. The odd corners are
  kept on purpose — a one-word name really does produce doubled initials
  ("Madhav" → "MM"), because that is what the live data contains.            */

CREATE OR ALTER FUNCTION app.initials_of(@full_name nvarchar(200))
RETURNS nvarchar(8)
AS
BEGIN
    DECLARE @n nvarchar(200) = LTRIM(RTRIM(ISNULL(@full_name, N'')));
    IF @n = N'' RETURN N'W';

    DECLARE @first nvarchar(200) =
        CASE WHEN CHARINDEX(N' ', @n) > 0 THEN LEFT(@n, CHARINDEX(N' ', @n) - 1) ELSE @n END;
    DECLARE @rev nvarchar(200) = REVERSE(@n);
    DECLARE @last nvarchar(200) =
        CASE WHEN CHARINDEX(N' ', @rev) > 0
             THEN REVERSE(LEFT(@rev, CHARINDEX(N' ', @rev) - 1)) ELSE @n END;

    DECLARE @out nvarchar(8) = UPPER(LEFT(@first, 1)) + UPPER(LEFT(@last, 1));
    RETURN CASE WHEN @out = N'' THEN N'W' ELSE @out END;
END;
GO

CREATE OR ALTER TRIGGER auth.tr_users_make_profile ON auth.users AFTER INSERT
AS BEGIN
    SET NOCOUNT ON;

    DECLARE @global uniqueidentifier;
    SELECT TOP (1) @global = id FROM app.communities WHERE slug = N'wecycle-global';

    /* The signup form's answers arrive as JSON on the user row; JSON_VALUE
       reads them the same way Postgres read raw_user_meta_data->>'…'. */
    INSERT INTO app.profiles
        (id, username, full_name, initials, avatar_color, community_id, phone,
         college_id, college, graduating_year, course, department, email)
    SELECT
        i.id,
        COALESCE(
            NULLIF(JSON_VALUE(i.raw_user_meta_data, '$.username'), N''),
            NULLIF(LEFT(ISNULL(i.email, N''),
                        CASE WHEN CHARINDEX(N'@', ISNULL(i.email, N'')) > 0
                             THEN CHARINDEX(N'@', i.email) - 1 ELSE 0 END), N''),
            N'user_' + LEFT(CONVERT(nvarchar(36), i.id), 8)),
        NULLIF(LTRIM(RTRIM(ISNULL(JSON_VALUE(i.raw_user_meta_data, '$.full_name'), N''))), N''),
        app.initials_of(JSON_VALUE(i.raw_user_meta_data, '$.full_name')),
        COALESCE(NULLIF(JSON_VALUE(i.raw_user_meta_data, '$.avatar_color'), N''), N'#6C63FF'),
        @global,
        COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(JSON_VALUE(i.raw_user_meta_data, '$.phone'), N''))), N''), i.phone),
        NULLIF(JSON_VALUE(i.raw_user_meta_data, '$.college_id'), N''),
        NULLIF(JSON_VALUE(i.raw_user_meta_data, '$.college'), N''),
        TRY_CONVERT(int, NULLIF(JSON_VALUE(i.raw_user_meta_data, '$.graduating_year'), N'')),
        NULLIF(JSON_VALUE(i.raw_user_meta_data, '$.course'), N''),
        NULLIF(JSON_VALUE(i.raw_user_meta_data, '$.department'), N''),
        i.email
    FROM inserted AS i
    WHERE NOT EXISTS (SELECT 1 FROM app.profiles AS p WHERE p.id = i.id);

    /* app.tr_profiles_biz already adds the community membership when
       community_id is set, so there is nothing to do here for that. */
END;
GO

/* The Manipal gate. Postgres enforced it on auth.users with a BEFORE trigger;
   AFTER + THROW has the same effect because the transaction is rolled back.
   Mirrors lib/emailDomain.ts — three implementations of one rule, which is
   two too many, and the reason each one names the others. */
CREATE OR ALTER TRIGGER auth.tr_users_email_gate ON auth.users AFTER INSERT, UPDATE
AS BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;
    IF EXISTS (SELECT 1 FROM deleted) AND NOT UPDATE(email) RETURN;

    IF EXISTS (SELECT 1 FROM inserted AS i WHERE app.is_signup_email_allowed(i.email) = 0)
        THROW 50012,
            N'Wecycle accounts require a Manipal email address. Use your Manipal email, e.g. name@learner.manipal.edu.',
            1;
END;
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 9 — DELETION

  ┌─ WHY THERE ARE NO CASCADING FOREIGN KEYS IN THIS SCHEMA ─────────────────┐
  │                                                                          │
  │ Postgres cleaned up after a delete on its own: 40-odd foreign keys        │
  │ carried ON DELETE CASCADE, and removing a member removed their listings,  │
  │ their saves, their notifications and everything else in one statement.    │
  │                                                                          │
  │ SQL Server will not accept that graph. It refuses any schema where two    │
  │ cascade paths can reach the same table, and this schema is full of them:  │
  │ conversations references auth.users three times; user_blocks and          │
  │ content_reports twice each; communities reaches impact_log both directly  │
  │ and through listings; comments cascades to itself, which SQL Server       │
  │ forbids outright. These are not edge cases — it is most of the graph.     │
  │                                                                          │
  │ Trying to keep cascades anyway means INSTEAD OF DELETE triggers on ten    │
  │ parent tables, which recurse into each other and are genuinely hard to    │
  │ reason about at 2am. So: EVERY foreign key here is NO ACTION, and         │
  │ deletion is these procedures. They are longer to read and there is        │
  │ nothing hidden in them — the order children die in is written down.       │
  │                                                                          │
  │ THE CONSEQUENCE, WHICH IS THE THING TO REMEMBER:                          │
  │     DELETE FROM app.listings WHERE id = @x   -- fails, foreign keys       │
  │     EXEC app.usp_delete_listing @x           -- correct                   │
  └──────────────────────────────────────────────────────────────────────────┘
═══════════════════════════════════════════════════════════════════════════════*/

CREATE OR ALTER PROCEDURE app.usp_delete_listing @listing_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;      /* any error rolls the whole thing back, not half */
    BEGIN TRAN;

    DELETE FROM app.saves             WHERE listing_id = @listing_id;
    DELETE FROM app.listing_responses WHERE listing_id = @listing_id;
    DELETE FROM app.comments          WHERE entity_type = N'listing' AND entity_id = @listing_id;
    DELETE FROM app.reactions         WHERE entity_type = N'listing' AND entity_id = @listing_id;

    /* These two kept the row and dropped the reference in Postgres
       (ON DELETE SET NULL), because the history is worth more than the link. */
    UPDATE app.impact_log    SET related_listing_id = NULL WHERE related_listing_id = @listing_id;
    UPDATE app.conversations SET listing_id         = NULL WHERE listing_id         = @listing_id;

    DELETE FROM app.listings WHERE id = @listing_id;

    COMMIT;
END;
GO

CREATE OR ALTER PROCEDURE app.usp_delete_request @request_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRAN;

    DELETE FROM app.request_offers WHERE request_id = @request_id;
    DELETE FROM app.comments   WHERE entity_type = N'request' AND entity_id = @request_id;
    DELETE FROM app.reactions  WHERE entity_type = N'request' AND entity_id = @request_id;
    UPDATE app.impact_log SET related_request_id = NULL WHERE related_request_id = @request_id;

    DELETE FROM app.requests WHERE id = @request_id;

    COMMIT;
END;
GO

CREATE OR ALTER PROCEDURE app.usp_delete_event @event_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRAN;

    /* Responses before forms: a response points at both the form and the
       event, so the form cannot go first. */
    DELETE FROM app.event_form_responses WHERE event_id = @event_id;
    DELETE FROM app.event_forms          WHERE event_id = @event_id;
    DELETE FROM app.event_rsvps          WHERE event_id = @event_id;
    DELETE FROM app.event_saves          WHERE event_id = @event_id;
    DELETE FROM app.comments   WHERE entity_type = N'event' AND entity_id = @event_id;
    DELETE FROM app.reactions  WHERE entity_type = N'event' AND entity_id = @event_id;
    UPDATE app.impact_log SET related_event_id = NULL WHERE related_event_id = @event_id;

    DELETE FROM app.events WHERE id = @event_id;

    COMMIT;
END;
GO

CREATE OR ALTER PROCEDURE app.usp_delete_lost_found @report_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRAN;

    DELETE FROM app.comments  WHERE entity_type = N'lost_found' AND entity_id = @report_id;
    DELETE FROM app.reactions WHERE entity_type = N'lost_found' AND entity_id = @report_id;
    DELETE FROM app.lost_found_reports WHERE id = @report_id;

    COMMIT;
END;
GO

/* A comment and everything under it. The recursive CTE collects the whole
   subtree first, then the delete walks it deepest-first — a plain
   DELETE … WHERE id IN (subtree) would violate the self-referencing key the
   moment a parent went before its child. */
CREATE OR ALTER PROCEDURE app.usp_delete_comment @comment_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRAN;

    DECLARE @tree TABLE (id uniqueidentifier PRIMARY KEY, depth int);

    WITH descendants AS (
        SELECT c.id, 0 AS depth FROM app.comments AS c WHERE c.id = @comment_id
        UNION ALL
        SELECT c.id, d.depth + 1
        FROM app.comments AS c JOIN descendants AS d ON c.parent_comment_id = d.id
    )
    INSERT INTO @tree (id, depth) SELECT id, depth FROM descendants OPTION (MAXRECURSION 100);

    DECLARE @d int = (SELECT MAX(depth) FROM @tree);
    WHILE @d >= 0
    BEGIN
        DELETE c FROM app.comments AS c JOIN @tree AS t ON t.id = c.id WHERE t.depth = @d;
        SET @d = @d - 1;
    END

    COMMIT;
END;
GO

/*── Deleting a member ──
  What delete_my_account() did in one statement, because Postgres cascaded from
  auth.users all the way down. Order is everything: each block removes rows that
  point at something removed by a later block.                               */

CREATE OR ALTER PROCEDURE app.usp_delete_user @user_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRAN;

    /* 1. This member's own posts, and everything hanging off them. */
    DECLARE @listings TABLE (id uniqueidentifier PRIMARY KEY);
    DECLARE @requests TABLE (id uniqueidentifier PRIMARY KEY);
    DECLARE @events   TABLE (id uniqueidentifier PRIMARY KEY);
    DECLARE @reports  TABLE (id uniqueidentifier PRIMARY KEY);

    INSERT INTO @listings SELECT id FROM app.listings           WHERE user_id      = @user_id;
    INSERT INTO @requests SELECT id FROM app.requests           WHERE user_id      = @user_id;
    INSERT INTO @events   SELECT id FROM app.events             WHERE organizer_id = @user_id;
    INSERT INTO @reports  SELECT id FROM app.lost_found_reports WHERE user_id      = @user_id;

    DELETE s FROM app.saves             AS s JOIN @listings AS l ON l.id = s.listing_id;
    DELETE r FROM app.listing_responses AS r JOIN @listings AS l ON l.id = r.listing_id;
    DELETE o FROM app.request_offers    AS o JOIN @requests AS q ON q.id = o.request_id;
    DELETE x FROM app.event_form_responses AS x JOIN @events AS e ON e.id = x.event_id;
    DELETE f FROM app.event_forms       AS f JOIN @events AS e ON e.id = f.event_id;
    DELETE v FROM app.event_rsvps       AS v JOIN @events AS e ON e.id = v.event_id;
    DELETE v FROM app.event_saves       AS v JOIN @events AS e ON e.id = v.event_id;

    /* 2. Anything anyone attached to those posts. */
    DELETE c FROM app.comments  AS c JOIN @listings AS l ON c.entity_type = N'listing'    AND c.entity_id = l.id;
    DELETE c FROM app.comments  AS c JOIN @requests AS q ON c.entity_type = N'request'    AND c.entity_id = q.id;
    DELETE c FROM app.comments  AS c JOIN @events   AS e ON c.entity_type = N'event'      AND c.entity_id = e.id;
    DELETE c FROM app.comments  AS c JOIN @reports  AS p ON c.entity_type = N'lost_found' AND c.entity_id = p.id;
    DELETE x FROM app.reactions AS x JOIN @listings AS l ON x.entity_type = N'listing'    AND x.entity_id = l.id;
    DELETE x FROM app.reactions AS x JOIN @requests AS q ON x.entity_type = N'request'    AND x.entity_id = q.id;
    DELETE x FROM app.reactions AS x JOIN @events   AS e ON x.entity_type = N'event'      AND x.entity_id = e.id;
    DELETE x FROM app.reactions AS x JOIN @reports  AS p ON x.entity_type = N'lost_found' AND x.entity_id = p.id;

    /* 3. This member's activity on everyone else's posts. Comments are done
          deepest-first for the same reason as usp_delete_comment: a reply must
          not outlive its parent, and their own comment may be someone's
          parent. Deleting the whole subtree of each is the faithful reading of
          the Postgres cascade. */
    DECLARE @mine TABLE (id uniqueidentifier PRIMARY KEY, depth int);
    WITH roots AS (
        SELECT c.id, 0 AS depth FROM app.comments AS c WHERE c.user_id = @user_id
        UNION ALL
        SELECT c.id, r.depth + 1
        FROM app.comments AS c JOIN roots AS r ON c.parent_comment_id = r.id
    )
    INSERT INTO @mine (id, depth)
    SELECT id, MAX(depth) FROM roots GROUP BY id OPTION (MAXRECURSION 100);

    DECLARE @d int = (SELECT MAX(depth) FROM @mine);
    WHILE @d >= 0
    BEGIN
        DELETE c FROM app.comments AS c JOIN @mine AS m ON m.id = c.id WHERE m.depth = @d;
        SET @d = @d - 1;
    END

    DELETE FROM app.reactions            WHERE user_id = @user_id;
    DELETE FROM app.saves                WHERE user_id = @user_id;
    DELETE FROM app.listing_responses    WHERE user_id = @user_id;
    DELETE FROM app.request_offers       WHERE user_id = @user_id;
    DELETE FROM app.event_rsvps          WHERE user_id = @user_id;
    DELETE FROM app.event_saves          WHERE user_id = @user_id;
    DELETE FROM app.event_form_responses WHERE user_id = @user_id;

    /* 4. Their own posts can go now that nothing points at them. */
    DELETE l FROM app.listings           AS l JOIN @listings AS x ON x.id = l.id;
    DELETE r FROM app.requests           AS r JOIN @requests AS x ON x.id = r.id;
    DELETE e FROM app.events             AS e JOIN @events   AS x ON x.id = e.id;
    DELETE p FROM app.lost_found_reports AS p JOIN @reports  AS x ON x.id = p.id;
    UPDATE app.lost_found_reports SET claimed_by = NULL WHERE claimed_by = @user_id;

    /* 5. Messages, then conversations. */
    DELETE m FROM app.messages AS m
    JOIN app.conversations AS c ON c.id = m.conversation_id
    WHERE c.user_a = @user_id OR c.user_b = @user_id;
    DELETE FROM app.messages      WHERE sender_id = @user_id;
    UPDATE app.conversations SET last_sender_id = NULL WHERE last_sender_id = @user_id;
    DELETE FROM app.conversations WHERE user_a = @user_id OR user_b = @user_id;

    /* 6. Everything else that names them. */
    DELETE FROM app.notifications WHERE user_id  = @user_id;
    UPDATE app.notifications SET actor_id = NULL WHERE actor_id = @user_id;
    DELETE FROM app.alerts             WHERE user_id = @user_id;
    DELETE FROM app.push_queue         WHERE user_id = @user_id;
    DELETE FROM app.push_subscriptions WHERE user_id = @user_id;
    DELETE FROM app.saved_searches     WHERE user_id = @user_id;
    DELETE FROM app.impact_log         WHERE user_id = @user_id;
    DELETE FROM app.announcements      WHERE author_id = @user_id;
    DELETE FROM app.user_blocks        WHERE blocker_id = @user_id OR target_id = @user_id;
    DELETE FROM app.content_reports    WHERE reporter_id = @user_id OR target_user_id = @user_id;
    UPDATE app.content_reports  SET reviewed_by = NULL WHERE reviewed_by = @user_id;
    UPDATE app.inventory_items  SET owner_id    = NULL WHERE owner_id    = @user_id;
    UPDATE app.inventory_items  SET borrowed_by = NULL WHERE borrowed_by = @user_id;
    UPDATE app.app_config       SET updated_by  = NULL WHERE updated_by  = @user_id;
    DELETE FROM app.community_members WHERE user_id = @user_id;

    /* 7. Identity last. */
    DELETE FROM app.profiles          WHERE id      = @user_id;
    DELETE FROM auth.sessions         WHERE user_id = @user_id;
    DELETE FROM auth.one_time_codes   WHERE user_id = @user_id;
    DELETE FROM auth.users            WHERE id      = @user_id;

    COMMIT;
END;
GO

/* delete_my_account() — the member's own "delete my account" button. Separate
   from usp_delete_user so that the one an admin can call and the one a member
   can call are different objects with different permissions (SECTION 11). */
CREATE OR ALTER PROCEDURE app.usp_delete_my_account
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me uniqueidentifier = app.current_user_id();
    IF @me IS NULL THROW 50001, N'Not authenticated.', 1;
    EXEC app.usp_delete_user @me;
END;
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 10 — THE RPCs

  Every function the application called through supabase.rpc(), as a stored
  procedure. Same names, same arguments, same answers, so the data layer is a
  rename rather than a rewrite:

      supabase.rpc('rpc_toggle_save', { _listing_id: id })
      EXEC app.usp_toggle_save @listing_id = @id

  They all take the caller from app.current_user_id(), never from an argument.
  A procedure that accepted a user id would let any caller act as anybody, and
  these are the procedures the API layer exposes most directly.
═══════════════════════════════════════════════════════════════════════════════*/

CREATE OR ALTER PROCEDURE app.usp_toggle_save @listing_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me uniqueidentifier = app.current_user_id();
    IF @me IS NULL THROW 50001, N'Not authenticated.', 1;

    IF EXISTS (SELECT 1 FROM app.saves WHERE user_id = @me AND listing_id = @listing_id)
    BEGIN
        DELETE FROM app.saves WHERE user_id = @me AND listing_id = @listing_id;
        SELECT CONVERT(bit, 0) AS saved;
    END
    ELSE
    BEGIN
        INSERT INTO app.saves (user_id, listing_id) VALUES (@me, @listing_id);
        SELECT CONVERT(bit, 1) AS saved;
    END
END;
GO

CREATE OR ALTER PROCEDURE app.usp_toggle_event_save @event_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me uniqueidentifier = app.current_user_id();
    IF @me IS NULL THROW 50001, N'Not authenticated.', 1;

    IF EXISTS (SELECT 1 FROM app.event_saves WHERE user_id = @me AND event_id = @event_id)
    BEGIN
        DELETE FROM app.event_saves WHERE user_id = @me AND event_id = @event_id;
        SELECT CONVERT(bit, 0) AS saved;
    END
    ELSE
    BEGIN
        INSERT INTO app.event_saves (event_id, user_id) VALUES (@event_id, @me);
        SELECT CONVERT(bit, 1) AS saved;
    END
END;
GO

CREATE OR ALTER PROCEDURE app.usp_toggle_like
    @entity_type nvarchar(20),
    @entity_id   uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me uniqueidentifier = app.current_user_id();
    IF @me IS NULL THROW 50001, N'Not authenticated.', 1;

    IF EXISTS (SELECT 1 FROM app.reactions
               WHERE user_id = @me AND entity_type = @entity_type
                 AND entity_id = @entity_id AND kind = N'like')
    BEGIN
        DELETE FROM app.reactions
        WHERE user_id = @me AND entity_type = @entity_type
          AND entity_id = @entity_id AND kind = N'like';
        SELECT CONVERT(bit, 0) AS liked;
    END
    ELSE
    BEGIN
        INSERT INTO app.reactions (user_id, entity_type, entity_id, kind)
        VALUES (@me, @entity_type, @entity_id, N'like');
        SELECT CONVERT(bit, 1) AS liked;
    END
END;
GO

CREATE OR ALTER PROCEDURE app.usp_toggle_rsvp @event_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me uniqueidentifier = app.current_user_id();
    IF @me IS NULL THROW 50001, N'Not authenticated.', 1;

    IF EXISTS (SELECT 1 FROM app.event_rsvps
               WHERE user_id = @me AND event_id = @event_id AND status = N'going')
    BEGIN
        DELETE FROM app.event_rsvps WHERE user_id = @me AND event_id = @event_id;
        SELECT CONVERT(nvarchar(20), N'cancelled') AS status;
    END
    ELSE
    BEGIN
        /* The Postgres original was an upsert: a 'maybe' or 'declined' row is
           promoted rather than duplicated, which the primary key would refuse. */
        UPDATE app.event_rsvps SET status = N'going'
        WHERE user_id = @me AND event_id = @event_id;

        IF @@ROWCOUNT = 0
            INSERT INTO app.event_rsvps (event_id, user_id, status)
            VALUES (@event_id, @me, N'going');

        SELECT CONVERT(nvarchar(20), N'going') AS status;
    END
END;
GO

CREATE OR ALTER PROCEDURE app.usp_increment_listing_view @listing_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE app.listings SET view_count = view_count + 1 WHERE id = @listing_id;
END;
GO

CREATE OR ALTER PROCEDURE app.usp_increment_event_view @event_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE app.events SET view_count = view_count + 1 WHERE id = @event_id;
END;
GO

/* @ids is a JSON array of uuids, or NULL for "all of mine". Postgres took a
   uuid[]; SQL Server has no array parameter, and JSON travels through every
   driver without a table type to declare. */
CREATE OR ALTER PROCEDURE app.usp_mark_notifications_read @ids nvarchar(max) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me uniqueidentifier = app.current_user_id();
    IF @me IS NULL THROW 50001, N'Not authenticated.', 1;

    IF @ids IS NULL
        UPDATE app.notifications SET is_read = 1, read_at = SYSUTCDATETIME()
        WHERE user_id = @me AND is_read = 0;
    ELSE
        UPDATE n SET is_read = 1, read_at = SYSUTCDATETIME()
        FROM app.notifications AS n
        JOIN OPENJSON(@ids) AS j ON n.id = TRY_CONVERT(uniqueidentifier, j.value)
        WHERE n.user_id = @me AND n.is_read = 0;

    SELECT @@ROWCOUNT AS marked;
END;
GO

CREATE OR ALTER PROCEDURE app.usp_my_impact_summary
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me uniqueidentifier = app.current_user_id();
    IF @me IS NULL THROW 50001, N'Not authenticated.', 1;

    SELECT
        (SELECT * FROM app.profiles WHERE id = @me
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS profile,
        (SELECT community_rank FROM app.leaderboard_view WHERE user_id = @me) AS community_rank,
        (SELECT global_rank    FROM app.leaderboard_view WHERE user_id = @me) AS global_rank,
        (SELECT c.member_count FROM app.communities AS c
         JOIN app.profiles AS p ON p.community_id = c.id WHERE p.id = @me)    AS community_members;
END;
GO

CREATE OR ALTER PROCEDURE app.usp_community_feed
    @community_id uniqueidentifier,
    @limit        int = 20,
    @before       datetime2(3) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @take int = CASE WHEN @limit > 100 THEN 100 WHEN @limit < 1 THEN 1 ELSE @limit END;

    SELECT TOP (@take) *
    FROM app.feed_view
    WHERE community_id = @community_id
      AND (@before IS NULL OR posted_at < @before)
    ORDER BY posted_at DESC;
END;
GO

/*── Contact details ──
  get_contact(). The important part is what it does NOT return: a member's
  email and phone are only ever released when their own settings allow it, and
  the flags it reports back are the EFFECTIVE ones — allow_dms AND the specific
  toggle — so a screen cannot render a contact button with nothing behind it.
  Reading app.profiles directly would hand over both columns regardless, which
  is why SECTION 11 withholds them and leaves this as the only way in.       */
CREATE OR ALTER PROCEDURE app.usp_get_contact @target uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me uniqueidentifier = app.current_user_id();
    IF @me IS NULL THROW 50001, N'Not authenticated.', 1;

    SELECT
        CASE WHEN p.id = @me
                   OR (p.allow_dms = 1 AND p.contact_email_enabled = 1)
             THEN p.email END AS email,
        CASE WHEN p.id = @me
                   OR (p.allow_dms = 1 AND (p.contact_whatsapp_enabled = 1 OR p.show_phone_on_profile = 1))
             THEN p.phone END AS phone,
        CONVERT(bit, CASE WHEN p.allow_dms = 1 AND p.contact_email_enabled = 1 THEN 1 ELSE 0 END)
            AS contact_email_enabled,
        CONVERT(bit, CASE WHEN p.allow_dms = 1 AND p.contact_whatsapp_enabled = 1 THEN 1 ELSE 0 END)
            AS contact_whatsapp_enabled
    FROM app.profiles AS p
    WHERE p.id = @target;
END;
GO

CREATE OR ALTER PROCEDURE app.usp_admin_set_suspension
    @target uniqueidentifier,
    @days   int,
    @reason nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF app.is_wecycle_admin() = 0
        THROW 50002, N'Only Wecycle admins can suspend an account.', 1;

    DECLARE @until datetime2(3) =
        CASE WHEN @days IS NULL OR @days <= 0 THEN NULL
             ELSE DATEADD(day, @days, SYSUTCDATETIME()) END;

    UPDATE app.profiles
       SET suspended_until  = @until,
           suspended_reason = CASE WHEN @until IS NULL THEN NULL ELSE @reason END
     WHERE id = @target;

    SELECT @until AS suspended_until;
END;
GO

CREATE OR ALTER PROCEDURE app.usp_get_or_create_conversation
    @other_user uniqueidentifier,
    @listing_id uniqueidentifier = NULL,
    @subject    nvarchar(300)    = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me uniqueidentifier = app.current_user_id();
    IF @me IS NULL THROW 50001, N'Not authenticated.', 1;
    IF @other_user IS NULL OR @other_user = @me THROW 50003, N'Invalid recipient.', 1;

    DECLARE @a uniqueidentifier = CASE WHEN @me < @other_user THEN @me ELSE @other_user END;
    DECLARE @b uniqueidentifier = CASE WHEN @me < @other_user THEN @other_user ELSE @me END;
    DECLARE @key uniqueidentifier = ISNULL(@listing_id, CONVERT(uniqueidentifier, N'00000000-0000-0000-0000-000000000000'));

    DECLARE @id uniqueidentifier;
    SELECT @id = id FROM app.conversations
     WHERE user_a = @a AND user_b = @b AND listing_key = @key;

    IF @id IS NULL
    BEGIN
        INSERT INTO app.conversations (user_a, user_b, listing_id, subject)
        VALUES (@a, @b, @listing_id, @subject);
        SELECT @id = id FROM app.conversations
         WHERE user_a = @a AND user_b = @b AND listing_key = @key;
    END

    SELECT @id AS conversation_id;
END;
GO

CREATE OR ALTER PROCEDURE app.usp_upsert_push_subscription
    @endpoint   nvarchar(450),
    @p256dh     nvarchar(200),
    @auth       nvarchar(100),
    @user_agent nvarchar(400) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me uniqueidentifier = app.current_user_id();
    IF @me IS NULL THROW 50001, N'Not authenticated.', 1;

    UPDATE app.push_subscriptions
       SET user_id = @me, p256dh = @p256dh, auth = @auth,
           user_agent = @user_agent, last_seen_at = SYSUTCDATETIME()
     WHERE endpoint = @endpoint;

    IF @@ROWCOUNT = 0
        INSERT INTO app.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
        VALUES (@me, @endpoint, @p256dh, @auth, @user_agent);
END;
GO

/* Run on a schedule — SQL Agent, or whatever cron the server has. Postgres ran
   it from pg_cron. See db/README.md for the job. */
CREATE OR ALTER PROCEDURE app.usp_mark_expired_alerts
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @expired TABLE (id uniqueidentifier, user_id uniqueidentifier,
                            title nvarchar(200), duration_hours int);

    UPDATE app.alerts SET status = N'expired'
    OUTPUT inserted.id, inserted.user_id, inserted.title, inserted.duration_hours INTO @expired
    WHERE status = N'active' AND expires_at <= SYSUTCDATETIME();

    INSERT INTO app.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
    SELECT user_id, NULL, N'alert_expired', N'alert', id,
           N'Alert auto-deleted',
           N'Your alert "' + title + N'" expired after '
             + CONVERT(nvarchar(10), duration_hours) + N' hours.'
    FROM @expired;

    SELECT COUNT(*) AS expired FROM @expired;
END;
GO

/*── The SIGCHI 35% check ──
  claim_sigchi_offer(). This answers ONE question about ONE address and never
  returns the list, because the list is 57 real students' personal email
  addresses. Everything about its shape follows from that: the throttle, the
  attempt log, and the fact that SECTION 11 grants nobody SELECT on
  app.sigchi_members. It is the only door, so it is the only thing that has to
  be right. */
CREATE OR ALTER PROCEDURE app.usp_claim_sigchi_offer @email nvarchar(320)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me uniqueidentifier = app.current_user_id();
    IF @me IS NULL THROW 50004, N'Sign in to check your SIGCHI membership.', 1;

    DECLARE @norm nvarchar(320) = LOWER(LTRIM(RTRIM(ISNULL(@email, N''))));

    IF @norm = N'' OR CHARINDEX(N'@', @norm) = 0
    BEGIN
        SELECT CONVERT(bit, 0) AS matched, CONVERT(nvarchar(200), NULL) AS code,
               CONVERT(nvarchar(200), NULL) AS member_name;
        RETURN;
    END

    /* Twelve wrong guesses in ten minutes and this member is done for a while.
       Guessing at the roster is made of misses; finding your own code is one
       hit, so only misses count. */
    IF (SELECT COUNT(*) FROM app.sigchi_claim_attempts
        WHERE user_id = @me AND matched = 0
          AND at > DATEADD(minute, -10, SYSUTCDATETIME())) >= 12
        THROW 50005, N'Too many attempts — try again in a few minutes.', 1;

    DECLARE @found bit = CASE WHEN EXISTS (
        SELECT 1 FROM app.sigchi_members WHERE email = @norm) THEN 1 ELSE 0 END;

    INSERT INTO app.sigchi_claim_attempts (user_id, email_tried, matched)
    VALUES (@me, @norm, @found);

    IF @found = 0
    BEGIN
        SELECT CONVERT(bit, 0) AS matched, CONVERT(nvarchar(200), NULL) AS code,
               CONVERT(nvarchar(200), NULL) AS member_name;
        RETURN;
    END

    SELECT CONVERT(bit, 1) AS matched,
           (SELECT value FROM app.sigchi_offer_config WHERE [key] = N'rlf_35_code') AS code,
           NULLIF(LTRIM(RTRIM(m.full_name)), N'') AS member_name
    FROM app.sigchi_members AS m
    WHERE m.email = @norm;
END;
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 11 — PERMISSIONS

  ┌─ WHAT REPLACED ROW LEVEL SECURITY, AND WHY ──────────────────────────────┐
  │                                                                          │
  │ Postgres had 40-odd RLS policies, and it needed them: Supabase gives the  │
  │ BROWSER a direct connection to the database, so the database itself was   │
  │ the last line of defence. If RLS were wrong, anyone with the anon key     │
  │ could read the table.                                                     │
  │                                                                          │
  │ SQL Server cannot be exposed that way and must never be. Something in     │
  │ front of it holds the connection string, so authorisation belongs in that │
  │ server — where it can be read, tested and debugged — rather than in       │
  │ predicate functions that run invisibly on every query.                    │
  │                                                                          │
  │ THAT IS A REAL TRADE, NOT A FREE WIN. The rules used to be enforced even  │
  │ if the application layer was wrong. Now a missing WHERE clause in the API │
  │ is a data leak. What backs it up:                                         │
  │                                                                          │
  │   • the login below gets EXECUTE and the table grants it needs, and       │
  │     nothing else — no DDL, no db_owner                                    │
  │   • the two genuinely dangerous columns (profiles.email, profiles.phone)  │
  │     are DENIED outright, so no query can select them by accident. The     │
  │     only way to a member's contact details is app.usp_get_contact, which  │
  │     applies their privacy settings.                                       │
  │   • app.sigchi_members is denied entirely, for the same reason.           │
  │                                                                          │
  │ DENY beats GRANT in SQL Server, always. That is what makes the two lines  │
  │ below worth more than a policy: SELECT * FROM app.profiles fails, even    │
  │ for a login that has SELECT on the table.                                 │
  └──────────────────────────────────────────────────────────────────────────┘

  Set a real password before running this on anything reachable.
═══════════════════════════════════════════════════════════════════════════════*/

IF DATABASE_PRINCIPAL_ID(N'wecycle_app') IS NULL
    CREATE ROLE wecycle_app;
GO

GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::app  TO wecycle_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::auth TO wecycle_app;
GRANT EXECUTE ON SCHEMA::app TO wecycle_app;
GO

/* The two columns that must never come back in a SELECT *. */
DENY SELECT (email) ON OBJECT::app.profiles TO wecycle_app;
DENY SELECT (phone) ON OBJECT::app.profiles TO wecycle_app;
GO

/* The roster. usp_claim_sigchi_offer runs as its owner and still reaches it —
   that is the point of going through a procedure. */
DENY SELECT ON OBJECT::app.sigchi_members TO wecycle_app;
GO

PRINT N'';
PRINT N'Role [wecycle_app] is ready. Create the login the application will use:';
PRINT N'';
PRINT N'    CREATE LOGIN wecycle_api WITH PASSWORD = ''<a real password>'';';
PRINT N'    CREATE USER  wecycle_api FOR LOGIN wecycle_api WITH DEFAULT_SCHEMA = app;';
PRINT N'    ALTER ROLE   wecycle_app ADD MEMBER wecycle_api;';
PRINT N'';
PRINT N'Do NOT connect the application as sa. The DENYs above are the only thing';
PRINT N'stopping a stray SELECT * from returning 99 members'' email addresses,';
PRINT N'and sa ignores every one of them.';
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 12 — REFERENCE DATA

  The rows the schema does not work without: the categories every post points
  at, and the communities every post belongs to. Safe to commit, because none
  of it is anybody's personal data.

  The UUIDs are the REAL ones from the Postgres database and must not be
  regenerated. Every listing, request, event and profile in the data export
  carries a community_id that points at one of these five rows; invent new ids
  and the import fails on the first foreign key, which is the good outcome —
  the bad one is a second Wecycle community nobody can see into.

  Everything else — the 99 members, their 46 listings, the SIGCHI roster, the
  moderation word list — lives in the data export, NOT here. See db/README.md.

  Idempotent: re-running updates the labels and leaves the ids alone.
═══════════════════════════════════════════════════════════════════════════════*/

MERGE app.categories AS t
USING (VALUES
    (N'all',         N'All',                         N'⚡',  0),
    (N'electronics', N'Electronics',                 N'💻', 10),
    (N'furniture',   N'Furniture & Room Essentials', N'🪑', 20),
    (N'books',       N'Books & Academic',            N'📚', 30),
    (N'sports',      N'Sports & Fitness',            N'⚽', 50),
    (N'kitchen',     N'Hostel & Kitchen',            N'🍳', 70),
    (N'art',         N'Art & Stationery',            N'🎨', 90),
    (N'adopt',       N'Adopt',                       N'🐾', 100),
    (N'fashion',     N'Fashion',                     N'👕', 100),
    (N'hobbies',     N'Hobbies & Collectibles',      N'🎸', 100),
    (N'mobility',    N'Vehicles & Mobility',         N'🚲', 100),
    (N'tickets',     N'Events & Tickets',            N'🎟️', 100),
    (N'services',    N'Services & Skills',           N'🤝', 110)
) AS s (id, label, icon, sort_order)
ON t.id = s.id
WHEN MATCHED THEN
    UPDATE SET label = s.label, icon = s.icon, sort_order = s.sort_order, is_active = 1
WHEN NOT MATCHED THEN
    INSERT (id, label, icon, sort_order, is_active)
    VALUES (s.id, s.label, s.icon, s.sort_order, 1);
GO

MERGE app.communities AS t
USING (VALUES
    (CONVERT(uniqueidentifier, N'a4640775-4946-49b2-a5d8-2f35e57e0b1a'), N'wecycle-global',    N'Wecycle',          N'neighborhood', N'Worldwide'),
    (CONVERT(uniqueidentifier, N'6a9c1bd0-3b1e-4da6-ad9f-dabc75ed4269'), N'mahe-manipal',      N'MAHE Manipal',     N'campus',       N'Manipal, India'),
    (CONVERT(uniqueidentifier, N'ca98a8ea-dfff-43ac-a403-4480669789f7'), N'bits-goa',          N'BITS Pilani Goa',  N'campus',       N'Goa, India'),
    (CONVERT(uniqueidentifier, N'4931d8d2-ead5-4df6-bcd3-46c796eb7f6f'), N'iisc-bangalore',    N'IISc Bangalore',   N'campus',       N'Bengaluru, India'),
    (CONVERT(uniqueidentifier, N'439ec900-06b1-4fed-8592-f98cbe856e25'), N'cyber-hub-gurgaon', N'Cyber Hub',        N'office',       N'Gurugram, India')
) AS s (id, slug, name, type, location)
ON t.id = s.id
WHEN MATCHED THEN
    UPDATE SET slug = s.slug, name = s.name, type = s.type, location = s.location
WHEN NOT MATCHED THEN
    INSERT (id, slug, name, type, location)
    VALUES (s.id, s.slug, s.name, s.type, s.location);
GO

/* The one config row the SIGCHI check reads. The CODE ITSELF IS NOT HERE and
   must never be committed — this repository is public. Set it by hand once,
   or let tools/export-data.mjs carry it across with the rest of the data:

       UPDATE app.sigchi_offer_config SET value = N'<the code>'
        WHERE [key] = N'rlf_35_code';                                        */
IF NOT EXISTS (SELECT 1 FROM app.sigchi_offer_config WHERE [key] = N'rlf_35_code')
    INSERT INTO app.sigchi_offer_config ([key], value) VALUES (N'rlf_35_code', N'SET-ME');
GO

/*═══════════════════════════════════════════════════════════════════════════════
  SECTION 13 — DID IT WORK

  Prints what was built. If a number here is lower than the one in the comment,
  something above failed and scrolled past — which is easy to miss in a script
  this long, since a failed batch does not stop the ones after it.
═══════════════════════════════════════════════════════════════════════════════*/

PRINT N'';
PRINT N'──────────────────────────────────────────────────────────────';
PRINT N'  Wecycle — SQL Server schema';
PRINT N'──────────────────────────────────────────────────────────────';

DECLARE @tables int = (SELECT COUNT(*) FROM sys.tables WHERE SCHEMA_NAME(schema_id) IN (N'app', N'auth'));
DECLARE @views  int = (SELECT COUNT(*) FROM sys.views  WHERE SCHEMA_NAME(schema_id) = N'app');
DECLARE @procs  int = (SELECT COUNT(*) FROM sys.procedures WHERE SCHEMA_NAME(schema_id) = N'app');
DECLARE @funcs  int = (SELECT COUNT(*) FROM sys.objects WHERE type IN (N'FN', N'IF', N'TF') AND SCHEMA_NAME(schema_id) = N'app');
DECLARE @trigs  int = (SELECT COUNT(*) FROM sys.triggers WHERE parent_class = 1);
DECLARE @idx    int = (SELECT COUNT(*) FROM sys.indexes i JOIN sys.tables t ON t.object_id = i.object_id
                       WHERE SCHEMA_NAME(t.schema_id) IN (N'app', N'auth') AND i.type > 0);
DECLARE @fks    int = (SELECT COUNT(*) FROM sys.foreign_keys);
DECLARE @cats   int = (SELECT COUNT(*) FROM app.categories);
DECLARE @comms  int = (SELECT COUNT(*) FROM app.communities);

PRINT N'  tables        ' + CONVERT(nvarchar(10), @tables) + N'   (expected 39)';
PRINT N'  views         ' + CONVERT(nvarchar(10), @views)  + N'   (expected 3)';
PRINT N'  procedures    ' + CONVERT(nvarchar(10), @procs)  + N'   (expected 22)';
PRINT N'  functions     ' + CONVERT(nvarchar(10), @funcs)  + N'   (expected 13)';
PRINT N'  triggers      ' + CONVERT(nvarchar(10), @trigs)  + N'   (expected 29)';
PRINT N'  indexes       ' + CONVERT(nvarchar(10), @idx);
PRINT N'  foreign keys  ' + CONVERT(nvarchar(10), @fks);
PRINT N'  categories    ' + CONVERT(nvarchar(10), @cats)   + N'   (expected 13)';
PRINT N'  communities   ' + CONVERT(nvarchar(10), @comms)  + N'   (expected 5)';
PRINT N'';

/* A foreign key SQL Server did not verify is a foreign key that is not being
   enforced — it happens after a bulk insert with CHECK_CONSTRAINTS omitted,
   and it is silent. The import script re-trusts every key when it finishes;
   this is the check that says whether it did. */
DECLARE @untrusted int = (SELECT COUNT(*) FROM sys.foreign_keys WHERE is_not_trusted = 1);
IF @untrusted > 0
BEGIN
    PRINT N'  WARNING: ' + CONVERT(nvarchar(10), @untrusted) + N' foreign key(s) are NOT TRUSTED.';
    PRINT N'           They are not being enforced. Repair with:';
    PRINT N'           EXEC sp_MSforeachtable ''ALTER TABLE ? WITH CHECK CHECK CONSTRAINT ALL'';';
    PRINT N'';
END

PRINT N'  Next: load the data  (tools/export-data.mjs, then the file it writes)';
PRINT N'        then create the application login — see SECTION 11 above.';
PRINT N'──────────────────────────────────────────────────────────────';
GO
