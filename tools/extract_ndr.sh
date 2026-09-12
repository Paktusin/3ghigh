#!/bin/zsh
# Достать ndr из пакета прошивки MU, сложенного в fw/.
#   tools/extract_ndr.sh            — найти ifs-root.ifs в fw/, распаковать, найти ndr
# Результат: out/ifs/<вариант>/ с деревом образа и out/ndr/ndr (SH4 ELF).
set -e
cd "$(dirname "$0")/.."
TK=MMI3G-Toolkit-main/tools

echo "=== образы ifs-root.ifs в fw/ ==="
find fw -iname 'ifs-root.ifs' -print 2>/dev/null | sort
IFS_FILE=$(find fw -iname 'ifs-root.ifs' 2>/dev/null | grep -E '/(41|4[0-9])/' | head -1)
[ -z "$IFS_FILE" ] && IFS_FILE=$(find fw -iname 'ifs-root.ifs' 2>/dev/null | head -1)
[ -z "$IFS_FILE" ] && { echo "ifs-root.ifs не найден в fw/ — положите пакет туда"; exit 1; }
echo "беру: $IFS_FILE ($(stat -f%z "$IFS_FILE") байт)"

VAR=$(echo "$IFS_FILE" | sed -nE 's#.*/ifs-root/([^/]+)/.*#\1#p'); VAR=${VAR:-unknown}
OUT=out/ifs/$VAR; rm -rf "$OUT"; mkdir -p "$OUT" out/ndr

echo "=== заголовок образа ==="
xxd -l 64 "$IFS_FILE"

echo "=== распаковка (inflate_ifs.py --extract) ==="
python3 "$TK/inflate_ifs.py" "$IFS_FILE" --extract "$OUT" --keep-decomp --no-container-fallback

echo "=== файлов извлечено: $(find "$OUT" -type f | wc -l | tr -d ' ') ==="
echo "=== ищу ndr ==="
find "$OUT" -type f -iname 'ndr' -o -type f -iname 'ndr.*' | while read -r f; do
  echo "--- $f ($(stat -f%z "$f") байт) ---"; xxd -l 16 "$f"; file "$f" 2>/dev/null
done
NDR=$(find "$OUT" -type f -iname 'ndr' | head -1)
[ -z "$NDR" ] && { echo "ndr в образе не найден; смотрите список выше и efs-system.efs"; exit 2; }
cp "$NDR" out/ndr/ndr.raw
# iwlyfmbp — обёртка QNX deflate, снять qnx_inflator
if head -c 8 out/ndr/ndr.raw | grep -q 'iwlyfmbp'; then
  echo "ndr упакован (iwlyfmbp) — распаковываю"; python3 "$TK/inflate_qnx.py" out/ndr/ndr.raw out/ndr/ndr
else
  cp out/ndr/ndr.raw out/ndr/ndr
fi
echo "=== итог ==="; ls -la out/ndr/; file out/ndr/ndr 2>/dev/null; echo "строки FLDB внутри: $(strings -a out/ndr/ndr | grep -c -i fldb)"
