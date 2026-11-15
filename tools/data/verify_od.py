#!/usr/bin/env python3
"""public/data/od.json を検証する。すべて通れば終了コード0、1つでも失敗すれば1。

    python3 tools/data/verify_od.py

照合に使う原本(年報の xls、旧作品の data.json)が raw/ になければ取得して保存する。
"""

import json
import os
import re
import sys

import openpyxl
import xlrd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_od as B  # noqa: E402  (定数・取得処理を共有する)

N = B.N
PREFS = B.PREFS

# 公表値(各年の日本人移動者の都道府県間移動者数)
PUBLISHED = {
    2013: 2301895, 2014: 2259688, 2015: 2334738, 2016: 2275331, 2017: 2287310,
    2018: 2293493, 2019: 2297005, 2020: 2247492, 2021: 2242845, 2022: 2255362,
    2023: 2229186, 2024: 2188590, 2025: 2148329,
}

OLD_DATA_NAME = "prefecturalMigrants-data.json"
OLD_DATA_URL = "https://structure-and-representation.com/works/prefecturalMigrants/data.json"

# 年報(基本集計)第2表「男女，移動前の住所地別都道府県間移動者数」
NENPO = {
    2012: ("nenpo2012_t2.xls", "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000018799830&fileKind=0"),
    2013: ("nenpo2013_t2.xls", "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000023617820&fileKind=0"),
}
NENPO_LIST = (
    "https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&cycle=7&toukei=00200523"
    "&tstat=000000070001&tclass1=000001040402&tclass2val=0&year={y}0&month=0"
)

failures = []


