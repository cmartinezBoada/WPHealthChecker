import { WP_APP_PASSWORD, WP_URL, WP_USER } from './config.ts'
import type { Performance, Plugin, ProblemeSante, SanteSite, VersionWp } from './types.ts'

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

// Appelle l'API REST de WordPress avec l'authentification Basic
async function requeteWp(chemin: string): Promise<unknown> {
  const url = `${WP_URL}/wp-json${chemin}`

  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: AUTORISATION } })
  } catch (e) {
    throw new Error(`WordPress injoignable (${url})`, { cause: e })
  }

  if (!res.ok) {
    throw new Error(`Erreur ${res.status} : ${res.statusText} (${url})`)
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
