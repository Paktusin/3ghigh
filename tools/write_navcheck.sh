#!/bin/zsh
# Положить на карту пробу состава nav-раздела и обезвредить DBINFO/CONFIG.
#
# Набор карт на карте НЕ трогается — проба ложится рядом.
#
# Заодно из метаданных удаляются записи DBINFO и CONFIG. У них назначение —
# корень базы (/mnt/nav/db/DBInfo.txt), а у всех компонентов стоит
# DeleteDestinationDirBeforeCopy="true", поэтому их установка сносит
# /mnt/nav/db целиком вместе со всем pkgdb. Проще убрать их из списка, чем
# каждый раз помнить, что отмечать их нельзя.
set -e
cd "$(dirname "$0")/.."
V="/Volumes/NO NAME"
if [ "$1" != "--no-wait" ]; then
  echo "жду карту $V ..."
  n=0; until [ -d "$V" ] || [ $n -ge 300 ]; do sleep 2; n=$((n+1)); done
fi
[ -d "$V" ] || { echo "карта не смонтирована"; exit 1; }
sleep 2
touch "$V/.w" 2>/dev/null || { echo "карта заблокирована (LOCK)"; exit 1; }
rm -f "$V/.w"

setopt +o nomatch 2>/dev/null || true
rm -rf "$V/var/nav" "$V/var/ndr" 2>/dev/null || true
rm -f "$V/.started" "$V/.done" "$V/.syslog" 2>/dev/null || true
find "$V" -maxdepth 1 -name ".step*" -delete 2>/dev/null || true
cp tools/navcheck/run.sh "$V/run.sh"
cp out/ndrprobe/copie_scr.sh "$V/copie_scr.sh"
ditto --norsrc --noextattr --noacl out/ndrprobe/bin "$V/bin"
ditto --norsrc --noextattr --noacl out/ndrprobe/lib "$V/lib"
mkdir -p "$V/var"

# обезвредить DBINFO и CONFIG в метаданных релиза
for M in "$V"/MMI3G/metainfo2.txt "$V"/MMI3GP/metainfo2.txt; do
  [ -f "$M" ] || continue
  python3 - "$M" <<'PY'
import sys,re
p=sys.argv[1]; s=open(p,'rb').read().decode('latin1')
blocks=re.split(r'(?=\[)', s)
keep=[b for b in blocks if not re.search(r'DisplayName = "Database - (DBINFO|CONFIG)"', b)]
removed=len(blocks)-len(keep)
open(p,'wb').write(''.join(keep).encode('latin1'))
print("  %s: удалено записей %d" % (p.split('/')[-2], removed))
PY
done

find "$V" \( -name '._*' -o -name '.DS_Store' \) -delete 2>/dev/null || true
echo "--- итог ---"
echo "run.sh: $([ -f "$V/run.sh" ] && echo да || echo НЕТ)   copie_scr: $([ -f "$V/copie_scr.sh" ] && echo да || echo НЕТ)"
echo "набор на месте: $([ -d "$V/pkgdb/GDB" ] && echo да || echo НЕТ)"
echo "DBINFO/CONFIG в метаданных: $(grep -ac 'Database - \(DBINFO\|CONFIG\)' "$V/MMI3G/metainfo2.txt" 2>/dev/null || echo 0)"
sync; diskutil eject "$V"
