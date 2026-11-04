import type {Plugin} from "../components/Plugins.tsx"
const WP_URL = import.meta.env.VITE_WP_URL
const WP_USER = import.meta.env.VITE_WP_USER
const WP_APP_PASSWORD = import.meta.env.VITE_WP_APP_PASSWORD
export type WpPlugin = {
  plugin: string                    // ex. 'wordfence/wordfence'
  status: 'active' | 'inactive'
  name: string
  version: string
}

// Réponse du plugin WP Health Checker Connector
export type WpPluginUpdate = {
  plugin: string                    // même format que WpPlugin.plugin
  new_version: string
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

// Appelle l'API REST de WordPress avec l'authentification Basic
async function requeteWp(chemin: string): Promise<unknown> {
  const url = `${WP_URL}/wp-json${chemin}`
  console.log('[requeteWp] URL :', url)

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Basic ${btoa(`${WP_USER}:${WP_APP_PASSWORD}`)}`,
      },
    })
  } catch (e) {
    console.error('[requeteWp] Échec réseau (site injoignable ou CORS) :', e)
    throw e
  }
  console.log('[requeteWp] Réponse HTTP :', res.status, res.statusText)

  if (!res.ok) {
    throw new Error(`Erreur ${res.status} : ${res.statusText}`)
  }
  return res.json()
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
export async function chargerVersionWp(): Promise<{ version: string; latest: string | null }> {
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

export type SanteSite = {
  good: number
  recommended: number
  critical: number
}

// Réponse du plugin WP Health Checker Connector : null si Santé du site n'a jamais été analysé
export async function chargerSanteSite(): Promise<SanteSite | null> {
  const donnees: unknown = await requeteWp('/health-checker/v1/site-health')
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
  return { good: donnees.good, recommended: donnees.recommended, critical: donnees.critical }
}

export async function chargerPlugins(): Promise<Plugin[]> {
  console.log('[chargerPlugins] Utilisateur :', WP_USER, '| mot de passe défini :', Boolean(WP_APP_PASSWORD))

  const [donneesPlugins, donneesMisesAJour] = await Promise.all([
    requeteWp('/wp/v2/plugins'),
    requeteWp('/health-checker/v1/updates'),
  ])
  console.log('[chargerPlugins] Données reçues :', donneesPlugins, donneesMisesAJour)
  if (!Array.isArray(donneesPlugins) || !Array.isArray(donneesMisesAJour)) {
    throw new Error('Réponse inattendue de WordPress')
  }

  const misesAJour = new Map(
    (donneesMisesAJour as WpPluginUpdate[]).map((u) => [u.plugin, u.new_version])
  )
  const plugins = (donneesPlugins as WpPlugin[]).map((wp) => versPlugin(wp, misesAJour))
  console.log(`[chargerPlugins] ${plugins.length} plugin(s) converti(s), ${misesAJour.size} mise(s) à jour`)
  return plugins
}
