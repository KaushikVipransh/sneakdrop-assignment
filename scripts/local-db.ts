/**
 * Runs a real Postgres 17 server without Docker, using the prebuilt binaries
 * from the @embedded-postgres npm packages. Same port and credentials as
 * docker-compose.yml, so the rest of the project cannot tell the difference.
 * Useful when Docker is unavailable.
 *   pnpm db:local        start (runs in the background)
 *   pnpm db:local:stop   stop
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";

const USER = "sneakdrop";
const PASSWORD = "sneakdrop";
const PORT = 5432;
const DATABASES = ["sneakdrop", "sneakdrop_test"];

function binDir(): string {
  // Only x64 builds exist for Windows; they also run on Windows on ARM via emulation.
  const pkg =
    process.platform === "win32"
      ? "@embedded-postgres/windows-x64"
      : `@embedded-postgres/${process.platform}-${process.arch}`;
  return path.resolve("node_modules", pkg, "native", "bin");
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const client = new Client({
      host: "localhost",
      port: PORT,
      user: USER,
      password: PASSWORD,
      database: "postgres",
    });
    try {
      await client.connect();
      await client.end();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Postgres did not become ready in 30 s");
}

async function createDatabases(): Promise<void> {
  const client = new Client({
    host: "localhost",
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: "postgres",
  });
  await client.connect();
  for (const name of DATABASES) {
    const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (!rowCount) {
      await client.query(`create database ${name}`);
      console.log(`created database ${name}`);
    }
  }
  await client.end();
}

async function main() {
  const bin = binDir();
  const exe = (name: string) => path.join(bin, process.platform === "win32" ? `${name}.exe` : name);
  const dataDir = path.resolve(".pgdata");

  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "pgpw-"));
    const pwFile = path.join(tmp, "pw");
    writeFileSync(pwFile, PASSWORD);
    const init = spawnSync(
      exe("initdb"),
      ["-D", dataDir, "-U", USER, `--pwfile=${pwFile}`, "-A", "scram-sha-256", "-E", "UTF8"],
      { stdio: "inherit" },
    );
    rmSync(tmp, { recursive: true, force: true });
    if (init.status !== 0) throw new Error("initdb failed");
  }

  if (process.argv.includes("--stop")) {
    spawnSync(exe("pg_ctl"), ["-D", dataDir, "stop", "-m", "fast"], { stdio: "inherit" });
    return;
  }

  // pg_ctl starts the server in the background, so it keeps running after this script exits.
  const status = spawnSync(exe("pg_ctl"), ["-D", dataDir, "status"], { stdio: "ignore" });
  if (status.status !== 0) {
    const started = spawnSync(
      exe("pg_ctl"),
      [
        "-D",
        dataDir,
        "-l",
        path.join(dataDir, "server.log"),
        "-o",
        `-p ${PORT} -c max_connections=300 -c listen_addresses=localhost`,
        "-w",
        "start",
      ],
      // Do not share our stdout: the server would hold the pipe open after we exit.
      { stdio: "ignore" },
    );
    if (started.status !== 0) throw new Error("pg_ctl start failed; see .pgdata/server.log");
  }

  await waitForServer();
  await createDatabases();
  console.log(`Postgres 17 running on localhost:${PORT}. Stop it with: pnpm db:local:stop`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
