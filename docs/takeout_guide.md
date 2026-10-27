# Google Takeout による既存写真の一括エクスポート & 整理ガイド

Google フォトに保存されている写真・動画をローカルPCへ安全に退避し、メタデータを復元して整理する完全ガイドです。

---

## 1. Google Takeout（データのエクスポート）の実行手順

ブラウザから Google 公式のデータエクスポート機能を利用して、元の画質の写真・動画を一括取得します。

### 手順
1. **Google Takeout にアクセス**:
   - ブラウザで [https://takeout.google.com/](https://takeout.google.com/) を開きます。
2. **対象サービスを選択**:
   - 上部の **「選択をすべて解除」** をクリックします。
   - リストから **「Google フォト」** だけにチェックを入れます。
   - ※「複数の形式」「すべてのフォトアルバムが含まれます」をクリックし、不要な自動生成アルバム（「Year in Review」など）を除外して特定の年やアルバムに絞ることも可能です。
3. **エクスポート形式の設定**:
   - 「次のステップ」をクリック。
   - **配信方法**: 「ダウンロード リンクをメールで送信」
   - **頻度**: 「1 回エクスポート」
   - **ファイル形式**: `.zip`
   - **ファイルサイズ**: **`50 GB`** を選択（重要：デフォルトの2GBのままだと大量の分割ファイルになりダウンロードが大変になります。50GBに設定することで1〜2個のファイルにまとまります）。
4. **エクスポートの作成**:
   - 「エクスポートを作成」をクリックします。
   - Google側でZIP作成処理が開始されます（13.87GBの場合、通常数十分〜数時間で完了メールが届きます）。
5. **ローカルPCへダウンロード**:
   - 完了メール内のリンク、または Takeout 画面から ZIP ファイルをローカルPC（または外付けHDD）にダウンロードします。

---

## 2. メタデータ復元 & フォルダ整理スクリプトの実行

Google Takeout でダウンロードした写真には、以下の特有の問題があります：
- 撮影日時やGPS情報が写真本体から抜け落ちており、別個の `.json` ファイルに保存されている。
- 写真の作成日/更新日がすべて「Takeoutのダウンロード日」になってしまい、日付順に並ばない。
- 重複ファイルや分割ZIPが存在する。

これを解決するため、同封の `takeout_processor.py` を使用します。

### 必要要件
- Python 3.8 以上
- 依存ライブラリ（EXIF埋め込み用）:
  ```bash
  pip install -r scripts/requirements.txt
  ```

### 実行例

#### パターンA: ダウンロードしたZIPファイルを直接指定して整理
ZIPファイルを解凍せずにそのまま渡すと、一時展開して年・月別のフォルダ（`YYYY/YYYY-MM/`）に写真を分類し、EXIFおよびファイルの更新日時を正しく復元します。

```bash
python3 scripts/takeout_processor.py -i /path/to/takeout-001.zip -o ~/Pictures/MyPhotos/
```

#### パターンB: 複数のZIPファイルが入っているフォルダを指定
```bash
python3 scripts/takeout_processor.py -i /path/to/takeout_folder/ -o ~/Pictures/MyPhotos/
```

#### パターンC: すでに手動で解凍したフォルダを指定
```bash
python3 scripts/takeout_processor.py -i /path/to/Takeout/Google\ フォト/ -o ~/Pictures/MyPhotos/
```

#### オプション一覧
| オプション | 説明 |
| :--- | :--- |
| `-i`, `--input` | **[必須]** TakeoutのZIPファイルまたは展開済みフォルダパス |
| `-o`, `--output` | 整理先フォルダ（デフォルト: `./organized_photos`） |
| `--action copy` | ファイルをコピーして配置（デフォルト・安全） |
| `--action move` | ファイルを移動して配置（ディスク容量がカツカツの場合） |
| `--format year_month` | `YYYY/YYYY-MM/` 形式で分類（デフォルト） |
| `--format year` | `YYYY/` 年別フォルダのみで分類 |
| `--format flat` | フォルダ分けせず1箇所に配置 |
| `--dry-run` | 実際の書き込みを行わず、シミュレーションを実行 |
| `--no-dedup` | 重複ファイルのスキップを無効化 |

### 実行後の状態
- 各写真・動画のファイル更新日時が、実際の「撮影日時」になります。
- JPEG写真の内部EXIFに撮影日時とGPS位置情報が再書き込みされます。
- `~/Pictures/MyPhotos/2023/2023-05/IMG_xxxx.jpg` のように時系列で整然と整理され、WindowsフォトやMacの写真アプリ、Synology/Immich等にそのまま移行できるようになります。
