
/* WARNING: Removing unreachable block (ram,0x08277fe4) */

void target(int param_1,ushort *param_2)

{
  short sVar1;
  ushort uVar2;
  ushort uVar3;
  ushort uVar4;
  byte *pbVar5;
  
  uVar4 = DAT_08278000;
  if ((param_1 != 0) && (param_2 != (ushort *)0x0)) {
    pbVar5 = (byte *)(param_1 + 0x39);
    sVar1 = *(short *)(param_1 + 0x14);
    uVar3 = *param_2 & DAT_08277ffe | ((ushort)((uint)(int)(char)*pbVar5 >> 1) & 3) * 0x200;
    *param_2 = uVar3;
    uVar2 = DAT_08278002;
    *param_2 = uVar3 & uVar4 | ((short)(char)*pbVar5 & 1U) << 8;
    *(undefined1 *)param_2 = *(undefined1 *)(param_1 + 0x3b);
    *param_2 = *param_2 & uVar2;
    param_2 = param_2 + 2;
    if ((((int)sVar1 & 0xffU) << 8 | ((int)sVar1 & 0xff00U) >> 8) < 3) {
      uVar4 = (*(char *)(param_1 + 0x38) * 2 & 0xffU) << 2;
      *param_2 = uVar4;
      *param_2 = uVar4 | *pbVar5 >> 5;
    }
    else {
      *param_2 = *(ushort *)(param_1 + 0x3e) << 8 | *(ushort *)(param_1 + 0x3e) >> 8;
    }
  }
  return;
}


