# pokemon-replay-decoder

Decodificador independiente de replays `.colreplay` (formato `CLRP`) de
Pokémon Auto Chess. Proyecto autónomo: no depende del repositorio del juego,
solo de `@colyseus/sdk` / `@colyseus/schema` / `@colyseus/msgpackr` fijados a
las versiones del juego (`@colyseus/schema@5.0.32`, `@colyseus/sdk@0.18.2`).

## Uso

```bash
npm install
npm run decode -- /ruta/al/replay.colreplay --out ./salida
# eventos solo por cambio de fase (como la v0.1):
npm run decode -- /ruta/al/replay.colreplay --out ./salida --granularity phase
```

## Modo lote (un solo comando)

Pon todos los `.colreplay` en `./input/` y corre:

```bash
npm run decode:all
# equivale a: npx tsx src/decode-all.ts --in ./input --out ./decoded
```

Procesa cada archivo a `./decoded/<nombre-del-replay>/` y al final informa
cuántos se procesaron y cuáles fallaron (un archivo malo no detiene el resto).

## Salida

- `rounds.jsonl` / `rounds.csv` — una fila por jugador en cada cambio de
  `stageLevel` o `phase`: oro, vida, nivel, XP, racha, interés, rival, tienda,
  banca y tablero (nombre, estrellas, posición, objetos), objetos, sinergias y
  último resultado de pelea.
- `events.jsonl` / `events.csv` — acciones con marca de tiempo exacta del
  frame (`--granularity frame`, por defecto): `fight_result`, `money`, `life`,
  `streak`, `level_up`, `xp_change`, `reroll`, `shop_remove`, `buy`, `sell`,
  `bench_gain/lose`, `board_gain/lose`, `item_gain/lose`, `synergy_change`.
  Con `--granularity phase` solo se comparan fotos de fase.
- `combat.jsonl` / `combat.csv` — cada evento `POKEMON_DAMAGE`, `POKEMON_HEAL`
  y `ABILITY` con `t` exacto, atacante y víctima resueltos por tile dentro de
  la simulación (`blue` vs `red`), cantidad y skill. Las filas que no se
  pudieron resolver llevan la columna `unresolved` (y se cuentan, no se
  ocultan).
- `combat_summary.jsonl` / `combat_summary.csv` — daño total por atacante y
  pelea, con `sharePct` (cuota del daño total de esa simulación).
- `story.md` — narrativa ronda a ronda del POV: situación, acciones con causa
  y timestamp exacto, resumen de tu pelea con daño a favor/en contra, tabla
  comparativa de los 8 jugadores, consejo de objetos (qué podías haber
  combinado según las recetas del juego) y tabla de daño por objeto.
- `summary.json` — metadatos, conteos, frames y mensajes no decodificables.

## Cómo funciona

1. Parsea el contenedor `CLRP` v1 (cabecera JSON + frames + footer `CLTR`
   opcional).
2. Alimenta `handshake` / `setState` / `patch` a `SchemaSerializer` en orden.
   El esquema se reconstruye desde la reflexión incluida en el archivo.
3. Corrige los metadatos legados `array:string` / `set:string` de la
   reflexión para que los entienda `@colyseus/schema@5.0.32`.
4. Resuelve combate cruzando cada mensaje con el estado en ese instante:
   la víctima por su tile `(simId, x, y)` y el atacante por su sprite
   `index` dentro de la simulación.

## Robustez

- Cabecera o versión desconocida → error claro.
- Todo frame o mensaje no decodificable se lista en `summary.json` y por
  consola; nada se ignora en silencio.
