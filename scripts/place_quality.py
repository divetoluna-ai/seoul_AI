"""Shared catalog eligibility rules used by source imports and the Java API."""
import html
import json
import re
import unicodedata
from pathlib import Path

RULES_PATH = Path(__file__).resolve().parents[1] / 'backend/src/main/resources/data/place-quality-rules.json'
RULES = json.loads(RULES_PATH.read_text(encoding='utf-8'))


def display_name(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', html.unescape(str(value or '')))).strip()


def exclusion_reason(name, category):
    if category not in RULES['allowedCategories']:
        return 'unrelated_category'
    raw = str(name or '')
    name = display_name(raw)
    if not name or len(name) > 200 or not any(c.isalnum() for c in name):
        return 'invalid_name'
    # Inspect control characters before whitespace normalization can hide them.
    if any(re.search(pattern, raw, re.I) or re.search(pattern, name, re.I) for pattern in RULES['invalidNamePatterns']):
        return 'invalid_name'
    patterns = RULES['blockedNamePatterns'] + RULES['categoryNamePatterns'].get(category, [])
    if any(re.search(pattern, name, re.I) for pattern in patterns):
        return 'unrelated_business'
    if category == 'shopping' and re.search(RULES['humanBeautyNamePattern'], name, re.I) and not re.search(RULES['petCareNamePattern'], name, re.I):
        return 'unrelated_business'
    return ''
