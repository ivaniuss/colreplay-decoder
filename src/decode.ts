import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { SchemaSerializer } from "@colyseus/sdk"
import { parseReplay, type ParsedReplay } from "./format.js"

const PHASE_NAMES = ["PICK", "FIGHT", "TOWN"]

interface PokemonSnap {
  name: string
  stars: number
  positionX: number
  positionY: number
  items: string[]
  shiny: boolean
  index: string
}

interface HistorySnap {
  name: string
  result: string
  weather: string
}

interface PlayerSnap {
  uid: string
  name: string
  money: number
  life: number
  level: number
  experience: number
  expNeeded: number
  streak: number
  interest: number
  maxInterest: number
  rank: number
  elo: number
  alive: boolean
  opponentId: string
  opponentName: string
  map: string
  synergies: Record<string, number>
  items: string[]
  scarvesItems: string[]
  shop: string[]
  bench: PokemonSnap[]
  board: PokemonSnap[]
  history: HistorySnap[]
}

function toArr<T>(v: any): T[] {
  if (!v) return []
  if (typeof v.toArray === "function") return v.toArray()
  if (v.forEach) {
    const out: T[] = []
    v.forEach((x: T) => out.push(x))
    return out
  }
  return Array.from(v as Iterable<T>)
}

function pkmSnap(p: any): PokemonSnap {
  return {
    name: String(p.name ?? ""),
    stars: Number(p.stars ?? 0),
    positionX: Number(p.positionX ?? -1),
    positionY: Number(p.positionY ?? -1),
    items: toArr<string>(p.items),
    shiny: Boolean(p.shiny),
    index: String(p.index ?? "")
  }
}

function snapshotPlayers(state: any): Map<string, PlayerSnap> {
  const out = new Map<string, PlayerSnap>()
  const players = state?.players
  if (!players) return out
  players.forEach((p: any, key: string) => {
    const units: PokemonSnap[] = []
    p.board?.forEach((pk: any) => units.push(pkmSnap(pk)))
    const bench = units.filter((u) => u.positionY === 0)
    const board = units.filter((u) => u.positionY > 0)
    const synergies: Record<string, number> = {}
    p.synergies?.forEach((v: number, k: string) => (synergies[k] = v))
    const history: HistorySnap[] = []
    p.history?.forEach((h: any) =>
      history.push({ name: String(h.name ?? ""), result: String(h.result ?? ""), weather: String(h.weather ?? "") })
    )
    out.set(p.id ?? key, {
      uid: p.id ?? key,
      name: String(p.name ?? ""),
      money: Number(p.money ?? 0),
      life: Number(p.life ?? 0),
      level: Number(p.experienceManager?.level ?? 0),
      experience: Number(p.experienceManager?.experience ?? 0),
      expNeeded: Number(p.experienceManager?.expNeeded ?? 0),
      streak: Number(p.streak ?? 0),
      interest: Number(p.interest ?? 0),
      maxInterest: Number(p.maxInterest ?? 0),
      rank: Number(p.rank ?? 0),
      elo: Number(p.elo ?? 0),
      alive: Boolean(p.alive),
      opponentId: String(p.opponentId ?? ""),
      opponentName: String(p.opponentName ?? ""),
      map: String(p.map ?? ""),
      synergies,
      items: toArr<string>(p.items),
      scarvesItems: toArr<string>(p.scarvesItems),
      shop: toArr<string>(p.shop).map(String),
      bench,
      board,
      history
    })
  })
  return out
}

// ── detección de acciones ────────────────────────────────────────────────────
interface Event {
  t: number
  stage: number
  phase: string
  uid: string
  player: string
  type: string
  detail: string
}

function multiset<T extends string>(arr: T[]): Map<T, number> {
  const m = new Map<T, number>()
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1)
  return m
}
function diffMs<T extends string>(a: Map<T, number>, b: Map<T, number>) {
  const added: T[] = []
  const removed: T[] = []
  for (const [k, n] of b) for (let i = 0; i < n - (a.get(k) ?? 0); i++) added.push(k)
  for (const [k, n] of a) for (let i = 0; i < n - (b.get(k) ?? 0); i++) removed.push(k)
  return { added, removed }
}

