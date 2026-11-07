import { WP_APP_PASSWORD, WP_URL, WP_USER } from './config.ts'
import type {
  Performance,
  Plugin,
  ProblemeSante,
  ResultatMiseAJourPlugin,
  SanteSite,
  VersionWp,
} from './types.ts'

// Réponse de /wp/v2/plugins
type WpPlugin = {
  plugin: string                    // ex. 'wordfence/wordfence'
  name: string
  version: string
}

// Réponse du plugin WP Health Checker Connector
type WpPluginUpdate = {
  plugin: string                    // même format que WpPlugin.plugin
  new_version: string
}

const AUTORISATION = `Basic ${Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64')}`

// Erreur renvoyée par WordPress (WP_Error) : status HTTP et message lisible
export class ErreurWordPress extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ErreurWordPress'
    this.status = status
  }
}

// Message d'un WP_Error ({ code, message, data }), sinon le statut HTTP
async function messageErreurWp(res: Response, url: string): Promise<string> {
  try {
    const corps: unknown = await res.json()
    if (typeof corps === 'object' && corps !== null && 'message' in corps && typeof corps.message === 'string') {
      return corps.message
    }
  } catch {
    // Corps absent ou non JSON
  }
  return `Erreur ${res.status} : ${res.statusText} (${url})`
}

