import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/postgres" });
await c.connect(); await c.query("DEALLOCATE ALL"); await c.end(); console.log("deallocated");