function pkmKey(p: PokemonSnap) {
  return `${p.name}|${p.stars}`
}

function diffPlayer(prev: PlayerSnap | undefined, cur: PlayerSnap, stage: number, phase: string, t: number): Event[] {
  const evs: Event[] = []
  const mk = (type: string, detail: string) =>
    evs.push({ t, stage, phase, uid: cur.uid, player: cur.name, type, detail })
  if (!prev) return evs

  if (cur.history.length > prev.history.length) {
    const last = cur.history[cur.history.length - 1]
    mk("fight_result", `${last.name} -> ${last.result}`)
  }
  if (cur.streak !== prev.streak) mk("streak", `${prev.streak} -> ${cur.streak}`)
  if (cur.money !== prev.money) mk("money", `${prev.money}g -> ${cur.money}g`)
  if (cur.life !== prev.life) mk("life", `${prev.life} -> ${cur.life}`)
  if (cur.level !== prev.level) mk("level_up", `nivel ${prev.level} -> ${cur.level}`)
  if (cur.experience !== prev.experience && cur.level === prev.level)
    mk("xp_change", `${prev.experience} -> ${cur.experience}/${cur.expNeeded}`)

  const prevShop = multiset(prev.shop)
  const curShop = multiset(cur.shop)
  const gained = diffMs(prevShop, curShop).added
  const removed = diffMs(prevShop, curShop).removed
  if (removed.length >= 3 && gained.length >= 3) mk("reroll", `${removed.length} slots refrescados`)
  else if (removed.length > 0 && removed.length < 3) {
    for (const r of removed) mk("shop_remove", r)
  }

  const prevBench = multiset(prev.bench.map(pkmKey))
  const curBench = multiset(cur.bench.map(pkmKey))
  const bAdd = diffMs(prevBench, curBench).added
  const bRem = diffMs(prevBench, curBench).removed
  const prevBoard = multiset(prev.board.map(pkmKey))
  const curBoard = multiset(cur.board.map(pkmKey))
  const bdAdd = diffMs(prevBoard, curBoard).added
  const bdRem = diffMs(prevBoard, curBoard).removed

  for (const a of bAdd) {
    const nm = a.split("|")[0]
    if ((prevShop.get(nm) ?? 0) > 0) {
      // la unidad estaba en la tienda: compra (aunque el slot se vacíe en otro frame)
      mk("buy", `${nm} (tienda -> banco)`)
      prevShop.set(nm, (prevShop.get(nm) ?? 1) - 1)
      continue
    }
    mk("bench_gain", a)
  }
  for (const r of bRem) mk("bench_lose", r)
  for (const a of bdAdd) mk("board_gain", a)
  for (const r of bdRem) mk("board_lose", r)

  const iAdd = diffMs(multiset(prev.items), multiset(cur.items)).added
  const iRem = diffMs(multiset(prev.items), multiset(cur.items)).removed
  for (const a of iAdd) mk("item_gain", a)
  for (const r of iRem) mk("item_lose", r)

  for (const [k, v] of Object.entries(cur.synergies)) {
    if (prev.synergies[k] !== v) mk("synergy_change", `${k}: ${prev.synergies[k] ?? 0} -> ${v}`)
  }
  return evs
}

