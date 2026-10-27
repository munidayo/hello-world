#!/usr/bin/env python3
"""
takeout_processor.py の単体テスト・結合テスト
"""

import datetime
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image
import piexif

from takeout_processor import TakeoutProcessor, find_json_metadata_file, parse_takeout_json


class TestTakeoutProcessor(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_takeout_")
        self.input_dir = Path(self.test_dir) / "raw_takeout"
        self.output_dir = Path(self.test_dir) / "output"
        self.input_dir.mkdir(parents=True)
        self.output_dir.mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def _create_dummy_image(self, path: Path, color="blue"):
        img = Image.new("RGB", (100, 100), color=color)
        img.save(path, "JPEG")

    def test_json_matching_and_processing(self):
        # 1. 通常のファイル
        img1 = self.input_dir / "IMG_20230501.jpg"
        self._create_dummy_image(img1, color="blue")
        json1 = self.input_dir / "IMG_20230501.jpg.json"
        target_dt = datetime.datetime(2023, 5, 1, 14, 30, 0)
        target_ts = int(target_dt.timestamp())
        with open(json1, "w", encoding="utf-8") as f:
            json.dump({
                "title": "IMG_20230501.jpg",
                "photoTakenTime": {"timestamp": str(target_ts)},
                "geoData": {"latitude": 35.681236, "longitude": 139.767125, "altitude": 10.0}
            }, f)

        # 2. 重複命名形式 IMG_20230601(1).jpg と IMG_20230601.jpg(1).json
        img2 = self.input_dir / "IMG_20230601(1).jpg"
        self._create_dummy_image(img2, color="red")
        json2 = self.input_dir / "IMG_20230601.jpg(1).json"
        dt2 = datetime.datetime(2023, 6, 1, 10, 0, 0)
        with open(json2, "w", encoding="utf-8") as f:
            json.dump({
                "title": "IMG_20230601.jpg",
                "photoTakenTime": {"timestamp": str(int(dt2.timestamp()))}
            }, f)

        # プロセッサーの実行
        processor = TakeoutProcessor(
            input_path=self.input_dir,
            output_dir=self.output_dir,
            action="copy",
            folder_format="year_month",
            fix_exif=True,
            dedup=True,
            dry_run=False
        )
        processor.process()

        # 検証1: 出力先ディレクトリ構造の確認
        out_file1 = self.output_dir / "2023" / "2023-05" / "IMG_20230501.jpg"
        self.assertTrue(out_file1.exists(), f"File should exist at {out_file1}")

        # 検証2: EXIF 日時とGPSの確認
        exif_dict = piexif.load(str(out_file1))
        date_orig = exif_dict["Exif"].get(piexif.ExifIFD.DateTimeOriginal)
        self.assertEqual(date_orig.decode("utf-8"), "2023:05:01 14:30:00")
        self.assertIn(piexif.GPSIFD.GPSLatitude, exif_dict["GPS"])

        # 検証3: ファイルのタイムスタンプ確認
        stat1 = out_file1.stat()
        self.assertAlmostEqual(stat1.st_mtime, target_ts, delta=5)

        # 検証4: 重複形式のファイル
        out_file2 = self.output_dir / "2023" / "2023-06" / "IMG_20230601(1).jpg"
        self.assertTrue(out_file2.exists(), f"File should exist at {out_file2}")

    def test_zip_and_deduplication(self):
        # ZIPアーカイブ経由の処理と同一ファイル重複排除のテスト
        zip_input_dir = Path(self.test_dir) / "zip_src"
        zip_input_dir.mkdir()

        img_orig = zip_input_dir / "photo.jpg"
        self._create_dummy_image(img_orig, color="green")
        json_orig = zip_input_dir / "photo.jpg.json"
        with open(json_orig, "w", encoding="utf-8") as f:
            json.dump({
                "title": "photo.jpg",
                "creationTime": {"timestamp": "1672531199"}
            }, f)

        # 重複ファイル（中身は同一）
        img_dup = zip_input_dir / "photo_copy.jpg"
        self._create_dummy_image(img_dup, color="green")

        zip_path = Path(self.test_dir) / "test_takeout.zip"
        shutil.make_archive(str(zip_path.with_suffix("")), "zip", zip_input_dir)

        out_zip_dir = Path(self.test_dir) / "output_zip"
        processor = TakeoutProcessor(
            input_path=zip_path,
            output_dir=out_zip_dir,
            action="copy",
            folder_format="year_month",
            fix_exif=True,
            dedup=True,
            dry_run=False
        )
        processor.process()

        self.assertEqual(processor.stats["total_media_found"], 2)
        self.assertEqual(processor.stats["processed"], 1)
        self.assertEqual(processor.stats["duplicates_skipped"], 1)


if __name__ == "__main__":
    unittest.main()
