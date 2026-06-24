import { useEffect, useRef } from 'react'
import { Application, Graphics } from 'pixi.js'
import type { MobileAgent } from '../../types/agents'
import type { EntityKind, LifeOrganism, SpeciesRecord } from '../../types/life'
import type { Tile } from '../../types/simulation'
import { drawAgentPreview } from './agentGlyphs'
import { drawProducerPreview } from './plantGlyphs'
import { agentVisualTraits, producerVisualTraits } from './visualGenes'
import { lifeKindLabel } from './tileColors'
import { bodyPlanSummary } from '../../types/bodyPlan'
import { sensesSummary } from '../../types/senses'

interface InspectorPreviewProps {
  tile: Tile
  species: SpeciesRecord | null
  organism: LifeOrganism | null
  agent: MobileAgent | null
  population: number
  biomass: number
}

const PREVIEW_SIZE = 96

export function InspectorPreview({
  tile,
  species,
  organism,
  agent,
  population,
  biomass,
}: InspectorPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let destroyed = false
    let app: Application | null = null

    const run = async () => {
      app = new Application()
      await app.init({
        width: PREVIEW_SIZE,
        height: PREVIEW_SIZE,
        background: 0x0f1419,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })

      if (destroyed) {
        app.destroy(true)
        return
      }

      host.innerHTML = ''
      host.appendChild(app.canvas)

      const g = new Graphics()
      const cx = PREVIEW_SIZE / 2
      const cy = PREVIEW_SIZE / 2

      if (agent) {
        drawAgentPreview(g, agent, cx, cy, PREVIEW_SIZE * 0.35)
      } else if (organism) {
        drawProducerPreview(g, organism.kind, organism.genome, tile.terrain, cx, cy, PREVIEW_SIZE * 0.35)
      } else if (species) {
        drawPlaceholderGlyph(g, species.kind, cx, cy)
      }

      app.stage.addChild(g)
    }

    run()

    return () => {
      destroyed = true
      if (app) app.destroy(true)
      if (host) host.innerHTML = ''
    }
  }, [tile.terrain, species, organism, agent])

  const kind = species?.kind ?? organism?.kind ?? agent?.kind
  const role = species?.trophicRole ?? agent?.trophicRole ?? 'producer'
  const name = species?.name ?? (kind ? lifeKindLabel(kind) : 'Unknown')

  const traitLines = buildTraitLines(kind, organism, agent)

  return (
    <div className="rounded border border-command-border bg-command-surface/80 p-3">
      <p className="mb-2 font-mono text-[10px] text-slate-500">VISUAL PREVIEW</p>
      <div className="flex gap-3">
        <div
          ref={hostRef}
          className="h-24 w-24 shrink-0 overflow-hidden rounded border border-command-border/60"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1 font-mono text-xs">
          <p className="truncate text-slate-200">{name}</p>
          <p className="text-slate-500">{role}</p>
          <p className="text-slate-400">Pop {population} · biomass {biomass.toFixed(2)}</p>
          {traitLines.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[10px] text-slate-500">
              {traitLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function drawPlaceholderGlyph(g: Graphics, kind: EntityKind, cx: number, cy: number): void {
  if (kind === 'SimplePredator') {
    g.moveTo(cx, cy - 20)
    g.lineTo(cx + 18, cy + 12)
    g.lineTo(cx - 18, cy + 12)
    g.fill({ color: 0xf87171, alpha: 0.8 })
  } else if (kind === 'SimpleGrazer') {
    g.circle(cx, cy, 18)
    g.fill({ color: 0x4ade80, alpha: 0.8 })
  } else if (kind === 'Scavenger') {
    g.circle(cx, cy + 4, 14)
    g.fill({ color: 0xfbbf24, alpha: 0.8 })
  } else {
    g.circle(cx, cy, 16)
    g.fill({ color: 0x22c55e, alpha: 0.7 })
  }
}

function buildTraitLines(
  kind: EntityKind | undefined,
  organism: LifeOrganism | null,
  agent: MobileAgent | null,
): string[] {
  const lines: string[] = []
  if (agent) {
    const t = agentVisualTraits(agent)
    lines.push(`body: ${bodyPlanSummary(agent.bodyPlan)}`)
    lines.push(`senses: ${sensesSummary(agent.senses)}`)
    lines.push(`fitness ${agent.environmentalFitness.toFixed(2)} · stress ${agent.habitatStress.toFixed(2)}`)
    lines.push(`goal ${agent.currentGoal} — ${agent.targetReason}`)
    lines.push(`speed → ${agent.genome.speed.toFixed(2)} (legs ${t.legCount})`)
    lines.push(`sensory → ${agent.genome.sensoryRange} (eyes ×${t.eyeScale.toFixed(2)})`)
    if (agent.kind === 'SimplePredator') {
      lines.push(`hunt → ${agent.genome.huntingEfficiency.toFixed(2)}`)
    }
    if (agent.kind === 'SimpleGrazer') {
      lines.push(`graze → ${agent.genome.grazingEfficiency.toFixed(2)}`)
    }
    lines.push(`health ${agent.health.toFixed(2)} · energy ${agent.energy.toFixed(2)}`)
    lines.push(`last: ${agent.lastAction}`)
  } else if (organism) {
    const t = producerVisualTraits(organism.kind, organism.genome, organism.biomass, 0.5, 'grassland')
    lines.push(`spread → ${organism.genome.spreadRate.toFixed(2)}`)
    lines.push(`light use → ${organism.genome.lightUse.toFixed(2)}`)
    lines.push(`variant: ${t.variant}`)
  } else if (kind) {
    lines.push(`archetype: ${lifeKindLabel(kind)}`)
  }
  return lines.slice(0, 4)
}
