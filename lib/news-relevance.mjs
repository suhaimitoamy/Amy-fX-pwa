export const NEWS_FILTER_VERSION = '2026-07-14.1';

export const MARKET_KEYWORDS = [
  'gold', 'bullion', 'precious metals', 'gold reserve', 'xau', 'xauusd',
  'fed', 'federal reserve', 'fomc', 'powell', 'jerome powell',
  'cpi', 'core cpi', 'inflation', 'inflasi', 'ppi', 'pce', 'nfp',
  'nonfarm', 'non farm', 'payroll', 'employment', 'unemployment',
  'jobless', 'jobless claims', 'gdp', 'recession', 'resesi',
  'interest rate', 'suku bunga', 'rate cut', 'rate hike', 'dovish', 'hawkish',
  'yield', 'treasury', 'bond', 'bond yield', '10 year yield', '2 year yield',
  'dollar', 'us dollar', 'usd', 'dxy', 'central bank', 'ecb', 'boe', 'boj',
  'pboc', 'pmi', 'ism', 'retail sales', 'debt ceiling', 'government shutdown',
  'credit downgrade', 'default', 'bank collapse', 'banking crisis',
  'financial crisis', 'market panic', 'risk off', 'safe haven', 'uncertainty',
  'brics', 'dedollarization'
];

export const CONFLICT_KEYWORDS = [
  'war', 'perang', 'conflict', 'konflik', 'military', 'militer', 'battle',
  'invasion', 'invasi', 'attack', 'attacks', 'serangan', 'strike', 'strikes',
  'airstrike', 'missile', 'missiles', 'ballistic missile', 'ballistic missiles',
  'rudal', 'drone', 'drones', 'bombing', 'bombings', 'explosion', 'explosions',
  'ledakan', 'troops', 'army', 'navy', 'nuclear', 'nuklir', 'nuclear threat',
  'ancaman nuklir', 'weapon', 'weapons', 'defense', 'defence', 'hostilities',
  'escalation', 'eskalasi', 'retaliation', 'ceasefire', 'gencatan senjata',
  'truce', 'targeted', 'targeting', 'targets', 'air base', 'military base',
  'american base', 'us base', 'state of emergency', 'security threat',
  'embargo', 'sanctions', 'sanksi', 'tariff', 'trade war', 'border conflict',
  'territorial dispute', 'geopolitical', 'tension', 'ketegangan', 'crisis',
  'krisis'
];

export const DIPLOMACY_KEYWORDS = [
  'peace', 'perdamaian', 'peace talks', 'perundingan damai', 'peace deal',
  'kesepakatan damai', 'peace agreement', 'peace negotiations', 'ceasefire',
  'gencatan senjata', 'truce', 'de escalation', 'deescalation',
  'penurunan ketegangan', 'diplomacy', 'diplomasi', 'diplomatic talks'
];

export const CONTEXTUAL_DIPLOMACY_KEYWORDS = [
  'negotiation', 'negotiations', 'negosiasi', 'mediation', 'mediasi',
  'treaty', 'agreement', 'reconciliation', 'normalization',
  'normalisasi hubungan'
];

export const GEOPOLITICAL_ACTORS = [
  'iran', 'iranian', 'tehran', 'islamic republic', 'irgc',
  'revolutionary guard', 'khamenei', 'iran nuclear', 'iran sanctions',
  'america', 'american', 'united states', 'us', 'usa', 'amerika',
  'amerika serikat', 'washington', 'white house', 'pentagon',
  'us military', 'us government', 'congress', 'senate', 'executive order',
  'trump', 'president trump', 'israel', 'israeli', 'gaza', 'palestine',
  'palestinian', 'jordan', 'jordanian', 'kuwait', 'lebanon', 'syria', 'yemen',
  'russia', 'russian', 'ukraine', 'ukrainian', 'china', 'chinese', 'taiwan',
  'north korea', 'south china sea', 'middle east', 'nato', 'saudi arabia',
  'iraq'
];

