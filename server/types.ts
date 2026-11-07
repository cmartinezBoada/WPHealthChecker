// Types renvoyés par les routes /api/..., partagés avec le frontend (src/lib/wordpress.ts)

// Même forme que Plugin dans src/components/Plugins.tsx (vérifié à la compilation côté frontend)
export type Plugin = {
  name: string
  version: string
  updateAvailable: boolean
  newVersion?: string
}

export type VersionWp = {
  version: string                   // ex. '6.8.1'
  latest: string | null             // ex. '6.8.2', null si à jour
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

export type Performance = {
  response_time_ms: number          // médiane de 3 requêtes vers la page d'accueil
  measured_at: number               // timestamp Unix (secondes)
}
