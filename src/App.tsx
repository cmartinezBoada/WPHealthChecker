import logo from './assets/logo.svg'
import Header from './components/Header'

// Mocked data until the real WordPress project is wired in
const APP_NAME = 'WP Health Checker'
const PROJECT_NAME = 'Acme Coffee Blog'

function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        appName={APP_NAME}
        projectName={PROJECT_NAME}
        logoSrc={logo}
        logoAlt="WP Health Checker logo"
      />
    </div>
  )
}

export default App
