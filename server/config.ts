import { existsSync, readFileSync } from 'node:fs'
import { getCACertificates, setDefaultCACertificates } from 'node:tls'

const FICHIER_ENV = new URL('./.env', import.meta.url)

if (existsSync(FICHIER_ENV)) {
  process.loadEnvFile(FICHIER_ENV)
}

function lireVariable(nom: string): string {
  const valeur = process.env[nom]
  if (!valeur) {
    console.error(`[config] Variable ${nom} manquante : la définir dans server/.env (voir server/.env.example)`)
    process.exit(1)
  }
  return valeur
}

export const WP_URL = lireVariable('WP_URL').replace(/\/+$/, '')
export const WP_USER = lireVariable('WP_USER')
export const WP_APP_PASSWORD = lireVariable('WP_APP_PASSWORD')
export const PORT = Number(process.env.PORT ?? 3001)

export const ADMIN_USER = lireVariable('ADMIN_USER')
// Hash bcrypt généré par `npm run hash-password`
export const ADMIN_PASSWORD_HASH = lireVariable('ADMIN_PASSWORD_HASH')
export const SESSION_SECRET = lireVariable('SESSION_SECRET')
export const EN_PRODUCTION = process.env.NODE_ENV === 'production'

if (!/^\$2[aby]\$\d{2}\$.{53}$/.test(ADMIN_PASSWORD_HASH)) {
  console.error(
    "[config] ADMIN_PASSWORD_HASH n'est pas un hash bcrypt valide : le générer avec `npm run hash-password` et le mettre entre apostrophes dans server/.env",
  )
  process.exit(1)
}
if (SESSION_SECRET.length < 32) {
  console.error('[config] SESSION_SECRET trop court (32 caractères minimum, ex. `openssl rand -base64 32`)')
  process.exit(1)
}

// Certificat auto-signé (ex. Local) : on lui fait confiance en plus des autorités habituelles,
// sans désactiver la vérification TLS
const WP_CA_CERT = process.env.WP_CA_CERT
if (WP_CA_CERT) {
  setDefaultCACertificates([...getCACertificates('default'), readFileSync(WP_CA_CERT, 'utf8')])
}
