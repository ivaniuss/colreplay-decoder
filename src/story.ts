// Análisis narrativo ronda a ronda: qué pasó, por qué, y consejo de objetos.
// Recetas copiadas de app/types/enum/Item.ts (ItemRecipe) del juego, solo lectura.

export interface StoryInput {
  viewerUid: string
  rounds: Record<string, any>[]
  events: Record<string, any>[]
  combat: Record<string, any>[]
  combatSummary: Record<string, any>[]
}

// [producto, componenteA, componenteB][]
const RECIPES: [string, string, string][] = [
  ["OLD_AMBER", "FOSSIL_STONE", "FOSSIL_STONE"],
  ["DAWN_STONE", "FOSSIL_STONE", "TWISTED_SPOON"],
  ["WATER_STONE", "FOSSIL_STONE", "MYSTIC_WATER"],
  ["THUNDER_STONE", "FOSSIL_STONE", "MAGNET"],
  ["FIRE_STONE", "FOSSIL_STONE", "CHARCOAL"],
  ["MOON_STONE", "FOSSIL_STONE", "HEART_SCALE"],
  ["DUSK_STONE", "FOSSIL_STONE", "BLACK_GLASSES"],
  ["LEAF_STONE", "FOSSIL_STONE", "MIRACLE_SEED"],
  ["ICE_STONE", "FOSSIL_STONE", "NEVER_MELT_ICE"],
  ["CHOICE_SPECS", "TWISTED_SPOON", "TWISTED_SPOON"],
  ["SOUL_DEW", "TWISTED_SPOON", "MYSTIC_WATER"],
  ["UPGRADE", "TWISTED_SPOON", "MAGNET"],
  ["REAPER_CLOTH", "TWISTED_SPOON", "BLACK_GLASSES"],
  ["ABILITY_SHIELD", "TWISTED_SPOON", "MIRACLE_SEED"],
  ["POWER_LENS", "TWISTED_SPOON", "NEVER_MELT_ICE"],
  ["POKEMONOMICON", "TWISTED_SPOON", "CHARCOAL"],
  ["HEAVY_DUTY_BOOTS", "TWISTED_SPOON", "HEART_SCALE"],
  ["AQUA_EGG", "MYSTIC_WATER", "MYSTIC_WATER"],
  ["BLUE_ORB", "MYSTIC_WATER", "MAGNET"],
  ["SCOPE_LENS", "MYSTIC_WATER", "BLACK_GLASSES"],
  ["STAR_DUST", "MYSTIC_WATER", "NEVER_MELT_ICE"],
  ["GREEN_ORB", "MYSTIC_WATER", "MIRACLE_SEED"],
  ["DEEP_SEA_TOOTH", "MYSTIC_WATER", "CHARCOAL"],
  ["SHINY_CHARM", "MYSTIC_WATER", "HEART_SCALE"],
  ["XRAY_VISION", "MAGNET", "MAGNET"],
  ["RAZOR_FANG", "MAGNET", "BLACK_GLASSES"],
  ["GRACIDEA_FLOWER", "MAGNET", "MIRACLE_SEED"],
  ["LOADED_DICE", "MAGNET", "NEVER_MELT_ICE"],
  ["PUNCHING_GLOVE", "MAGNET", "CHARCOAL"],
  ["MUSCLE_BAND", "MAGNET", "HEART_SCALE"],
  ["WONDER_BOX", "BLACK_GLASSES", "BLACK_GLASSES"],
  ["SMOKE_BALL", "BLACK_GLASSES", "MIRACLE_SEED"],
  ["WIDE_LENS", "BLACK_GLASSES", "NEVER_MELT_ICE"],
  ["RAZOR_CLAW", "BLACK_GLASSES", "CHARCOAL"],
  ["SAFETY_GOGGLES", "BLACK_GLASSES", "HEART_SCALE"],
  ["KINGS_ROCK", "MIRACLE_SEED", "MIRACLE_SEED"],
  ["STICKY_BARB", "MIRACLE_SEED", "HEART_SCALE"],
  ["PROTECTIVE_PADS", "MIRACLE_SEED", "CHARCOAL"],
  ["MAX_REVIVE", "MIRACLE_SEED", "NEVER_MELT_ICE"],
  ["ASSAULT_VEST", "NEVER_MELT_ICE", "NEVER_MELT_ICE"],
  ["SHELL_BELL", "NEVER_MELT_ICE", "CHARCOAL"],
  ["POKE_DOLL", "NEVER_MELT_ICE", "HEART_SCALE"],
  ["RED_ORB", "CHARCOAL", "CHARCOAL"],
  ["FLAME_ORB", "CHARCOAL", "HEART_SCALE"],
  ["ROCKY_HELMET", "HEART_SCALE", "HEART_SCALE"],
  ["FRIEND_BOW", "SILK_SCARF", "FOSSIL_STONE"],
  ["BLACK_BELT", "SILK_SCARF", "BLACK_GLASSES"],
  ["MACH_RIBBON", "SILK_SCARF", "MAGNET"],
  ["EXPLOSIVE_BAND", "SILK_SCARF", "CHARCOAL"],
  ["TWIST_BAND", "SILK_SCARF", "NEVER_MELT_ICE"],
  ["LUCKY_RIBBON", "SILK_SCARF", "TWISTED_SPOON"],
  ["BIG_EATER_BELT", "SILK_SCARF", "MIRACLE_SEED"],
  ["COVER_BAND", "SILK_SCARF", "HEART_SCALE"],
  ["EFFICIENT_BANDANNA", "SILK_SCARF", "MYSTIC_WATER"],
  ["NULLIFY_BANDANNA", "SILK_SCARF", "SILK_SCARF"]
]

