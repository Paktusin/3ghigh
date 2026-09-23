#!/bin/zsh
# Положить на карту починку описателя базы (acios_db.ini).
# Набор карт на карте не трогает. Вставлять в машину БЕЗ захода в меню обновления.
#
#   tools/write_fixacios.sh                    описатель — заводской снимок
#   tools/write_fixacios.sh --from out/cyprus  описатель из образа (чистый раздел)
#
# Заводской снимок перечисляет 17 файлов и годится, только когда база на
# разделе заводская. Для образа, собранного с --clean, берётся его собственный
# acios_db.ini: он перечисляет ровно то, что в образе есть.
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

# какой описатель класть: свой (из образа) или заводской снимок
INI="tools/fixacios/acios_db.ini"
if [ "$1" = "--from" ] && [ -n "$2" ]; then
  [ -f "$2/acios_db.ini" ] || { echo "в $2 нет acios_db.ini — собран ли образ с --clean?"; exit 1; }
  INI="$2/acios_db.ini"
fi
# проверка описателя: непустой и состоит из строк с путями
grep -c "^ANY: /mnt/nav/db/pkgdb/" "$INI" >/dev/null 2>&1 || true
n=$(wc -c < "$INI" | tr -d ' ')
paths=$(awk '/^(ANY|#SDS|#MNT\(SDS\)): / {n++} END {print n+0}' "$INI")
[ "$n" -gt 0 ] && [ "$paths" -ge 3 ] || { echo "описатель $INI негоден: $n байт, путей $paths"; exit 1; }
echo "описатель: $INI ($n б, путей $paths)"

setopt +o nomatch 2>/dev/null || true
rm -rf "$V/var/base" "$V/var/nav" "$V/var/ndr" "$V/var/fix" 2>/dev/null || true
rm -f "$V/.started" "$V/.done" 2>/dev/null || true
find "$V" -maxdepth 1 -name ".step*" -delete 2>/dev/null || true
cp tools/fixacios/run.sh        "$V/run.sh"
cp "$INI"                       "$V/acios_db.ini"
cp out/ndrprobe/copie_scr.sh    "$V/copie_scr.sh"
ditto --norsrc --noextattr --noacl out/ndrprobe/bin "$V/bin"
ditto --norsrc --noextattr --noacl out/ndrprobe/lib "$V/lib"
mkdir -p "$V/var"
find "$V" \( -name '._*' -o -name '.DS_Store' \) -delete 2>/dev/null || true
echo "--- итог ---"
echo "run.sh:       $([ -f "$V/run.sh" ] && echo да || echo НЕТ)"
echo "acios_db.ini: $(wc -c < "$V/acios_db.ini" | tr -d ' ') байт"
echo "copie_scr:    $([ -f "$V/copie_scr.sh" ] && echo да || echo НЕТ)"
echo "набор карт:   $([ -d "$V/pkgdb" ] && echo есть || echo нет) — не тронут"
sync; diskutil eject "$V"
