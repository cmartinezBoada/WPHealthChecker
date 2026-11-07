import type { Status } from '../components/StatusCard'
import type { DerniereSauvegarde } from './wordpress'

// Âge de la dernière sauvegarde : ok en dessous du premier seuil, critique au-delà du second
export const SEUIL_SAUVEGARDE_OK_JOURS = 7
export const SEUIL_SAUVEGARDE_CRITIQUE_JOURS = 30

const MS_PAR_JOUR = 24 * 60 * 60 * 1000

// Du plus grand au plus petit : la première unité atteinte est utilisée
const UNITES: { unite: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unite: 'year', ms: 365 * MS_PAR_JOUR },
  { unite: 'month', ms: 30 * MS_PAR_JOUR },
  { unite: 'week', ms: 7 * MS_PAR_JOUR },
  { unite: 'day', ms: MS_PAR_JOUR },
  { unite: 'hour', ms: 60 * 60 * 1000 },
  { unite: 'minute', ms: 60 * 1000 },
]

// numeric: 'always' : « il y a 2 jours » plutôt que « avant-hier »
const formatRelatif = new Intl.RelativeTimeFormat('fr', { numeric: 'always' })

// « il y a 2 jours », « il y a 3 ans »… ; une date future (horloges décalées) compte comme maintenant
export function formaterAnciennete(date: Date, maintenant: Date): string {
  const ecartMs = Math.max(0, maintenant.getTime() - date.getTime())
  for (const { unite, ms } of UNITES) {
    if (ecartMs >= ms) {
      return formatRelatif.format(-Math.floor(ecartMs / ms), unite)
    }
  }
  return "à l'instant"
}

export function ageEnJours(date: Date, maintenant: Date): number {
  return Math.max(0, maintenant.getTime() - date.getTime()) / MS_PAR_JOUR
}

export function statutAnciennete(jours: number): Status {
  if (jours < SEUIL_SAUVEGARDE_OK_JOURS) return 'ok'
  if (jours < SEUIL_SAUVEGARDE_CRITIQUE_JOURS) return 'warning'
  return 'critical'
}

// Chargement de la dernière sauvegarde côté tableau de bord (carte et confirmation de mise à jour)
export type ChargementSauvegarde =
  | { etat: 'chargement' }
  | { etat: 'erreur' }
  | { etat: 'charge'; sauvegarde: DerniereSauvegarde }

export type DescriptionSauvegarde = {
  texte: string                     // ex. 'il y a 3 ans', 'Aucune sauvegarde'
  status: Status
  // Mise en avant en rouge avant une mise à jour : plus de 7 jours, ou aucune sauvegarde
  alerte: boolean
}

export function decrireSauvegarde(sauvegarde: DerniereSauvegarde, maintenant: Date): DescriptionSauvegarde {
  switch (sauvegarde.state) {
    case 'found': {
      const date = new Date(sauvegarde.created_at)
      const status = statutAnciennete(ageEnJours(date, maintenant))
      return { texte: formaterAnciennete(date, maintenant), status, alerte: status !== 'ok' }
    }
    case 'none':
      return { texte: 'Aucune sauvegarde', status: 'critical', alerte: true }
    case 'unknown':
      return { texte: 'Duplicator non détecté', status: 'warning', alerte: false }
  }
}
