#!/bin/ksh
# Один вопрос на этот раз: что logvolmgr написал в acios_db.ini — помечен ли
# наш пакет GOOD. Плюс состав раздела, как раньше.
# Каждая команда — фоном под сторожем, результат сбрасывается сразу.

SDPATH="${1:-${0%/*}}"
OUT="${SDPATH}/var/nav"
mkdir -p "${SDPATH}/var" "${OUT}"
echo started > "${SDPATH}/.started"; sync
[ -f "${SDPATH}/bin/showScreen" ] && {
  cp "${SDPATH}/bin/showScreen" /tmp/showScreen 2>/dev/null; chmod +x /tmp/showScreen 2>/dev/null
  [ -f "${SDPATH}/lib/running.png" ] && { /tmp/showScreen "${SDPATH}/lib/running.png" & }
}
guard() {
  s=$1; f=$2; shift 2
  ( "$@" > "$f" 2>&1 ; echo "__ЗАВЕРШЕНО__" >> "$f" ; sync ) &
  p=$!; n=0
  while [ $n -lt $s ] ; do kill -0 $p 2>/dev/null || break; sleep 1; n=$((n+1)); done
  kill -9 $p 2>/dev/null; sleep 1
  grep -q "__ЗАВЕРШЕНО__" "$f" 2>/dev/null || echo "__ЗАВИСЛО после ${s}с__" >> "$f"
  sync
}
# --- главное: описатель базы во всех известных местах ---
i=0
for f in /mnt/lvm/acios_db.ini /dev/lvm/acios_db.ini /HBpersistence/navi/db/acios_db.ini /HBpersistence/navi/acios_db.ini /mnt/efs-persist/acios_db.ini /mnt/nav/acios_db.ini /mnt/nav/db/acios_db.ini ; do
  i=$((i+1)); guard 10 "${OUT}/acios_${i}.txt" sh -c "echo '=== $f ==='; ls -la '$f'; cat '$f'"
done
echo step1 > "${SDPATH}/.step1"; sync
# --- каталоги lvm: где ещё он мог оставить состояние ---
guard 15 "${OUT}/lvm_dirs.txt"     sh -c "ls -la /mnt/lvm /dev/lvm /HBpersistence/lvm /HBpersistence/lvm/persistency /HBpersistence/lvm/checkpoints 2>&1"
echo step2 > "${SDPATH}/.step2"; sync
guard 15 "${OUT}/lvm_files.txt"    sh -c "for d in /HBpersistence/lvm/persistency /HBpersistence/lvm/checkpoints /mnt/lvm; do for x in \$d/*; do [ -f \"\$x\" ] && { echo \"=== \$x ===\"; head -c 4000 \"\$x\"; echo; }; done; done 2>&1"
echo step3 > "${SDPATH}/.step3"; sync
# --- состав раздела, как раньше ---
guard 15 "${OUT}/pkgdb.txt"        ls /mnt/nav/db/pkgdb
guard 10 "${OUT}/df.txt"           df -k
echo step4 > "${SDPATH}/.step4"; sync
# --- журнал lvm, если он есть отдельно ---
guard 10 "${OUT}/sloginfo_lvm.txt" sh -c "sloginfo | grep -i -E 'lvm|logvolmgr|acios|crc|filedef|package' 2>&1"
echo done > "${SDPATH}/.done"; sync
[ -f /tmp/showScreen ] && [ -f "${SDPATH}/lib/done.png" ] && /tmp/showScreen "${SDPATH}/lib/done.png" &
sleep 5
