#!/bin/ksh
# Один вопрос: что лежит на nav-разделе? Всё остальное вторично.
#
# На заклиненной машине блокируется любое обращение к файловой системе, включая
# сам ls. Поэтому каждая проверка запускается ФОНОМ со сторожевым таймером:
# что успело записаться — то и останется, зависшая команда никого не держит.
# Результат сбрасывается на карту сразу (sync), а не в конце.

SDPATH="${1:-${0%/*}}"
OUT="${SDPATH}/var/nav"
mkdir -p "${SDPATH}/var" "${OUT}"
echo started > "${SDPATH}/.started"; sync

# показать заставку, чтобы было видно, что проба пошла
[ -f "${SDPATH}/bin/showScreen" ] && {
  cp "${SDPATH}/bin/showScreen" /tmp/showScreen 2>/dev/null
  chmod +x /tmp/showScreen 2>/dev/null
  [ -f "${SDPATH}/lib/running.png" ] && { /tmp/showScreen "${SDPATH}/lib/running.png" & }
}

# guard <секунд> <файл> <команда...>
guard() {
  s=$1; f=$2; shift 2
  ( "$@" > "$f" 2>&1 ; echo "__ЗАВЕРШЕНО__" >> "$f" ) &
  p=$!
  n=0
  while [ $n -lt $s ] ; do
    kill -0 $p 2>/dev/null || break
    sleep 1; n=$((n+1))
  done
  kill -9 $p 2>/dev/null
  grep -q "__ЗАВЕРШЕНО__" "$f" 2>/dev/null || echo "__ЗАВИСЛО после ${s}с__" >> "$f"
  sync
}

# ГЛАВНОЕ: состав раздела. Сначала короткое, потом подробное.
guard 15 "${OUT}/1_pkgdb.txt"      ls    /mnt/nav/db/pkgdb
echo step1 > "${SDPATH}/.step1"; sync
guard 15 "${OUT}/2_db_root.txt"    ls -la /mnt/nav/db
echo step2 > "${SDPATH}/.step2"; sync
guard 20 "${OUT}/3_pkgdb_sizes.txt" du -sk /mnt/nav/db/pkgdb/
echo step3 > "${SDPATH}/.step3"; sync
guard 10 "${OUT}/4_mount.txt"      df -k
echo step4 > "${SDPATH}/.step4"; sync
guard 10 "${OUT}/5_dbinfo.txt"     cat /mnt/nav/db/DBInfo.txt

echo done > "${SDPATH}/.done"; sync
[ -f /tmp/showScreen ] && [ -f "${SDPATH}/lib/done.png" ] && /tmp/showScreen "${SDPATH}/lib/done.png" &
sleep 5
