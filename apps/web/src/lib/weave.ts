/** Vertical threads as one SVG path, a subpath per x from `top` to `bottom`, so a woven strip stays a few elements. */
export const verticals = (xs: ReadonlyArray<number>, top: number, bottom: number) =>
  xs.map((x) => `M${x} ${top}V${bottom}`).join('')

/** The warp threads that pass over weft row `row`: every other one, shifting by one each row, as plain weave does. */
export const overs = (xs: ReadonlyArray<number>, row: number) =>
  xs.filter((_, column) => (row + column) % 2 === 0)
