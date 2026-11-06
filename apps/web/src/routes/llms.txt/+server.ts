import { llmsTxt } from '$lib/server/llms'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url, locals }) =>
  new Response(await llmsTxt(locals.env.ASSETS, url), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
