import { Hono } from 'hono';

export const getRoutes = (hono: Hono<any>) => {
	return Array.from(new Set(hono.routes.map((route) => route.path).sort()));
};
