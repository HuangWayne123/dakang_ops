import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");
const AUDITS_FILE = path.join(DATA_DIR, "agent-audits.jsonl");

async function ensureFile(filePath) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf8");
  }
}

async function appendRecord(filePath, record) {
  await ensureFile(filePath);
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

async function readRecords(filePath) {
  await ensureFile(filePath);
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function appendEvent(record) {
  await appendRecord(EVENTS_FILE, record);
}

export async function appendAgentAudit(record) {
  await appendRecord(AUDITS_FILE, record);
}

export async function getEvents() {
  return readRecords(EVENTS_FILE);
}

export async function getAgentAudits() {
  return readRecords(AUDITS_FILE);
}
