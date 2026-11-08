import { serve } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { connexion, deconnexion, exigerSession, moi } from './auth.ts'
import { PORT, WP_URL } from './config.ts'
import {
  chargerDerniereSauvegarde,
  chargerNomProjet,
  chargerPerformance,
  chargerPlugins,
  chargerSanteSite,
  chargerVersionWp,
  ErreurWordPress,
  FORMAT_ID_PLUGIN,
  mettreAJourPlugin,
  mettreAJourWordPress,
} from './wordpress.ts'

const app = new Hono().basePath('/api')

// 401 sur toute route /api/... sans session valide, sauf /api/login et /api/me
app.use('*', exigerSession)

app.post('/login', connexion)
app.post('/logout', deconnexion)
app.get('/me', moi)

// En cas d'échec côté WordPress : 502 avec { erreur }, détail complet seulement dans les logs du serveur
function route<T>(chemin: string, charger: () => Promise<T>) {
  app.get(chemin, async (c) => {
    try {
      return c.json(await charger())
    } catch (e) {
      console.error(`[api] ${chemin} :`, e)
      return c.json({ erreur: 'Impossible de joindre WordPress' }, 502)
    }
  })
}

// Réponse d'une mise à jour échouée, avec le lien WP Admin proposé par le dashboard.
// 404 (introuvable) et 409 (rien à mettre à jour, serveur incompatible) sont transmis tels quels.
// Jamais de 401 : le frontend le prendrait pour une session expirée.
function reponseEchecMiseAJour(c: Context, libelle: string, e: unknown, lienWpAdmin: string) {
  if (e instanceof ErreurWordPress) {
    console.error(`[api] ${libelle} : WordPress ${e.status} : ${e.message}`)
    if (e.details) {
      console.error('[api]   erreurs de l\'upgrader :', e.details.erreurs)
      console.error('[api]   messages de l\'upgrader :', e.details.messages)
    }
    const status = e.status === 404 || e.status === 409 ? e.status : 502
    return c.json({ erreur: e.message, lienWpAdmin, ...(e.details && { details: e.details }) }, status)
  }
  console.error(`[api] ${libelle} :`, e)
  return c.json({ erreur: e instanceof Error ? e.message : 'Impossible de joindre WordPress', lienWpAdmin }, 502)
}

// Protégée par exigerSession comme toutes les routes hors /login et /me
app.post('/plugins/:id/update', async (c) => {
  // L'identifiant contient un '/' : le client l'encode (wordfence%2Fwordfence), Hono le décode
  const id = c.req.param('id')
  if (!FORMAT_ID_PLUGIN.test(id)) {
    return c.json({ erreur: 'Identifiant de plugin invalide' }, 400)
  }
  try {
    return c.json(await mettreAJourPlugin(id))
  } catch (e) {
    return reponseEchecMiseAJour(c, `Mise à jour du plugin ${id}`, e, `${WP_URL}/wp-admin/plugins.php`)
  }
})

// Protégée par exigerSession. Peut durer plusieurs minutes (délai de 5 minutes côté connecteur)
app.post('/wordpress/update', async (c) => {
  try {
    return c.json(await mettreAJourWordPress())
  } catch (e) {
    return reponseEchecMiseAJour(c, 'Mise à jour de WordPress', e, `${WP_URL}/wp-admin/update-core.php`)
  }
})

route('/plugins', chargerPlugins)
route('/nom-projet', chargerNomProjet)
route('/version-wp', chargerVersionWp)
route('/sante-site', chargerSanteSite)
route('/performance', chargerPerformance)
route('/sauvegardes', chargerDerniereSauvegarde)

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
  console.log(`[api] http://localhost:${port}/api → ${WP_URL}`)
})