function classifyBuySell(evs: Event[], prev: PlayerSnap | undefined, cur: PlayerSnap) {
  if (!prev) return evs
  const benchAdded = evs.filter((e) => e.type === "bench_gain").map((e) => e.detail)
  const benchLostNames = evs.filter((e) => e.type === "bench_lose").map((e) => e.detail.split("|")[0])
  return evs.map((e) => {
    if (e.type === "shop_remove") {
      const i = benchAdded.findIndex((b) => b.startsWith(e.detail + "|"))
      if (i >= 0) {
        benchAdded.splice(i, 1)
        return { ...e, type: "buy", detail: `${e.detail} (tienda -> banco)` }
      }
      // compra para evolucionar: el slot se vacía y la misma especie sale de la banca (fusionada)
      const j = benchLostNames.indexOf(e.detail)
      if (j >= 0) {
        benchLostNames.splice(j, 1)
        return { ...e, type: "buy", detail: `${e.detail} (tienda -> evolucion)` }
      }
      return e
    }
    if (e.type === "bench_lose" && !prev.shop.includes(e.detail.split("|")[0])) {
      if (cur.money > prev.money) return { ...e, type: "sell", detail: e.detail }
    }
    return e
  })
}

function fmtPokemon(list: PokemonSnap[]) {
  return list
    .map((p) => `${p.name} ★${p.stars}${p.items.length ? `(${p.items.join("+")})` : ""} @${p.positionX},${p.positionY}`)
    .join("; ")
}

// ── resolución de combate ────────────────────────────────────────────────────
// POKEMON_DAMAGE/HEAL: {index (atacante, sprite), type, amount, x, y (víctima), id (simulationId)}
// ABILITY: {id (simulationId), skill, ap, positionX/Y (caster), targetX/Y}
interface CombatRow {
  t: number
  stage: number
  phase: string
  simId: string
  blue: string
  red: string
  kind: "damage" | "heal" | "ability"
  attacker: string
  attackerSide: string
  victim: string
  victimSide: string
  amount: number
  attackType: number | string
  skill: string
  unresolved: string
}

function playerName(state: any, uid: string): string {
  try {
    return String(state?.players?.get(uid)?.name ?? uid ?? "")
  } catch {
    return String(uid ?? "")
  }
}

function forEachUnit(team: any, cb: (u: any, side: string, teamRef: any) => void, side: string) {
  try {
    team?.forEach?.((u: any) => cb(u, side, team))
  } catch {
    // colección no iterable en este estado parcial
  }
}

function unitAtTile(sim: any, x: number, y: number): { name: string; index: string; stars: number; side: string } | null {
  let found: { name: string; index: string; stars: number; side: string } | null = null
  for (const [team, side] of [[sim?.blueTeam, "blue"], [sim?.redTeam, "red"]] as const) {
    forEachUnit(team, (u: any) => {
      if (!found && Number(u.positionX) === x && Number(u.positionY) === y) {
        found = { name: String(u.name ?? ""), index: String(u.index ?? ""), stars: Number(u.stars ?? 0), side }
      }
    }, side)
  }
  return found
}

function unitsWithIndex(sim: any, index: string): { name: string; side: string }[] {
  const out: { name: string; side: string }[] = []
  for (const [team, side] of [[sim?.blueTeam, "blue"], [sim?.redTeam, "red"]] as const) {
    forEachUnit(team, (u: any) => {
      if (String(u.index ?? "") === String(index)) out.push({ name: String(u.name ?? ""), side })
    }, side)
  }
  return out
}

