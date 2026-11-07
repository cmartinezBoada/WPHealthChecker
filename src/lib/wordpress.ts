import type { Plugin } from '../components/Plugins.tsx'
import type {
  DerniereSauvegarde,
  Plugin as PluginApi,
  Performance,
  ResultatMiseAJourPlugin,
  SanteSite,
  VersionWp,
} from '../../server/types.ts'
import { ErreurNonAuthentifie, signalerNonAuthentifie } from './session.ts'

export type {
  DerniereSauvegarde,
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
    throw await versErreurApi(res)
  }
  return res.json()
}

// Erreur renvoyée par le serveur : message { erreur } et, pour une mise à jour échouée,
// le lien vers la page Extensions de WP Admin
export class ErreurApi extends Error {
  readonly lienWpAdmin: string | null

  constructor(message: string, lienWpAdmin: string | null = null) {
    super(message)
    this.name = 'ErreurApi'
    this.lienWpAdmin = lienWpAdmin
  }
}

// Le lien finit dans un href : seules les URL http(s) sont acceptées
function lienHttp(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null
  try {
    const url = new URL(valeur)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

// Message { erreur } renvoyé par le serveur, sinon le statut HTTP
async function versErreurApi(res: Response): Promise<ErreurApi> {
  try {
    const corps: unknown = await res.json()
    if (typeof corps === 'object' && corps !== null && 'erreur' in corps && typeof corps.erreur === 'string') {
      return new ErreurApi(corps.erreur, lienHttp('lienWpAdmin' in corps ? corps.lienWpAdmin : null))
    }
  } catch {
    // Corps absent ou non JSON
  }
  return new ErreurApi(`Erreur ${res.status} : ${res.statusText}`)
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

export function chargerDerniereSauvegarde(): Promise<DerniereSauvegarde> {
  return requeteApi('/sauvegardes')
}

// null tant que la première mesure WP-Cron n'a pas eu lieu
export function chargerPerformance(): Promise<Performance | null> {
  return requeteApi('/performance')
}
