import fs from "fs";
import path from "path";
import { PipelineStatus } from "./metabase";

const FILE = path.join(process.cwd(), "data", "overrides.json");

function read(): Record<string, PipelineStatus> {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function write(data: Record<string, PipelineStatus>) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function getOverride(brandId: number): PipelineStatus | null {
  return read()[String(brandId)] ?? null;
}

export function getAllOverrides(): Record<string, PipelineStatus> {
  return read();
}

export function setOverride(brandId: number, status: PipelineStatus) {
  const data = read();
  data[String(brandId)] = status;
  write(data);
}

export function clearOverride(brandId: number) {
  const data = read();
  delete data[String(brandId)];
  write(data);
}
