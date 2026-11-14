"""Read user-supplied business registry workbooks without changing the originals."""
import hashlib
import json
import posixpath
import re
import unicodedata
from collections import Counter
from xml.etree import ElementTree as ET
from zipfile import ZipFile
from place_quality import display_name, exclusion_reason

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REGIONS = {
    '서울': '11', '부산': '26', '대구': '27', '인천': '28', '광주': '29',
    '대전': '30', '울산': '31', '세종': '36', '경기': '41', '강원': '51',
    '충북': '43', '충남': '44', '전북': '52', '전남': '46', '경북': '47',
    '경남': '48', '제주': '50',
}
PROVINCES = {
    '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천',
    '광주광역시': '광주', '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종',
    '경기도': '경기', '강원도': '강원', '강원특별자치도': '강원', '충청북도': '충북',
    '충청남도': '충남', '전라북도': '전북', '전북특별자치도': '전북', '전라남도': '전남',
    '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주', '제주도': '제주',
}
TYPES = {'일반음식점', '휴게음식점', '제과점영업'}
GWANGJU_DISTRICTS = {'동구', '서구', '남구', '북구', '광산구'}
JEONNAM_DISTRICTS = {'목포시', '여수시', '순천시', '나주시', '광양시', '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군', '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군'}


def clean(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', str(value or ''))).strip()


def normalized(value):
    return re.sub(r'[^\w]', '', clean(value).lower())


def name_key(value):
    return normalized(re.sub(r'^(?:\(주\)|\(유\)|주식회사|유한회사)\s*', '', clean(value)))


def address_key(address):
    street = search_address(address).split('(')[0].strip()
    first, *rest = street.split(' ')
    return normalized(' '.join([PROVINCES.get(first, first), *rest]))


def search_address(address):
    """Map the workbook's combined prefix to this application's existing regional filters."""
    parts = clean(address).split(' ')
    if parts[0] == '전남광주통합특별시' and len(parts) > 1:
        if parts[1] in GWANGJU_DISTRICTS:
            parts[0] = '광주광역시'
        elif parts[1] in JEONNAM_DISTRICTS:
            parts[0] = '전라남도'
    return ' '.join(parts)


def read_registry(path):
    """Read only cells, including shared/inline strings and sparse rows; never execute formulas."""
    with ZipFile(path) as archive:
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        relations = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheet = next((s for s in workbook.findall('s:sheets/s:sheet', NS) if s.get('name') == '업소현황'), None)
        if sheet is None:
            raise ValueError(f'{path.name}: 업소현황 sheet is required')
        target = relations[sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
        sheet_path = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
        if not sheet_path.startswith('xl/worksheets/'):
            raise ValueError('Unexpected worksheet path')
        root = ET.fromstring(archive.read(sheet_path))
        headers = None
        output = []
        for row in root.findall('s:sheetData/s:row', NS):
            cells = {}
            for cell in row.findall('s:c', NS):
                if cell.find('s:f', NS) is not None:
                    raise ValueError(f'{path.name}: formulas are not supported in source records')
                value = cell.find('s:v', NS)
                inline = cell.find('s:is', NS)
                text = value.text if value is not None else ''.join(inline.itertext()) if inline is not None else ''
                if cell.get('t') == 's':
                    text = strings[int(text)]
                cells[re.sub(r'\d', '', cell.get('r'))] = clean(text)
            if not any(cells.values()):
                continue
            if headers is None:
                headers = cells
                if not {'업소명', '업종', '지역', '업소주소'}.issubset(set(headers.values())):
                    raise ValueError(f'{path.name}: required column headers are missing')
                continue
            output.append({header: cells.get(column, '') for column, header in headers.items()})
        return output


def merge_registries(facilities, paths, audit=None):
    """Preserve existing identities and details; never guess coordinates or business conditions."""
    index = {}
    for key, record in facilities.items():
        index.setdefault((record['region'], name_key(record['name']), address_key(record['address'])), []).append(key)
    reports = []
    excluded = Counter()
    for path in sorted(paths):
        rows = read_registry(path)
        stamp_match = re.search(r'(\d{4})\.(\d{2})\.(\d{2})', path.name)
        stamp = '-'.join(stamp_match.groups()) if stamp_match else ''
        stats = Counter()
        seen = set()
        for number, row in enumerate(rows, 2):
            name, address, source_type = display_name(row['업소명']), row['업소주소'], row['업종']
            if not name or not address or source_type not in TYPES:
                stats['missing_or_unsupported'] += 1
                continue
            reason = exclusion_reason(row['업소명'], 'restaurant')
            if reason:
                stats[reason] += 1
                if audit is not None:
                    audit.append(dict(source=path.name, row=number, name=row['업소명'], category=source_type, reason=reason))
                continue
            searchable_address = search_address(address)
            first = searchable_address.split(' ')[0]
            # The workbook groups 광주 and 전남 together; the address identifies the actual province.
            region = REGIONS.get(PROVINCES.get(first, first))
            if not region:
                stats['unknown_region'] += 1
                continue
            match_key = (region, name_key(name), address_key(address))
            exact_key = (region, name_key(name), normalized(address))
            if exact_key in seen:
                stats['duplicates'] += 1
                continue
            seen.add(exact_key)
            matches = index.get(match_key, [])
            if len(matches) == 1:
                previous = facilities[matches[0]]
                if previous.get('source', 'csv') == 'csv':
                    previous['source'] = 'csv+xlsx'
                    note = f'추가 확인 자료: 반려동물 동반가능 업소현황 ({stamp} 기준). 상세 동반 조건은 기존 문화시설 자료 기준입니다.'
                    previous['other'] = ' · '.join(filter(None, [previous.get('other', ''), note]))
                    stats['merged_existing'] += 1
                else:
                    stats['duplicates'] += 1
                continue
            district = searchable_address.split(' ')[1] if len(searchable_address.split(' ')) > 1 else ''
            if region == '36':
                district = '세종특별자치시'
            elif not re.fullmatch(r'.+[시군구]', district):
                stats['invalid_district'] += 1
                continue
            identity = region + '|' + normalized(name) + '|' + normalized(address)
            identifier = 'csv-' + hashlib.sha256(identity.encode()).hexdigest()[:20]
            facilities[identity] = dict(
                id=identifier, name=name, category='restaurant', region=region, district=district,
                address=address, latitude='', longitude='', phone='', modified=stamp,
                overview=f'반려동물 동반가능 업소현황에 등재된 {source_type}입니다. 동반 가능한 구역과 세부 조건은 방문 전 업소에 확인해주세요.',
                hours='', restDay='', parking='', animals='', requirements='', facilities='', other='',
                sourceCategory=source_type, source='xlsx')
            index.setdefault(match_key, []).append(identity)
            stats['added'] += 1
        assert len(rows) == sum(stats.values()), (path.name, len(rows), stats)
        for key, count in stats.items():
            if key != 'added':
                excluded['registry_' + key] += count
        reports.append(dict(source=path.name, sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                            sourceRows=len(rows), snapshot=stamp, **dict(stats)))
    return reports, excluded
