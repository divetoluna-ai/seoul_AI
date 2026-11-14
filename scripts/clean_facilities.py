"""Build the application's normalized local dataset; never overwrite the supplied CSV."""
from pathlib import Path
import csv
import hashlib
import json
import math
import re
import unicodedata
from collections import Counter
from registry_facilities import merge_registries

ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / 'backend/src/main/resources'
SOURCE = RESOURCES / '한국문화정보원_전국 반려동물 동반 가능 문화시설 위치 데이터_20250324.csv'
REGIONS = {'서울특별시':'11','부산광역시':'26','대구광역시':'27','인천광역시':'28',
           '광주광역시':'29','대전광역시':'30','울산광역시':'31','세종특별자치시':'36',
           '경기도':'41','강원도':'51','강원특별자치도':'51','충청북도':'43','충청남도':'44',
           '전라북도':'52','전북특별자치도':'52','전라남도':'46','경상북도':'47','경상남도':'48','제주특별자치도':'50'}
CATEGORIES = {'카페':'restaurant','식당':'restaurant','여행지':'attraction','미술관':'culture',
              '박물관':'culture','문예회관':'culture','펜션':'stay','호텔':'stay',
              '반려동물용품':'shopping','미용':'care','위탁관리':'care'}
EMPTY = {'정보없음','정보 없음','해당없음','해당 없음','nan','null'}

def clean(value):
    value = unicodedata.normalize('NFKC', value or '').strip()
    return '' if value in EMPTY else re.sub(r'[ \t\u00a0]+', ' ', value)

def normalized(value):
    return re.sub(r'[^\w]', '', clean(value).lower())

def main():
    with SOURCE.open(encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    rejected = Counter()
    facilities = {}
    for raw in rows:
        r = {key: clean(value) for key, value in raw.items()}
        if any(term in r['카테고리2'] + r['카테고리3'] for term in ('의료','약국','병원')) or any(term in r['시설명'] for term in ('약국','병원')):
            rejected['medical'] += 1
            continue
        if r['반려동물 동반 가능정보'] != 'Y':
            rejected['not_pet_friendly'] += 1
            continue
        region = REGIONS.get(r['시도 명칭'])
        address = r['도로명주소'] or r['지번주소']
        category = CATEGORIES.get(r['카테고리3'])
        if not region or not category or not r['시설명'] or not address:
            rejected['missing_required'] += 1
            continue
        try:
            latitude, longitude = float(r['위도']), float(r['경도'])
            if not (math.isfinite(latitude) and math.isfinite(longitude) and 32 <= latitude <= 40 and 124 <= longitude <= 132):
                raise ValueError()
        except ValueError:
            rejected['invalid_coordinates'] += 1
            continue
        district = r['시군구 명칭'] or ('세종특별자치시' if region == '36' else '')
        # Street and lot-number address forms can differ; only exact normalized keys are
        # collapsed here. Cross-source coordinate matching happens in the Java catalog.
        key = region + '|' + normalized(r['시설명']) + '|' + normalized(address)
        identifier = 'csv-' + hashlib.sha256(key.encode()).hexdigest()[:20]
        stamp = r['최종작성일']
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', stamp):
            stamp = ''
        phone = '' if r['전화번호'] in ('없음','-') else r['전화번호']
        facility = dict(id=identifier, name=r['시설명'], category=category, region=region,
                        district=district, address=address, latitude=str(latitude), longitude=str(longitude),
                        phone=phone, modified=stamp, overview=r['기본 정보_장소설명'],
                        hours=r['운영시간'], restDay=r['휴무일'],
                        parking={'Y':'주차 가능','N':'주차 불가'}.get(r['주차 가능여부'], ''),
                        animals=r['입장 가능 동물 크기'], requirements=r['반려동물 제한사항'],
                        facilities=' · '.join(label for key, label in [('장소(실내) 여부','실내 이용 가능'),('장소(실외)여부','실외 이용 가능')] if r[key]=='Y'),
                        other=' · '.join(part for part in [
                            '입장료: '+r['입장(이용료)가격 정보'] if r['입장(이용료)가격 정보'] else '',
                            '반려동물 추가 요금: '+r['애견 동반 추가 요금'] if r['애견 동반 추가 요금'] else ''
                        ] if part), sourceCategory=r['카테고리3'])
        if key in facilities:
            rejected['duplicates'] += 1
            # Prefer the newest row; on ties prefer the more complete record.
            previous = facilities[key]
            if (stamp, sum(bool(v) for v in facility.values())) <= (previous['modified'], sum(bool(v) for v in previous.values())):
                continue
        facilities[key] = facility
    csv_included = len(facilities)
    registry_reports, registry_excluded = merge_registries(facilities, RESOURCES.glob('반려동물_동반가능_업소현황*.xlsx'))
    rejected.update(registry_excluded)
    source_rows = len(rows) + sum(r['sourceRows'] for r in registry_reports)
    output = sorted(facilities.values(), key=lambda r: r['id'])
    report = dict(source=SOURCE.name, sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                  sourceRows=source_rows, csvSourceRows=len(rows), csvIncluded=csv_included,
                  registrySources=registry_reports, excluded=dict(rejected), included=len(output),
                  byCategory=dict(sorted(Counter(r['category'] for r in output).items())),
                  byRegion=dict(sorted(Counter(r['region'] for r in output).items())),
                  rules=['Exclude medical categories and facility names containing hospital/pharmacy',
                         'Include only explicitly pet-friendly Y records',
                         'Normalize whitespace, null markers, province codes and coordinates',
                         'Deduplicate normalized name and address; prefer the newest complete record',
                         'Include user-supplied registry workbooks; merge an unambiguous name and street match',
                         'Keep missing registry coordinates empty; resolve addresses on explicit course selection'])
    dest = RESOURCES / 'data'
    dest.mkdir(exist_ok=True)
    (dest/'facilities.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
    (dest/'facilities-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    assert source_rows == len(output) + sum(rejected.values())
    print(json.dumps(report, ensure_ascii=True))

if __name__ == '__main__':
    main()
