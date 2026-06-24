import { Container } from 'pixi.js'

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
}

export function createRenderLayers(): RenderLayers {
  const root = new Container()
  const layers: Partial<Record<RenderLayerId, Container>> = {}

  for (const id of LAYER_ORDER) {
    const layer = new Container()
    layer.label = id
    layers[id] = layer
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
  }
}

export function clearLayer(layer: Container): void {
  layer.removeChildren()
}

export function clearAllLayers(layers: RenderLayers): void {
  for (const id of LAYER_ORDER) {
    clearLayer(layers[id])
  }
}
