/**
 * The two style cascades decided in #18.
 *
 * They are TWO, not one. Team shapes and Position labels are different objects
 * with different properties, and no layer of one can ever override a layer of the
 * other — a single eight-layer list conflated them.
 *
 *   Team shapes:     team -> org -> teamDepth.<n> -> shape.<path>
 *                    (`shape.<path>` is keyed by Team Path — since #34 removed the
 *                     `shape` PROPERTY, that name means only this layer)
 *   Position labels: position -> role.<Role> -> occupant.<email> -> vacant
 *
 * Later layers win.
 */
import type { PositionStyle, TeamStyle, ViewDoc } from '../files/types'

export type StyleDoc = ViewDoc['style']

/** Every property resolved — no optionals, so the renderer never guesses. */
export interface ResolvedTeamStyle extends Required<TeamStyle> {}
export interface ResolvedPositionStyle extends Required<PositionStyle> {}

export const BASE_TEAM: ResolvedTeamStyle = {
  fill: '#ffffff',
  line: '#9aa0a6',
  border: 1,
  font: 13,
  text: '#202124',
  margin: 8,
}

export const BASE_POSITION: ResolvedPositionStyle = {
  fill: 'transparent',
  text: '#3c4043',
  font: 11,
}

export const DEFAULT_STYLE: StyleDoc = {
  team: {},
  org: { border: 3, font: 17, fill: '#fafafa' },
  teamDepth: {
    1: { border: 2, font: 15, fill: '#f1f6ff' },
    2: { border: 1, font: 13, fill: '#ffffff' },
    3: { border: 1, font: 12, fill: '#fcfcfd' },
  },
  shape: {},
  position: {},
  role: {},
  occupant: {},
  vacant: { fill: '#ffe4e4', text: '#b02020' },
}

const merge = <T extends object>(base: T, layer: Partial<T> | undefined): T => {
  if (!layer) return base
  const out = { ...base }
  for (const [k, v] of Object.entries(layer)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v
  }
  return out
}

/** Which layers apply to a Team, weakest first. Exported so the UI can show provenance (#22). */
export function teamLayerChain(style: StyleDoc, depth: number, path: string): [string, TeamStyle | undefined][] {
  return [
    ['team', style.team],
    ...(depth === 0 ? ([['org', style.org]] as [string, TeamStyle | undefined][]) : []),
    ...(depth > 0 ? ([[`teamDepth.${depth}`, style.teamDepth?.[depth]]] as [string, TeamStyle | undefined][]) : []),
    [`shape.${path}`, style.shape?.[path]],
  ]
}

export function resolveTeamStyle(style: StyleDoc, depth: number, path: string): ResolvedTeamStyle {
  let out = BASE_TEAM
  for (const [, layer] of teamLayerChain(style, depth, path)) out = merge(out, layer)
  return out
}

export interface PositionKey {
  role: string
  occupantEmail: string | null
  vacant: boolean
}

export function positionLayerChain(style: StyleDoc, p: PositionKey): [string, PositionStyle | undefined][] {
  return [
    ['position', style.position],
    [`role.${p.role}`, style.role?.[p.role]],
    ...(p.occupantEmail
      ? ([[`occupant.${p.occupantEmail}`, style.occupant?.[p.occupantEmail]]] as [string, PositionStyle | undefined][])
      : []),
    ...(p.vacant ? ([['vacant', style.vacant]] as [string, PositionStyle | undefined][]) : []),
  ]
}

export function resolvePositionStyle(style: StyleDoc, p: PositionKey): ResolvedPositionStyle {
  let out = BASE_POSITION
  for (const [, layer] of positionLayerChain(style, p)) out = merge(out, layer)
  return out
}

/** Writes a patch into one cascade layer, addressed as `team`, `teamDepth.2`, `shape.<path>`… */
export function writeLayer(style: StyleDoc, id: string, patch: Record<string, unknown>): StyleDoc {
  const [head, rest] = id.split(/\.(.+)/) as [string, string | undefined]
  const next = { ...style } as Record<string, unknown>
  const clean = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out = { ...obj }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete out[k]
      else out[k] = v
    }
    return out
  }
  if (!rest) {
    next[head] = clean((next[head] as Record<string, unknown>) ?? {})
  } else {
    const bucket = { ...((next[head] as Record<string, unknown>) ?? {}) }
    bucket[rest] = clean((bucket[rest] as Record<string, unknown>) ?? {})
    next[head] = bucket
  }
  return next as StyleDoc
}
