import { useState } from 'react'
import type { ChargementSauvegarde } from '../lib/sauvegardes'
import { ErreurNonAuthentifie } from '../lib/session'
import { ErreurApi, mettreAJourPlugin } from '../lib/wordpress'
import ConfirmationMiseAJour from './ConfirmationMiseAJour'

export type Plugin = {
  id: string
  name: string
  version: string
  miseAJour: EtatMiseAJour
}

// 'inconnu' : WordPress n'a pas pu vérifier les mises à jour, ce n'est pas « à jour »
type EtatMiseAJour =
  | { etat: 'disponible'; nouvelleVersion: string }
  | { etat: 'a-jour' }
  | { etat: 'inconnu' }

const BADGES_MISE_A_JOUR: Record<EtatMiseAJour['etat'], { texte: string; classes: string }> = {
  disponible: { texte: 'Update available', classes: 'bg-amber-50 text-amber-700' },
  'a-jour': { texte: 'Up to date', classes: 'bg-emerald-50 text-emerald-700' },
  inconnu: { texte: 'Inconnu', classes: 'bg-slate-100 text-slate-600' },
}

type PluginsProps = {
  plugins: Plugin[]
  // Recharge la liste depuis le serveur ; rejette en cas d'échec
  onRecharger: () => Promise<void>
  // Affichée dans la confirmation de mise à jour
  sauvegarde: ChargementSauvegarde
}

// Message affiché sous la ligne d'un plugin après une tentative de mise à jour
type MessagePlugin =
  | { type: 'succes'; texte: string }
  | { type: 'erreur'; texte: string; lienWpAdmin: string | null }

// La page d'accueil ne répondait plus correctement juste après une mise à jour
type AlerteSite = { nom: string; versions: string; httpStatus: number | null }

function texteErreur(e: unknown): string {
  return e instanceof Error ? e.message : 'Erreur inconnue'
}

function Plugins({ plugins, onRecharger, sauvegarde }: PluginsProps) {
  // Une seule mise à jour à la fois : WordPress ne gère pas bien deux mises à jour simultanées
  const [idEnCours, setIdEnCours] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, MessagePlugin>>({})
  const [alertesSite, setAlertesSite] = useState<AlerteSite[]>([])
  // Mise à jour en attente de confirmation (dialogue ouvert)
  const [demande, setDemande] = useState<{ plugin: Plugin; nouvelleVersion: string } | null>(null)

  const definirMessage = (id: string, message: MessagePlugin | null) =>
    setMessages(({ [id]: _ancien, ...autres }) => (message ? { ...autres, [id]: message } : autres))

  const verificationImpossible = plugins.some((plugin) => plugin.miseAJour.etat === 'inconnu')

  // Lancée seulement après confirmation dans ConfirmationMiseAJour
  const mettreAJour = async (plugin: Plugin) => {
    setIdEnCours(plugin.id)
    definirMessage(plugin.id, null)
    try {
      const resultat = await mettreAJourPlugin(plugin.id)
      const versionsReelles = `${resultat.previous_version} → ${resultat.new_version}`
      if (!resultat.site_ok) {
        setAlertesSite((alertes) => [
          ...alertes,
          { nom: plugin.name, versions: versionsReelles, httpStatus: resultat.http_status },
        ])
      }
      try {
        await onRecharger()
        definirMessage(plugin.id, { type: 'succes', texte: `Mis à jour : ${versionsReelles}` })
      } catch (e: unknown) {
        definirMessage(plugin.id, {
          type: 'erreur',
          texte: `Mis à jour (${versionsReelles}), mais la liste n'a pas pu être rechargée : ${texteErreur(e)}`,
          // La mise à jour a réussi : rien à refaire dans WP Admin
          lienWpAdmin: null,
        })
      }
    } catch (e: unknown) {
      // Session expirée : l'application revient déjà au formulaire de connexion
      if (e instanceof ErreurNonAuthentifie) return
      definirMessage(plugin.id, {
        type: 'erreur',
        texte: `Échec de la mise à jour : ${texteErreur(e)}`,
        lienWpAdmin: e instanceof ErreurApi ? e.lienWpAdmin : null,
      })
    } finally {
      setIdEnCours(null)
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Plugins</h2>

      {demande && (
        <ConfirmationMiseAJour
          nomPlugin={demande.plugin.name}
          versionActuelle={demande.plugin.version}
          nouvelleVersion={demande.nouvelleVersion}
          sauvegarde={sauvegarde}
          onConfirmer={() => {
            setDemande(null)
            void mettreAJour(demande.plugin)
          }}
          onAnnuler={() => setDemande(null)}
        />
      )}

      {alertesSite.length > 0 && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {alertesSite.map((alerte, index) => (
              <p key={index}>
                <strong>Le site est peut-être cassé.</strong> Après la mise à jour de « {alerte.nom} » (
                {alerte.versions}), la page d'accueil{' '}
                {alerte.httpStatus === null
                  ? 'ne répond plus'
                  : `répond avec le code HTTP ${alerte.httpStatus}`}
                . Vérifiez le site sans attendre.
              </p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAlertesSite([])}
            className="shrink-0 rounded-md px-2 py-1 font-medium hover:bg-red-100"
          >
            Fermer
          </button>
        </div>
      )}

      {verificationImpossible && (
        <p
          role="status"
          className="mb-3 rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-700"
        >
          <strong>Vérification des mises à jour impossible.</strong> WordPress n'a pas pu interroger
          WordPress.org : des mises à jour sont peut-être disponibles. Rechargez la page pour réessayer.
        </p>
      )}

      <ul className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-4 lg:gap-5 lg:p-6">
        {plugins.map((plugin) => {
          const message = messages[plugin.id]
          const enCours = idEnCours === plugin.id
          const { miseAJour } = plugin
          const badge = BADGES_MISE_A_JOUR[miseAJour.etat]
          return (
            <li key={plugin.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-6 lg:gap-x-10">
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                {plugin.name}
              </span>
              <div className="w-28 shrink-0">
                <p className="text-xs uppercase text-slate-500">Version</p>
                <p className="whitespace-nowrap text-sm text-slate-900">
                  {plugin.version}
                  {miseAJour.etat === 'disponible' && (
                    <span className="text-amber-700"> → {miseAJour.nouvelleVersion}</span>
                  )}
                </p>
              </div>
              <div className="w-32 shrink-0">
                <p className="text-xs uppercase text-slate-500">Update</p>
                <span
                  className={`mt-0.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.classes}`}
                >
                  {badge.texte}
                </span>
              </div>
              {miseAJour.etat === 'disponible' ? (
                <div className="w-full shrink-0 sm:w-36 sm:text-right">
                  <button
                    type="button"
                    onClick={() => setDemande({ plugin, nouvelleVersion: miseAJour.nouvelleVersion })}
                    disabled={idEnCours !== null}
                    className={`rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white hover:bg-slate-700 disabled:opacity-50 ${
                      enCours ? 'disabled:cursor-wait' : 'disabled:cursor-not-allowed'
                    }`}
                  >
                    {enCours ? 'Mise à jour…' : 'Mettre à jour'}
                  </button>
                </div>
              ) : (
                // Garde les colonnes alignées avec les lignes qui ont un bouton
                <div className="hidden w-36 shrink-0 sm:block" />
              )}
              {message && (
                <p
                  role={message.type === 'erreur' ? 'alert' : 'status'}
                  className={`basis-full text-sm ${
                    message.type === 'erreur' ? 'text-red-600' : 'text-emerald-700'
                  }`}
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
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default Plugins
