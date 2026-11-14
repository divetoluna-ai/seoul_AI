import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from place_quality import exclusion_reason, display_name
from supplemental_facilities import merge_supplemental, coordinate


class DataImportTests(unittest.TestCase):
    def test_scope_and_name_rules_preserve_real_businesses(self):
        for name in ['가나안경원 명동점', '강남엔비의원', '휴대폰대리점', '네일스튜디오']:
            self.assertEqual('unrelated_business', exclusion_reason(name, 'shopping'))
        for name in ['?커피', '카페 �', '---', '테스트', '1234567890']:
            self.assertEqual('invalid_name', exclusion_reason(name, 'restaurant'))
        for name, category in [('큰엉해안경승지', 'attraction'), ('반계리 은행나무', 'attraction'), ('핑퐁커피 경대병원점', 'restaurant'), ('닷', 'restaurant'), ('1938', 'restaurant'), ('2Cats', 'restaurant'), ('프렌즈 애견미용실', 'shopping')]:
            self.assertEqual('', exclusion_reason(name, category), name)
        self.assertEqual("콩콩'짱짱 댕댕이집", display_name('콩콩&#39;짱짱 댕댕이집'))

    def test_duplicate_files_enrichment_identity_and_missing_dates(self):
        fields = ['name', 'category', 'source_category', 'province', 'district', 'address', 'latitude', 'longitude', 'pet_allowed', 'source']
        base = dict(name='정원 카페', category='카페', source_category='휴게음식점', province='서울특별시', district='종로구', address='서울 종로구 테스트길 11', latitude='37.57', longitude='126.98', pet_allowed='True', source='제공기관')
        rows = [base, {**base, 'name': '새로운 캠핑장', 'category': '캠핑장', 'source_category': '야영장', 'address': '서울 종로구 테스트길 22'},
                {**base, 'name': '?커피'}, {**base, 'name': '스튜디오', 'category': '기타', 'source_category': '사진관'}]
        old = dict(id='csv-old-stable-id', name='정원 카페', region='11', address='서울특별시 종로구 테스트길 11', source='xlsx', latitude='', longitude='', hours='기존 운영시간', other='')
        facilities = {'old': old}; audit = []
        with tempfile.TemporaryDirectory() as folder:
            first, second = Path(folder)/'업소1.csv', Path(folder)/'업소2.csv'
            with first.open('w', encoding='utf-8-sig', newline='') as output:
                writer = csv.DictWriter(output, fieldnames=fields); writer.writeheader(); writer.writerows(rows)
            original = first.read_bytes(); second.write_bytes(original)
            reports, excluded = merge_supplemental(facilities, [first, second], audit)
            self.assertEqual(original, first.read_bytes())
        self.assertEqual(2, len(facilities)); self.assertEqual('csv-old-stable-id', old['id'])
        self.assertEqual('37.57', old['latitude']); self.assertEqual('기존 운영시간', old['hours'])
        added = next(p for key, p in facilities.items() if key != 'old')
        self.assertEqual('stay', added['category']); self.assertEqual('', added['modified'])
        self.assertEqual('supplemental', added['source']); self.assertTrue(added['id'].startswith('csv-'))
        self.assertEqual(4, reports[1]['duplicate_file']); self.assertEqual(2, len(audit))
        self.assertEqual(8, len(facilities)-1 + sum(excluded.values()))

    def test_missing_coordinates_are_not_invented_and_partial_or_invalid_points_are_rejected(self):
        self.assertEqual(('', ''), coordinate({'longitude': '', 'latitude': ''}))
        for point in [{'longitude': '', 'latitude': '37.5'}, {'longitude': 'nan', 'latitude': '37'}, {'longitude': '37', 'latitude': '127'}]:
            with self.assertRaises(ValueError): coordinate(point)

    def test_generated_data_has_unique_ids_and_balanced_row_counts(self):
        root = Path(__file__).resolve().parents[2]/'backend/src/main/resources/data'
        rows = json.loads((root/'facilities.json').read_text(encoding='utf-8'))
        report = json.loads((root/'facilities-report.json').read_text(encoding='utf-8'))
        self.assertEqual(len(rows), len({r['id'] for r in rows}))
        self.assertEqual(report['sourceRows'], len(rows)+sum(report['excluded'].values()))
        self.assertTrue(all(not exclusion_reason(r['name'], r['category']) for r in rows))


if __name__ == '__main__': unittest.main()
