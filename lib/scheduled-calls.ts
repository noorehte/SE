import fs from "fs";
import path from "path";

const FILE = "/tmp/scheduled-calls.json";

interface ScheduledCall {
  brandId: number;
  brandName: string;
  seOwner: string;
  scheduledAt: string; // ISO — when the automation ran
  callDate: string;    // ISO — the actual calendar event date
}

function read(): Record<string, ScheduledCall> {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function write(data: Record<string, ScheduledCall>): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function isScheduled(brandId: number): boolean {
  return Boolean(read()[String(brandId)]);
}

export function markScheduled(
  brandId: number,
  brandName: string,
  seOwner: string,
  callDate: string
): void {
  const data = read();
  data[String(brandId)] = {
    brandId,
    brandName,
    seOwner,
    scheduledAt: new Date().toISOString(),
    callDate,
  };
  write(data);
}

export function getAllScheduled(): Record<string, ScheduledCall> {
  return read();
}
