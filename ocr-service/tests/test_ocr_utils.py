import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ocr_utils import clamp_int, is_pgs_codec, merge_chunk_segments, pgsrip_language, pgsrip_sup_name, pgsrip_track_flag, plan_chunks


class OcrUtilsTests(unittest.TestCase):
    def test_clamp_int_without_maximum(self):
        self.assertEqual(clamp_int(100000, 30, 10), 100000)
        self.assertEqual(clamp_int(0, 30, 10), 10)
        self.assertEqual(clamp_int("invalid", 30, 10), 30)
        self.assertEqual(clamp_int(1000, 30, 10, maximum=None), 1000)
        self.assertEqual(clamp_int(1000, 30, 10, 100), 100)

    def test_is_pgs_codec(self):
        self.assertTrue(is_pgs_codec("hdmv_pgs_subtitle"))
        self.assertTrue(is_pgs_codec("PGSsub"))
        self.assertFalse(is_pgs_codec("dvd_subtitle"))

    def test_pgsrip_sup_name_includes_language_and_flags(self):
        self.assertEqual(pgsrip_language("chi"), "zh")
        self.assertEqual(pgsrip_sup_name("chi", True), "subtitle.zh.forced.sup")
        self.assertEqual(pgsrip_sup_name("zh-CN", False), "subtitle.zh-CN.sup")
        self.assertEqual(pgsrip_sup_name("und", False, "en"), "subtitle.und.sup")
        self.assertEqual(pgsrip_track_flag(True), "forced")
        self.assertEqual(pgsrip_track_flag(False), "full")

    def test_plan_chunks(self):
        self.assertEqual(plan_chunks(60, 1800), [(0.0, 60.0)])
        self.assertEqual(plan_chunks(8503, 1800), [
            (0.0, 1800.0),
            (1800.0, 1800.0),
            (3600.0, 1800.0),
            (5400.0, 1800.0),
            (7200.0, 1303.0),
        ])

    def test_merge_chunk_segments_dedupes_boundary(self):
        merged = merge_chunk_segments([
            [
                {"id": 1, "start": 10, "end": 12, "text": "Hello", "confidence": 0.8},
                {"id": 2, "start": 1799.5, "end": 1802, "text": "Boundary", "confidence": 0.7},
            ],
            [
                {"id": 1, "start": 1802, "end": 1804, "text": "Boundary", "confidence": 0.9},
                {"id": 2, "start": 1805, "end": 1808, "text": "Next", "confidence": 0.6},
            ],
        ], 1810)
        self.assertEqual(len(merged), 3)
        boundary = next(item for item in merged if item["text"] == "Boundary")
        self.assertEqual(boundary["start"], 1799.5)
        self.assertEqual(boundary["end"], 1804)
        self.assertEqual(boundary["confidence"], 0.9)
        self.assertEqual([item["id"] for item in merged], [1, 2, 3])

    def test_merge_clamps_to_duration(self):
        merged = merge_chunk_segments([[
            {"start": 99, "end": 130, "text": "Last", "confidence": 0.5},
        ]], 120)
        self.assertEqual(merged[0]["end"], 120)


if __name__ == "__main__":
    unittest.main()
