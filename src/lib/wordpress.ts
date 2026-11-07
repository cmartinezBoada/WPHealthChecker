import type { Plugin } from '../components/Plugins.tsx'
import type { Plugin as PluginApi, Performance, SanteSite, VersionWp } from '../../server/types.ts'
import { ErreurNonAuthentifie, signalerNonAuthentifie } from './session.ts'

export type { Performance, ProblemeSante, SanteSite, VersionWp } from '../../server/types.ts'

// Appelle le backend (server/), qui seul détient les identifiants WordPress.
// Les réponses sont déjà vérifiées par le serveur.
// Un 401 signifie que la session a expiré : l'application revient au formulaire de connexion.
async function requeteApi<T>(chemin: string): Promise<T> {
  const res = await fetch(`/api${chemin}`)
  if (res.status === 401) {
    signalerNonAuthentifie()
    throw new ErreurNonAuthentifie()
  }
  if (!res.ok) {
    throw new Error(`Erreur ${res.status} : ${res.statusText}`)
  }
  return res.json()
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
