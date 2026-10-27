#!/usr/bin/env python3
"""
Google Takeout 写真・動画プロセッサー (takeout_processor.py)

Google Takeout でエクスポートされた写真・動画アーカイブを展開・整理し、
分離された JSON メタデータから撮影日時および GPS 情報を写真本体（EXIF/ファイルタイムスタンプ）に復元します。
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Dict, Optional, Tuple

try:
    import piexif
    from PIL import Image
    PIEXIF_AVAILABLE = True
except ImportError:
    PIEXIF_AVAILABLE = False

# サポートするメディア拡張子（小文字）
IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif",
    ".bmp", ".tiff", ".tif", ".dng", ".cr2", ".nef", ".arw"
}
VIDEO_EXTENSIONS = {
    ".mp4", ".mov", ".m4v", ".avi", ".3gp", ".mkv", ".wmv", ".webm"
}
SUPPORTED_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS


def calculate_sha256(filepath: Path, chunk_size: int = 65536) -> str:
    """ファイルの SHA256 ハッシュを計算します。"""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(chunk_size):
            sha256.update(chunk)
    return sha256.hexdigest()


def find_json_metadata_file(media_path: Path) -> Optional[Path]:
    """
    メディアファイルに対応する Google Takeout の JSON メタデータファイルを探索します。
    Takeout の変則的なファイル命名規則に対応します。
    """
    parent = media_path.parent
    name = media_path.name
    stem = media_path.stem
    suffix = media_path.suffix

    candidates = [
        # パターン1: IMG_1234.jpg.json
        parent / f"{name}.json",
        # パターン2: IMG_1234.json
        parent / f"{stem}.json",
    ]

    # パターン3: IMG_1234(1).jpg -> IMG_1234.jpg(1).json
    match_dup = re.search(r"^(.*?)\((\d+)\)$", stem)
    if match_dup:
        base_stem, dup_num = match_dup.groups()
        candidates.extend([
            parent / f"{base_stem}{suffix}({dup_num}).json",
            parent / f"{base_stem}({dup_num}){suffix}.json",
            parent / f"{base_stem}({dup_num}).json",
        ])

    # パターン4: 編集済み画像 IMG_1234-edited.jpg -> IMG_1234.jpg.json
    if "-edited" in stem:
        orig_stem = stem.replace("-edited", "")
        candidates.extend([
            parent / f"{orig_stem}{suffix}.json",
            parent / f"{orig_stem}.json",
        ])

    for cand in candidates:
        if cand.is_file():
            return cand

    # パターン5: 長いファイル名（Google Takeout が約47-51文字で切り詰めた場合）
    # 例: very_long_file_name_12345678901234567890123.jp.json
    truncated_prefix = name[:46]
    for sibling in parent.glob(f"{truncated_prefix}*.json"):
        if sibling.is_file():
            return sibling

    return None


def parse_takeout_json(json_path: Path) -> Tuple[Optional[datetime.datetime], Optional[float], Optional[float], Optional[float]]:
    """
    JSON ファイルから撮影日時、緯度、経度、高度を抽出します。
    """
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        try:
            with open(json_path, "r", encoding="shift_jis") as f:
                data = json.load(f)
        except Exception:
            return None, None, None, None

    dt = None
    # 撮影日時（photoTakenTime 優先、無ければ creationTime）
    taken_time_info = data.get("photoTakenTime") or data.get("creationTime")
    if taken_time_info and "timestamp" in taken_time_info:
        try:
            ts = int(taken_time_info["timestamp"])
            if ts > 0:
                dt = datetime.datetime.fromtimestamp(ts)
        except (ValueError, TypeError, OSError):
            pass

    # 位置情報
    geo = data.get("geoDataExif") or data.get("geoData") or {}
    lat = geo.get("latitude")
    lon = geo.get("longitude")
    alt = geo.get("altitude")

    # 緯度・経度がともに 0.0 の場合は未設定とみなす
    if lat == 0.0 and lon == 0.0:
        lat = None
        lon = None
        alt = None

    return dt, lat, lon, alt


def deg_to_dms_rational(deg_float: float):
    """度数を EXIF GPS 形式の有理数タプル (degrees, minutes, seconds) に変換します。"""
    deg = int(abs(deg_float))
    min_float = (abs(deg_float) - deg) * 60.0
    minute = int(min_float)
    sec = int(round((min_float - minute) * 60.0 * 10000))
    return ((deg, 1), (minute, 1), (sec, 10000))


def write_exif_metadata(image_path: Path, dt: Optional[datetime.datetime], lat: Optional[float], lon: Optional[float], alt: Optional[float]) -> bool:
    """
    JPEG 画像に撮影日時および GPS EXIF 情報を書き込みます。
    piexif が利用可能な場合のみ動作します。
    """
    if not PIEXIF_AVAILABLE or image_path.suffix.lower() not in [".jpg", ".jpeg"]:
        return False

    try:
        try:
            exif_dict = piexif.load(str(image_path))
        except Exception:
            exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}

        changed = False

        if dt:
            dt_str = dt.strftime("%Y:%m:%d %H:%M:%S")
            exif_dict["0th"][piexif.ImageIFD.DateTime] = dt_str
            exif_dict["Exif"][piexif.ExifIFD.DateTimeOriginal] = dt_str
            exif_dict["Exif"][piexif.ExifIFD.DateTimeDigitized] = dt_str
            changed = True

        if lat is not None and lon is not None:
            lat_ref = "N" if lat >= 0 else "S"
            lon_ref = "E" if lon >= 0 else "W"
            exif_dict["GPS"][piexif.GPSIFD.GPSLatitudeRef] = lat_ref
            exif_dict["GPS"][piexif.GPSIFD.GPSLatitude] = deg_to_dms_rational(lat)
            exif_dict["GPS"][piexif.GPSIFD.GPSLongitudeRef] = lon_ref
            exif_dict["GPS"][piexif.GPSIFD.GPSLongitude] = deg_to_dms_rational(lon)
            if alt is not None:
                exif_dict["GPS"][piexif.GPSIFD.GPSAltitudeRef] = 0 if alt >= 0 else 1
                exif_dict["GPS"][piexif.GPSIFD.GPSAltitude] = (int(abs(alt) * 100), 100)
            changed = True

        if changed:
            exif_bytes = piexif.dump(exif_dict)
            piexif.insert(exif_bytes, str(image_path))
            return True
    except Exception:
        return False
    return False


def set_file_timestamp(file_path: Path, dt: datetime.datetime):
    """OS レベルのファイル更新日時・アクセス日時を変更します。"""
    try:
        ts = dt.timestamp()
        os.utime(file_path, (ts, ts))
    except Exception:
        pass


class TakeoutProcessor:
    def __init__(self, input_path: Path, output_dir: Path, action: str = "copy",
                 folder_format: str = "year_month", fix_exif: bool = True,
                 dedup: bool = True, dry_run: bool = False):
        self.input_path = input_path
        self.output_dir = output_dir
        self.action = action  # "copy" or "move"
        self.folder_format = folder_format  # "year_month", "year", "flat"
        self.fix_exif = fix_exif
        self.dedup = dedup
        self.dry_run = dry_run

        self.stats = {
            "total_media_found": 0,
            "processed": 0,
            "json_matched": 0,
            "exif_updated": 0,
            "timestamp_updated": 0,
            "duplicates_skipped": 0,
            "errors": 0,
        }
        self.seen_hashes: set = set()

    def process(self):
        print(f"=== Google Takeout 写真・動画プロセッサー開始 ===")
        print(f"入力: {self.input_path}")
        print(f"出力先: {self.output_dir}")
        print(f"動作モード: {self.action} (Dry-run: {self.dry_run})")
        print(f"フォルダ分類形式: {self.folder_format}")
        print(f"EXIF復元: {'有効 (piexif)' if self.fix_exif and PIEXIF_AVAILABLE else 'タイムスタンプのみ'}")
        print("-" * 50)

        temp_extract_dir = None
        scan_dir = self.input_path

        # ZIPファイルが直接指定された場合、またはZIP群が含まれる場合
        if self.input_path.is_file() and self.input_path.suffix.lower() == ".zip":
            temp_extract_dir = tempfile.mkdtemp(prefix="takeout_unzip_")
            print(f"ZIPファイルを一時展開中: {self.input_path.name} -> {temp_extract_dir}")
            with zipfile.ZipFile(self.input_path, "r") as zf:
                zf.extractall(temp_extract_dir)
            scan_dir = Path(temp_extract_dir)
        elif self.input_path.is_dir():
            # ディレクトリ内に zip がある場合、それらを一括展開して処理することも可能
            zip_files = list(self.input_path.glob("*.zip"))
            if zip_files:
                temp_extract_dir = tempfile.mkdtemp(prefix="takeout_unzips_")
                print(f"ディレクトリ内に {len(zip_files)} 個のZIPファイルを検出しました。展開中...")
                for zf_path in zip_files:
                    print(f"  展開中: {zf_path.name}")
                    with zipfile.ZipFile(zf_path, "r") as zf:
                        zf.extractall(temp_extract_dir)
                scan_dir = Path(temp_extract_dir)

        try:
            self._scan_and_process_dir(scan_dir)
        finally:
            if temp_extract_dir and os.path.exists(temp_extract_dir):
                shutil.rmtree(temp_extract_dir, ignore_errors=True)

        self._print_summary()

    def _scan_and_process_dir(self, directory: Path):
        for root, _, files in os.walk(directory):
            for file_name in files:
                file_path = Path(root) / file_name
                suffix = file_path.suffix.lower()
                if suffix in SUPPORTED_EXTENSIONS:
                    self.stats["total_media_found"] += 1
                    self._process_single_media(file_path)

    def _process_single_media(self, media_path: Path):
        try:
            # 重複チェック
            if self.dedup:
                file_hash = calculate_sha256(media_path)
                if file_hash in self.seen_hashes:
                    self.stats["duplicates_skipped"] += 1
                    return
                self.seen_hashes.add(file_hash)

            # JSONメタデータの探索
            json_path = find_json_metadata_file(media_path)
            dt, lat, lon, alt = None, None, None, None

            if json_path:
                self.stats["json_matched"] += 1
                dt, lat, lon, alt = parse_takeout_json(json_path)

            # 日時がJSONから取れなかった場合のフォールバック（ファイル自体の更新日時）
            if not dt:
                file_stat = media_path.stat()
                dt = datetime.datetime.fromtimestamp(file_stat.st_mtime)

            # 出力先パスの決定
            dest_dir = self._get_destination_dir(dt)
            dest_file = self._get_unique_dest_path(dest_dir, media_path.name)

            if not self.dry_run:
                dest_dir.mkdir(parents=True, exist_ok=True)
                if self.action == "copy":
                    shutil.copy2(media_path, dest_file)
                else:
                    shutil.move(media_path, dest_file)

                # EXIF更新
                if self.fix_exif and PIEXIF_AVAILABLE and dest_file.suffix.lower() in [".jpg", ".jpeg"]:
                    if write_exif_metadata(dest_file, dt, lat, lon, alt):
                        self.stats["exif_updated"] += 1

                # ファイルタイムスタンプ更新
                if dt:
                    set_file_timestamp(dest_file, dt)
                    self.stats["timestamp_updated"] += 1

            self.stats["processed"] += 1

        except Exception as e:
            self.stats["errors"] += 1
            print(f"エラー発生 [{media_path.name}]: {e}", file=sys.stderr)

    def _get_destination_dir(self, dt: datetime.datetime) -> Path:
        if self.folder_format == "year_month":
            return self.output_dir / str(dt.year) / f"{dt.year}-{dt.month:02d}"
        elif self.folder_format == "year":
            return self.output_dir / str(dt.year)
        else:
            return self.output_dir

    def _get_unique_dest_path(self, dest_dir: Path, filename: str) -> Path:
        target = dest_dir / filename
        if not target.exists():
            return target

        stem = target.stem
        suffix = target.suffix
        counter = 1
        while target.exists():
            target = dest_dir / f"{stem}_{counter}{suffix}"
            counter += 1
        return target

    def _print_summary(self):
        print("\n" + "=" * 50)
        print("=== 処理結果サマリー ===")
        print(f"検出されたメディア総数:   {self.stats['total_media_found']}")
        print(f"処理完了（出力先へ配置）: {self.stats['processed']}")
        print(f"JSONメタデータ紐付け成功: {self.stats['json_matched']}")
        print(f"EXIFメタデータ書き込み:  {self.stats['exif_updated']}")
        print(f"タイムスタンプ復元:      {self.stats['timestamp_updated']}")
        print(f"重複排除スキップ数:      {self.stats['duplicates_skipped']}")
        print(f"エラー件数:              {self.stats['errors']}")
        print("=" * 50)


def main():
    parser = argparse.ArgumentParser(
        description="Google Takeoutの写真・動画を整理し、JSONメタデータを復元します。"
    )
    parser.add_argument("-i", "--input", required=True, type=Path,
                        help="Google TakeoutのZIPファイルまたは展開済みフォルダのパス")
    parser.add_argument("-o", "--output", default=Path("./organized_photos"), type=Path,
                        help="整理後の保存先ディレクトリ（デフォルト: ./organized_photos）")
    parser.add_argument("--action", choices=["copy", "move"], default="copy",
                        help="ファイルをコピーするか移動するか（デフォルト: copy）")
    parser.add_argument("--format", choices=["year_month", "year", "flat"], default="year_month",
                        help="フォルダの分類方法（デフォルト: year_month -> YYYY/YYYY-MM/）")
    parser.add_argument("--no-exif", action="store_true",
                        help="EXIF書き込みを行わずタイムスタンプ設定のみ実行する")
    parser.add_argument("--no-dedup", action="store_true",
                        help="ハッシュ重複排除を無効化する")
    parser.add_argument("--dry-run", action="store_true",
                        help="実際のファイルコピー/移動を行わずにシミュレーションを実行")

    args = parser.parse_args()

    if not args.input.exists():
        print(f"エラー: 入力パスが見つかりません: {args.input}", file=sys.stderr)
        sys.exit(1)

    processor = TakeoutProcessor(
        input_path=args.input,
        output_dir=args.output,
        action=args.action,
        folder_format=args.format,
        fix_exif=not args.no_exif,
        dedup=not args.no_dedup,
        dry_run=args.dry_run
    )
    processor.process()


if __name__ == "__main__":
    main()
