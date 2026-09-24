#!/bin/zsh
# Положить на карту починку описателя + пробу журнала (одна карта, один заход).
#
#   tools/write_fixprobe.sh --from out/cyprus   описатель из образа
#
# Набор карт на карте не трогается. Вставлять в машину БЕЗ захода в меню
# обновления: скрипт починит описатель, поднимет уровень журнала нав-ядра и
# снимет sloginfo. После перезагрузки вставить ещё раз — снимет журнал уже с
# поднятым уровнем.
set -e
cd "$(dirname "$0")/.."
INI="tools/fixacios/acios_db.ini"
if [ "$1" = "--from" ] && [ -n "$2" ]; then
  [ -f "$2/acios_db.ini" ] || { echo "в $2 нет acios_db.ini"; exit 1; }
  INI="$2/acios_db.ini"; shift 2
fi
V="/Volumes/NO NAME"
if [ "$1" != "--no-wait" ]; then
  echo "жду карту $V ..."
  n=0; until [ -d "$V" ] || [ $n -ge 300 ]; do sleep 2; n=$((n+1)); done
fi
[ -d "$V" ] || { echo "карта не смонтирована"; exit 1; }
sleep 2
touch "$V/.w" 2>/dev/null || { echo "карта заблокирована (LOCK)"; exit 1; }
rm -f "$V/.w"

paths=$(awk '/^(ANY|#SDS|#MNT\(SDS\)): / {n++} END {print n+0}' "$INI")
[ "$paths" -ge 3 ] || { echo "описатель $INI негоден: путей $paths"; exit 1; }
echo "описатель: $INI (путей $paths)"

setopt +o nomatch 2>/dev/null || true
rm -rf "$V/var/fixprobe" "$V/var/ndr" "$V/var/fix" 2>/dev/null || true
rm -f "$V/.started" "$V/.done" "$V/.syslog" 2>/dev/null || true
find "$V" -maxdepth 1 -name ".step*" -delete 2>/dev/null || true
cp tools/fixprobe/run.sh "$V/run.sh"
cp "$INI"                "$V/acios_db.ini"
cp out/ndrprobe/copie_scr.sh "$V/copie_scr.sh"
ditto --norsrc --noextattr --noacl out/ndrprobe/bin "$V/bin"
ditto --norsrc --noextattr --noacl out/ndrprobe/lib "$V/lib"
mkdir -p "$V/var"
find "$V" \( -name '._*' -o -name '.DS_Store' \) -delete 2>/dev/null || true
echo "--- итог ---"
echo "run.sh:       $([ -f "$V/run.sh" ] && echo да || echo НЕТ)"
echo "acios_db.ini: $(wc -c < "$V/acios_db.ini" | tr -d ' ') байт"
echo "набор карт:   $([ -d "$V/pkgdb" ] && echo есть || echo нет) — не тронут"
sync; diskutil eject "$V"