export const ENERGY_RISK_KEYWORDS = [
  'oil', 'crude', 'brent', 'wti', 'opec', 'gas', 'energy crisis',
  'oil supply', 'oil prices', 'shipping route', 'red sea', 'hormuz',
  'strait of hormuz'
];

export const HIGH_IMPACT_KEYWORDS = [
  'fomc', 'powell', 'jerome powell', 'cpi', 'core cpi', 'nfp', 'nonfarm',
  'non farm', 'payroll', 'pce', 'ppi', 'interest rate', 'rate cut',
  'rate hike', 'war', 'perang', 'invasion', 'invasi', 'attack', 'attacks',
  'serangan', 'strike', 'strikes', 'airstrike', 'missile', 'missiles',
  'ballistic missile', 'ballistic missiles', 'rudal', 'drone', 'drones',
  'bombing', 'bombings', 'explosion', 'explosions', 'ledakan', 'targeted',
  'targeting', 'targets', 'nuclear', 'nuklir', 'nuclear threat',
  'ancaman nuklir', 'escalation', 'eskalasi', 'retaliation', 'ceasefire',
  'gencatan senjata', 'peace talks', 'perundingan damai', 'peace deal',
  'kesepakatan damai', 'peace agreement', 'sanctions', 'sanksi', 'embargo',
  'tariff', 'trade war', 'recession', 'resesi', 'gdp', 'government shutdown',
  'debt ceiling', 'bank collapse', 'banking crisis', 'financial crisis',
  'default', 'credit downgrade'
];

export const RELEVANCE_KEYWORDS = [...new Set([
  ...MARKET_KEYWORDS,
  ...CONFLICT_KEYWORDS,
  ...DIPLOMACY_KEYWORDS,
  ...GEOPOLITICAL_ACTORS,
  ...ENERGY_RISK_KEYWORDS
])];

export function normalizeNewsText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bu\s*\.\s*s\s*\.\s*a\s*\.?(?=\s|$)/g, ' usa ')
    .replace(/\bu\s*\.\s*s\s*\.?(?=\s|$)/g, ' us ')
    .replace(/xau\s*\/\s*usd/g, ' xauusd ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsNewsTerm(text, term) {
  const haystack = ` ${normalizeNewsText(text)} `;
  const needle = normalizeNewsText(term);
  return Boolean(needle) && haystack.includes(` ${needle} `);
}

export function matchesAnyNewsTerm(text, terms) {
  return terms.some(term => containsNewsTerm(text, term));
}

export function matchedNewsKeywords(text) {
  const directMatches = RELEVANCE_KEYWORDS.filter(term => containsNewsTerm(text, term));
  const contextualMatches = CONTEXTUAL_DIPLOMACY_KEYWORDS.filter(term => containsNewsTerm(text, term));
  const hasContext = matchesAnyNewsTerm(text, GEOPOLITICAL_ACTORS)
    || matchesAnyNewsTerm(text, CONFLICT_KEYWORDS);
  return [...new Set([
    ...directMatches,
    ...(hasContext ? contextualMatches : [])
  ])];
}

export function isRelevantNews(text) {
  if (matchesAnyNewsTerm(text, RELEVANCE_KEYWORDS)) return true;
  return matchesAnyNewsTerm(text, CONTEXTUAL_DIPLOMACY_KEYWORDS)
    && (matchesAnyNewsTerm(text, GEOPOLITICAL_ACTORS)
      || matchesAnyNewsTerm(text, CONFLICT_KEYWORDS));
}

export function getNewsImpact(text) {
  if (matchesAnyNewsTerm(text, HIGH_IMPACT_KEYWORDS)) return 'high';
  const diplomacyWithActor = matchesAnyNewsTerm(text, DIPLOMACY_KEYWORDS)
    && matchesAnyNewsTerm(text, GEOPOLITICAL_ACTORS);
  return diplomacyWithActor ? 'high' : 'medium';
}
