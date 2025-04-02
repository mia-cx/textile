import { Context } from "hono";
import { env } from "hono/adapter";

export const getEnv = (c: Context, name: string) => {
	return env<{ [name]: string }>(c)[name]
};
