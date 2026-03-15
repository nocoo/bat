import { Hono } from "hono";

type Bindings = {
	DB: D1Database;
	BAT_WRITE_KEY: string;
	BAT_READ_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => c.text("bat-worker ok"));

export default app;
