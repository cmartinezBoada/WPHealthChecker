export type Plugin = {
  name: string
  version: string
  updateAvailable: boolean
}

type PluginsProps = {
  plugins: Plugin[]
}

function Plugins({ plugins }: PluginsProps) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Plugins</h2>
      <ul className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-4 lg:gap-5 lg:p-6">
        {plugins.map((plugin) => (
          <li key={plugin.name} className="flex items-center gap-3 sm:gap-6 lg:gap-10">
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">
              {plugin.name}
            </span>
            <div className="w-20 shrink-0">
              <p className="text-xs uppercase text-slate-500">Version</p>
              <p className="text-sm text-slate-900">{plugin.version}</p>
            </div>
            <div className="w-32 shrink-0">
              <p className="text-xs uppercase text-slate-500">Update</p>
              <span
                className={`mt-0.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  plugin.updateAvailable
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {plugin.updateAvailable ? 'Update available' : 'Up to date'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default Plugins
