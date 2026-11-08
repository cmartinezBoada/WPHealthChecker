// Types renvoyés par les routes /api/..., partagés avec le frontend (src/lib/wordpress.ts)

// Même forme que Plugin dans src/components/Plugins.tsx (vérifié à la compilation côté frontend)
export type Plugin = {
  id: string                        // ex. 'wordfence/wordfence' (format de /wp/v2/plugins)
  name: string
  version: string
  miseAJour: EtatMiseAJourPlugin
}

// 'inconnu' : WordPress n'a pas pu vérifier les mises à jour. Ne jamais l'afficher comme « à jour ».
export type EtatMiseAJourPlugin =
  | { etat: 'disponible'; nouvelleVersion: string }
  | { etat: 'a-jour' }
  | { etat: 'inconnu' }

export type VersionWp = {
  version: string                   // ex. '6.8.1'
  latest: string | null             // ex. '6.8.2', null si à jour
  // 'minor' : même branche (7.1.3 → 7.1.4) ; 'major' : nouvelle branche (7.1 → 7.2). null si à jour
  update_type: 'minor' | 'major' | null
}

// Réponse de POST /api/wordpress/update
export type ResultatMiseAJourWordPress = {
  previous_version: string
  new_version: string
  site_ok: boolean                  // page d'accueil et /wp-json/ répondent toutes deux en HTTP 200
  accueil_http_status: number | null // null si pas de réponse
  api_http_status: number | null
}

export type ProblemeSante = {
  test: string                      // ex. 'php_version'
  status: 'critical' | 'recommended'
}

export type SanteSite = {
  good: number
  recommended: number
  critical: number
  issues: ProblemeSante[]
}

// Réponse de POST /api/plugins/:id/update
export type ResultatMiseAJourPlugin = {
  plugin: string
  previous_version: string
  new_version: string
  site_ok: boolean                  // la page d'accueil répond en 2xx après la mise à jour
  http_status: number | null        // null si la page d'accueil n'a pas répondu du tout
}

// Dernière sauvegarde Duplicator terminée dont il reste une copie (GET /api/sauvegardes)
export type DerniereSauvegarde =
  | { state: 'unknown' }            // Duplicator absent ou illisible : ne jamais afficher « aucune »
  | { state: 'none' }               // aucune sauvegarde terminée avec des fichiers
  | { state: 'found'; created_at: string } // ISO 8601 UTC, ex. '2023-05-17T15:56:29Z'

export type Performance = {
  response_time_ms: number          // médiane de 3 requêtes vers la page d'accueil
  measured_at: number               // timestamp Unix (secondes)
}
