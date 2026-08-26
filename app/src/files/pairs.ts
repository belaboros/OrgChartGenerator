/** Pairing rule, shared by every adapter so they cannot disagree about it. */
export function orgPrefixes(fileNames: readonly string[]): string[] {
  const teams = new Set<string>()
  const employees = new Set<string>()
  for (const n of fileNames) {
    if (n.endsWith('-teams.yaml')) teams.add(n.slice(0, -'-teams.yaml'.length))
    else if (n.endsWith('-employees.yaml')) employees.add(n.slice(0, -'-employees.yaml'.length))
  }
  // An organization needs both halves; a lone file is not an organization.
  return [...teams].filter((p) => employees.has(p)).sort()
}

export function viewNames(fileNames: readonly string[], prefix: string): string[] {
  return fileNames.filter((n) => n.startsWith(prefix + '.') && n.endsWith('.view.yaml')).sort()
}
