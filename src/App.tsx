import logo from './assets/logo.svg'
import Header from './components/Header'
import Plugins, { type Plugin } from './components/Plugins'
import StatusCard, { type Status } from './components/StatusCard'

// Mocked data until the real WordPress project is wired in
const APP_NAME = 'WP Health Checker'
const PROJECT_NAME = 'Acme Coffee Blog'
const ELEMENTS: { name: string; value: string; status: Status }[] = [
  { name: 'WordPress Core', value: 'v6.8.1', status: 'ok' },
  { name: 'Security', value: '82/100', status: 'warning' },
  { name: 'Performance', value: '82/100', status: 'ok' },
]
const PLUGINS: Plugin[] = [
  { name: 'Wordfence', version: '8.1.0', updateAvailable: true },
  { name: 'ACF Pro', version: '6.7.0', updateAvailable: true },
  { name: 'WooCommerce', version: '9.4.2', updateAvailable: false },
  { name: 'Yoast SEO', version: '25.6', updateAvailable: false },
]

function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        appName={APP_NAME}
        projectName={PROJECT_NAME}
        logoSrc={logo}
        logoAlt="WP Health Checker logo"
      />
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        {ELEMENTS.map((element) => (
          <StatusCard key={element.name} {...element} />
        ))}
        <Plugins plugins={PLUGINS} />
      </main>
    </div>
  )
}

export default App
