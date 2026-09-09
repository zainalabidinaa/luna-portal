export type UserRole = 'admin' | 'friends_family' | 'premium' | 'premium_plus' | 'free' | 'restricted';

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  avatar_color: string | null;
  avatar_id: number | null;
  profile_index: number;
  uses_primary_addons: boolean;
  pin_enabled: boolean;
  role: UserRole;
  role_expires_at: string | null;
  created_at: string;
  curated_setup_installed: boolean;
  curated_setup_synced_at: string | null;
}

export interface InstalledAddon {
  id: string;
  profile_id: string;
  addon_url: string;
  addon_name: string | null;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  /** 'curated' rows are provisioned from the admin's list and re-mirrored by the
   *  sync pass; 'user' rows are the user's own and are never auto-removed. */
  source: 'user' | 'curated';
  /** Admin-only flag: marks an addon as a stream source, so it is excluded from
   *  provisioning unless curated_addon_settings.curated_streams_enabled is on. */
  provides_stream: boolean;
}

export interface InviteCode {
  code: string;
  created_by: string | null;
  used_by: string | null;
  used_email: string | null;
  used_at: string | null;
  created_at: string;
  expires_at: string | null;
  max_uses: number;
  is_active: boolean;
  role_duration_days: number | null;
  /** When true, redeeming this code also provisions the admin's stream addons,
   *  not just catalogs/metadata/subtitles. */
  includes_streams: boolean;
}

export interface Collection {
  id: string;
  name: string;
  sort_order: number;
  backdrop_image: string | null;
  view_mode: string;
  show_all_tab: boolean;
  focus_glow_enabled: boolean;
  pin_to_top: boolean;
  enabled: boolean;
  show_on_home: boolean;
  show_ios_home: boolean;
  show_ios_movies: boolean;
  show_ios_series: boolean;
  show_mac_home: boolean;
  show_mac_movies: boolean;
  show_mac_series: boolean;
  created_at: string;
  parent_collection_id: string | null;
  parent_folder_id: string | null;
  /** NULL = shared/admin-curated collection. Non-null = personal collection
   *  owned by that profile, private to them via RLS. */
  owner_profile_id: string | null;
  /** Publish gate — 'draft' work is invisible everywhere until published.
   *  Every existing row is backfilled to 'published' (see
   *  20260909_collections_status_and_display_section.sql), so 'draft' only
   *  ever means "created after this column existed and not yet published." */
  status: 'draft' | 'published';
  /** Rows-vs-hub choice a curator publishes for every viewer — distinct from
   *  the app's local, per-device admin preview toggle (CollectionDisplayPreferenceStore,
   *  never synced). null keeps the existing default hub-row fallback. */
  display_section: 'rows' | 'hub' | null;
}

export interface Folder {
  id: string;
  collection_id: string;
  name: string;
  cover_image: string | null;
  focus_gif: string | null;
  sort_order: number;
  title_logo: string | null;
  hero_backdrop: string | null;
  hero_video_url: string | null;
  hide_title: boolean;
  tile_shape: string;
  focus_gif_enabled: boolean;
  enabled: boolean;
  parent_folder_id: string | null;
}

export interface FolderSource {
  id: string;
  folder_id: string;
  provider: string;
  title: string | null;
  tmdb_id: string | null;
  media_type: string | null;
  sort_order: number;
}

export interface FolderCatalog {
  id: string;
  folder_id: string;
  catalog_id: string;
  media_type: string;
  genre: string | null;
  extras: Record<string, string> | null;
  /** The installed_addons row this catalog was picked from. NULL for legacy
   *  admin-curated rows, or when the addon has since been deleted. */
  addon_id: string | null;
}

export interface LanguageHubRail {
  id: string;
  /** 'general' rows with iso=null are MacLanguageHubView's shared default
   *  tier; a language's own 'general' rows (iso set) fully replace those
   *  defaults for that language (not merged) — matching the Arabic-only
   *  override that existed before this table did. 'featured' rows are
   *  always additive per-language rails. */
  tier: 'general' | 'featured';
  iso: string | null;
  title: string;
  kind: 'movie' | 'tv' | 'both';
  filter_type: 'language' | 'country';
  /** '' with filter_type='language' means "use this language's own iso" —
   *  a non-empty value only occurs with filter_type='country' (pooled
   *  country codes, e.g. Arabic's regional groupings). */
  filter_value: string;
  params: Record<string, string>;
  sort_order: number;
}

export interface HomePreset {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  locale_tag: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface HomePresetItemDataSource {
  // Widened beyond 'collection' so a row with an unrecognized kind (a manual
  // DB edit, a legacy row, or a future non-collection producer) type-checks
  // instead of silently assuming collectionId exists.
  kind: string;
  collectionId?: string;
}

export interface HomePresetItem {
  id: string;
  preset_id: string;
  /** Which of the on-device Home/Movies/Series tabs this item populates —
   *  see 20260910_home_preset_items_tab_scope.sql. Independent of
   *  media_type, which narrows content *within* whichever tab this is. */
  tab: 'home' | 'movies' | 'series';
  // Mirrors WidgetDataSource's encoded shape (Packages/MoonlitCore/Sources/
  // MoonlitCore/Models/WidgetModels.swift). Only the 'collection' kind is
  // producible from the portal today.
  data_source: HomePresetItemDataSource;
  media_type: 'movie' | 'series' | null;
  style: string;
  sort_order: number;
}

export type Plan = 'premium' | 'premium_plus';

export type SupportTopic = 'general' | 'billing' | 'account' | 'playback' | 'bug';
export type SupportStatus = 'new' | 'open' | 'resolved';

export interface SupportRequest {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  topic: SupportTopic;
  message: string;
  status: SupportStatus;
  created_at: string;
  resolved_at: string | null;
  /** Set once the request has been emailed to the team inbox. */
  notified_at: string | null;
  /** Set once the sender has been sent their confirmation copy. */
  confirmed_at: string | null;
  /** Salted hash of the submitter's IP, used only for rate limiting. */
  submitter_ip_hash: string | null;
}
