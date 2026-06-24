import { Container, Graphics } from 'pixi.js'

export const LAYER_ORDER = [
  'terrain',
  'plants',
  'agents',
  'speciesHighlight',
  'activity',
  'selection',
] as const

export type RenderLayerId = (typeof LAYER_ORDER)[number]

export interface RenderLayers {
  terrain: Container
  plants: Container
  agents: Container
  speciesHighlight: Container
  activity: Container
  selection: Container
  root: Container
  /** Persistent draw surfaces — cleared each frame instead of recreated. */
  graphics: Record<RenderLayerId, Graphics>
}

export function createRenderLayers(): RenderLayers {
  const root = new Container()
  const layers: Partial<Record<RenderLayerId, Container>> = {}
  const graphics = {} as Record<RenderLayerId, Graphics>

  for (const id of LAYER_ORDER) {
    const layer = new Container()
    layer.label = id
    const g = new Graphics()
    g.label = `${id}-surface`
    layer.addChild(g)
    layers[id] = layer
    graphics[id] = g
    root.addChild(layer)
  }

  return {
    terrain: layers.terrain!,
    plants: layers.plants!,
    agents: layers.agents!,
    speciesHighlight: layers.speciesHighlight!,
    activity: layers.activity!,
    selection: layers.selection!,
    root,
    graphics,
  }
}

export function clearLayerGraphics(layers: RenderLayers, id: RenderLayerId): void {
  layers.graphics[id].clear()
}

export function clearAnimatedLayerGraphics(layers: RenderLayers): void {
  for (const id of ['agents', 'speciesHighlight', 'activity', 'selection'] as const) {
    clearLayerGraphics(layers, id)
  }
}

export function clearAllLayerGraphics(layers: RenderLayers): void {
  for (const id of LAYER_ORDER) {
    clearLayerGraphics(layers, id)
  }
}

/** @deprecated Use clearLayerGraphics — kept for callers that still pass Container. */
export function clearLayer(layer: Container): void {
  const removed = layer.removeChildren()
  for (const child of removed) {
    child.destroy({ children: true })
  }
}

/** @deprecated Use clearAllLayerGraphics. */
export function clearAllLayers(layers: RenderLayers): void {
  clearAllLayerGraphics(layers)
}

export function countPixiGraphics(root: Container): number {
  let count = 0
  const walk = (node: Container): void => {
    for (const child of node.children) {
      if (child instanceof Graphics) count += 1
      if (child instanceof Container) walk(child)
    }
  }
  walk(root)
  return count
}

export function countPixiContainers(root: Container): number {
  let count = 0
  const walk = (node: Container): void => {
    count += 1
    for (const child of node.children) {
      if (child instanceof Container) walk(child)
    }
  }
  walk(root)
  return count
}
