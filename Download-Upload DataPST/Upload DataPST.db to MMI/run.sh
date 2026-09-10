#!/bin/ksh
sdcard=`ls /mnt|grep sdcard.*t`
echo Using card $sdcard

dstPath=/mnt/$sdcard

mount -u $dstPath
echo remounted for full access

$dstPath/utils/showScreen $dstPath/screens/scriptStart.png

rm -f  $dstPath/.done

echo started > $dstPath/.started


echo Copying fs0 to $dstPath

ls /mnt/ >$dstPath/.listing
# место для ваших комманд

mount -uw /mnt/efs-persist
cp -v $SDPath/read/DataPST.db /mnt/efs-persist

$dstPath/utils/showScreen $dstPath/screens/scriptDone.png

echo done > $dstPath/.done

rm -f  $dstPath/.started