function resolveCombat(
  state: any, t: number, stage: number, phase: string,
  type: string, payload: any
): CombatRow | null {
  if (type !== "POKEMON_DAMAGE" && type !== "POKEMON_HEAL" && type !== "ABILITY") return null
  if (!payload || typeof payload !== "object") return null
  const simId = String(payload.id ?? "")
  const sim = state?.simulations?.get(simId)
  const blueId = String(sim?.bluePlayerId ?? "")
  const redId = String(sim?.redPlayerId ?? "")
  const blue = playerName(state, blueId)
  const red = playerName(state, redId)
  const unresolved: string[] = []
  if (!sim) unresolved.push("sim-not-found")

  const base = { t, stage, phase, simId, blue, red, amount: 0, attackType: "", skill: "", unresolved: "" }
  if (type === "ABILITY") {
    const caster = sim ? unitAtTile(sim, Number(payload.positionX), Number(payload.positionY)) : null
    if (!caster) unresolved.push("caster-not-found")
    const target = sim ? unitAtTile(sim, Number(payload.targetX), Number(payload.targetY)) : null
    return {
      ...base, kind: "ability",
      attacker: caster?.name ?? "", attackerSide: caster?.side ?? "",
      victim: target?.name ?? "", victimSide: target?.side ?? "",
      skill: String(payload.skill ?? ""), unresolved: unresolved.join("|")
    }
  }
  const kind = type === "POKEMON_DAMAGE" ? "damage" : "heal"
  const victim = sim ? unitAtTile(sim, Number(payload.x), Number(payload.y)) : null
  if (!victim) unresolved.push("victim-not-found")
  const candidates = sim ? unitsWithIndex(sim, String(payload.index ?? "")) : []
  if (!candidates.length) unresolved.push("attacker-not-found")
  const attacker = candidates[0]
  return {
    ...base, kind,
    attacker: attacker?.name ?? `index:${payload.index ?? "?"}`, attackerSide: attacker?.side ?? "",
    victim: victim?.name ?? "", victimSide: victim?.side ?? "",
    amount: Number(payload.amount ?? 0), attackType: payload.type ?? "",
    unresolved: unresolved.join("|")
  }
}

