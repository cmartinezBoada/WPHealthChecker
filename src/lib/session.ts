// Session admin : connexion, déconnexion, et détection d'une session expirée (401)

export class ErreurNonAuthentifie extends Error {
  constructor() {
    super('Session expirée')
    this.name = 'ErreurNonAuthentifie'
  }
}

// Rappels appelés dès qu'un appel /api/... répond 401 (session expirée)
const rappelsNonAuthentifie = new Set<() => void>()

// Renvoie la fonction de désabonnement (à utiliser comme nettoyage d'un useEffect)
export function surNonAuthentifie(rappel: () => void): () => void {
  rappelsNonAuthentifie.add(rappel)
  return () => {
    rappelsNonAuthentifie.delete(rappel)
  }
}

export function signalerNonAuthentifie() {
  for (const rappel of rappelsNonAuthentifie) rappel()
}

// Message d'erreur renvoyé par le serveur ({ erreur }), sinon un message générique
async function messageErreur(res: Response): Promise<string> {
  try {
    const corps: unknown = await res.json()
    if (corps && typeof corps === 'object' && 'erreur' in corps && typeof corps.erreur === 'string') {
      return corps.erreur
    }
  } catch {
    // Corps absent ou non JSON
  }
  return `Erreur ${res.status}`
}

// Utilisateur connecté, ou null sans session valide
export async function verifierSession(): Promise<string | null> {
  const res = await fetch('/api/me')
  if (!res.ok) throw new Error(await messageErreur(res))
  const { utilisateur }: { utilisateur: string | null } = await res.json()
  return utilisateur
}

// Un 401 ici veut dire « identifiants invalides », pas « session expirée » :
// on n'utilise donc pas signalerNonAuthentifie
export async function seConnecter(utilisateur: string, motDePasse: string): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utilisateur, motDePasse }),
    })
  } catch {
    throw new Error('Serveur injoignable')
  }
  if (!res.ok) throw new Error(await messageErreur(res))
  const corps: { utilisateur: string } = await res.json()
  return corps.utilisateur
}

// Une session déjà expirée (401) revient au même : l'utilisateur est déconnecté
export async function seDeconnecter(): Promise<void> {
  const res = await fetch('/api/logout', { method: 'POST' })
  if (!res.ok && res.status !== 401) throw new Error(await messageErreur(res))
}
