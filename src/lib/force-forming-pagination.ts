export const FORCE_FORMING_PAGE_SIZE = 20;

export function forceFormingPageRange(page: number): [number, number] {
  const start = Math.max(0, Math.floor(page) - 1) * FORCE_FORMING_PAGE_SIZE;
  return [start, start + FORCE_FORMING_PAGE_SIZE - 1];
}