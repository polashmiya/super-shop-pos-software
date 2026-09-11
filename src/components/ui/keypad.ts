/** Applies a keypad key to a text value (keeps at most `decimals` decimals). */
export function applyKeypadKey(current: string, key: string, decimals = 2, maxLength = 10): string {
  if (key === 'clear') return '';
  if (key === 'back') return current.slice(0, -1);
  if (key === '.') {
    if (decimals === 0 || current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  const next = current === '0' && key !== '00' ? key : `${current}${key}`;
  const [, fraction] = next.split('.');
  if (fraction !== undefined && fraction.length > decimals) return current;
  if (next.replace('.', '').length > maxLength) return current;
  return next.replace(/^0+(?=\d)/, '');
}
