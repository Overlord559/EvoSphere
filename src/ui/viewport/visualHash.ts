/** Deterministic hash helpers for procedural visuals — no Math.random(). */

export function tileHash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 982451653) | 0
  h = ((h ^ (h >>> 13)) * 1274126177) | 0
  return (h ^ (h >>> 16)) >>> 0
}

export function hash01(x: number, y: number, salt: number): number {
  return tileHash(x, y, salt) / 0xffffffff
}

export function hashRange(x: number, y: number, salt: number, min: number, max: number): number {
  return min + hash01(x, y, salt) * (max - min)
}

export function hashAngle(x: number, y: number, salt: number): number {
  return hash01(x, y, salt) * Math.PI * 2
}

export function entityHash(id: string, salt: number): number {
  let h = salt
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  }
  return (h ^ (h >>> 16)) >>> 0
}

export function entityHash01(id: string, salt: number): number {
  return entityHash(id, salt) / 0xffffffff
}
