import { useState } from 'react'
import type { ChargementSauvegarde } from '../lib/sauvegardes'
import { ErreurNonAuthentifie } from '../lib/session'
import { ErreurApi, mettreAJourWordPress, type VersionWp } from '../lib/wordpress'
import ConfirmationMiseAJour from './ConfirmationMiseAJour'
import StatusCard, { type HealthItem } from './StatusCard'

// Pas de carte pendant le chargement, comme les autres cartes
export type ChargementVersionWp = { etat: 'erreur' } | { etat: 'charge'; version: VersionWp }

type CarteWordPressProps = {
  chargement: ChargementVersionWp
  sauvegarde: ChargementSauvegarde
  // Une mise à jour de plugin est en cours : pas de mise à jour de WordPress en parallèle
  bloque: boolean
  onOccupation: (enCours: boolean) => void
  // Recharge la version depuis le serveur ; rejette en cas d'échec
  onRecharger: () => Promise<void>
}

const TYPES_MISE_A_JOUR: Record<
  NonNullable<VersionWp['update_type']>,
  { court: string; precision: string; important: boolean }
> = {
  minor: {
    court: 'mineure',
    precision: 'Mise à jour mineure : corrections et sécurité, sans nouvelle fonctionnalité.',
    important: false,
  },
  major: {
    court: 'majeure',
    precision: 'Mise à jour majeure : nouvelles fonctionnalités. Vérifiez la compatibilité des plugins et du thème.',
    important: true,
  },
}

const PRECISION_TYPE_INCONNU = { texte: 'Type de mise à jour inconnu (mineure ou majeure).', important: true }

type Message =
  | { type: 'succes'; texte: string }
  | { type: 'erreur'; texte: string; lienWpAdmin: string | null }

function texteErreur(e: unknown): string {
  return e instanceof Error ? e.message : 'Erreur inconnue'
}

function texteStatutHttp(statut: number | null): string {
  return statut === null ? 'ne répond pas' : `répond avec le code HTTP ${statut}`
}

function versCarte(chargement: ChargementVersionWp): HealthItem {
  const name = 'WordPress Core'
  if (chargement.etat === 'erreur') {
    return { name, value: 'Indisponible', status: 'warning' }
  }
  const { version, latest, update_type } = chargement.version
  if (latest === null) {
    return { name, value: `v${version}`, status: 'ok' }
  }
  const type = update_type ? ` · ${TYPES_MISE_A_JOUR[update_type].court}` : ''
  return { name, value: `v${version} → ${latest}${type}`, status: 'warning' }
}

function CarteWordPress({ chargement, sauvegarde, bloque, onOccupation, onRecharger }: CarteWordPressProps) {
  const [demande, setDemande] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [alerteSite, setAlerteSite] = useState<string | null>(null)

  const offre =
    chargement.etat === 'charge' && chargement.version.latest !== null
      ? { ...chargement.version, latest: chargement.version.latest }
      : null

  // Lancée seulement après confirmation dans ConfirmationMiseAJour
  const mettreAJour = async () => {
    setEnCours(true)
    onOccupation(true)
    setMessage(null)
    setAlerteSite(null)
    try {
      const resultat = await mettreAJourWordPress()
      const versions = `${resultat.previous_version} → ${resultat.new_version}`
      if (!resultat.site_ok) {
        setAlerteSite(
          `Après la mise à jour de WordPress (${versions}), la page d'accueil ${texteStatutHttp(
            resultat.accueil_http_status
          )} et l'API REST ${texteStatutHttp(resultat.api_http_status)}. Vérifiez le site sans attendre.`
        )
      }
      try {
        await onRecharger()
        setMessage({ type: 'succes', texte: `WordPress mis à jour : ${versions}` })
      } catch (e: unknown) {
        setMessage({
          type: 'erreur',
          texte: `WordPress mis à jour (${versions}), mais la carte n'a pas pu être rechargée : ${texteErreur(e)}`,
          // La mise à jour a réussi : rien à refaire dans WP Admin
          lienWpAdmin: null,
        })
      }
    } catch (e: unknown) {
      // Session expirée : l'application revient déjà au formulaire de connexion
      if (e instanceof ErreurNonAuthentifie) return
      setMessage({
        type: 'erreur',
        texte: `Échec de la mise à jour de WordPress : ${texteErreur(e)}`,
        lienWpAdmin: e instanceof ErreurApi ? e.lienWpAdmin : null,
      })
    } finally {
      setEnCours(false)
      onOccupation(false)
    }
  }

  return (
    <StatusCard {...versCarte(chargement)}>
      {offre && (
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setDemande(true)}
            disabled={enCours || bloque}
            title={bloque ? 'Une mise à jour de plugin est en cours' : undefined}
            className={`self-start rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white hover:bg-slate-700 disabled:opacity-50 ${
              enCours ? 'disabled:cursor-wait' : 'disabled:cursor-not-allowed'
            }`}
          >
            {enCours ? 'Mise à jour de WordPress…' : 'Mettre à jour WordPress'}
          </button>
          {enCours && (
            <p role="status" className="flex items-center gap-2 text-sm text-slate-700">
              <span
                aria-hidden="true"
                className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
              />
              Mise à jour en cours : cela peut prendre quelques minutes. Gardez cette page ouverte pour voir
              le résultat.
            </p>
          )}
        </div>
      )}

      {alerteSite && (
        <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <strong>Le site est peut-être cassé.</strong> {alerteSite}
        </p>
      )}

      {message && (
        <p
          role={message.type === 'erreur' ? 'alert' : 'status'}
          className={`mt-3 text-sm ${message.type === 'erreur' ? 'text-red-600' : 'text-emerald-700'}`}
        >
          {message.texte}
          {message.type === 'erreur' && message.lienWpAdmin && (
            <>
              {' '}
              <a
                href={message.lienWpAdmin}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium whitespace-nowrap underline hover:text-red-800"
              >
                Mettre à jour depuis WP Admin
              </a>
            </>
          )}
        </p>
      )}

      {demande && offre && (
        <ConfirmationMiseAJour
          titre="Mettre à jour WordPress ?"
          versionActuelle={offre.version}
          nouvelleVersion={offre.latest}
          precision={
            offre.update_type
              ? {
                  texte: TYPES_MISE_A_JOUR[offre.update_type].precision,
                  important: TYPES_MISE_A_JOUR[offre.update_type].important,
                }
              : PRECISION_TYPE_INCONNU
          }
          libelleConfirmer="Mettre à jour WordPress"
          sauvegarde={sauvegarde}
          onConfirmer={() => {
            setDemande(false)
            void mettreAJour()
          }}
          onAnnuler={() => setDemande(false)}
        />
      )}
    </StatusCard>
  )
}

export default CarteWordPress
