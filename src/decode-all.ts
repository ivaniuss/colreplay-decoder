import { readdirSync } from "node:fs"
import { join, basename } from "node:path"
import { decodeFile } from "./decode.js"

// Procesa todos los .colreplay de una carpeta de entrada, uno por subcarpeta de salida.
// Uso: decode-all.ts [--in DIR] [--out DIR] [--granularity frame|phase]

async function main() {
  const args = process.argv.slice(2)
  let inDir = "./input"
  let outDir = "./decoded"
  let granularity: "frame" | "phase" = "frame"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--in") inDir = args[++i]
    else if (args[i] === "--out") outDir = args[++i]
    else if (args[i] === "--granularity") {
      const g = args[++i]
      if (g !== "frame" && g !== "phase") {
        console.error(`--granularity debe ser "frame" o "phase" (recibido: ${g})`)
        process.exit(1)
      }
      granularity = g
    }
  }

  let entries: string[]
  try {
    entries = readdirSync(inDir).filter((f) => f.endsWith(".colreplay"))
  } catch {
    console.error(`No se pudo leer la carpeta de entrada: ${inDir} (créala y pon ahí los .colreplay)`)
    process.exit(1)
  }
  if (!entries.length) {
    console.error(`No hay archivos .colreplay en ${inDir}`)
    process.exit(1)
  }

  const failed: string[] = []
  for (const entry of entries) {
    const file = join(inDir, entry)
    const out = join(outDir, basename(entry, ".colreplay"))
    console.log(`\n===== ${entry} -> ${out} =====`)
    try {
      await decodeFile(file, out, granularity)
    } catch (e) {
      console.error(`ERROR procesando ${entry}: ${(e as Error).message}`)
      failed.push(entry)
    }
  }

  console.log(`\nListo: ${entries.length - failed.length}/${entries.length} replays procesados en ${outDir}`)
  if (failed.length) {
    console.error(`Fallaron: ${failed.join(", ")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
