import type { Plugin } from '../components/Plugins.tsx'
import type {
  Plugin as PluginApi,
  Performance,
  ResultatMiseAJourPlugin,
  SanteSite,
  VersionWp,
} from '../../server/types.ts'
import { ErreurNonAuthentifie, signalerNonAuthentifie } from './session.ts'

export type {
  Performance,
  ProblemeSante,
  ResultatMiseAJourPlugin,
  SanteSite,
  VersionWp,
} from '../../server/types.ts'

// Appelle le backend (server/), qui seul détient les identifiants WordPress.
// Les réponses sont déjà vérifiées par le serveur.
// Un 401 signifie que la session a expiré : l'application revient au formulaire de connexion.
async function requeteApi<T>(chemin: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${chemin}`, options)
  if (res.status === 401) {
    signalerNonAuthentifie()
    throw new ErreurNonAuthentifie()
  }
  if (!res.ok) {
    throw new Error(await messageErreur(res))
  }
  return res.json()
}

// Message { erreur } renvoyé par le serveur, sinon le statut HTTP
async function messageErreur(res: Response): Promise<string> {
  try {
    const corps: unknown = await res.json()
    if (typeof corps === 'object' && corps !== null && 'erreur' in corps && typeof corps.erreur === 'string') {
      return corps.erreur
    }
  } catch {
    // Corps absent ou non JSON
  }
  return `Erreur ${res.status} : ${res.statusText}`
}

// L'identifiant contient un '/' (ex. 'wordfence/wordfence') : il est encodé dans l'URL
export function mettreAJourPlugin(id: string): Promise<ResultatMiseAJourPlugin> {
  return requeteApi(`/plugins/${encodeURIComponent(id)}/update`, { method: 'POST' })
}

export async function chargerPlugins(): Promise<Plugin[]> {
  // PluginApi[] assignable à Plugin[] : les deux types restent synchronisés à la compilation
  const plugins: PluginApi[] = await requeteApi('/plugins')
  return plugins
}

export function chargerNomProjet(): Promise<string> {
  return requeteApi('/nom-projet')
}

export function chargerVersionWp(): Promise<VersionWp> {
  return requeteApi('/version-wp')
}

// null si Santé du site n'a jamais été analysé
export function chargerSanteSite(): Promise<SanteSite | null> {
  return requeteApi('/sante-site')
}

// null tant que la première mesure WP-Cron n'a pas eu lieu
export function chargerPerformance(): Promise<Performance | null> {
  return requeteApi('/performance')
}