const COMPONENTS = new Set<string>()
for (const [, a, b] of RECIPES) {
  COMPONENTS.add(a)
  COMPONENTS.add(b)
}

function count(list: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1)
  return m
}

// qué se podía craftear con el inventario (componentes sueltos, no equipados)
export function missedCrafts(inventory: string[]): string[] {
  const have = count(inventory.filter((i) => COMPONENTS.has(i)))
  const out: string[] = []
  for (const [product, a, b] of RECIPES) {
    const needB = a === b ? 2 : 1
    if ((have.get(a) ?? 0) >= (a === b ? 2 : 1) && (have.get(b) ?? 0) >= needB) {
      out.push(`${product} (con ${a}+${b})`)
    }
  }
  // componentes duplicados sin combinar
  for (const [item, n] of have) {
    if (n >= 2 && !out.some((o) => o.includes(item))) out.push(`2× ${item} sin combinar`)
  }
  return out
}

interface StageGroup {
  stage: number
  rows: Record<string, any>[]
  events: Record<string, any>[]
  fights: Record<string, any>[]
}

export function buildStory(input: StoryInput): string {
  const { viewerUid, rounds, events, combat, combatSummary } = input
  const stages = [...new Set(rounds.map((r) => Number(r.stageLevel)))].sort((a, b) => a - b)
  const povName = rounds.find((r) => r.uid === viewerUid)?.name ?? "POV"
  const byStage = new Map<number, StageGroup>()
  for (const s of stages) byStage.set(s, { stage: s, rows: [], events: [], fights: [] })
  for (const r of rounds) byStage.get(Number(r.stageLevel))?.rows.push(r)
  for (const e of events) {
    const g = byStage.get(Number(e.stage))
    if (g) g.events.push(e)
  }
  const fightsBySim = new Map<string, Record<string, any>[]>()
  for (const c of combat) {
    if (!fightsBySim.has(c.simId)) fightsBySim.set(c.simId, [])
    fightsBySim.get(c.simId)!.push(c)
  }

  const L: string[] = []
  L.push(`# Partida ronda a ronda (POV: ${povName})`)
  L.push("")
  L.push("Cada ronda: tu situación, qué hiciste y por qué (eventos con causa),")
  L.push("qué pasó en tu pelea, cómo van los demás y consejo de objetos.")
  L.push("")

  for (const s of stages) {
    const g = byStage.get(s)!
    const povRows = g.rows.filter((r) => r.uid === viewerUid)
    const pov = povRows[povRows.length - 1]
    L.push(`## Stage ${s}`)
    L.push("")
    if (pov) {
      L.push(
        `**Tú:** vida ${pov.life}, oro ${pov.money}, nivel ${pov.level} ` +
        `(xp ${pov.experience}/${pov.expNeeded}), racha ${pov.streak}, interés ${pov.interest}, ` +
        `rival: ${pov.opponentName || "—"}.`
      )
      L.push(`Tablero: ${pov.board || "—"}`)
      L.push(`Banca: ${pov.bench || "—"}`)
      L.push(`Objetos: ${pov.items || "—"}`)
      L.push("")
    }
    // acciones del POV agrupadas por instante (causa -> efecto)
    const povEvents = g.events.filter((e) => e.uid === viewerUid)
    const byT = new Map<number, Record<string, any>[]>()
    for (const e of povEvents) {
      if (!byT.has(e.t)) byT.set(e.t, [])
      byT.get(e.t)!.push(e)
    }
    if (byT.size) {
      L.push("**Qué hiciste y por qué:**")
      for (const t of [...byT.keys()].sort((a, b) => a - b)) {
        const es = byT.get(t)!
        const money = es.find((e) => e.type === "money")
        const rest = es.filter((e) => e.type !== "money").map((e) => `${e.type}: ${e.detail}`)
        L.push(`- t=${t}ms [${es[0].phase}] ${rest.join(" | ")}${money ? ` (oro ${money.detail})` : ""}`)
      }
      L.push("")
    }
    // tu pelea: resultado + daño
    const povSims = [...fightsBySim.entries()].filter(([, rows]) =>
      rows.some((r) => r.blue === povName || r.red === povName) && rows[0]?.stage === s
    )
    for (const [simId, rows] of povSims) {
      const first = rows[0]
      let foe = first.blue === povName ? first.red : first.blue
      if (!foe || foe === "pve") foe = String(pov?.opponentName || "PvE")
      const summary = combatSummary.filter((c) => c.simId === simId)
        .sort((a, b) => b.damage - a.damage).slice(0, 3)
      const side = first.blue === povName ? "blue" : "red"
      const dealt = summary.filter((c) => c.attackerSide === side).reduce((a, c) => a + c.damage, 0)
      const taken = summary.filter((c) => c.attackerSide !== side).reduce((a, c) => a + c.damage, 0)
      L.push(`**Tu pelea vs ${foe}:** daño ${dealt} a favor / ${taken} en contra.`)
      for (const c of summary) L.push(`- ${c.attacker} (${c.attackerSide}): ${c.damage} (${c.sharePct}%)`)
      L.push("")
    }
    const fr = povEvents.find((e) => e.type === "fight_result")
    if (fr) L.push(`Resultado registrado: ${fr.detail}`)
    // consejo de objetos con el último snapshot del stage
    if (pov) {
      const inv = String(pov.items).split("|").filter(Boolean)
      const tips = missedCrafts(inv)
      if (tips.length) {
        L.push("")
        L.push("**Objetos: podías haber combinado:**")
        for (const t of tips) L.push(`- ${t}`)
      }
    }
    // cómo van los demás (tabla compacta)
    L.push("")
    L.push("**Todos:**")
    L.push("| jugador | vida | oro | nivel | racha | tablero | resultado |")
    L.push("|---|---|---|---|---|---|---|")
    const seen = new Map<string, Record<string, any>>()
    for (const r of g.rows) seen.set(r.uid, r)
    const ordered = [...seen.values()].sort((a, b) => b.life - a.life)
    for (const r of ordered) {
      const nBoard = r.board ? String(r.board).split(";").filter(Boolean).length : 0
      L.push(`| ${r.uid === viewerUid ? `**${r.name}**` : r.name} | ${r.life} | ${r.money} | ${r.level} | ${r.streak} | ${nBoard} | ${r.historyLast || "—"} |`)
    }
    L.push("")
  }

  // daño por objeto: cruza el daño de cada atacante con los objetos que llevaba
  // equipados en el tablero de su dueño en ese stage (aproximado: si la unidad
  // ya no está en el tablero de la foto, su daño queda como no atribuido)
  const boardItems = new Map<string, Map<string, string[]>>() // stage|name -> unit -> items
  for (const r of rounds) {
    const key = `${r.stageLevel}|${r.name}`
    if (!boardItems.has(key)) boardItems.set(key, new Map())
    const m = boardItems.get(key)!
    for (const entry of String(r.board || "").split(";").map((s) => s.trim()).filter(Boolean)) {
      const mm = entry.match(/^(.*) ★\d+(?:\(([^)]*)\))? @-?\d+,-?\d+$/)
      if (mm) m.set(mm[1], mm[2] ? mm[2].split("+") : [])
    }
  }
  const simStage = new Map<string, number>()
  const simOwner = new Map<string, { name: string; side: string }>()
  for (const [simId, rows] of fightsBySim) {
    simStage.set(simId, Number(rows[0]?.stage))
    simOwner.set(simId + "|blue", { name: String(rows[0]?.blue ?? ""), side: "blue" })
    simOwner.set(simId + "|red", { name: String(rows[0]?.red ?? ""), side: "red" })
  }
  const dmgByItem = new Map<string, number>()
  let notFound = 0
  for (const c of combatSummary) {
    const stage = simStage.get(c.simId)
    const owner = simOwner.get(c.simId + "|" + c.attackerSide)?.name ?? ""
    const units = boardItems.get(`${stage}|${owner}`)
    if (units === undefined) {
      // bando sin tablero de jugador (rival PvE): baseline, no es un fallo
      dmgByItem.set("(rival PvE)", (dmgByItem.get("(rival PvE)") ?? 0) + c.damage)
      continue
    }
    if (!units.has(c.attacker)) {
      notFound += c.damage
      continue
    }
    const items = units.get(c.attacker)!
    if (!items.length) {
      dmgByItem.set("(sin objeto)", (dmgByItem.get("(sin objeto)") ?? 0) + c.damage)
      continue
    }
    const share = c.damage / items.length
    for (const it of items) dmgByItem.set(it, (dmgByItem.get(it) ?? 0) + share)
  }
  L.push("## Daño por objeto (toda la partida)")
  L.push("")
  L.push("Aproximado: reparte el daño de cada unidad entre los objetos que llevaba")
  L.push("en la foto de su stage. No encontrado (unidad vendida/evolucionada): " + notFound + ".")
  L.push("")
  L.push("| objeto | daño atribuido |")
  L.push("|---|---|")
  for (const [it, dmg] of [...dmgByItem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    L.push(`| ${it} | ${Math.round(dmg)} |`)
  }
  L.push("")
  return L.join("\n")
}
