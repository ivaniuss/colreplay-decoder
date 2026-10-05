// Parser del contenedor .colreplay (CLRP).
// Formato definido en app/public/src/game/replay-format.ts de
// keldaanCommunity/pokemonAutoChess (CLRP v1).

import { unpack } from "@colyseus/msgpackr"

export const MAGIC = [0x43, 0x4c, 0x52, 0x50] // "CLRP"
const CONTAINER_V1 = 1
const KIND = { handshake: 0, state: 1, patch: 2, message: 3 } as const
export const KIND_NAME = ["handshake", "state", "patch", "message"] as const
const ENC_MSGPACK = 0
const ENC_BYTES = 1
const ENC_NONE = 2

export interface ReplayFrame {
  t: number
  kind: "handshake" | "state" | "patch" | "message"
  offset?: number
  bytes?: Uint8Array
  type?: string | number
  payload?: unknown
}

export interface ReplayHeader {
  format: string
  schemaVersion: number
  game: { version: string; assetsVersion: string; serializerId: string }
  room: string
  viewerUid: string
  recordedAt: string
}

const td = new TextDecoder()

class ByteReader {
  pos = 0
  constructor(private u8: Uint8Array) {}
  u8r(): number {
    return this.u8[this.pos++]
  }
  u32(): number {
    const b = this.u8
    const p = this.pos
    this.pos += 4
    return ((b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) >>> 0) + b[p + 3] * 0x1000000
  }
  varint(): number {
    let shift = 1
    let result = 0
    let b: number
    do {
      b = this.u8[this.pos++]
      result += (b & 0x7f) * shift
      shift *= 128
    } while (b & 0x80)
    return result
  }
  bytes(n: number): Uint8Array {
    const out = this.u8.slice(this.pos, this.pos + n)
    this.pos += n
    return out
  }
}

function parseTrailerFooter(buf: Uint8Array): { byteLength: number } | null {
  const TRAILER_MAGIC = [0x43, 0x4c, 0x54, 0x52] // "CLTR"
  const L = buf.length
  if (L < 8) return null
  for (let i = 0; i < 4; i++) if (buf[L - 4 + i] !== TRAILER_MAGIC[i]) return null
  const lenPos = L - 8
  const summaryLen =
    (buf[lenPos] | (buf[lenPos + 1] << 8) | (buf[lenPos + 2] << 16)) + buf[lenPos + 3] * 0x1000000
  const start = lenPos - summaryLen
  if (summaryLen <= 0 || start < 0) return null
  return { byteLength: summaryLen + 8 }
}

export interface ParsedReplay {
  header: ReplayHeader
  frames: ReplayFrame[]
  trailerSummary: unknown | null
  warnings: string[]
}

export function parseReplay(input: Uint8Array): ParsedReplay {
  for (let i = 0; i < 4; i++) {
    if (input.length < 4 || input[i] !== MAGIC[i])
      throw new Error("No es un archivo CLRP (magia incorrecta)")
  }
  const r = new ByteReader(input)
  for (let i = 0; i < 4; i++) r.u8r()
  const ver = r.u8r()
  if (ver !== CONTAINER_V1)
    throw new Error(`Versión de contenedor no soportada: ${ver} (esperada 1)`)
  const metaLen = r.u32()
  const header = JSON.parse(td.decode(r.bytes(metaLen))) as ReplayHeader
  if (header.format !== "colreplay-v1")
    throw new Error(`Formato de cabecera desconocido: ${header.format}`)

  const trailer = parseTrailerFooter(input)
  const framesEnd = trailer ? input.length - trailer.byteLength : input.length

  const frames: ReplayFrame[] = []
  const warnings: string[] = []
  let prevT = 0
  while (r.pos < framesEnd) {
    const frameStart = r.pos
    try {
      const kind = r.u8r()
      const t = prevT + r.varint()
      if (kind === KIND.message) {
        const typeTag = r.u8r()
        const type = typeTag === 0 ? r.varint() : td.decode(r.bytes(r.varint()))
        const enc = r.u8r()
        let payload: unknown
        if (enc === ENC_NONE) payload = undefined
        else if (enc === ENC_BYTES) payload = r.bytes(r.varint())
        else payload = unpack(r.bytes(r.varint()))
        frames.push({ t, kind: "message", type, payload })
      } else {
        const kindName = KIND_NAME[kind]
        if (kindName === undefined) throw new Error(`tipo de frame desconocido ${kind}`)
        const offset = r.varint()
        const len = r.varint()
        frames.push({ t, kind: kindName, offset, bytes: r.bytes(len) })
      }
      if (r.pos > framesEnd) throw new Error("frame trunca al final del archivo")
    } catch (e) {
      warnings.push(
        `Decodificación detenida en frame corrupto/truncado @${frameStart} (frames recuperados: ${frames.length}): ${(e as Error).message}`
      )
      break
    }
    prevT = frames[frames.length - 1].t
  }
  let trailerSummary: unknown = null
  if (trailer) {
    try {
      const lenPos = input.length - 8
      const summaryLen =
        (input[lenPos] | (input[lenPos + 1] << 8) | (input[lenPos + 2] << 16)) +
        input[lenPos + 3] * 0x1000000
      trailerSummary = JSON.parse(td.decode(input.subarray(lenPos - summaryLen, lenPos)))
    } catch {
      warnings.push("No se pudo parsear el trailer CLTR")
    }
  }
  return { header, frames, trailerSummary, warnings }
}
