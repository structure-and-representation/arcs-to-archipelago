#!/usr/bin/env python3
"""住民基本台帳人口移動報告 長期時系列表 第11表から public/data/od.json を生成する。

    python3 tools/data/build_od.py            # raw/ に原本があればそれを使う
    python3 tools/data/build_od.py --refresh  # 原本を取得し直す

詳細は tools/data/README.md を参照。
"""

import argparse
import datetime
import json
import os
import re
import sys
import urllib.request

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")
SOURCE_TXT = os.path.join(RAW_DIR, "SOURCE.txt")
OUT_PATH = os.path.normpath(os.path.join(HERE, "..", "..", "public", "data", "od.json"))

XLSX_NAME = "11-long.xlsx"
XLSX_URL = "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040430819&fileKind=0"
LIST_URL = (
    "https://www.e-stat.go.jp/stat-search/files?toukei=00200523&tstat=000000070001"
    "&cycle=0&tclass1=000001051218&layout=datalist&page=1&tclass2val=0"
)
SOURCE_NAME = "住民基本台帳人口移動報告(総務省統計局)長期時系列表 第11表"
SERIES = "日本人移動者"

PREFS = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
    "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
    "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県",
    "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
]
N = len(PREFS)
assert N == 47 and len(set(PREFS)) == 47

# 0始まりの行・列の添字(README.md 参照)
ROW_TOTAL = 6
ROW_FIRST = 7  # 北海道
COL_TOTAL = 3
COL_FIRST = 4  # 北海道
ROW_HEADER = 2  # 移動後の住所地の名称
ROW_CODE = 4  # 移動後の住所地のJISコード


def read_source_entries():
    """SOURCE.txt を {file: {key: value}} として読む。空行で区切られた key: value の並び。"""
    entries = {}
    if not os.path.exists(SOURCE_TXT):
        return entries
    with open(SOURCE_TXT, encoding="utf-8") as f:
        text = f.read()
    for block in re.split(r"\n\s*\n", text):
        entry = {}
        for line in block.splitlines():
            if line.startswith("#") or ":" not in line:
                continue
            k, v = line.split(":", 1)
            entry[k.strip()] = v.strip()
        if "file" in entry:
            entries[entry["file"]] = entry
    return entries


def write_source_entries(entries):
    header = (
        "# 取得した原本ファイルの一覧。空行で区切った key: value の並び。\n"
        "# build_od.py / verify_od.py が取得日の参照と追記に使うので、書式を変えないこと。\n"
    )
    blocks = []
    for name in sorted(entries):
        e = entries[name]
        keys = ["file", "retrieved", "url", "description"]
        lines = [f"{k}: {e[k]}" for k in keys if k in e]
        lines += [f"{k}: {v}" for k, v in e.items() if k not in keys]
        blocks.append("\n".join(lines))
    with open(SOURCE_TXT, "w", encoding="utf-8") as f:
        f.write(header + "\n" + "\n\n".join(blocks) + "\n")


def fetch(url, dest, description):
    """url を dest に保存し、SOURCE.txt に取得日と取得URLを記録する。"""
    os.makedirs(RAW_DIR, exist_ok=True)
    print(f"取得: {url}", file=sys.stderr)
    with urllib.request.urlopen(url, timeout=120) as res:
        data = res.read()
    tmp = dest + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, dest)
    entries = read_source_entries()
    name = os.path.basename(dest)
    entries[name] = {
        "file": name,
        "retrieved": datetime.date.today().isoformat(),
        "url": url,
        "description": description,
    }
    write_source_entries(entries)


def ensure_raw(refresh=False):
    path = os.path.join(RAW_DIR, XLSX_NAME)
    if refresh or not os.path.exists(path):
        fetch(
            XLSX_URL,
            path,
            f"住民基本台帳人口移動報告 長期時系列表 第11表(シート2012〜、{SERIES}。一覧ページ: {LIST_URL})",
        )
    return path


def squash(s):
    """全角・半角の空白と改行をすべて取り除く。"""
    return re.sub(r"\s+", "", str(s))


def as_count(v, where):
    """セルの値を非負の整数にする。'-' は None を返す(同一都道府県のセル)。"""
    if isinstance(v, str):
        if v.strip() == "-":
            return None
        raise ValueError(f"{where}: 数値でないセル {v!r}")
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != int(v) or v < 0:
        raise ValueError(f"{where}: 非負整数でないセル {v!r}")
    return int(v)


def parse_sheet(rows, year):
    """1シート(行のリスト)から 47×47 の行優先リストを作る。構造が想定と違えば例外にする。"""
    # 見出しの確認: 列の都道府県名・JISコード、行の JISコード・都道府県名
    for d in range(N):
        c = COL_FIRST + d
        if squash(rows[ROW_HEADER][c]) != PREFS[d]:
            raise ValueError(f"{year}: 列{c}の見出し {rows[ROW_HEADER][c]!r} が {PREFS[d]} ではない")
        if int(rows[ROW_CODE][c]) != d + 1:
            raise ValueError(f"{year}: 列{c}のコード {rows[ROW_CODE][c]!r} が {d + 1} ではない")
    for o in range(N):
        r = ROW_FIRST + o
        if str(rows[r][0]).strip() != f"{o + 1:02d}" or squash(rows[r][1]) != PREFS[o]:
            raise ValueError(f"{year}: 行{r}が {o + 1:02d} {PREFS[o]} ではない: {rows[r][:2]}")
    if "総" not in squash(rows[ROW_TOTAL][0]):
        raise ValueError(f"{year}: 行{ROW_TOTAL}が総数行ではない")

    flat = []
    for o in range(N):
        r = ROW_FIRST + o
        for d in range(N):
            where = f"{year}年 行{r} 列{COL_FIRST + d}"
            v = as_count(rows[r][COL_FIRST + d], where)
            if o == d:
                if v is not None:
                    raise ValueError(f"{where}: 対角セルが '-' ではない: {v}")
                v = 0
            elif v is None:
                raise ValueError(f"{where}: 非対角セルが '-'")
            flat.append(v)
    return flat


def build(xlsx_path):
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    try:
        years = sorted(int(n) for n in wb.sheetnames)
        if years != list(range(years[0], years[-1] + 1)):
            raise ValueError(f"シート名が連続した年ではない: {wb.sheetnames}")
        matrices = {}
        for y in years:
            rows = list(wb[str(y)].iter_rows(values_only=True))
            matrices[str(y)] = parse_sheet(rows, y)
    finally:
        wb.close()
    totals = {str(y): sum(matrices[str(y)]) for y in years}
    return years, totals, matrices


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="raw/ の原本があっても取得し直す")
    args = ap.parse_args()

    path = ensure_raw(args.refresh)
    entry = read_source_entries().get(XLSX_NAME)
    if not entry or "retrieved" not in entry:
        sys.exit(f"{SOURCE_TXT} に {XLSX_NAME} の取得日がありません")
    years, totals, matrices = build(path)

    doc = {
        "series": SERIES,
        "unit": "人",
        "source": {"name": SOURCE_NAME, "url": LIST_URL, "retrieved": entry["retrieved"]},
        "years": years,
        "totals": totals,
        "matrices": matrices,
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{OUT_PATH} を出力しました({os.path.getsize(OUT_PATH):,} バイト、{years[0]}〜{years[-1]}年)")


if __name__ == "__main__":
    main()
