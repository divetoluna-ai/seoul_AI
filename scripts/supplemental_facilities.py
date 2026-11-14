"""Merge normalized pet-friendly CSV exports while retaining original catalog identities."""
import csv
import hashlib
import math
import re
from collections import Counter
from registry_facilities import REGIONS, PROVINCES, clean, name_key, address_key, search_address
from place_quality import display_name, exclusion_reason

CATEGORIES = {'공원·산책로': 'attraction', '관광지': 'attraction', '반려견 놀이터': 'attraction',
              '숙박': 'stay', '캠핑장': 'stay', '식당': 'restaurant', '식음료': 'restaurant',
              '카페': 'restaurant', '체험': 'leisure'}
FIELDS = {'name', 'category', 'source_category', 'province', 'district', 'address', 'latitude', 'longitude', 'pet_allowed', 'source'}


def read_csv(path):
    raw = path.read_bytes()
    for encoding in ('utf-8-sig', 'cp949'):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f'{path.name}: unsupported CSV encoding')
    # splitlines preserves quoted multiline fields when fed through StringIO.
    from io import StringIO
    reader = csv.DictReader(StringIO(text, newline=''))
    if not FIELDS.issubset(reader.fieldnames or []):
        raise ValueError(f'{path.name}: required normalized CSV columns are missing')
    return [{key: clean(value) for key, value in row.items() if key is not None} for row in reader], encoding


def category_for(row):
    kind = row['source_category']
    if kind in {'애견스쿨', '애견호텔&유치원', '애견유치원'}:
        return 'care'
    return CATEGORIES.get(row['category'], '')


def coordinate(row):
    x, y = row['longitude'], row['latitude']
    if not x and not y:
        return '', ''
    try:
        x, y = float(x), float(y)
        if not (math.isfinite(x) and math.isfinite(y) and 124 <= x <= 132 and 32 <= y <= 39.5):
            raise ValueError()
        return str(x), str(y)
    except ValueError:
        raise ValueError('Invalid or incomplete source coordinates') from None


def merge_supplemental(facilities, paths, audit):
    index = {}
    for key, record in facilities.items():
        index.setdefault((record['region'], name_key(record['name']), address_key(record['address'])), []).append(key)
    seen_files = {}
    reports, excluded = [], Counter()
    for path in sorted(paths):
        rows, encoding = read_csv(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        stats = Counter()
        if digest in seen_files:
            stats['duplicate_file'] = len(rows)
            reports.append(dict(source=path.name, sourceSha256=digest, sourceRows=len(rows), encoding=encoding,
                                duplicateOf=seen_files[digest], **dict(stats)))
            excluded['supplemental_duplicate_file'] += len(rows)
            continue
        seen_files[digest] = path.name
        seen_rows = set()
        for number, row in enumerate(rows, 2):
            name, address = display_name(row['name']), row['address']
            category = category_for(row)
            reason = exclusion_reason(row['name'], category)
            if reason:
                stats[reason] += 1
                audit.append(dict(source=path.name, row=number, name=row['name'], category=row['category'], reason=reason))
                continue
            if row['pet_allowed'].lower() not in {'true', 'y', 'yes', '1'}:
                stats['not_pet_friendly'] += 1
                continue
            searchable = search_address(address)
            province = searchable.split(' ')[0]
            region = REGIONS.get(PROVINCES.get(province, province))
            if not name or not address or not region:
                stats['missing_required'] += 1
                continue
            parts = searchable.split(' ')
            district = '세종특별자치시' if region == '36' else parts[1] if len(parts) > 1 else ''
            if region != '36' and not re.fullmatch(r'.+[시군구]', district):
                district = row['district']
            if region != '36' and not re.fullmatch(r'.+[시군구]', district):
                stats['invalid_district'] += 1
                continue
            try:
                longitude, latitude = coordinate(row)
            except ValueError:
                stats['invalid_coordinates'] += 1
                continue
            match_key = (region, name_key(name), address_key(address))
            if match_key in seen_rows:
                stats['duplicates'] += 1
                continue
            seen_rows.add(match_key)
            stamp = row.get('source_date', '')
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', stamp):
                stamp = ''
            provider = dict(file=path.name, provider=row['source'], url=row.get('source_url', ''), date=stamp)
            details = ' · '.join(filter(None, [f'추가 자료 출처: {row["source"]}', f'원문: {row["source_url"]}' if row.get('source_url') else '', f'기준일: {stamp}' if stamp else '',
                f'입장료: {row["fee"]}' if row.get('fee') else '', f'반려동물 추가 요금: {row["pet_fee"]}' if row.get('pet_fee') else '',
                f'위치 안내: {row["location_detail"]}' if row.get('location_detail') else '', f'홈페이지: {row["website"]}' if row.get('website') else '']))
            fields = dict(phone=row.get('phone', ''), hours=row.get('hours', ''), restDay=row.get('closed_days', ''),
                          animals=row.get('pet_size', ''), requirements=row.get('pet_rules', ''),
                          facilities=' · '.join(label for key, label in [('indoor', '실내 이용 가능'), ('outdoor', '실외 이용 가능')]
                                                if row.get(key, '').lower() in {'true', 'y', 'yes', '1'}))
            matches = index.get(match_key, [])
            if len(matches) == 1:
                previous = facilities[matches[0]]
                if not previous.get('latitude') and latitude:
                    previous.update(latitude=latitude, longitude=longitude)
                for key, value in fields.items():
                    if not previous.get(key) and value:
                        previous[key] = value
                previous.setdefault('supplementalSources', []).append(provider)
                previous['other'] = ' · '.join(filter(None, [previous.get('other', ''), details]))
                stats['merged_existing'] += 1
                continue
            identity = region + '|' + name_key(name) + '|' + address_key(address)
            identifier = 'csv-' + hashlib.sha256(identity.encode()).hexdigest()[:20]
            # A conservative source prefix avoids replacing an ambiguous pre-existing key.
            key = 'supplemental|' + identity
            facilities[key] = dict(id=identifier, name=name, category=category, region=region, district=district,
                address=address, latitude=latitude, longitude=longitude, modified=stamp, parking='',
                overview=f'{row["source"]} 제공 반려동물 동반 가능 자료에 등재된 {row["source_category"]}입니다. 동반 조건은 방문 전 시설에 확인해주세요.',
                other=details, sourceCategory=row['source_category'], source='supplemental', supplementalSources=[provider], **fields)
            index.setdefault(match_key, []).append(key)
            stats['added'] += 1
        assert len(rows) == sum(stats.values()), (path.name, len(rows), stats)
        for reason, count in stats.items():
            if reason != 'added':
                excluded['supplemental_' + reason] += count
        reports.append(dict(source=path.name, sourceSha256=digest, sourceRows=len(rows), encoding=encoding, **dict(stats)))
    return reports, excluded
