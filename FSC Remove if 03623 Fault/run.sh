#!/bin/ksh
sdcard=`ls /mnt|grep sdcard.*t`
echo Using card $sdcard
dstPath=/mnt/$sdcard
mount -u $dstPath
echo remounted for full access

$dstPath/utils/showScreen $dstPath/screens/scriptStart.png

rm -f  $dstPath/.done
echo started > $dstPath/.started

mount -uw /mnt/efs-persist

rm -f /mnt/efs-persist/FSC/*.fsc
rm -f /mnt/efs-persist/FSC/cache/*.fsc

echo "DONE." >> $dstPath/patch.log
# END PATCH SECTION

$dstPath/utils/showScreen $dstPath/screens/scriptDone.png

echo done > $dstPath/.done

rm -f  $dstPath/.started