def check(ok, label, detail=""):
    print(f"  [{'OK' if ok else 'NG'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)
    return ok


def raw_path(name, url, description):
    path = os.path.join(B.RAW_DIR, name)
    if not os.path.exists(path):
        B.fetch(url, path, description)
    return path


def compare_cells(label, got, expected):
    """got と expected(ともに長さ 2209 の行優先リスト)の全セルを比較する。"""
    diffs = [(i // N, i % N, a, b) for i, (a, b) in enumerate(zip(got, expected)) if a != b]
    detail = ""
    if diffs:
        o, d, a, b = diffs[0]
        detail = f"{len(diffs)}セル不一致。例: {PREFS[o]}→{PREFS[d]} od.json={a} 照合先={b}"
    else:
        detail = f"全{len(expected)}セル一致"
    check(not diffs and len(got) == len(expected), label, detail)


def read_xlsx_independent(path):
    """長期時系列表の全シートを読み、{年: (全国総数セル, 行優先2209個)} を返す(build_od とは別実装)。"""
    out = {}
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for name in wb.sheetnames:
        rows = [list(r) for r in wb[name].iter_rows(values_only=True)]
        flat = []
        for o in range(N):
            for d in range(N):
                v = rows[7 + o][4 + d]
                flat.append(0 if v == "-" else int(v))
        out[int(name)] = (int(rows[6][3]), flat)
    wb.close()
    return out


def parse_nenpo(path):
    """年報の xls から 2209 セルの行優先リストを作る。

    移動先4つごとのブロックが縦に並ぶ。見出し行(「移動前の住所地」を含む行)で、
    「2桁コード+都・道・府・県で終わる名前」のセルが移動先、その列の「総数」が両性計の値。
    """
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    cells = {}
    dest_cols = {}
    for r in range(sh.nrows):
        row = [sh.cell_value(r, c) for c in range(sh.ncols)]
        texts = [B.squash(v) if isinstance(v, str) else "" for v in row]
        if any("移動前の住所地" in t for t in texts):
            dest_cols = {}
            for c, t in enumerate(texts):
                m = re.fullmatch(r"(\d{2})(.*[都道府県])", t)
                if m:
                    code = int(m.group(1))
                    if PREFS[code - 1] != m.group(2):
                        raise ValueError(f"{path} 行{r}: 見出し {t!r} がコードと合わない")
                    if B.squash(sh.cell_value(r + 2, c)) != "総数":
                        raise ValueError(f"{path} 行{r + 2} 列{c}: 総数列ではない")
                    dest_cols[c] = code - 1
            continue
        if not dest_cols or not re.fullmatch(r"\d{2}", texts[8]) or not texts[10].endswith(tuple("都道府県")):
            continue
        o = int(texts[8]) - 1
        if PREFS[o] != texts[10]:
            raise ValueError(f"{path} 行{r}: {texts[8]} {texts[10]} が合わない")
        for c, d in dest_cols.items():
            if (o, d) in cells:
                raise ValueError(f"{path} 行{r}: {PREFS[o]}→{PREFS[d]} が重複")
            v = row[c]
            cells[(o, d)] = 0 if v == "-" else int(v)
    if len(cells) != N * N:
        raise ValueError(f"{path}: {len(cells)}セルしか取れない(期待 {N * N})")
    return [cells[(o, d)] for o in range(N) for d in range(N)]


def main():
    print(f"検証対象: {B.OUT_PATH}")
    with open(B.OUT_PATH, encoding="utf-8") as f:
        doc = json.load(f)

    print("\n[形式]")
    years = doc.get("years")
    check(doc.get("series") == B.SERIES and doc.get("unit") == "人", "series / unit")
    src = doc.get("source", {})
    check(
        src.get("url") == B.LIST_URL and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(src.get("retrieved"))),
        "source.url / source.retrieved", f"retrieved={src.get('retrieved')}",
    )
    check(years == list(range(2012, 2026)), "years が 2012〜2025", str(years))
    mats = doc["matrices"]
    check(sorted(mats) == sorted(map(str, years)) and sorted(doc["totals"]) == sorted(mats), "matrices / totals のキーが years と一致")
    for y in years:
        m = mats[str(y)]
        n_ok = len(m) == N * N
        ints = all(type(v) is int for v in m)
        diag = all(m[i * N + i] == 0 for i in range(N)) if n_ok else False
        off = all(m[o * N + d] > 0 for o in range(N) for d in range(N) if o != d) if n_ok and ints else False
        check(n_ok and ints and diag and off, f"{y}年: 要素数{len(m)}・整数・対角0・非対角が正")

    print("\n[各年の合計 = 長期時系列表の全国総数セル(行6・列3)]")
    xlsx = read_xlsx_independent(raw_path(B.XLSX_NAME, B.XLSX_URL, "長期時系列表 第11表"))
    for y in years:
        total_cell, flat = xlsx[y]
        s = sum(mats[str(y)])
        check(
            s == doc["totals"][str(y)] == total_cell,
            f"{y}年: 合計 {s:,} / totals {doc['totals'][str(y)]:,} / 全国総数セル {total_cell:,}",
        )

    print("\n[各年の合計 = 公表値]")
    for y, v in PUBLISHED.items():
        check(doc["totals"][str(y)] == v, f"{y}年: {doc['totals'][str(y)]:,} = 公表値 {v:,}")
    print("  (2012年は公表値の指定がないため、下の年報との全セル照合で確認)")

    print("\n[長期時系列表の原本との全セル照合]")
    for y in years:
        compare_cells(f"{y}年 vs xlsx 原本", mats[str(y)], xlsx[y][1])

    print("\n[2014年 vs 旧作品 data.json]")
    old_path = raw_path(OLD_DATA_NAME, OLD_DATA_URL, "旧作品「三大都市圏の人の流れ」(2015)のデータ。2014年の都道府県間移動者数")
    with open(old_path, encoding="utf-8") as f:
        old = json.load(f)
    names = [n["name"] for n in old["nodes"]]
    check(names == PREFS, "旧データの nodes が北海道→沖縄の47都道府県")
    old_flat = [0] * (N * N)
    seen = set()
    dup = 0
    for l in old["links"]:
        key = (l["source"], l["target"])
        dup += key in seen
        seen.add(key)
        old_flat[l["source"] * N + l["target"]] = l["value"]
    check(dup == 0 and len(seen) == N * (N - 1), f"旧データの links が重複なしの{N * (N - 1)}本", f"{len(old['links'])}本")
    compare_cells("2014年 vs 旧データ", mats["2014"], old_flat)

    print("\n[2012・2013年 vs 年報(基本集計)第2表]")
    for y, (name, url) in NENPO.items():
        path = raw_path(name, url, f"年報(基本集計){y}年 第2表 男女，移動前の住所地別都道府県間移動者数。一覧: " + NENPO_LIST.format(y=y))
        compare_cells(f"{y}年 vs 年報 第2表({name})", mats[str(y)], parse_nenpo(path))

    print()
    if failures:
        print(f"失敗 {len(failures)}件:")
        for x in failures:
            print(f"  - {x}")
        return 1
    print("すべての検証に通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
