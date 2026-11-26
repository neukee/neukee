/**
 * Node.js release lines: end-of-life date and LTS codename, copied from the official schedule,
 * https://github.com/nodejs/Release/blob/main/schedule.json (fetched 2026-11-25). Update it from
 * that file, never from memory. `end` is the last day a line gets fixes. Codenames are lowercased
 * (the schedule writes "Iron"; nvm's `.nvmrc` writes `lts/iron`).
 */
const RELEASES: readonly { line: string; end: string; codename?: string }[] = [
  { line: "0.8", end: "2014-07-31" },
  { line: "0.10", end: "2016-10-31" },
  { line: "0.12", end: "2016-12-31" },
  { line: "4", end: "2018-04-30", codename: "argon" },
  { line: "5", end: "2016-06-30" },
  { line: "6", end: "2019-04-30", codename: "boron" },
  { line: "7", end: "2017-06-30" },
  { line: "8", end: "2019-12-31", codename: "carbon" },
  { line: "9", end: "2018-06-30" },
  { line: "10", end: "2021-04-30", codename: "dubnium" },
  { line: "11", end: "2019-06-01" },
  { line: "12", end: "2022-04-30", codename: "erbium" },
  { line: "13", end: "2020-06-01" },
  { line: "14", end: "2023-04-30", codename: "fermium" },
  { line: "15", end: "2021-06-01" },
  { line: "16", end: "2023-09-11", codename: "gallium" },
  { line: "17", end: "2022-06-01" },
  { line: "18", end: "2025-04-30", codename: "hydrogen" },
  { line: "19", end: "2023-06-01" },
  { line: "20", end: "2026-04-30", codename: "iron" },
  { line: "21", end: "2024-06-01" },
  { line: "22", end: "2027-04-30", codename: "jod" },
  { line: "23", end: "2025-06-01" },
  { line: "24", end: "2028-04-30", codename: "krypton" },
  { line: "25", end: "2026-06-01" },
  { line: "26", end: "2029-04-30", codename: "lithium" },
  { line: "27", end: "2030-04-30" },
];

/** The release line of a version: "0.10" for 0.10.x, otherwise the major ("22"). */
export function releaseLine(version: string): string {
  const [major = "", minor = ""] = version.split(".");
  return major === "0" ? `0.${minor}` : major;
}

/** Every major line (1 and above), newest first. */
export function majorLines(): string[] {
  return RELEASES.filter((release) => !release.line.startsWith("0."))
    .map((release) => release.line)
    .reverse();
}

/** The end-of-life date of a release line, if the schedule lists it. */
export function endOfLife(line: string): string | undefined {
  return RELEASES.find((release) => release.line === line)?.end;
}

/** The major of an LTS line by codename ("iron" → 20); codenames compare case-insensitively. */
export function ltsMajor(codename: string): string | undefined {
  const name = codename.toLowerCase();
  return RELEASES.find((release) => release.codename === name)?.line;
}
