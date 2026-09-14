#!/bin/zsh
# Записать набор из out/<dir> на SD, поставив XAC и XAC3 (набор карт).
#   tools/write_maps.sh cyprus-nonb [--no-wait]
set -e
cd "$(dirname "$0")/.."
SET="$1"; [ -z "$SET" ] && { echo "укажите набор: out/<dir>"; exit 1; }
D="out/$SET"; [ -d "$D" ] || { echo "нет каталога $D"; exit 1; }
V="/Volumes/NO NAME"
if [ "$2" != "--no-wait" ]; then n=0; until [ -d "$V" ] || [ $n -ge 300 ]; do sleep 2; n=$((n+1)); done; fi
[ -d "$V" ] || { echo "карта не смонтирована"; exit 1; }
sleep 2
touch "$V/.w" 2>/dev/null || { echo "карта заблокирована (LOCK)"; exit 1; }
rm -f "$V/.w"
node src/checksum.js "$D" 2>&1 | grep -q "все суммы и размеры сходятся" || { echo "$D не сходится — не пишу"; exit 1; }
# снять пробу-скрипты, если оставались от диагностики
rm -f "$V/copie_scr.sh" "$V/run.sh" "$V/uninstall.sh"; rm -rf "$V/scripts" "$V/engdefs" "$V/var/ndr"
rm -f "$V"/pkgdb/XAC/* "$V"/pkgdb/XAC3/*
rsync -rt --exclude '.DS_Store' --exclude '._*' "$D/" "$V/" 2>&1 | grep -v "unreadable directory" || true
find "$V" \( -name '._*' -o -name '.DS_Store' \) -delete 2>/dev/null || true
echo "--- сверка карты ---"
node src/checksum.js "$V" 2>&1 | grep -E "Database - XAC |Database - XAC3|сходятся|РАСХОЖ"
echo "XAC=$SET: $(cmp -s "$D/pkgdb/XAC/kN221EUx01_0.db" "$V/pkgdb/XAC/kN221EUx01_0.db" && echo да || echo НЕТ)  XAC3=$SET: $(cmp -s "$D/pkgdb/XAC3/kN221EUx01_2.db" "$V/pkgdb/XAC3/kN221EUx01_2.db" && echo да || echo НЕТ)"
echo "copie_scr удалён: $([ -f "$V/copie_scr.sh" ] && echo НЕТ || echo да)"
sync; diskutil eject "$V"
