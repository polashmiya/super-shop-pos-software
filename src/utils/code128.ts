/* ==========================================================================
   Code 128 (set B) barcode → SVG bar widths. Used on receipts (invoice
   number) and product labels. Pure, no dependencies.
   ========================================================================== */

const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Module widths (alternating bar/space, starting with a bar) for the text. */
export function code128Modules(text: string): number[] {
  const values: number[] = [START_B];
  for (const char of text) {
    const code = char.charCodeAt(0);
    values.push(code >= 32 && code <= 127 ? code - 32 : 0);
  }
  let checksum = START_B;
  for (let index = 1; index < values.length; index += 1) checksum += values[index] * index;
  values.push(checksum % 103, STOP);
  return values.flatMap((value) => PATTERNS[value].split('').map(Number));
}

/** Returns an SVG string for the barcode (bars only, text rendered separately). */
export function code128Svg(text: string, height = 42, moduleWidth = 1.4): string {
  const modules = code128Modules(text);
  const quiet = 10;
  let x = quiet;
  let bars = '';
  modules.forEach((width, index) => {
    const w = width * moduleWidth;
    if (index % 2 === 0) bars += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`;
    x += w;
  });
  const total = x + quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total.toFixed(2)} ${height}" width="100%" height="${height}" preserveAspectRatio="none" fill="#000">${bars}</svg>`;
}
