/** Select one native cell from a compact raster page without resampling it. */
export function moruFrame(frame: number, sheet: { cell: number; columns: number }) {
  return `translate(${-(frame % sheet.columns) * sheet.cell}px, ${-Math.floor(frame / sheet.columns) * sheet.cell}px)`;
}
