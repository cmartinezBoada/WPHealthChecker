import { createHash, timingSafeEqual } from 'node:crypto'
import { getConnInfo } from '@hono/node-server/conninfo'
import bcrypt from 'bcryptjs'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { ADMIN_PASSWORD_HASH, ADMIN_USER, EN_PRODUCTION, SESSION_SECRET } from './config.ts'

const NOM_COOKIE = 'wphc_session'
const DUREE_SESSION_S = 7 * 24 * 60 * 60

const MAX_ECHECS = 5
const FENETRE_ECHECS_MS = 15 * 60 * 1000

// Message unique : ne jamais indiquer si c'est l'identifiant ou le mot de passe qui est faux
const ERREUR_IDENTIFIANTS = 'Identifiants invalides'

type Session = { utilisateur: string; expire: number }

const optionsCookie = {
  path: '/',
  httpOnly: true,
  secure: EN_PRODUCTION,
  sameSite: 'Lax',
} as const

// Session sans état : cookie signé (HMAC-SHA256) contenant l'utilisateur et l'expiration.
// L'expiration est revérifiée côté serveur, sans se fier au Max-Age du navigateur.
async function lireSession(c: Context): Promise<Session | null> {
  const valeur = await getSignedCookie(c, SESSION_SECRET, NOM_COOKIE)
  if (!valeur) return null
  try {
    const session = JSON.parse(Buffer.from(valeur, 'base64url').toString('utf8')) as Session
    if (session.utilisateur !== ADMIN_USER || typeof session.expire !== 'number') return null
    if (session.expire <= Date.now()) return null
    return session
  } catch {
    return null
  }
}

async function ouvrirSession(c: Context, utilisateur: string) {
  const session: Session = { utilisateur, expire: Date.now() + DUREE_SESSION_S * 1000 }
  const valeur = Buffer.from(JSON.stringify(session)).toString('base64url')
  await setSignedCookie(c, NOM_COOKIE, valeur, SESSION_SECRET, { ...optionsCookie, maxAge: DUREE_SESSION_S })
}

// Limitation des échecs de connexion, par adresse IP (en mémoire)
const echecsParIp = new Map<string, number[]>()

function echecsRecents(ip: string, maintenant: number): number[] {
  const recents = (echecsParIp.get(ip) ?? []).filter((t) => maintenant - t < FENETRE_ECHECS_MS)
  if (recents.length) echecsParIp.set(ip, recents)
  else echecsParIp.delete(ip)
  return recents
}

// Purge périodique pour que la table ne grossisse pas indéfiniment
setInterval(() => {
  const maintenant = Date.now()
  for (const ip of echecsParIp.keys()) echecsRecents(ip, maintenant)
}, FENETRE_ECHECS_MS).unref()

// Comparer les empreintes donne des tampons de même longueur, quelle que soit la saisie
function egalEnTempsConstant(a: string, b: string): boolean {
  const empreinte = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(empreinte(a), empreinte(b))
}

async function verifierIdentifiants(utilisateur: string, motDePasse: string): Promise<boolean> {
  // Le hash est toujours vérifié, même si l'identifiant est faux, pour ne rien révéler par le temps de réponse
  const motDePasseOk = await bcrypt.compare(motDePasse, ADMIN_PASSWORD_HASH)
  const utilisateurOk = egalEnTempsConstant(utilisateur, ADMIN_USER)
  return utilisateurOk && motDePasseOk
}

export async function connexion(c: Context) {
  const ip = getConnInfo(c).remote.address ?? 'inconnue'
  const maintenant = Date.now()
  const echecs = echecsRecents(ip, maintenant)

  if (echecs.length >= MAX_ECHECS) {
    const attenteS = Math.ceil((echecs[0] + FENETRE_ECHECS_MS - maintenant) / 1000)
    c.header('Retry-After', String(attenteS))
    return c.json({ erreur: 'Trop de tentatives, réessayer plus tard' }, 429)
  }

  // La tentative compte comme un échec dès maintenant, dans le même tour synchrone que la
  // vérification de la limite : des requêtes envoyées en parallèle ne peuvent pas la dépasser.
  // Elle est effacée en cas de succès.
  echecsParIp.set(ip, [...echecs, maintenant])

  let corps: unknown
  try {
    corps = await c.req.json()
  } catch {
    return c.json({ erreur: 'Requête invalide' }, 400)
  }
  const { utilisateur, motDePasse } = (corps ?? {}) as Record<string, unknown>
  if (typeof utilisateur !== 'string' || typeof motDePasse !== 'string') {
    return c.json({ erreur: 'Requête invalide' }, 400)
  }

  if (!(await verifierIdentifiants(utilisateur, motDePasse))) {
    console.warn(`[auth] Échec de connexion depuis ${ip}`)
    return c.json({ erreur: ERREUR_IDENTIFIANTS }, 401)
  }

  echecsParIp.delete(ip)
  await ouvrirSession(c, ADMIN_USER)
  return c.json({ utilisateur: ADMIN_USER })
}

export function deconnexion(c: Context) {
  deleteCookie(c, NOM_COOKIE, optionsCookie)
  return c.json({ ok: true })
}

export async function moi(c: Context) {
  const session = await lireSession(c)
  return c.json({ utilisateur: session?.utilisateur ?? null })
}

// Routes accessibles sans session (chemins complets, basePath inclus)
const ROUTES_PUBLIQUES = new Set(['/api/login', '/api/me'])

export const exigerSession: MiddlewareHandler = async (c, next) => {
  if (ROUTES_PUBLIQUES.has(c.req.path)) return next()
  if (!(await lireSession(c))) return c.json({ erreur: 'Non authentifié' }, 401)
  return next()
}
