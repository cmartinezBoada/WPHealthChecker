import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { connexion, deconnexion, exigerSession, moi } from './auth.ts'
import { PORT, WP_URL } from './config.ts'
import {
  chargerNomProjet,
  chargerPerformance,
  chargerPlugins,
  chargerSanteSite,
  chargerVersionWp,
  ErreurWordPress,
  FORMAT_ID_PLUGIN,
  mettreAJourPlugin,
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
    if (e instanceof ErreurWordPress) {
      console.error(`[api] Mise à jour du plugin ${id} : WordPress ${e.status} : ${e.message}`)
      // 404 (non installé) et 409 (pas de mise à jour) sont transmis tels quels. Jamais de 401 :
      // le frontend le prendrait pour une session expirée.
      const status = e.status === 404 || e.status === 409 ? e.status : 502
      return c.json({ erreur: e.message }, status)
    }
    console.error(`[api] Mise à jour du plugin ${id} :`, e)
    return c.json({ erreur: 'Impossible de joindre WordPress' }, 502)
  }
})

route('/plugins', chargerPlugins)
route('/nom-projet', chargerNomProjet)
route('/version-wp', chargerVersionWp)
route('/sante-site', chargerSanteSite)
route('/performance', chargerPerformance)

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
  console.log(`[api] http://localhost:${port}/api → ${WP_URL}`)
})