// Appelle l'API REST de WordPress avec l'authentification Basic.
// Avec un corps, la requête est un POST JSON.
async function requeteWp(chemin: string, corps?: unknown): Promise<unknown> {
  const url = `${WP_URL}/wp-json${chemin}`
  const options: RequestInit =
    corps === undefined
      ? { headers: { Authorization: AUTORISATION } }
      : {
          method: 'POST',
          headers: { Authorization: AUTORISATION, 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        }

  let res: Response
  try {
    res = await fetch(url, options)
  } catch (e) {
    throw new Error(`WordPress injoignable (${url})`, { cause: e })
  }

  if (!res.ok) {
    throw new ErreurWordPress(res.status, await messageErreurWp(res, url))
  }
  // 204 No Content : WordPress n'envoie pas de corps quand la réponse vaut null
  if (res.status === 204) {
    return null
  }
  return res.json()
}

function estWpPlugin(valeur: unknown): valeur is WpPlugin {
  return (
    typeof valeur === 'object' && valeur !== null &&
    'plugin' in valeur && typeof valeur.plugin === 'string' &&
    'name' in valeur && typeof valeur.name === 'string' &&
    'version' in valeur && typeof valeur.version === 'string'
  )
}

function estWpPluginUpdate(valeur: unknown): valeur is WpPluginUpdate {
  return (
    typeof valeur === 'object' && valeur !== null &&
    'plugin' in valeur && typeof valeur.plugin === 'string' &&
    'new_version' in valeur && typeof valeur.new_version === 'string'
  )
}

export function versPlugin(wp: WpPlugin, misesAJour: Map<string, string>): Plugin {
  const newVersion = misesAJour.get(wp.plugin)
  return {
    id: wp.plugin,
    name: wp.name,
    version: wp.version,
    updateAvailable: newVersion !== undefined,
    newVersion,
  }
}

export async function chargerPlugins(): Promise<Plugin[]> {
  const [donneesPlugins, donneesMisesAJour] = await Promise.all([
    requeteWp('/wp/v2/plugins'),
    requeteWp('/health-checker/v1/updates'),
  ])
  if (!Array.isArray(donneesPlugins) || !Array.isArray(donneesMisesAJour)) {
    throw new Error('Réponse inattendue de WordPress')
  }

  const misesAJour = new Map(
    donneesMisesAJour.filter(estWpPluginUpdate).map((u) => [u.plugin, u.new_version])
  )
  return donneesPlugins.filter(estWpPlugin).map((wp) => versPlugin(wp, misesAJour))
}

// Même format que /wp/v2/plugins : 'dossier/fichier' ou 'fichier', sans point (donc ni '..' ni '.php')
export const FORMAT_ID_PLUGIN = /^[^./]+(?:\/[^./]+)?$/

const DELAI_VERIFICATION_SITE_MS = 15_000

// Vérifie depuis Node que la page d'accueil répond toujours après la mise à jour
async function verifierPageAccueil(): Promise<{ site_ok: boolean; http_status: number | null }> {
  try {
    // Paramètre unique : un cache de page ne doit pas servir l'ancienne version du site
    const res = await fetch(`${WP_URL}/?whc_verification=${Date.now()}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(DELAI_VERIFICATION_SITE_MS),
    })
    await res.body?.cancel()
    return { site_ok: res.ok, http_status: res.status }
  } catch (e) {
    console.error('[api] Page d\'accueil injoignable après la mise à jour :', e)
    return { site_ok: false, http_status: null }
  }
}

// Met à jour un plugin via le connecteur, puis vérifie que le site répond toujours
export async function mettreAJourPlugin(id: string): Promise<ResultatMiseAJourPlugin> {
  const donnees = await requeteWp('/health-checker/v1/update-plugin', { plugin: id })
  if (
    typeof donnees !== 'object' || donnees === null ||
    !('plugin' in donnees) || typeof donnees.plugin !== 'string' ||
    !('previous_version' in donnees) || typeof donnees.previous_version !== 'string' ||
    !('new_version' in donnees) || typeof donnees.new_version !== 'string'
  ) {
    throw new Error('Réponse inattendue de WordPress')
  }
  return {
    plugin: donnees.plugin,
    previous_version: donnees.previous_version,
    new_version: donnees.new_version,
    ...(await verifierPageAccueil()),
  }
}

// L'index de l'API REST (/wp-json) contient le titre du site dans "name"
export async function chargerNomProjet(): Promise<string> {
  const donnees = await requeteWp('')
  if (typeof donnees !== 'object' || donnees === null || !('name' in donnees) || typeof donnees.name !== 'string') {
    throw new Error('Réponse inattendue de WordPress')
  }
  return donnees.name
}

// Réponse du plugin WP Health Checker Connector : { version: '6.8.1', latest: '6.8.2' | null }
export async function chargerVersionWp(): Promise<VersionWp> {
  const donnees = await requeteWp('/health-checker/v1/version')
  if (
    typeof donnees !== 'object' || donnees === null ||
    !('version' in donnees) || typeof donnees.version !== 'string' ||
    !('latest' in donnees) || (donnees.latest !== null && typeof donnees.latest !== 'string')
  ) {
    throw new Error('Réponse inattendue de WordPress')
  }
  return { version: donnees.version, latest: donnees.latest }
}

function estProblemeSante(valeur: unknown): valeur is ProblemeSante {
  return (
    typeof valeur === 'object' && valeur !== null &&
    'test' in valeur && typeof valeur.test === 'string' &&
    'status' in valeur && (valeur.status === 'critical' || valeur.status === 'recommended')
  )
}

// Réponse du plugin WP Health Checker Connector : null si Santé du site n'a jamais été analysé
export async function chargerSanteSite(): Promise<SanteSite | null> {
  const donnees = await requeteWp('/health-checker/v1/site-health')
  if (donnees === null) {
    return null
  }
  if (
    typeof donnees !== 'object' ||
    !('good' in donnees) || typeof donnees.good !== 'number' ||
    !('recommended' in donnees) || typeof donnees.recommended !== 'number' ||
    !('critical' in donnees) || typeof donnees.critical !== 'number'
  ) {
    throw new Error('Réponse inattendue de WordPress')
  }
  // "issues" est absent avec une ancienne version du plugin connecteur
  const issues = 'issues' in donnees && Array.isArray(donnees.issues)
    ? donnees.issues.filter(estProblemeSante)
    : []
  return { good: donnees.good, recommended: donnees.recommended, critical: donnees.critical, issues }
}

// Mesurée toutes les heures par WP-Cron : null tant que la première mesure n'a pas eu lieu
export async function chargerPerformance(): Promise<Performance | null> {
  const donnees = await requeteWp('/health-checker/v1/performance')
  if (donnees === null) {
    return null
  }
  if (
    typeof donnees !== 'object' ||
    !('response_time_ms' in donnees) || typeof donnees.response_time_ms !== 'number' ||
    !('measured_at' in donnees) || typeof donnees.measured_at !== 'number'
  ) {
    throw new Error('Réponse inattendue de WordPress')
  }
  return { response_time_ms: donnees.response_time_ms, measured_at: donnees.measured_at }
}
