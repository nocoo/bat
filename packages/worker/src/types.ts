// Worker environment bindings
export type Bindings = {
	DB: D1Database;
	BAT_WRITE_KEY: string;
	BAT_READ_KEY: string;
};

export type AppEnv = { Bindings: Bindings };
