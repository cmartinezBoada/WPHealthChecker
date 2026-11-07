import { useEffect, useId, useRef } from 'react'
import { decrireSauvegarde, SEUIL_SAUVEGARDE_OK_JOURS, type ChargementSauvegarde } from '../lib/sauvegardes'

type ConfirmationMiseAJourProps = {
  nomPlugin: string
  versionActuelle: string
  nouvelleVersion: string
  sauvegarde: ChargementSauvegarde
  onConfirmer: () => void
  onAnnuler: () => void
}

type LigneSauvegarde = { texte: string; alerte: boolean }

function ligneSauvegarde(sauvegarde: ChargementSauvegarde): LigneSauvegarde {
  switch (sauvegarde.etat) {
    case 'chargement':
      return { texte: 'Dernière sauvegarde : vérification…', alerte: false }
    case 'erreur':
      return { texte: 'Dernière sauvegarde : impossible à vérifier', alerte: false }
    case 'charge': {
      const { texte, alerte } = decrireSauvegarde(sauvegarde.sauvegarde, new Date())
      switch (sauvegarde.sauvegarde.state) {
        case 'found':
          return { texte: `Dernière sauvegarde : ${texte}`, alerte }
        case 'none':
          return { texte, alerte }
        case 'unknown':
          return { texte: `Dernière sauvegarde inconnue : ${texte}`, alerte }
      }
    }
  }
}

// Monté seulement pendant la demande : le dialogue s'ouvre en modal dès l'affichage.
// Échap ou « Annuler » ferment le dialogue, ce qui déclenche onAnnuler.
function ConfirmationMiseAJour({
  nomPlugin,
  versionActuelle,
  nouvelleVersion,
  sauvegarde,
  onConfirmer,
  onAnnuler,
}: ConfirmationMiseAJourProps) {
  const refDialogue = useRef<HTMLDialogElement>(null)
  const idTitre = useId()
  const ligne = ligneSauvegarde(sauvegarde)

  useEffect(() => {
    refDialogue.current?.showModal()
  }, [])

  return (
    <dialog
      ref={refDialogue}
      onClose={onAnnuler}
      aria-labelledby={idTitre}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
    >
      <h2 id={idTitre} className="text-lg font-semibold">
        Mettre à jour « {nomPlugin} » ?
      </h2>
      <p className="mt-2 text-sm text-slate-700">
        Version {versionActuelle} → {nouvelleVersion}
      </p>

      <div
        className={`mt-4 rounded-lg p-3 text-sm ${
          ligne.alerte
            ? 'border border-red-300 bg-red-50 font-medium text-red-800'
            : 'bg-slate-100 text-slate-700'
        }`}
      >
        <p>{ligne.texte}</p>
        {ligne.alerte && (
          <p className="mt-1 font-normal">
            Pas de sauvegarde de moins de {SEUIL_SAUVEGARDE_OK_JOURS} jours : faites-en une avant de mettre à jour.
          </p>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => refDialogue.current?.close()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirmer}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Mettre à jour
        </button>
      </div>
    </dialog>
  )
}

export default ConfirmationMiseAJour
