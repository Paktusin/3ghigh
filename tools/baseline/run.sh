#!/bin/ksh
# ЭТАЛОН рабочей навигации. Только чтение. Снимается на ИСПРАВНОЙ машине, чтобы
# было с чем сравнивать зависшие срезы. Ключевое — увидеть в журнале строку,
# которая идёт ПОСЛЕ "start: NDL Initialisation" (завершение инициализации).
# Всё под сторожем — на рабочей машине не зависнет, но пусть будет.

SDPATH="${1:-${0%/*}}"
OUT="${SDPATH}/var/base"
mkdir -p "${SDPATH}/var" "${OUT}"
echo started > "${SDPATH}/.started"; sync
[ -f "${SDPATH}/bin/showScreen" ] && {
  cp "${SDPATH}/bin/showScreen" /tmp/showScreen 2>/dev/null; chmod +x /tmp/showScreen 2>/dev/null
  [ -f "${SDPATH}/lib/running.png" ] && { /tmp/showScreen "${SDPATH}/lib/running.png" & }
}
guard() { s=$1; f=$2; shift 2
  ( "$@" > "$f" 2>&1 ; echo "__ЗАВЕРШЕНО__" >> "$f" ; sync ) & p=$!; n=0
  while [ $n -lt $s ]; do kill -0 $p 2>/dev/null || break; sleep 1; n=$((n+1)); done
  kill -9 $p 2>/dev/null; sleep 1
  grep -q "__ЗАВЕРШЕНО__" "$f" 2>/dev/null || echo "__ЗАВИСЛО ${s}с__" >> "$f"; sync; }

# 1. Полный журнал — здесь и лежит завершение NDL Initialisation
guard 20 "${OUT}/syslog_full.txt" sloginfo
echo s1 > "${SDPATH}/.step1"; sync
# 2. Состояния процессов навигации — эталон здоровых потоков
guard 10 "${OUT}/pidin_state.txt"    pidin
guard 10 "${OUT}/pidin_ndr.txt"      pidin -p ndr
guard 10 "${OUT}/pidin_mmi3gapp.txt" pidin -p MMI3GApplication
echo s2 > "${SDPATH}/.step2"; sync
# 3. Три среза ndr (крутится / стоит — эталон)
for i in 1 2 3; do echo "=== срез $i ===" >> "${OUT}/pidin_repeat.txt"; pidin -p ndr >> "${OUT}/pidin_repeat.txt" 2>&1; sleep 3; done; sync
echo s3 > "${SDPATH}/.step3"; sync
# 4. Валидный описатель базы во всех местах
i=0; for f in /mnt/lvm/acios_db.ini /HBpersistence/navi/db/acios_db.ini /HBpersistence/navi/acios_db.ini /mnt/efs-persist/acios_db.ini; do
  i=$((i+1)); guard 10 "${OUT}/acios_${i}.txt" sh -c "echo '=== $f ==='; ls -la '$f'; cat '$f'"; done
echo s4 > "${SDPATH}/.step4"; sync
# 5. Эталонный состав раздела (23 компонента)
guard 15 "${OUT}/pkgdb.txt" ls -la /mnt/nav/db/pkgdb
guard 10 "${OUT}/df.txt"    df -k
# 6. персистентность навигации и lvm
guard 15 "${OUT}/hbp_navi.txt" ls -laR /HBpersistence/navi
guard 10 "${OUT}/lvm.txt"      ls -laR /mnt/lvm /HBpersistence/lvm
# 7. Отметки установщика по каждому компоненту. Каталог тома, который читает CDM
#    (acios_db.ini), генерирует LVM при установке, а эти файлы пишет SWDL —
#    по ним видно, какие компоненты установщик реально трогал и что записал.
guard 20 "${OUT}/swdl_marks.txt" sh -c '
  for f in /mnt/nav/db/pkgdb/*.SWDL.version.txt /mnt/nav/db/pkgdb/*.SWDL.compatibility.txt; do
    [ -f "$f" ] || continue
    echo "=== $f"; cat "$f"; echo
  done'
# 8. Куда реально ведут пути из acios_db.ini: существуют ли файлы и какого размера
guard 20 "${OUT}/acios_targets.txt" sh -c '
  ini=/HBpersistence/navi/db/acios_db.ini
  [ -f "$ini" ] || { echo "нет $ini"; exit 0; }
  sed -n "s/^[A-Za-z]*: *//p" "$ini" | while read pth; do
    [ -n "$pth" ] || continue
    if [ -e "$pth" ]; then ls -la "$pth"; else echo "ОТСУТСТВУЕТ: $pth"; fi
  done'
echo done > "${SDPATH}/.done"; sync
[ -f /tmp/showScreen ] && [ -f "${SDPATH}/lib/done.png" ] && /tmp/showScreen "${SDPATH}/lib/done.png" &
sleep 5
