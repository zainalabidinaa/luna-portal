import { useEffect, useState } from 'react';

// Mirrors TMDBTileBackdropFetcher.swift's own discover queries exactly, so
// Home's Browse-by-Genre/Language tiles here use the same real content art
// MacGenreTile/MacLanguageTile generate on-device — routed through the
// tmdb-discover edge function since TMDB's API itself sends no CORS headers.
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w780';

// TMDB's own stable genre ids (https://api.themoviedb.org/3/genre/movie/list) —
// every one of home_browse_tiles' 18 seeded genre names is a standard TMDB
// genre, so no keyword-search fallback (TMDBKeywordIDs' Anime/Stand-Up Comedy
// path) is needed here.
const TMDB_GENRE_IDS: Record<string, number> = {
  action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, fantasy: 14, history: 36,
  horror: 27, music: 10402, mystery: 9648, romance: 10749, 'sci-fi': 878,
  thriller: 53, war: 10752, western: 37,
};

interface TMDBResult {
  backdrop_path?: string | null;
  poster_path?: string | null;
}

// Cached — a tile's backdrop rarely needs to change within one page session.
const cache = new Map<string, Promise<string | null>>();

async function fetchDiscover(kind: 'movie' | 'tv', params: Record<string, string>): Promise<string | null> {
  const search = new URLSearchParams({ kind, ...params });
  try {
    const res = await fetch(`${FUNCTIONS_URL}/tmdb-discover?${search.toString()}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: TMDBResult[] };
    const path = data.results?.map((r) => r.backdrop_path ?? r.poster_path).find(Boolean);
    return path ? `${IMAGE_BASE}${path}` : null;
  } catch {
    return null;
  }
}

function resolveGenreBackdrop(name: string): Promise<string | null> {
  const key = `genre:${name.toLowerCase()}`;
  let promise = cache.get(key);
  if (!promise) {
    const genreId = TMDB_GENRE_IDS[name.toLowerCase()];
    promise = genreId
      ? fetchDiscover('movie', { with_genres: String(genreId), sort_by: 'popularity.desc', 'vote_count.gte': '50' })
      : Promise.resolve(null);
    cache.set(key, promise);
  }
  return promise;
}

function resolveLanguageBackdrop(iso: string): Promise<string | null> {
  const key = `lang:${iso}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = fetchDiscover('tv', { with_original_language: iso, sort_by: 'popularity.desc', 'vote_count.gte': '20' });
    cache.set(key, promise);
  }
  return promise;
}

/** A real TMDB backdrop for a Home browse tile — `null` while loading or if
 *  TMDB has nothing (caller should fall back to a genre icon / flag emoji). */
export function useTMDBTileBackdrop(kind: 'genre' | 'language', name: string, iso: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    let cancelled = false;
    const promise = kind === 'genre' ? resolveGenreBackdrop(name) : iso ? resolveLanguageBackdrop(iso) : Promise.resolve(null);
    promise.then((result) => { if (!cancelled) setUrl(result); });
    return () => { cancelled = true; };
  }, [kind, name, iso]);

  return url;
}
