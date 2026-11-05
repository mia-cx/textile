import { hostStylesheets, prepareHostVault, routes, vaults } from 'virtual:svartz/host'
import { error, redirect } from '@sveltejs/kit'
import { assets, base } from '$app/paths'
import type { EntryGenerator, PageLoad } from './$types'

export const load: PageLoad = async ({ url }) => {
  const appPath = base ? url.pathname.slice(base.length) || '/' : url.pathname
  const pathname = appPath.endsWith('/') ? appPath : `${appPath}/`
  const destination = routes.redirects[pathname]
  if (destination) redirect(308, `${base}${destination}`)
  await prepareHostVault(pathname)
  if (!routes.all.includes(pathname)) error(404)
  return {
    svartzStylesheets: hostStylesheets(pathname).map((file) => `${assets}/${file}`),
    // Svartz links a note's Markdown copy itself. A listing it generates (feed, folders, tags) has a twin too, which
    // apps/web converts from the page, so it gets its link here.
    markdown: notes.includes(pathname) ? undefined : `${base}${pathname.replace(/\/$/, '')}.md`,
  }
}

const notes: ReadonlyArray<string> = vaults[0]?.artifacts.index.routes.notes ?? []

export const entries: EntryGenerator = async () =>
  routes.all.map((pathname) => ({ slug: pathname.replace(/^\/+|\/+$/g, '') }))