async function main() {
  const args = process.argv.slice(2)
  const file = args[0]
  let outDir = "./salida"
  let granularity: "frame" | "phase" = "frame"
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--out") outDir = args[++i]
    else if (args[i] === "--granularity") {
      const g = args[++i]
      if (g !== "frame" && g !== "phase") {
        console.error(`--granularity debe ser "frame" o "phase" (recibido: ${g})`)
        process.exit(1)
      }
      granularity = g
    }
  }
  if (!file) {
    console.error("Uso: decode.ts <replay.colreplay> [--out DIR] [--granularity frame|phase]")
    process.exit(1)
  }
  const buf = readFileSync(file)
  const parsed: ParsedReplay = parseReplay(buf)
  const { header } = parsed
  console.log(`Archivo: ${file}`)
  console.log(`Formato: ${header.format} | schemaVersion=${header.schemaVersion}`)
  console.log(`Juego: ${header.game.version} (assets ${header.game.assetsVersion}, serializer ${header.game.serializerId})`)
  console.log(`Sala: ${header.room} | viewerUid: ${header.viewerUid} | grabado: ${header.recordedAt}`)
  console.log(`Granularidad de eventos: ${granularity}`)

  const ser = new SchemaSerializer<any>()
  const msgTypeCounts = new Map<string | number, number>()
  const badFrames: { index: number; t: number; kind: string; error: string }[] = []
  const messageErrors: { index: number; t: number; type: string | number; note: string }[] = []

  // La reflexión embebida usa el formato legado "array:string" / "set:string" para colecciones de primitivos;
  // @colyseus/schema 5.0.32 espera { array: "string" }. Corregimos los metadatos en sitio tras el handshake.
  function fixLegacyCollectionMetadata(ser: SchemaSerializer<any>) {
    const ctx = (ser as any).decoder?.context
    if (!ctx?.schemas) return
    for (const ctor of ctx.schemas.keys()) {
      const md = (ctor as any)[Symbol.metadata]
      if (!md) continue
      for (const k of Object.keys(md)) {
        const f = (md as any)[k]
        if (!f || typeof f !== "object") continue
        const t = f.type
        if (t && typeof t === "object" && !Array.isArray(t)) {
          const keys = Object.keys(t)
          if (keys.length === 1 && keys[0].includes(":")) {
            const [coll, prim] = keys[0].split(":")
            f.type = { [coll]: prim }
          }
        }
      }
    }
  }

  const rounds: Record<string, unknown>[] = []
  const events: Event[] = []
  const combat: CombatRow[] = []
  const prevByPlayer = new Map<string, PlayerSnap>()
  let lastStage = -1
  let lastPhase = -1
  let lastT = 0
  let framesApplied = 0
  let messagesProcessed = 0
  let combatUnresolved = 0

  function processStateSnapshot(t: number, state: any, emitEvents: boolean) {
    const snap = snapshotPlayers(state)
    if (emitEvents) {
      for (const [, p] of snap) {
        const evs = diffPlayer(
          prevByPlayer.get(p.uid), p,
          state.stageLevel ?? 0, PHASE_NAMES[state.phase] ?? String(state.phase), t
        )
        events.push(...classifyBuySell(evs, prevByPlayer.get(p.uid), p))
      }
    }
    for (const [uid, p] of snap) prevByPlayer.set(uid, p)
  }

  function emitRoundRow(t: number, state: any) {
    const snap = snapshotPlayers(state)
    for (const [uid, p] of snap) {
      const lastHist = p.history.length ? p.history[p.history.length - 1] : null
      rounds.push({
        t,
        stageLevel: state.stageLevel ?? 0,
        phase: PHASE_NAMES[state.phase] ?? String(state.phase),
        uid,
        name: p.name,
        money: p.money,
        life: p.life,
        level: p.level,
        experience: p.experience,
        expNeeded: p.expNeeded,
        streak: p.streak,
        interest: p.interest,
        maxInterest: p.maxInterest,
        rank: p.rank,
        elo: p.elo,
        alive: p.alive,
        opponentName: p.opponentName,
        map: p.map,
        synergies: JSON.stringify(p.synergies),
        items: p.items.join("|"),
        scarvesItems: p.scarvesItems.join("|"),
        shop: p.shop.join("|"),
        bench: fmtPokemon(p.bench),
        board: fmtPokemon(p.board),
        historyLast: lastHist ? `${lastHist.name}:${lastHist.result}` : "",
        historyLen: p.history.length
      })
    }
  }

  for (let i = 0; i < parsed.frames.length; i++) {
    const f = parsed.frames[i]
    try {
      if (f.kind === "message") {
        messagesProcessed++
        msgTypeCounts.set(f.type as string | number, (msgTypeCounts.get(f.type as string | number) ?? 0) + 1)
        if (f.payload instanceof Uint8Array) {
          messageErrors.push({ index: i, t: f.t, type: f.type!, note: "payload bytes (no decodificado a estructura)" })
        } else if (typeof f.type === "string" && ["POKEMON_DAMAGE", "POKEMON_HEAL", "ABILITY"].includes(f.type)) {
          const state = ser.getState()
          const row = resolveCombat(
            state, f.t, state?.stageLevel ?? 0,
            PHASE_NAMES[state?.phase] ?? String(state?.phase), f.type, f.payload
          )
          if (row) {
            combat.push(row)
            if (row.unresolved) combatUnresolved++
          } else {
            messageErrors.push({ index: i, t: f.t, type: f.type, note: "payload de combate no interpretable" })
          }
        }
        continue
      }
      const bytes = f.bytes ?? new Uint8Array(0)
      const it = { offset: f.offset ?? 1 }
      if (f.kind === "handshake") {
        ser.handshake(bytes, it)
        fixLegacyCollectionMetadata(ser)
      } else if (f.kind === "state") {
        ser.setState(bytes, it)
      } else {
        ser.patch(bytes, it)
      }
      framesApplied++
      const state = ser.getState()
      if (granularity === "frame") {
        processStateSnapshot(f.t, state, true)
      }
      const stage = state?.stageLevel ?? 0
      const phase = state?.phase ?? 0
      if (stage !== lastStage || phase !== lastPhase) {
        if (granularity === "phase") processStateSnapshot(f.t, state, true)
        emitRoundRow(f.t, state)
        lastStage = stage
        lastPhase = phase
      }
      lastT = f.t
    } catch (e) {
      badFrames.push({ index: i, t: f.t, kind: f.kind, error: (e as Error).message })
    }
  }

  try {
    const state = ser.getState()
    if (state) {
      const stage = state.stageLevel ?? 0
      const phase = state.phase ?? 0
      if (stage !== lastStage || phase !== lastPhase) {
        if (granularity === "phase") processStateSnapshot(lastT, state, true)
        emitRoundRow(lastT, state)
      }
    }
  } catch (e) {
    badFrames.push({ index: -1, t: lastT, kind: "final", error: (e as Error).message })
  }

  // resumen de daño por pelea y atacante (cuota del daño total de la sim)
  const dmgBySimAtk = new Map<string, { simId: string; blue: string; red: string; attacker: string; attackerSide: string; damage: number }>()
  const dmgBySim = new Map<string, number>()
  for (const c of combat) {
    if (c.kind !== "damage") continue
    const key = `${c.simId}|${c.attacker}|${c.attackerSide}`
    const e = dmgBySimAtk.get(key) ?? { simId: c.simId, blue: c.blue, red: c.red, attacker: c.attacker, attackerSide: c.attackerSide, damage: 0 }
    e.damage += c.amount
    dmgBySimAtk.set(key, e)
    dmgBySim.set(c.simId, (dmgBySim.get(c.simId) ?? 0) + c.amount)
  }
  const combatSummary = [...dmgBySimAtk.values()].map((e) => ({
    ...e,
    simTotal: dmgBySim.get(e.simId) ?? 0,
    sharePct: dmgBySim.get(e.simId) ? Math.round((e.damage / (dmgBySim.get(e.simId) ?? 1)) * 1000) / 10 : 0
  }))

  mkdirSync(outDir, { recursive: true })
  const jsonl = (rows: any[]) => rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "")
  writeFileSync(join(outDir, "rounds.jsonl"), jsonl(rounds))
  writeFileSync(join(outDir, "events.jsonl"), jsonl(events))
  writeFileSync(join(outDir, "combat.jsonl"), jsonl(combat))
  writeFileSync(join(outDir, "combat_summary.jsonl"), jsonl(combatSummary))
  const csv = (rows: Record<string, unknown>[]) => {
    if (!rows.length) return ""
    const keys = Object.keys(rows[0])
    const esc = (v: unknown) => {
      const s = v === undefined || v === null ? "" : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    return keys.join(",") + "\n" + rows.map((r) => keys.map((k) => esc(r[k])).join(",")).join("\n") + "\n"
  }
  writeFileSync(join(outDir, "rounds.csv"), csv(rounds))
  writeFileSync(join(outDir, "events.csv"), csv(events))
  writeFileSync(join(outDir, "combat.csv"), csv(combat))
  writeFileSync(join(outDir, "combat_summary.csv"), csv(combatSummary))
  const summary = {
    file,
    game: header.game,
    room: header.room,
    viewerUid: header.viewerUid,
    recordedAt: header.recordedAt,
    granularity,
    framesTotal: parsed.frames.length,
    framesApplied,
    messagesProcessed,
    messageTypes: Object.fromEntries(msgTypeCounts),
    badFrames,
    messageErrors,
    roundsRows: rounds.length,
    events: events.length,
    combatEvents: combat.length,
    combatUnresolved,
    trailer: parsed.trailerSummary
  }
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2))

  console.log(`\nFrames: ${parsed.frames.length} totales, ${framesApplied} aplicados, ${badFrames.length} con error`)
  console.log(`Mensajes: ${messagesProcessed} procesados; tipos:`, Object.fromEntries(msgTypeCounts))
  console.log(`Filas ronda/jugador: ${rounds.length} | eventos: ${events.length} | combate: ${combat.length} (${combatUnresolved} sin resolver)`)
  if (badFrames.length) {
    console.log(`\nFrames no decodificables (primeros 10):`)
    for (const b of badFrames.slice(0, 10)) console.log(`  #${b.index} t=${b.t}ms kind=${b.kind}: ${b.error}`)
  }
  if (messageErrors.length) {
    console.log(`Mensajes con payload no estructurado: ${messageErrors.length}`)
  }
  console.log(`Salida en ${outDir}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
