// ── Apps to hide from the launcher grid ─────────────────────────────────────
export const HIDDEN_PACKAGES = new Set([
  'com.google.android.play.games',
  'com.google.android.videos',
]);

// ── Known app names & brand colors ──────────────────────────────────────────
export const APP_DB: Record<string, { name: string; color: string }> = {
  'com.netflix.ninja':                     { name: 'Netflix',        color: '#E50914' },
  'com.google.android.youtube.tv':         { name: 'YouTube',        color: '#FF0000' },
  'com.google.android.youtube.tvkids':     { name: 'YouTube Kids',   color: '#FF5252' },
  'com.google.android.youtube.tvmusic':    { name: 'YouTube Music',  color: '#FF0000' },
  'com.google.android.youtube.tvunplugged':{ name: 'YouTube TV',     color: '#FF0000' },
  'com.disney.disneyplus':                 { name: 'Disney+',        color: '#0063E5' },
  'com.amazon.amazonvideo.livingroom':     { name: 'Prime Video',    color: '#00A8E0' },
  'com.hulu.plus':                         { name: 'Hulu',           color: '#1CE783' },
  'com.hulu.livingroomplus':               { name: 'Hulu',           color: '#1CE783' },
  'com.apple.atve.androidtv.appletv':      { name: 'Apple TV',       color: '#3A3A3C' },
  'com.apple.atve.googleplay.appletv':     { name: 'Apple TV',       color: '#3A3A3C' },
  'com.apple.atve.amazon.appletv':         { name: 'Apple TV',       color: '#3A3A3C' },
  'com.wbd.stream':                        { name: 'HBO Max',        color: '#002BE7' },
  'com.hbo.hbonow':                        { name: 'HBO Now',        color: '#4A4A4A' },
  'com.max.android.tv':                    { name: 'HBO Max',        color: '#002BE7' },
  'com.peacocktv.peacockandroid':          { name: 'Peacock',        color: '#1D1D1F' },
  'com.paramountplus.atve.android':        { name: 'Paramount+',     color: '#0064FF' },
  'tv.pluto.android':                      { name: 'Pluto TV',       color: '#1A1A2E' },
  'com.tubitv':                            { name: 'Tubi',           color: '#FA4716' },
  'com.crunchyroll.crunchyroid':           { name: 'Crunchyroll',    color: '#F47521' },
  'com.espn.sportscenter':                 { name: 'ESPN',           color: '#CC0000' },
  'air.WatchESPN':                         { name: 'ESPN',           color: '#CC0000' },
  'com.spotify.tv.android':               { name: 'Spotify',         color: '#1DB954' },
  'com.pandora.android.atv':              { name: 'Pandora',         color: '#224099' },
  'com.sling':                             { name: 'Sling TV',       color: '#FF6B00' },
  'com.philo.philo':                       { name: 'Philo',          color: '#FFC524' },
  'com.showtime.standalone':               { name: 'Showtime',       color: '#C8102E' },
  'com.amc.amcplus':                       { name: 'AMC+',           color: '#2D2D2D' },
  'com.plexapp.android':                   { name: 'Plex',           color: '#E5A00D' },
  'org.jellyfin.androidtv':               { name: 'Jellyfin',        color: '#00A4DC' },
  'com.emby.embyatv':                      { name: 'Emby',           color: '#52B54B' },
  'app.kodi':                              { name: 'Kodi',           color: '#17B2E7' },
  'com.kodi':                              { name: 'Kodi',           color: '#17B2E7' },
  'tv.fubo.mobile':                        { name: 'FuboTV',         color: '#4CAF50' },
  'com.fandangonow':                       { name: 'Vudu',           color: '#3399FF' },
  'com.vudu.air.androidplayer':            { name: 'Vudu',           color: '#3399FF' },
  'com.mxtech.videoplayer.atv':            { name: 'MX Player',      color: '#FF6600' },
  'com.twitch.android.viewer':             { name: 'Twitch',         color: '#9146FF' },
  'com.starz.starzplay':                   { name: 'Starz',          color: '#8B1A1A' },
  'com.directv.dtv':                       { name: 'DirecTV',        color: '#009BDE' },
  'com.cnn.mobile.cnn.phone':              { name: 'CNN',            color: '#CC0000' },
  'com.hallmarkchannel.hallmarkchanneleverywhere': { name: 'Hallmark', color: '#7B2F8B' },
  'com.discoveryplus.android':             { name: 'Discovery+',     color: '#2175D9' },
  'com.bravotv.bravo':                     { name: 'Bravo',          color: '#DD1133' },
  'com.nbc.NBCEverywhere':                 { name: 'NBC',            color: '#0045A1' },
  'tv.apmc.android.victorysports':         { name: 'Victory+',       color: '#D4A017' },
  'com.formulaone.production':             { name: 'F1 TV',          color: '#E8002D' },
  'com.kiswe.androidtv.myaew':             { name: 'MyAEW',          color: '#C89B3C' },
  'com.rohwrestling.android':              { name: 'ROH Wrestling',   color: '#CC0000' },
  'com.roku.web.trc':                      { name: 'Roku',           color: '#6C2DC7' },
};

export const PALETTE = ['#4285F4','#EA4335','#34A853','#FBBC04','#AB47BC','#26A69A','#EF5350','#7E57C2','#FF7043','#29B6F6'];

// Segments that should never be used as a display name fallback
export const SKIP_SEGMENTS = new Set([
  'android', 'tv', 'atv', 'app', 'application',
  'mobile', 'phone', 'tablet', 'watch',
  'plus', 'pro', 'lite', 'free', 'premium',
  'player', 'viewer', 'stream', 'media',
  'com', 'org', 'net', 'io', 'co', 'air',
]);

export function fallbackName(pkg: string): string {
  const segments = pkg.split('.').filter(s => s && !SKIP_SEGMENTS.has(s.toLowerCase()));
  // Prefer the first meaningful segment after the TLD (e.g. "plexapp" from "com.plexapp.android")
  const name = segments[0] ?? pkg.split('.').pop() ?? pkg;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function colorFor(pkg: string): string {
  let hash = 0;
  for (const ch of pkg) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export interface AppInfo {
  package: string;
  component: string;
  name: string;
  color: string;
}

/**
 * Resolve display name and color for an app package.
 * Checks APP_DB first, then deviceLabels, then falls back to generated values.
 */
export function resolveApp(pkg: string, deviceLabels: Map<string, string>): { name: string; color: string } {
  const db = APP_DB[pkg];
  const name = db?.name ?? deviceLabels.get(pkg) ?? fallbackName(pkg);
  const color = db?.color ?? colorFor(pkg);
  return { name, color };
}
