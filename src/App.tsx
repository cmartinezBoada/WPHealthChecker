import { useEffect, useState } from 'react'
import logo from './assets/logo.svg'
import Header from './components/Header'
import Plugins, { type Plugin } from './components/Plugins'
import StatusCard, { type HealthItem } from './components/StatusCard'
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

// Transforme le résultat de Santé du site en carte
function versCarteSante(sante: SanteSite | null): HealthItem {
  const name = 'Santé du site'
  if (sante === null) {
    return { name, value: 'Jamais analysé', status: 'warning' }
  }
  if (sante.critical > 0) {
    const parties = [pluriel(sante.critical, 'critique')]
    if (sante.recommended > 0) {
      parties.push(pluriel(sante.recommended, 'recommandé'))
    }
    return { name, value: parties.join(' · '), status: 'critical' }
  }
  if (sante.recommended > 0) {
    return { name, value: pluriel(sante.recommended, 'recommandé'), status: 'warning' }
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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