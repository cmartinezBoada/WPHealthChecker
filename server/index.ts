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

route('/plugins', chargerPlugins)
route('/nom-projet', chargerNomProjet)
route('/version-wp', chargerVersionWp)
route('/sante-site', chargerSanteSite)
route('/performance', chargerPerformance)

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
  console.log(`[api] http://localhost:${port}/api → ${WP_URL}`)
})
