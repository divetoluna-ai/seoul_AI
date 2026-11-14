import rules from './place-quality-rules.json' with { type: 'json' };

const invalid = rules.invalidNamePatterns.map(p => new RegExp(p, 'iu'));
const blocked = rules.blockedNamePatterns.map(p => new RegExp(p, 'iu'));
const byCategory = Object.fromEntries(Object.entries(rules.categoryNamePatterns).map(([key, patterns]) => [key, patterns.map(p => new RegExp(p, 'iu'))]));
const petCare = new RegExp(rules.petCareNamePattern, 'iu');
const humanBeauty = new RegExp(rules.humanBeautyNamePattern, 'iu');

// Apply the same published catalog rules to old browser favorites and saved itinerary stops.
export function isAllowedPlace(place: { name?: string; category?: string }) {
  if (typeof place.name !== 'string' || !rules.allowedCategories.includes(place.category || '')) return false;
  const name = place.name.normalize('NFKC').trim();
  return !!name && name.length <= 200 && /[\p{L}\p{N}]/u.test(name) &&
    !invalid.some(p => p.test(name)) && !blocked.some(p => p.test(name)) &&
    !(byCategory[place.category || ''] || []).some(p => p.test(name)) &&
    !(place.category === 'shopping' && humanBeauty.test(name) && !petCare.test(name));
}
