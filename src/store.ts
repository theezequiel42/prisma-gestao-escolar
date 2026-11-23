import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReportSynthesis } from "./report.ts";
import {
  approveSynthesis,
  createSynthesisVersion,
  type SynthesisVersion,
} from "./synthesis.ts";

interface StoredSynthesis extends SynthesisVersion {
  director: string;
  group: string;
}

export class SynthesisStore {
  private entries: StoredSynthesis[] = [];
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, "utf8");
      this.entries = JSON.parse(content) as StoredSynthesis[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.entries = [];
    }
  }

  public list(director: string, group: string): StoredSynthesis[] {
    return this.entries.filter(
      (entry) => entry.director === director && entry.group === group,
    );
  }

  public async create(
    director: string,
    group: string,
    content: ReportSynthesis,
    author: string,
    generatedBy: "ia" | "humano" = "humano",
  ): Promise<StoredSynthesis> {
    const previous = this.list(director, group);
    const entry: StoredSynthesis = {
      ...createSynthesisVersion(
        content,
        author,
        previous.length + 1,
        undefined,
        generatedBy,
      ),
      director,
      group,
    };
    this.entries.push(entry);
    await this.persist();
    return entry;
  }

  public async approve(
    director: string,
    group: string,
    version: number,
    note = "",
  ): Promise<StoredSynthesis> {
    const index = this.entries.findIndex(
      (entry) =>
        entry.director === director &&
        entry.group === group &&
        entry.version === version,
    );
    if (index < 0) throw new Error("Versão de síntese não encontrada.");
    const current = this.entries[index];
    const updated: StoredSynthesis = {
      ...approveSynthesis(current, note),
      director,
      group,
    };
    this.entries[index] = updated;
    await this.persist();
    return updated;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.entries, null, 2)}\n`, "utf8");
  }
}
