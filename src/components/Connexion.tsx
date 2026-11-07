import { useState, type ChangeEvent, type SubmitEvent } from 'react'
import { seConnecter } from '../lib/session'

type ConnexionProps = {
  appName: string
  logoSrc: string
  onConnexion: (utilisateur: string) => void
}

type EtatFormulaire = { etat: 'saisie' } | { etat: 'envoi' } | { etat: 'erreur'; message: string }

function Connexion({ appName, logoSrc, onConnexion }: ConnexionProps) {
  const [utilisateur, setUtilisateur] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [etatFormulaire, setEtatFormulaire] = useState<EtatFormulaire>({ etat: 'saisie' })
  const enCours = etatFormulaire.etat === 'envoi'

  const changerUtilisateur = (e: ChangeEvent<HTMLInputElement>) => setUtilisateur(e.target.value)
  const changerMotDePasse = (e: ChangeEvent<HTMLInputElement>) => setMotDePasse(e.target.value)

  const soumettre = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (enCours) return
    setEtatFormulaire({ etat: 'envoi' })
    try {
      onConnexion(await seConnecter(utilisateur, motDePasse))
    } catch (erreur: unknown) {
      setMotDePasse('')
      setEtatFormulaire({
        etat: 'erreur',
        message: erreur instanceof Error ? erreur.message : 'Erreur inconnue',
      })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={soumettre}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <img src={logoSrc} alt="" className="h-10 w-10 shrink-0" />
          <h1 className="text-lg font-bold text-slate-900">{appName}</h1>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Identifiant
          <input
            type="text"
            name="utilisateur"
            autoComplete="username"
            required
            autoFocus
            value={utilisateur}
            onChange={changerUtilisateur}
            disabled={enCours}
            className="rounded-lg border border-slate-300 px-3 py-2 font-normal text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Mot de passe
          <input
            type="password"
            name="motDePasse"
            autoComplete="current-password"
            required
            value={motDePasse}
            onChange={changerMotDePasse}
            disabled={enCours}
            className="rounded-lg border border-slate-300 px-3 py-2 font-normal text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100"
          />
        </label>

        {etatFormulaire.etat === 'erreur' && (
          <p role="alert" className="text-sm text-red-600">
            {etatFormulaire.message}
          </p>
        )}

        <button
          type="submit"
          disabled={enCours}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
        >
          {enCours ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}

export default Connexion
