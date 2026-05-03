export const normalizeIndustrySearchText = (value) => String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）]/g, '')
    .replace(/[-_/]/g, '')
    .replace(/及元件/g, '')
    .replace(/板块/g, '')
    .trim();

export const buildIndustrySearchCandidates = (name) => {
    const raw = String(name || '').trim();
    if (!raw) return [];

    const canonical = raw.replace(/及元件/g, '').replace(/板块/g, '').trim();
    const variants = new Set([
        raw,
        normalizeIndustrySearchText(raw),
        canonical,
        normalizeIndustrySearchText(canonical),
    ]);

    return Array.from(variants).filter(Boolean);
};

export const matchesIndustrySearch = (name, searchTerm) => {
    const normalizedQuery = normalizeIndustrySearchText(searchTerm);
    if (!normalizedQuery) return true;
    return buildIndustrySearchCandidates(name).some(
        (candidate) => normalizeIndustrySearchText(candidate).includes(normalizedQuery)
    );
};

export const syncHeatmapTileFocusState = (node, active) => {
    if (!node) return;
    node.style.filter = active ? 'brightness(1.25)' : 'brightness(1)';
    node.style.zIndex = active ? '10' : '1';
    node.style.transform = active ? 'scale(1.02)' : 'scale(1)';
};
