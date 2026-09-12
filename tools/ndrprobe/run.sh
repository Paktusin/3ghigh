#!/bin/ksh
# Где именно встал навигационный слой.
# Снимает то, чего нет в дампе system-info: состояния потоков с колонкой
# блокировки, срез по ndr и уровень отладки NDL.

SDPATH="${1:-${0%/*}}"
OUT="${SDPATH}/var/ndr"
mkdir -p "${SDPATH}/var"
mkdir -p "${OUT}"

echo started > "${SDPATH}/.started"
rm -f "${SDPATH}/.done"

# --- журнал ПЕРВЫМ: это главное, и он не зависит от nav-раздела ---
sloginfo                > "${OUT}/syslog_full.txt"     2>&1
sync
echo syslog > "${SDPATH}/.syslog"

[ -f "${SDPATH}/bin/showScreen" ] && {
  cp "${SDPATH}/bin/showScreen" /tmp/showScreen 2>/dev/null
  chmod +x /tmp/showScreen 2>/dev/null
  [ -f "${SDPATH}/lib/running.png" ] && { /tmp/showScreen "${SDPATH}/lib/running.png" & SHOWPID=$! ; }
}

# --- состояния потоков: STATE и на чём блокирован ---
# Без -F, чтобы получить формат по умолчанию с колонками STATE/Blocked.
pidin                  > "${OUT}/pidin_state.txt"      2>&1
pidin -p ndr           > "${OUT}/pidin_ndr.txt"        2>&1
pidin -p MMI3GApplication > "${OUT}/pidin_mmi3gapp.txt" 2>&1
pidin -p mme-becker    > "${OUT}/pidin_mme.txt"        2>&1
pidin arg              > "${OUT}/pidin_arg.txt"        2>&1
pidin mem              > "${OUT}/pidin_mem.txt"        2>&1

# три среза подряд: видно, стоит поток на месте или всё же движется
for i in 1 2 3 ; do
  echo "===== срез $i =====" >> "${OUT}/pidin_repeat.txt"
  pidin -p ndr >> "${OUT}/pidin_repeat.txt" 2>&1
  sleep 3
done

# --- уровни отладки навигации ---
ls -la /hbsystem/multicore/navi/ > "${OUT}/navi_multicore.txt" 2>&1
for f in dbglvl multi ; do
  echo "--- /hbsystem/multicore/navi/$f ---" >> "${OUT}/navi_dbglvl.txt"
  cat "/hbsystem/multicore/navi/$f"          >> "${OUT}/navi_dbglvl.txt" 2>&1
done

# --- что открыто и куда смонтировано ---
mount                  > "${OUT}/mount.txt"            2>&1
# чтение nav-раздела может блокироваться, когда ядро висит — в фоне, ждём не дольше 8 с
( ls -la /mnt/nav/db/pkgdb/ > "${OUT}/pkgdb_listing.txt" 2>&1
  ls -la /mnt/nav/db/       > "${OUT}/navdb_listing.txt" 2>&1
  cat /mnt/nav/db/config.nfm > "${OUT}/config.nfm"      2>&1
  cat /mnt/nav/db/DBInfo.txt > "${OUT}/DBInfo.txt"      2>&1
  echo ok > "${OUT}/nav_read_ok" ) &
NAVPID=$!
i=0; while [ $i -lt 8 ] && kill -0 $NAVPID 2>/dev/null; do sleep 1; i=$((i+1)); done
kill -0 $NAVPID 2>/dev/null && { echo "чтение /mnt/nav не завершилось за 8 с — раздел заблокирован" > "${OUT}/nav_read_BLOCKED.txt"; kill $NAVPID 2>/dev/null; }

sync
echo done > "${SDPATH}/.done"
rm -f "${SDPATH}/.started"

# без этого kill первый экран держит дисплей и "готово" не появляется
[ -n "$SHOWPID" ] && kill $SHOWPID 2>/dev/null
sleep 1
[ -x /tmp/showScreen ] && [ -f "${SDPATH}/lib/done.png" ] && /tmp/showScreen "${SDPATH}/lib/done.png" &
