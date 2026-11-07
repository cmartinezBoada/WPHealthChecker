import { useEffect, useState } from 'react'
import logo from './assets/logo.svg'
import Connexion from './components/Connexion'
import Header from './components/Header'
import Plugins, { type Plugin } from './components/Plugins'
import StatusCard, { type HealthDetail, type HealthItem } from './components/StatusCard'
import { decrireSauvegarde, type ChargementSauvegarde } from './lib/sauvegardes'
import {
  chargerDerniereSauvegarde,
  chargerNomProjet,
  chargerPerformance,
  chargerPlugins,
  chargerSanteSite,
  chargerVersionWp,
  type Performance,
  type SanteSite,
} from './lib/wordpress'
import { seDeconnecter, surNonAuthentifie, verifierSession } from './lib/session'

const APP_NAME = 'WP Health Checker'

// Temps de réponse du serveur (ms) : ok en dessous du seuil, critique au-dessus du maximum
const SEUIL_PERFORMANCE_OK_MS = 200
const SEUIL_PERFORMANCE_CRITIQUE_MS = 600

function versCartePerformance(mesure: Performance | null): HealthItem {
  if (mesure === null) {
    return { name: 'Performance', value: 'Pas encore mesuré', status: 'warning' }
  }
  const { response_time_ms } = mesure
  const status: HealthItem['status'] =
    response_time_ms < SEUIL_PERFORMANCE_OK_MS ? 'ok'
    : response_time_ms <= SEUIL_PERFORMANCE_CRITIQUE_MS ? 'warning'
    : 'critical'
  return { name: 'Performance', value: `${response_time_ms} ms`, status }
}

// Pas de carte pendant le chargement, comme les autres cartes
function versCarteSauvegardes(chargement: ChargementSauvegarde): HealthItem | undefined {
  const name = 'Sauvegardes'
  switch (chargement.etat) {
    case 'chargement':
      return undefined
    case 'erreur':
      return { name, value: 'Indisponible', status: 'warning' }
    case 'charge': {
      const { texte, status } = decrireSauvegarde(chargement.sauvegarde, new Date())
      return { name, value: texte, status }
    }
  }
}

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

// Monté seulement une fois connecté : les données sont rechargées à chaque connexion
function TableauDeBord({ onDeconnexion }: { onDeconnexion: () => Promise<void> }) {
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

  // Pas de carte tant que la performance n'est pas mesurée
  const [performance, setPerformance] = useState<HealthItem>()

  useEffect(() => {
    chargerPerformance()
      .then((mesure) => setPerformance(versCartePerformance(mesure)))
      .catch((e: unknown) => {
        console.error('[App] Performance indisponible :', e)
        setPerformance({ name: 'Performance', value: 'Pas disponible pour le moment', status: 'warning' })
      })
  }, [])

  // Partagée entre la carte Sauvegardes et la confirmation de mise à jour des plugins
  const [sauvegarde, setSauvegarde] = useState<ChargementSauvegarde>({ etat: 'chargement' })

  useEffect(() => {
    chargerDerniereSauvegarde()
      .then((resultat) => setSauvegarde({ etat: 'charge', sauvegarde: resultat }))
      .catch((e: unknown) => {
        console.error('[App] Sauvegardes indisponibles :', e)
        setSauvegarde({ etat: 'erreur' })
      })
  }, [])

  const elements: HealthItem[] = [versionWp, santeSite, performance, versCarteSauvegardes(sauvegarde)].filter(
    (element) => element !== undefined
  )

  // Après une mise à jour : en cas d'échec, l'ancienne liste reste affichée et l'erreur
  // remonte au composant Plugins (qui garde ses messages et alertes)
  const rechargerPlugins = async () => {
    const liste = await chargerPlugins()
    setEtatPlugins({ etat: 'succes', plugins: liste })
  }

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
        onDeconnexion={onDeconnexion}
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
        {etatPlugins.etat === 'succes' && (
          <Plugins plugins={etatPlugins.plugins} onRecharger={rechargerPlugins} sauvegarde={sauvegarde} />
        )}
      </main>
    </div>
  )
}

type EtatSession =
  | { etat: 'verification' }
  | { etat: 'deconnecte' }
  | { etat: 'connecte'; utilisateur: string }

function App() {
  const [session, setSession] = useState<EtatSession>({ etat: 'verification' })

  useEffect(() => {
    let annule = false
    verifierSession()
      .then((utilisateur) => {
        if (annule) return
        setSession(utilisateur ? { etat: 'connecte', utilisateur } : { etat: 'deconnecte' })
      })
      .catch((e: unknown) => {
        console.error('[App] Vérification de la session impossible :', e)
        if (!annule) setSession({ etat: 'deconnecte' })
      })
    return () => {
      annule = true
    }
  }, [])

  // N'importe quel appel /api/... qui répond 401 (session expirée) ramène au formulaire
  useEffect(() => surNonAuthentifie(() => setSession({ etat: 'deconnecte' })), [])

  const deconnecter = async () => {
    try {
      await seDeconnecter()
    } catch (e: unknown) {
      console.error('[App] Déconnexion impossible :', e)
    }
    setSession({ etat: 'deconnecte' })
  }

  switch (session.etat) {
    case 'verification':
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-sm text-slate-500">Vérification de la session…</p>
        </div>
      )
    case 'deconnecte':
      return (
        <Connexion
          appName={APP_NAME}
          logoSrc={logo}
          onConnexion={(utilisateur) => setSession({ etat: 'connecte', utilisateur })}
        />
      )
    case 'connecte':
      return <TableauDeBord onDeconnexion={deconnecter} />
  }
}

export default App