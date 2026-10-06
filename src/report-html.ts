// Reporte HTML autocontenido (SVG inline, sin dependencias): curvas por ronda,
// barras de daño, tablas de posiciones. Se escribe como report.html junto al resto.
export interface ReportInput {
  viewerUid: string
  gameVersion: string
  recordedAt: string
  rounds: Record<string, any>[]
  combatSummary: Record<string, any>[]
}

const COLORS = [
  "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
  "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe"
]

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function lineChart(
  title: string, stages: number[],
  series: { name: string; color: string; values: (number | null)[] }[],
  yLabel: string
): string {
  const W = 720, H = 260, P = 40
  const all = series.flatMap((s) => s.values.filter((v) => v !== null) as number[])
  const max = Math.max(...all, 1)
  const X = (i: number) => P + (i / Math.max(1, stages.length - 1)) * (W - 2 * P)
  const Y = (v: number) => H - P - (v / max) * (H - 2 * P)
  let paths = ""
  for (const s of series) {
    let d = ""
    s.values.forEach((v, i) => {
      if (v === null) return
      d += `${d ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`
    })
    paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"><title>${esc(s.name)}</title></path>`
    s.values.forEach((v, i) => {
      if (v === null) return
      paths += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.5" fill="${s.color}"><title>${esc(s.name)} r${stages[i]}: ${v}</title></circle>`
    })
  }
  const ticks = stages.filter((_, i) => i % Math.ceil(stages.length / 15) === 0)
  const labels = ticks.map((s) => {
    const i = stages.indexOf(s)
    return `<text x="${X(i)}" y="${H - 12}" font-size="10" text-anchor="middle">${s}</text>`
  }).join("")
  const legend = series.map((s, i) =>
    `<span style="color:${s.color}">&#9632;</span> ${esc(s.name)}${i < series.length - 1 ? " &nbsp;" : ""}`
  ).join("")
  return `<h2>${esc(title)}</h2><div>${legend}</div>
<svg width="${W}" height="${H}" style="border:1px solid #ccc">
<text x="8" y="16" font-size="11">${esc(yLabel)} (max ${max})</text>
${paths}${labels}</svg>`
}

function barChart(title: string, rows: { label: string; value: number; color: string }[]): string {
  const W = 720, BH = 22
  const max = Math.max(...rows.map((r) => r.value), 1)
  const bars = rows.map((r) => {
    const w = Math.max(2, (r.value / max) * (W - 220))
    return `<div style="display:flex;align-items:center;margin:2px 0">
<span style="width:200px;text-align:right;padding-right:8px;font-size:12px">${esc(r.label)}</span>
<div style="width:${w.toFixed(0)}px;height:${BH - 6}px;background:${r.color}"></div>
<span style="padding-left:6px;font-size:12px">${r.value}</span></div>`
  }).join("")
  return `<h2>${esc(title)}</h2>${bars}`
}

export function buildReportHtml(input: ReportInput): string {
  const { viewerUid, gameVersion, recordedAt, rounds, combatSummary } = input
  const stages = [...new Set(rounds.map((r) => Number(r.stageLevel)))].sort((a, b) => a - b)
  const players = [...new Map(rounds.map((r) => [r.uid, r.name] as const)).entries()]
  const colorOf = new Map(players.map(([uid], i) => [uid, COLORS[i % COLORS.length]]))
  const lastOf = (uid: string, stage: number) => {
    const rs = rounds.filter((r) => r.uid === uid && Number(r.stageLevel) === stage)
    return rs[rs.length - 1]
  }
  const seriesFor = (field: string) =>
    players.map(([uid, name]) => ({
      name: uid === viewerUid ? `${name} (tú)` : String(name),
      color: colorOf.get(uid)!,
      values: stages.map((s) => {
        const r = lastOf(uid, s)
        return r && r.alive ? Number(r[field]) : null
      })
    }))
  const finalStage = stages[stages.length - 1]
  const standings = players
    .map(([uid, name]) => lastOf(uid, finalStage))
    .filter(Boolean)
    .sort((a, b) => (a.rank || 99) - (b.rank || 99))
  const standRows = standings.map((r) =>
    `<tr><td>${r.rank || "—"}</td><td>${esc(r.uid === viewerUid ? r.name + " (tú)" : r.name)}</td>` +
    `<td>${r.life}</td><td>${r.money}</td><td>${r.level}</td><td>${esc(r.historyLast || "—")}</td></tr>`
  ).join("")
  const top = [...combatSummary].sort((a, b) => b.damage - a.damage).slice(0, 15)
  const dmgRows = top.map((c, i) =>
    `<tr><td>${i + 1}</td><td>${esc(c.attacker)}</td><td>${esc(c.blue)} vs ${esc(c.red)}</td>` +
    `<td>${c.damage}</td><td>${c.sharePct}%</td></tr>`
  ).join("")

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Reporte de partida ${esc(recordedAt)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:780px;margin:0 auto;padding:16px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;font-size:13px}h1{font-size:22px}</style>
</head><body>
<h1>Reporte de partida — juego ${esc(gameVersion)} — ${esc(recordedAt)}</h1>
<p>Rondas ${stages[0]}–${finalStage} · ${players.length} jugadores · ver <a href="story.md">story.md</a> para la narrativa ronda a ronda.</p>
${lineChart("Vida por ronda", stages, seriesFor("life"), "vida")}
${lineChart("Oro por ronda", stages, seriesFor("money"), "oro")}
${lineChart("Nivel por ronda", stages, seriesFor("level"), "nivel")}
<h2>Posiciones finales</h2>
<table><tr><th>#</th><th>jugador</th><th>vida</th><th>oro</th><th>nivel</th><th>último resultado</th></tr>${standRows}</table>
${barChart("Top daño por atacante", top.map((c, i) => ({ label: `${c.attacker} (${c.blue.slice(0, 8)} vs ${c.red.slice(0, 8)})`, value: c.damage, color: COLORS[i % COLORS.length] })))}
<h2>Detalle top daño</h2>
<table><tr><th>#</th><th>atacante</th><th>pelea</th><th>daño</th><th>cuota</th></tr>${dmgRows}</table>
</body></html>`
}
