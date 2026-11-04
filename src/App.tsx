import { useEffect, useState } from 'react'
import logo from './assets/logo.svg'
import Header from './components/Header'
import Plugins, { type Plugin } from './components/Plugins'
import StatusCard, { type HealthDetail, type HealthItem } from './components/StatusCard'
import {
  chargerNomProjet,
  chargerPlugins,
  chargerSanteSite,
  chargerVersionWp,
  type SanteSite,
} from './lib/wordpress'

const APP_NAME = 'WP Health Checker'

// Mocked data until the real WordPress project is wired in
const ELEMENTS_MOCKES: HealthItem[] = [
  { name: 'Performance', value: '82/100', status: 'ok' },
]

function pluriel(nombre: number, mot: string): string {
  return `${nombre} ${mot}${nombre > 1 ? 's' : ''}`
}

// Libellés courts des tests de Santé du site (identifiants du cœur de WordPress)
const LIBELLES_TESTS: Record<string, string> = {
  wordpress_version: 'Version WordPress',
  plugin_version: 'Plugins',
  theme_version: 'Thèmes',
  php_version: 'Version PHP',
  php_extensions: 'Extensions PHP',
  php_default_timezone: 'Fuseau PHP',
  php_sessions: 'Sessions PHP',
  sql_server: 'Base de données',
  utf8mb4_support: 'Encodage UTF8MB4',
  ssl_support: 'SSL',
  https_status: 'HTTPS',
  scheduled_events: 'Tâches planifiées',
  http_requests: 'Requêtes HTTP',
  rest_availability: 'API REST',
  is_in_debug_mode: 'Mode débogage',
  file_uploads: 'Téléversements',
  dotorg_communication: 'Connexion WordPress.org',
  background_updates: 'Mises à jour auto',
  plugin_theme_auto_updates: 'Mises à jour auto',
  loopback_requests: 'Requêtes loopback',
  authorization_header: 'En-tête Authorization',
  persistent_object_cache: 'Cache objet',
  page_cache: 'Cache de page',
  available_updates_disk_space: 'Espace disque',
  update_temp_backup_writable: 'Dossier sauvegarde',
  autoloaded_options: 'Options autochargées',
  search_engine_visibility: 'Visibilité moteurs',
}

// Test inconnu (plugin tiers) : 'mon_test' -> 'Mon test'
function libelleTest(test: string): string {
  const libelle = LIBELLES_TESTS[test]
  if (libelle) return libelle
  const texte = test.replace(/[_-]+/g, ' ').trim()
  return texte ? texte.charAt(0).toUpperCase() + texte.slice(1) : 'Test inconnu'
}

// Les critiques d'abord, sans doublons de libellé
function versDetails(sante: SanteSite): HealthDetail[] {
  const details = new Map<string, HealthDetail>()
  for (const statut of ['critical', 'recommended'] as const) {
    for (const probleme of sante.issues) {
      const label = libelleTest(probleme.test)
      if (probleme.status === statut && !details.has(label)) {
        details.set(label, { label, status: statut === 'critical' ? 'critical' : 'warning' })
      }
    }
  }
  return [...details.values()]
}

// Transforme le résultat de Santé du site en carte
function versCarteSante(sante: SanteSite | null): HealthItem {
  const name = 'Santé du site'
  if (sante === null) {
    return { name, value: 'Jamais analysé', status: 'warning' }
  }
  const details = versDetails(sante)
  if (sante.critical > 0) {
    const parties = [pluriel(sante.critical, 'critique')]
    if (sante.recommended > 0) {
      parties.push(pluriel(sante.recommended, 'recommandé'))
    }
    return { name, value: parties.join(' · '), status: 'critical', details }
  }
  if (sante.recommended > 0) {
    return { name, value: pluriel(sante.recommended, 'recommandé'), status: 'warning', details }
  }
  return { name, value: 'Tout est bon', status: 'ok' }
}

// Les trois situations possibles du chargement des plugins
type EtatPlugins =
  | { etat: 'chargement' }
  | { etat: 'succes'; plugins: Plugin[] }
  | { etat: 'erreur'; message: string }

function App() {
  const [etatPlugins, setEtatPlugins] = useState<EtatPlugins>({ etat: 'chargement' })
  const [nomProjet, setNomProjet] = useState('Chargement…')

  useEffect(() => {
    chargerNomProjet()
      .then(setNomProjet)
      .catch(() => setNomProjet('Nom du projet indisponible'))
  }, [])

  // Pas de carte tant que la version n'est pas chargée
  const [versionWp, setVersionWp] = useState<HealthItem>()

  useEffect(() => {
    chargerVersionWp()
      .then(({ version, latest }) =>
        setVersionWp(
          latest !== null
            ? { name: 'WordPress Core', value: `v${version} → ${latest}`, status: 'warning' }
            : { name: 'WordPress Core', value: `v${version}`, status: 'ok' }
        )
      )
      .catch((e: unknown) => {
        console.error('[App] Version WordPress indisponible :', e)
        setVersionWp({ name: 'WordPress Core', value: 'Indisponible', status: 'warning' })
      })
  }, [])

  // Pas de carte tant que la santé du site n'est pas chargée
  const [santeSite, setSanteSite] = useState<HealthItem>()

  useEffect(() => {
    chargerSanteSite()
      .then((sante) => setSanteSite(versCarteSante(sante)))
      .catch((e: unknown) => {
        console.error('[App] Santé du site indisponible :', e)
        setSanteSite({ name: 'Santé du site', value: 'Indisponible', status: 'warning' })
      })
  }, [])

  const elements: HealthItem[] = [versionWp, santeSite, ...ELEMENTS_MOCKES].filter(
    (element) => element !== undefined
  )

  useEffect(() => {
    chargerPlugins()
      .then((liste) => setEtatPlugins({ etat: 'succes', plugins: liste }))
      .catch((e: unknown) =>
        setEtatPlugins({
          etat: 'erreur',
          message: e instanceof Error ? e.message : 'Erreur inconnue',
        })
      )
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        appName={APP_NAME}
        projectName={nomProjet}
        logoSrc={logo}
        logoAlt="WP Health Checker logo"
      />
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
          {elements.map((element) => (
            <StatusCard key={element.name} {...element} />
          ))}
        </div>

        {etatPlugins.etat === 'chargement' && (
          <p className="text-sm text-slate-500">Chargement des plugins…</p>
        )}
        {etatPlugins.etat === 'erreur' && (
          <p className="text-sm text-red-600">
            Impossible de charger les plugins : {etatPlugins.message}
          </p>
        )}
        {etatPlugins.etat === 'succes' && <Plugins plugins={etatPlugins.plugins} />}
      </main>
    </div>
  )
}

export default App