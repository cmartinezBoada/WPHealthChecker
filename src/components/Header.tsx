type HeaderProps = {
  appName: string
  projectName: string
  logoSrc: string
  logoAlt?: string
}

function Header({ appName, projectName, logoSrc, logoAlt = '' }: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <img src={logoSrc} alt={logoAlt} className="h-10 w-10 shrink-0" />
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="text-lg font-bold text-slate-900">{appName}</span>
          <span className="truncate text-sm text-slate-500">{projectName}</span>
        </div>
      </div>
    </header>
  )
}

export default Header
