import { llmsFullTxt } from '$lib/server/llms'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url, locals, fetch }) =>
  new Response(await llmsFullTxt(locals.env.ASSETS, url, fetch), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
