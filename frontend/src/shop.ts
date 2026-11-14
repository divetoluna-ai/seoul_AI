export type Product = { id: string; name: string; priceWon: number; image: string; url: string; soldOut: boolean };
export type Catalog = { source: string; fetchedAt: string; stale: boolean; products: Product[] };
export function requiredPoints(priceWon: number) { return priceWon; }
export function missingPoints(priceWon: number, balance: number) { return Math.max(0, Math.ceil(requiredPoints(priceWon) - balance)); }
export function selectProducts(products: Product[], query: string, affordable: boolean, balance: number | null, sort: string) {
  return products.filter(p => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (!affordable || (balance !== null && !p.soldOut && missingPoints(p.priceWon, balance) === 0)))
    .sort((a,b) => sort === 'low' ? a.priceWon - b.priceWon : sort === 'high' ? b.priceWon - a.priceWon : 0);
}
