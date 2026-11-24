import { checkServerIdentity } from "node:tls";
import pg from "pg";
import type { ReportSynthesis } from "./report.ts";
import type { StoredSynthesis } from "./store.ts";
import { approveSynthesis, createSynthesisVersion } from "./synthesis.ts";

type SynthesisRow = StoredSynthesis & Record<string, unknown>;
type Query = <Row extends Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Row[] }>;

function connect(databaseUrl: string): Query {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("URL do PostgreSQL inválida.");
  }
  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !url.hostname) {
    throw new Error("URL do PostgreSQL inválida.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // Pass explicit connection fields: URL query options cannot replace this TLS policy.
  const pool = new pg.Pool({
    host,
    port: url.port ? Number(url.port) : 5432,
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: {
      rejectUnauthorized: true,
      checkServerIdentity: (_name, certificate) => checkServerIdentity(host, certificate),
    },
    enableChannelBinding: true,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 5_000,
  });
  // Idle connection failures must not crash the process; the pool discards the client.
  pool.on("error", () => {});
  return (sql, params) => pool.query(sql, params);
}

const COLUMNS = `director, "group", version, status, content, author,
  created_at AS "createdAt", review_note AS "reviewNote", generated_by AS "generatedBy"`;

export class PostgresSynthesisStore {
  private readonly query: Query;
  private initialization?: Promise<void>;

  public constructor(databaseUrl: string, query?: Query) {
    this.query = query ?? connect(databaseUrl);
  }

  public async listAll(): Promise<StoredSynthesis[]> {
    await this.initialize();
    const { rows } = await this.query<SynthesisRow>(`
      SELECT ${COLUMNS} FROM prisma_synthesis_versions
      ORDER BY director, "group", version
    `);
    return rows;
  }

  public async create(
    director: string,
    group: string,
    content: ReportSynthesis,
    author: string,
    generatedBy: "ia" | "humano" = "humano",
  ): Promise<StoredSynthesis> {
    const draft = createSynthesisVersion(content, author, 1, undefined, generatedBy);
    await this.initialize();
    // Reserving the next version locks only this pair; both writes roll back together.
    const { rows } = await this.query<SynthesisRow>(`
      WITH next_version AS (
        INSERT INTO prisma_synthesis_counters (director, "group", latest_version)
        VALUES ($1, $2, 1)
        ON CONFLICT (director, "group") DO UPDATE
          SET latest_version = prisma_synthesis_counters.latest_version + 1
        RETURNING latest_version
      )
      INSERT INTO prisma_synthesis_versions
        (director, "group", version, status, content, author, created_at, review_note, generated_by)
      SELECT $1, $2, latest_version, $3, $4::jsonb, $5, $6, $7, $8 FROM next_version
      RETURNING ${COLUMNS}
    `, [director, group, draft.status, JSON.stringify(draft.content), draft.author,
      draft.createdAt, draft.reviewNote, draft.generatedBy]);
    return rows[0];
  }

  public async approve(
    director: string,
    group: string,
    version: number,
    note = "",
  ): Promise<StoredSynthesis> {
    const notFound = "Versão de síntese não encontrada.";
    if (!Number.isInteger(version) || version < 1 || version > 2_147_483_647) {
      throw new Error(notFound);
    }
    await this.initialize();
    const key = [director, group, version];
    const { rows: [draft] } = await this.query<SynthesisRow>(`
      SELECT ${COLUMNS} FROM prisma_synthesis_versions
      WHERE director = $1 AND "group" = $2 AND version = $3
    `, key);
    if (!draft) throw new Error(notFound);
    const approval = approveSynthesis(draft, note);
    // Only the two approval fields change; repeated approvals replace the note.
    const { rows: [updated] } = await this.query<SynthesisRow>(`
      UPDATE prisma_synthesis_versions SET status = $4, review_note = $5
      WHERE director = $1 AND "group" = $2 AND version = $3
      RETURNING ${COLUMNS}
    `, [...key, approval.status, approval.reviewNote]);
    if (!updated) throw new Error(notFound);
    return updated;
  }

  private initialize(): Promise<void> {
    // The transaction-scoped lock serializes DDL across separate server instances.
    this.initialization ??= this.query(`
      DO $$ BEGIN
        PERFORM pg_advisory_xact_lock(1219051336, 2019857119);
        CREATE TABLE IF NOT EXISTS prisma_synthesis_counters (
          director text NOT NULL,
          "group" text NOT NULL,
          latest_version integer NOT NULL CHECK (latest_version > 0),
          PRIMARY KEY (director, "group")
        );
        CREATE TABLE IF NOT EXISTS prisma_synthesis_versions (
          director text NOT NULL,
          "group" text NOT NULL,
          version integer NOT NULL CHECK (version > 0),
          status text NOT NULL CHECK (status IN ('rascunho', 'aprovada')),
          content jsonb NOT NULL,
          author text NOT NULL,
          created_at text NOT NULL,
          review_note text,
          generated_by text NOT NULL CHECK (generated_by IN ('ia', 'humano')),
          PRIMARY KEY (director, "group", version)
        );
      END $$;
    `).then(() => undefined, (error: unknown) => {
      this.initialization = undefined;
      throw error;
    });
    return this.initialization;
  }
}
