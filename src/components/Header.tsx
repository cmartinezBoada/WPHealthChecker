import { useState } from 'react'

type HeaderProps = {
  appName: string
  projectName: string
  logoSrc: string
  logoAlt?: string  //optional parameter
  onDeconnexion: () => Promise<void>
}

function Header({ appName, projectName, logoSrc, logoAlt = '', onDeconnexion }: HeaderProps) {
  const [deconnexionEnCours, setDeconnexionEnCours] = useState(false)

  const deconnecter = async () => {
    setDeconnexionEnCours(true)
    try {
      await onDeconnexion()
    } finally {
      setDeconnexionEnCours(false)
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <img src={logoSrc} alt={logoAlt} className="h-10 w-10 shrink-0" />
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="text-lg font-bold text-slate-900">{appName}</span>
          <span className="truncate text-sm text-slate-500">{projectName}</span>
        </div>
        <button
          type="button"
          onClick={deconnecter}
          disabled={deconnexionEnCours}
          className="ml-auto shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
        >
          {deconnexionEnCours ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </div>
    </header>
  )
}

export default Header


