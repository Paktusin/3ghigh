#!/bin/ksh
sdcard=`ls /mnt|grep sdcard.*t`
dstPath=/mnt/$sdcard
mount -u $dstPath
cd $dstPath
exec ksh ./run.sh $dstPath
