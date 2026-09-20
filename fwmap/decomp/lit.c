/* ===== FUN_08ccf1bc @ 08ccf1bc ===== */

undefined4 FUN_08ccf1bc(int param_1,undefined4 param_2,undefined4 param_3,undefined4 param_4)

{
  int iVar1;
  undefined4 uVar2;
  
  if (*(short *)(DAT_08ccf222 + param_1) != 0) {
    (*(code *)PTR_FUN_08ccf228)(param_1 + DAT_08ccf224);
    iVar1 = (int)DAT_08ccf226;
    *(undefined2 *)(iVar1 + param_1) = 0;
    *(undefined4 *)(iVar1 + 6 + param_1) = 0;
    uVar2 = (*(code *)PTR_FUN_08ccf22c)(param_1,param_2,param_3,param_4);
    return uVar2;
  }
  return 0;
}



/* ===== FUN_08ccf3a0 @ 08ccf3a0 ===== */

bool FUN_08ccf3a0(uint param_1,uint param_2,undefined4 param_3,int param_4,int param_5)

{
  bool bVar1;
  
  bVar1 = false;
  switch(param_3) {
  case 0:
    bVar1 = (int)param_1 <= param_4 && param_5 <= (int)param_2;
    break;
  case 1:
    if ((param_1 != param_2) || (bVar1 = false, (param_1 & 1) == 0)) {
      bVar1 = param_4 <= (int)(param_2 & 0xfffffffe) && (int)((param_1 & 1) + param_1) <= param_5;
    }
    break;
  case 2:
    if ((param_1 != param_2) || (bVar1 = false, ((param_1 ^ 1) & 1) == 0)) {
      bVar1 = param_4 <= (int)(param_2 | 1) && (int)(param_1 | 1) <= param_5;
    }
    break;
  case 3:
    bVar1 = param_4 <= (int)param_2 && (int)param_1 <= param_5;
  }
  return bVar1;
}



/* ===== FUN_08ccf41c @ 08ccf41c ===== */

bool FUN_08ccf41c(uint param_1,undefined4 param_2,uint param_3,int param_4)

{
  bool bVar1;
  
  bVar1 = false;
  switch(param_2) {
  case 0:
    bVar1 = param_1 == param_3;
    break;
  case 1:
    bVar1 = false;
    if (((int)param_3 <= (int)param_1 && (int)param_1 <= param_4) && (((param_1 ^ 1) & 1) != 0)) {
      bVar1 = true;
    }
    break;
  case 2:
    bVar1 = false;
    if (((int)param_3 <= (int)param_1 && (int)param_1 <= param_4) && ((param_1 & 1) != 0)) {
      bVar1 = true;
    }
    break;
  case 3:
    bVar1 = (int)param_3 <= (int)param_1 && (int)param_1 <= param_4;
  }
  return bVar1;
}



/* ===== FUN_08ccf670 @ 08ccf670 ===== */

void FUN_08ccf670(undefined4 *param_1)

{
  *param_1 = 0;
  *(undefined2 *)(param_1 + 2) = 0;
  param_1[1] = 0;
  *(undefined2 *)(param_1 + 3) = 0xffff;
  *(undefined2 *)((int)param_1 + 10) = 0xffff;
  param_1[4] = 0xffffffff;
  return;
}



/* ===== thunk_FUN_08ccf670 @ 08ccf690 ===== */

void thunk_FUN_08ccf670(void)

{
  (*(code *)PTR_FUN_08ccf698)();
  return;
}



/* ===== FUN_08ccf69c @ 08ccf69c ===== */

void FUN_08ccf69c(int param_1,undefined4 param_2,undefined2 param_3)

{
  *(undefined4 *)(param_1 + 0x14) = param_2;
  *(undefined2 *)(param_1 + 0x18) = param_3;
  return;
}



/* ===== FUN_08ccf780 @ 08ccf780 ===== */

undefined4 FUN_08ccf780(int param_1,int param_2,int param_3,undefined2 param_4,undefined4 param_5)

{
  undefined2 uVar1;
  undefined *puVar2;
  undefined4 uVar3;
  int iVar4;
  int iVar5;
  int iVar6;
  ushort uVar7;
  
  uVar3 = 0xfffffffb;
  if (param_2 != 0 && param_3 != 0) {
    iVar5 = (int)DAT_08ccf834;
    *(undefined2 *)(DAT_08ccf832 + param_1) = 0xffff;
    iVar4 = (int)DAT_08ccf836;
    iVar5 = iVar5 + param_1;
    *(undefined4 *)(iVar5 + 0x30) = 1;
    uVar7 = (ushort)(param_2 == 0 || param_3 == 0);
    *(ushort *)(iVar4 + param_1) = uVar7;
    iVar4 = (int)DAT_08ccf838;
    iVar6 = (int)DAT_08ccf83a;
    *(undefined1 *)(iVar4 + param_1) = 0;
    *(undefined1 *)(iVar4 + 1 + param_1) = 0;
    *(undefined2 *)(iVar4 + 3 + param_1) = 0;
    iVar4 = (int)DAT_08ccf83c;
    *(undefined4 *)(iVar5 + 4) = param_5;
    puVar2 = PTR_FUN_08ccf844;
    *(undefined2 *)(iVar4 + param_1) = 0xffff;
    (*(code *)puVar2)(iVar6 + param_1);
    *(int *)(iVar5 + 0x10) = param_3;
    iVar4 = (int)DAT_08ccf83e;
    *(int *)(iVar5 + 0xc) = param_2;
    *(undefined2 *)(iVar4 + param_1) = param_4;
    uVar1 = *(undefined2 *)(param_2 + 8);
    *(undefined4 *)(iVar5 + 0x2c) = 0;
    *(undefined2 *)(iVar4 + 2 + param_1) = uVar1;
    *(undefined2 *)(iVar4 + 0xc + param_1) = 0xffff;
    *(ushort *)(iVar4 + 0xe + param_1) = uVar7;
    uVar3 = (*(code *)PTR_FUN_08ccf848)
                      (param_1,param_2 + (uint)*(ushort *)(param_2 + 2) * 2,param_3,iVar6 + param_1,
                       DAT_08ccf840 + param_1,0);
  }
  return uVar3;
}



/* ===== FUN_08ccf84c @ 08ccf84c ===== */

/* WARNING: Removing unreachable block (ram,0x08ccf8de) */
/* WARNING: Removing unreachable block (ram,0x08ccf8ac) */
/* WARNING: Removing unreachable block (ram,0x08ccfa02) */

undefined4 FUN_08ccf84c(undefined4 *param_1)

{
  short sVar1;
  undefined4 uVar2;
  int iVar3;
  undefined4 uVar4;
  uint uVar5;
  int iVar6;
  int iVar7;
  int *piVar8;
  short sVar9;
  short *psVar10;
  uint uVar11;
  
  uVar2 = (*(code *)PTR_FUN_08ccf870)();
  sVar9 = DAT_08ccfb1c;
  sVar1 = DAT_08ccfa26;
  switch(uVar2) {
  case 2:
    iVar3 = *(int *)((int)DAT_08ccfa26 + (int)param_1);
    if (iVar3 == 0x5b) {
      if ((*(ushort *)((int)DAT_08ccfa3e + (int)param_1) >> 0xc & 1) == 0) {
        *(ushort *)((int)DAT_08ccfa40 + (int)param_1) = (ushort)param_1[0x28] & 0xff;
      }
      else {
        *(ushort *)((int)DAT_08ccfa40 + (int)param_1) =
             ((ushort)param_1[0x28] & 0xff) + *(short *)((int)DAT_08ccfa40 + (int)param_1);
      }
    }
    else if (iVar3 < 0x5c) {
      if (iVar3 == 0x26) {
        *(undefined4 *)((int)DAT_08ccfa2e + (int)param_1) = param_1[0x28];
      }
      else if (iVar3 < 0x27) {
        if (iVar3 != 0x25) {
          return uVar2;
        }
        *(undefined4 *)((int)DAT_08ccfa32 + (int)param_1) = param_1[0x28];
      }
      else if (iVar3 == 0x29) {
        *(short *)((int)DAT_08ccfa34 + (int)param_1) = (short)param_1[0x28];
      }
      else {
        if (iVar3 != 0x46) {
          return uVar2;
        }
        ((int *)((int)DAT_08ccfa26 + (int)param_1))[7] = param_1[0x28];
      }
    }
    else {
      iVar7 = (int)DAT_08ccfa2e;
      if (iVar3 == iVar7) {
        *(char *)((int)DAT_08ccfa36 + (int)param_1) = (char)param_1[0x28];
      }
      else if (iVar7 < iVar3) {
        if (iVar3 == DAT_08ccfa30) {
          *(char *)((int)DAT_08ccfa3a + (int)param_1) = (char)param_1[0x28];
        }
        else {
          if (iVar3 != DAT_08ccfa30 + 1) {
            return uVar2;
          }
          *(short *)((int)DAT_08ccfa3c + (int)param_1) = (short)param_1[0x28];
        }
      }
      else {
        if (iVar3 != iVar7 + -1) {
          return uVar2;
        }
        *(char *)((int)DAT_08ccfa38 + (int)param_1) = (char)param_1[0x28];
      }
    }
    break;
  case 4:
    uVar11 = (uint)*(short *)((int)DAT_08ccfb1a + (int)param_1);
    if ((int)uVar11 < 0) {
      uVar5 = (uint)param_1[0x28] >> (~uVar11 & 0x1f) + 1;
    }
    else {
      uVar5 = param_1[0x28] << (uVar11 & 0x1f);
    }
    iVar3 = (int)DAT_08ccfb1c;
    *(uint *)((int)param_1 + DAT_08ccfb1c + 0x1c) =
         uVar5 + *(int *)((int)param_1 + DAT_08ccfb1c + 4);
    if ((int)uVar11 < 0) {
      uVar11 = (uint)param_1[0x29] >> (~uVar11 & 0x1f) + 1;
    }
    else {
      uVar11 = param_1[0x29] << (uVar11 & 0x1f);
    }
    *(uint *)((int)param_1 + sVar9 + 0x20) = uVar11 + *(int *)((int)param_1 + iVar3 + 8);
    break;
  case 5:
  case 6:
    if (((*(int *)((int)DAT_08ccfb1e + (int)param_1) == 0x5d) &&
        (((int *)((int)DAT_08ccfb1e + (int)param_1))[0xc] != 0)) &&
       (sVar1 = *(short *)((int)DAT_08ccfb20 + (int)param_1), -1 < sVar1)) {
      iVar3 = (int)DAT_08ccfb22;
      sVar9 = *(short *)(iVar3 + (int)param_1);
      if (sVar9 < sVar1) {
        iVar7 = (int)DAT_08ccfb24;
        do {
          iVar6 = (int)sVar9;
          sVar9 = sVar9 + 1;
          *(undefined1 *)((int)param_1 + iVar7 + iVar6) = 0;
        } while (sVar9 < sVar1);
        *(short *)((int)param_1 + iVar3) = sVar9;
      }
      sVar1 = *(short *)((int)DAT_08ccfb20 + (int)param_1);
      iVar3 = (int)DAT_08ccfb26;
      iVar7 = (int)sVar1;
      *(char *)((int)param_1 + iVar3 + 0x48 + iVar7) = (char)*(undefined2 *)(iVar3 + (int)param_1);
      *(short *)((int)param_1 + (int)DAT_08ccfb28 + iVar7 * 2) =
           (short)param_1[0x2c] - (short)*(undefined4 *)(iVar3 + 0x18 + (int)param_1);
      if (*(short *)((int)DAT_08ccfb22 + (int)param_1) == iVar7) {
        *(short *)((int)DAT_08ccfb22 + (int)param_1) = sVar1 + 1;
      }
    }
    break;
  case 7:
    piVar8 = (int *)((int)DAT_08ccfb1e + (int)param_1);
    if ((*piVar8 == (int)DAT_08ccfb2a) && (piVar8[0xc] != 0)) {
      iVar7 = piVar8[4];
      iVar3 = (int)DAT_08ccfb2c;
      *(undefined2 *)(iVar3 + (int)param_1) = *(undefined2 *)((int)DAT_08ccfb26 + (int)param_1);
      *(short *)(iVar3 + -2 + (int)param_1) = (short)param_1[0x2c] - (short)iVar7;
    }
    break;
  case 0xfffffffc:
    if (*(short *)((int)DAT_08ccfa24 + (int)param_1) != 0) {
      return uVar2;
    }
    iVar3 = DAT_08ccfa24 + 0x28;
    *(short *)(iVar3 + (int)param_1) = *(short *)(iVar3 + (int)param_1) + 1;
    break;
  case 0xfffffffd:
    psVar10 = (short *)((int)DAT_08ccfa24 + (int)param_1);
    if (*psVar10 == 0) {
      if (*(int *)((int)param_1 + DAT_08ccfa26 + 0x30) == 0) {
        sVar9 = *(short *)((int)DAT_08ccfa28 + (int)param_1) + 1;
        *(short *)((int)DAT_08ccfa28 + (int)param_1) = sVar9;
        if (param_1[*psVar10 * 8 + 7] == *(int *)((int)param_1 + sVar1 + 0x2c)) {
          uVar4 = *(undefined4 *)((int)param_1 + sVar1 + 0x10);
          iVar3 = (int)DAT_08ccfa2a;
          *(short *)(iVar3 + (int)param_1) = sVar9;
          *(short *)(iVar3 + 2 + (int)param_1) = (short)*param_1 - (short)uVar4;
          *(undefined4 *)((int)param_1 + sVar1 + 0x24) = param_1[5];
          *(undefined2 *)(iVar3 + 8 + (int)param_1) = *(undefined2 *)(param_1 + 6);
        }
      }
      else {
        *(undefined4 *)((int)param_1 + DAT_08ccfa26 + 0x30) = 0;
        iVar3 = (int)DAT_08ccfa28;
        *(undefined2 *)(iVar3 + (int)param_1) = 0;
        uVar4 = param_1[*psVar10 * 8 + 7];
        *(undefined2 *)(iVar3 + 0x18 + (int)param_1) = 0;
        *(undefined4 *)((int)param_1 + sVar1 + 0x2c) = uVar4;
        *(short *)(iVar3 + 0x1a + (int)param_1) =
             (short)*param_1 - (short)*(undefined4 *)((int)param_1 + sVar1 + 0x10);
        *(undefined4 *)((int)param_1 + sVar1 + 0x24) = param_1[5];
        *(undefined2 *)(iVar3 + 0x20 + (int)param_1) = *(undefined2 *)(param_1 + 6);
      }
    }
    (*(code *)PTR_FUN_08ccfa44)(param_1 + 3,(int)param_1 + (int)DAT_08ccfa2c,6);
    return uVar2;
  case 0xfffffffe:
    if (*(short *)((int)DAT_08ccfa24 + (int)param_1) != 0) {
      return uVar2;
    }
    iVar3 = DAT_08ccfa24 + 0x28;
    *(short *)(iVar3 + (int)param_1) = *(short *)(iVar3 + (int)param_1) + 1;
    return uVar2;
  case 0xffffffff:
  case 0:
  case 1:
  case 3:
    break;
  default:
    goto switchD_08ccf86a_default;
  }
switchD_08ccf86a_default:
  return uVar2;
}



/* ===== FUN_08ccfb30 @ 08ccfb30 ===== */

/* WARNING: Removing unreachable block (ram,0x08ccfb5a) */

void FUN_08ccfb30(undefined4 *param_1)

{
  short sVar1;
  int iVar2;
  undefined4 uVar3;
  
  sVar1 = DAT_08ccfb6c;
  uVar3 = *(undefined4 *)((int)param_1 + DAT_08ccfb6c + 0x10);
  *(undefined2 *)((int)DAT_08ccfb6e + (int)param_1) =
       *(undefined2 *)((int)DAT_08ccfb6a + (int)param_1);
  iVar2 = (int)DAT_08ccfb70;
  *(undefined4 *)((int)param_1 + sVar1 + 0x38) = *(undefined4 *)((int)param_1 + sVar1 + 0x1c);
  *(undefined2 *)(iVar2 + 0x28 + (int)param_1) = *(undefined2 *)(iVar2 + (int)param_1);
  *(short *)(iVar2 + 0x20 + (int)param_1) = (short)*param_1 - (short)uVar3;
  *(short *)(iVar2 + 0x22 + (int)param_1) =
       (short)(param_1[*(short *)(iVar2 + -0x34 + (int)param_1) * 8 + 7] -
               *(int *)((int)param_1 + sVar1 + 0xc) >> 1);
  return;
}



/* ===== FUN_08ccfb74 @ 08ccfb74 ===== */

void FUN_08ccfb74(int param_1,ushort *param_2)

{
  ushort uVar1;
  undefined *puVar2;
  int iVar3;
  int iVar4;
  int iVar5;
  int iVar6;
  ushort *puVar7;
  
  puVar7 = (ushort *)(DAT_08ccfbe4 + param_1);
  if (puVar7 != param_2) {
    (*(code *)PTR_FUN_08ccfbf4)(puVar7,(int)DAT_08ccfbe6);
  }
  iVar3 = (int)DAT_08ccfbec;
  iVar5 = DAT_08ccfbea + param_1;
  iVar6 = *(int *)(iVar5 + 0xc);
  *(undefined2 *)(iVar3 + param_1) = *(undefined2 *)(DAT_08ccfbe8 + param_1);
  *(undefined4 *)(iVar5 + 0x30) = 0;
  *(undefined4 *)(iVar5 + 0x1c) = *(undefined4 *)(iVar5 + 0x38);
  uVar1 = *puVar7;
  *(undefined2 *)(iVar3 + -4 + param_1) = *(undefined2 *)(iVar3 + 0x24 + param_1);
  *(undefined2 *)(iVar3 + -0x10 + param_1) = 0;
  puVar2 = PTR_FUN_08ccfbf8;
  iVar4 = (int)DAT_08ccfbee;
  *(uint *)(iVar5 + 0x2c) = iVar6 + (uint)*(ushort *)(iVar3 + 0x1e + param_1) * 2;
  (*(code *)puVar2)(param_1,*(int *)(iVar5 + 0x10) + (uint)uVar1,param_1 + DAT_08ccfbf0,
                    iVar4 + param_1,0);
  return;
}



/* ===== FUN_08ccfbfc @ 08ccfbfc ===== */

undefined4 FUN_08ccfbfc(int param_1,undefined2 *param_2)

{
  int iVar1;
  undefined1 auStack_20 [12];
  
  if (((((ushort)param_2[1] < *(ushort *)(DAT_08ccfca6 + param_1)) &&
       (iVar1 = DAT_08ccfca8 + param_1, *(int *)(iVar1 + 0x30) == 0)) &&
      (*(int *)(param_1 + 4) != 0)) && (*(int *)(iVar1 + 0x2c) != 0)) {
    (*(code *)PTR_FUN_08ccfcb0)(auStack_20,*(undefined4 *)(iVar1 + 4),*param_2);
    iVar1 = (*(code *)PTR_FUN_08ccfcb4)
                      (param_1,*(undefined4 *)(iVar1 + 0x2c),
                       *(int *)(iVar1 + 0x10) + (uint)(ushort)param_2[1],param_1 + DAT_08ccfcaa,
                       auStack_20,0);
    if (iVar1 < -3) {
      return 0;
    }
    (*(code *)PTR_FUN_08ccfcb8)(param_1,*(undefined4 *)(param_2 + 2),param_2[4]);
    (*(code *)PTR_FUN_08ccfcbc)(param_1 + DAT_08ccfcac,auStack_20,6);
    return 1;
  }
  return 0;
}



/* ===== FUN_08ccfdac @ 08ccfdac ===== */

void FUN_08ccfdac(int param_1,undefined4 param_2)

{
  (*(code *)PTR_FUN_08ccfdc4)(param_2,DAT_08ccfdc0 + param_1);
  return;
}



/* ===== FUN_08ccff80 @ 08ccff80 ===== */

undefined4 FUN_08ccff80(int *param_1,int param_2,int param_3)

{
  undefined4 uVar1;
  int iVar2;
  ushort *puVar3;
  
  iVar2 = *param_1;
  puVar3 = (ushort *)(param_1 + 1);
  if (iVar2 < param_2) {
    uVar1 = 0;
    if (param_2 <= (int)((uint)*puVar3 + iVar2)) {
      if ((int)((uint)*puVar3 + iVar2) < param_2 + param_3) {
        *puVar3 = (short)(param_2 + param_3) - (short)iVar2;
      }
      uVar1 = 1;
    }
  }
  else if (param_2 + param_3 < (int)((uint)*puVar3 + iVar2)) {
    uVar1 = 0;
    if (iVar2 <= param_2 + param_3) {
      *param_1 = param_2;
      uVar1 = 1;
      *puVar3 = ((short)iVar2 - (short)param_2) + *puVar3;
    }
  }
  else {
    *param_1 = param_2;
    uVar1 = 1;
    *puVar3 = (ushort)param_3;
  }
  return uVar1;
}



/* ===== FUN_08ccffce @ 08ccffce ===== */

undefined4 FUN_08ccffce(int *param_1,int *param_2,ushort *param_3)

{
  undefined4 uVar1;
  int iVar2;
  int iVar3;
  int iVar4;
  int iVar5;
  
  iVar5 = *param_2;
  iVar4 = *param_1;
  iVar3 = (uint)*param_3 + iVar5;
  iVar2 = (uint)*(ushort *)(param_1 + 1) + iVar4;
  if ((iVar4 < iVar3) && (iVar5 < iVar2)) {
    uVar1 = 1;
    if (iVar5 < iVar4 || iVar2 < iVar3) {
      if (iVar4 <= iVar5 || iVar2 < iVar3) {
        uVar1 = 0;
        if (iVar5 >= iVar4 && iVar2 < iVar3) {
          *param_2 = iVar2;
          *param_3 = (short)iVar3 - (short)iVar2;
        }
      }
      else {
        uVar1 = 0;
        *param_3 = (short)iVar4 - (short)iVar5;
      }
    }
  }
  else {
    uVar1 = 0;
  }
  return uVar1;
}



/* ===== FUN_08cd00fc @ 08cd00fc ===== */

void FUN_08cd00fc(undefined2 *param_1)

{
  short sVar1;
  int iVar2;
  
  *(undefined2 *)((int)DAT_08cd014a + (int)param_1) = 0;
  iVar2 = (int)DAT_08cd014c;
  param_1[1] = 0xffff;
  *(undefined2 *)(iVar2 + (int)param_1) = 0;
  *(undefined4 *)(param_1 + 2) = 0xffffffff;
  *(undefined2 *)(iVar2 + 2 + (int)param_1) = 0;
  param_1[4] = 0;
  *(undefined1 *)(iVar2 + 0xc + (int)param_1) = 0xff;
  param_1[5] = 0;
  *(undefined1 *)(iVar2 + 0xd + (int)param_1) = 0;
  *(undefined1 *)(param_1 + 6) = 0;
  *(undefined1 *)(iVar2 + 0xe + (int)param_1) = 0;
  sVar1 = DAT_08cd014e;
  *(undefined2 *)(iVar2 + 0x10 + (int)param_1) = 0;
  *(undefined2 *)(iVar2 + 0x12 + (int)param_1) = 0;
  *param_1 = 0xffff;
  *(undefined4 *)((int)param_1 + sVar1 + 0x14) = 0;
  *(undefined4 *)((int)param_1 + sVar1 + 0x18) = 0;
  *(undefined2 *)(iVar2 + 0x14 + (int)param_1) = 0;
  return;
}



/* ===== FUN_08cd039e @ 08cd039e ===== */

/* WARNING: Removing unreachable block (ram,0x08cd03e6) */
/* WARNING: Removing unreachable block (ram,0x08cd03cc) */
/* WARNING: Removing unreachable block (ram,0x08cd03f2) */

undefined4 FUN_08cd039e(uint param_1,byte *param_2)

{
  byte bVar1;
  undefined4 uVar2;
  
  uVar2 = 0;
  if (param_2 != (byte *)0x0) {
    if (param_1 < 0x80) {
      *param_2 = (byte)param_1;
      param_2[1] = 0;
      uVar2 = 1;
    }
    else {
      bVar1 = (byte)param_1 & 0x3f;
      if ((uint)(int)DAT_08cd040c < param_1) {
        *param_2 = (byte)(param_1 >> 0xc) | 0xe0;
        param_2[1] = (byte)(param_1 >> 6) & 0x3f | 0x80;
        param_2[2] = bVar1 | 0x80;
        param_2[3] = 0;
        uVar2 = 3;
      }
      else {
        *param_2 = (byte)(param_1 >> 6) | 0xc0;
        param_2[1] = bVar1 | 0x80;
        param_2[2] = 0;
        uVar2 = 2;
      }
    }
  }
  return uVar2;
}



/* ===== FUN_08cd0580 @ 08cd0580 ===== */

uint FUN_08cd0580(uint param_1)

{
  uint uVar1;
  
  uVar1 = param_1 - 0x20 & 0xffff;
  if (0x19 < (param_1 - 0x61 & 0xffff) && 0x1f < ((int)DAT_08cd05aa + param_1 & 0xffff)) {
    uVar1 = param_1;
  }
  return uVar1;
}



/* ===== FUN_08cd066c @ 08cd066c ===== */

void FUN_08cd066c(undefined4 *param_1,undefined4 param_2)

{
  *(undefined2 *)(param_1 + 2) = 0;
  param_1[1] = 0;
  *(undefined2 *)((int)param_1 + 10) = 0;
  *(undefined2 *)(param_1 + 3) = 0;
  *(undefined2 *)((int)param_1 + 0xe) = 0;
  param_1[5] = 0;
  param_1[6] = 0;
  *param_1 = param_2;
  *(undefined2 *)(param_1 + 7) = 0xffff;
  *(undefined2 *)((int)param_1 + 0x1e) = 0xffff;
  return;
}



/* ===== FUN_08cd0698 @ 08cd0698 ===== */

void FUN_08cd0698(undefined4 *param_1)

{
  undefined *puVar1;
  undefined4 *puVar2;
  int iVar3;
  
  puVar1 = PTR_FUN_08cd0704;
  iVar3 = 3;
  (*(code *)PTR_FUN_08cd0704)(param_1 + 3);
  (*(code *)puVar1)(param_1 + 5);
  puVar2 = param_1 + 7;
  do {
    iVar3 = iVar3 + -1;
    (*(code *)PTR_FUN_08cd0708)(puVar2);
    puVar2 = puVar2 + 8;
  } while (iVar3 != -1);
  (*(code *)puVar1)((int)param_1 + (int)DAT_08cd06fe);
  param_1[0x28] = 0;
  param_1[0x29] = 0;
  param_1[0x2c] = 0;
  param_1[0x2e] = 0;
  iVar3 = (int)DAT_08cd0700;
  *(undefined2 *)(iVar3 + (int)param_1) = 0;
  *(undefined2 *)(iVar3 + 2 + (int)param_1) = 0;
  *(undefined2 *)(iVar3 + 0x18 + (int)param_1) = 0;
  *param_1 = 0;
  param_1[1] = 0;
  param_1[2] = 0;
  *(undefined4 *)(iVar3 + 0x20 + (int)param_1) = 0;
  return;
}



/* ===== FUN_08cd070c @ 08cd070c ===== */

undefined4
FUN_08cd070c(int *param_1,short *param_2,int param_3,int param_4,undefined4 param_5,int param_6)

{
  undefined *puVar1;
  undefined4 uVar2;
  
  *(undefined2 *)((int)DAT_08cd0788 + (int)param_1) = 0;
  puVar1 = PTR_FUN_08cd078c;
  param_1[1] = param_4;
  (*(code *)puVar1)(param_1 + 3,param_5,6);
  param_1[2] = 0;
  puVar1 = PTR_FUN_08cd0790;
  *param_1 = param_3;
  (*(code *)puVar1)(param_1 + 7,param_2);
  param_1[0xb] = param_6;
  (*(code *)PTR_FUN_08cd0794)((int)param_1 + (int)DAT_08cd078a);
  if ((((param_4 == 0) || (param_2 == (short *)0x0 || *(short *)(param_4 + 10) < 10)) ||
      (param_3 == 0)) || (uVar2 = 1, *param_2 != 0x10)) {
    param_1[1] = 0;
    uVar2 = 0xfffffffb;
  }
  return uVar2;
}



/* ===== FUN_08cd0798 @ 08cd0798 ===== */

/* WARNING: Removing unreachable block (ram,0x08cd0dd2) */
/* WARNING: Removing unreachable block (ram,0x08cd0fbe) */
/* WARNING: Removing unreachable block (ram,0x08cd1182) */
/* WARNING: Removing unreachable block (ram,0x08cd1176) */
/* WARNING: Removing unreachable block (ram,0x08cd1166) */
/* WARNING: Removing unreachable block (ram,0x08cd07f0) */
/* WARNING: Removing unreachable block (ram,0x08cd082e) */
/* WARNING: Removing unreachable block (ram,0x08cd131c) */
/* WARNING: Removing unreachable block (ram,0x08cd1224) */
/* WARNING: Removing unreachable block (ram,0x08cd11f8) */
/* WARNING: Removing unreachable block (ram,0x08cd11ca) */
/* WARNING: Removing unreachable block (ram,0x08cd0a2c) */
/* WARNING: Removing unreachable block (ram,0x08cd0a42) */
/* WARNING: Removing unreachable block (ram,0x08cd128c) */
/* WARNING: Removing unreachable block (ram,0x08cd1304) */
/* WARNING: Removing unreachable block (ram,0x08cd1370) */
/* WARNING: Removing unreachable block (ram,0x08cd1346) */
/* WARNING: Removing unreachable block (ram,0x08cd12c8) */
/* WARNING: Removing unreachable block (ram,0x08cd1250) */
/* WARNING: Removing unreachable block (ram,0x08cd1308) */
/* WARNING: Removing unreachable block (ram,0x08cd132e) */
/* WARNING: Removing unreachable block (ram,0x08cd138e) */

int FUN_08cd0798(undefined4 *param_1)

{
  ushort uVar1;
  ushort uVar2;
  ushort uVar3;
  short sVar4;
  uint uVar5;
  undefined *puVar6;
  int iVar7;
  byte bVar8;
  short sVar9;
  uint uVar10;
  byte bVar11;
  ushort *puVar12;
  uint uVar13;
  short *psVar14;
  uint uVar15;
  bool bVar16;
  int *piVar17;
  int iVar18;
  byte *pbVar19;
  byte *pbVar20;
  byte *pbVar21;
  byte *pbVar22;
  ushort *puVar23;
  int *piVar24;
  uint local_34;
  uint local_28;
  uint local_24;
  code *pcVar25;
  
  pcVar25 = FUN_08cd0798;
  piVar24 = (int *)param_1[1];
  pbVar19 = (byte *)*param_1;
  if (piVar24 == (int *)0x0 || pbVar19 == (byte *)0x0) {
    return -5;
  }
  sVar4 = *(short *)((int)DAT_08cd091e + (int)param_1);
  puVar23 = (ushort *)param_1[sVar4 * 8 + 7];
  do {
    puVar6 = PTR_FUN_08cd11a4;
    uVar5 = DAT_08cd0f84;
    uVar13 = DAT_08cd0dbc;
    uVar10 = DAT_08cd0c28;
    local_34 = 0;
    uVar1 = *puVar23;
    puVar12 = puVar23;
    if (-1 < (short)uVar1) {
      uVar2 = puVar23[1];
      local_28 = (uint)puVar23[2];
      local_24 = (uint)puVar23[3];
      if ((uVar1 >> 0xb & 1) != 0) {
        bVar16 = false;
        if ((((uint)param_1[sVar4 * 8 + 8] >> 0x10 & (int)(short)puVar23[6]) == (uint)puVar23[8]) &&
           ((param_1[sVar4 * 8 + 8] & (uint)puVar23[7]) == (uint)puVar23[9])) {
          bVar16 = true;
        }
        if ((uVar1 >> 10 & 1) != 0) {
          bVar16 = (bool)(bVar16 ^ 1);
        }
        if (!bVar16) goto LAB_08cd13b2;
      }
      uVar15 = (int)(short)uVar1 & 0xff;
      iVar18 = -5;
      if (uVar15 == 0x43) {
        param_1[0x2c] = pbVar19;
        puVar23 = (ushort *)((int)param_1 + sVar4 * 0x20 + 0x2a);
        *(ushort *)((int)DAT_08cd0f7a + (int)param_1) = *puVar23;
        if ((byte *)(piVar24[1] + (uint)*(ushort *)(piVar24 + 2)) < pbVar19 + *puVar23) {
          pbVar19 = (byte *)*param_1;
        }
        else {
          iVar18 = 5;
          pbVar19 = pbVar19 + *puVar23;
        }
      }
      else if (uVar15 < 0x44) {
        if (uVar15 == 0x25) {
          pbVar20 = pbVar19 + 1;
          uVar13 = (uint)*pbVar19;
          uVar10 = (uint)DAT_08cd0c1c;
          if (uVar13 == uVar10) {
            bVar11 = *pbVar20;
            pbVar20 = pbVar19 + 4;
            uVar13 = (uint)CONCAT21(CONCAT11(bVar11,pbVar19[2]),pbVar19[3]);
          }
          else if (uVar10 < uVar13) {
            if (uVar13 == (int)DAT_08cd0c1e) {
              bVar11 = *pbVar20;
              pbVar20 = pbVar19 + 5;
              uVar13 = CONCAT31(CONCAT21(CONCAT11(bVar11,pbVar19[2]),pbVar19[3]),pbVar19[4]);
            }
          }
          else if (uVar13 == uVar10 - 1) {
            bVar11 = *pbVar20;
            pbVar20 = pbVar19 + 3;
            uVar13 = (uint)CONCAT11(bVar11,pbVar19[2]);
          }
          param_1[0x28] = uVar13;
          iVar18 = 2;
          local_34 = 0xffffffff;
          pbVar19 = pbVar20;
        }
        else if (uVar15 < 0x26) {
          if (uVar15 == 0x21) {
            iVar18 = 2;
            param_1[0x28] = (int)(char)*pbVar19;
            local_34 = (uint)DAT_08cd0c1a;
            pbVar19 = pbVar19 + 1;
          }
          else if (uVar15 < 0x22) {
            if (uVar15 == 0x11) {
              sVar9 = *(short *)(param_1 + sVar4 * 8 + 0xe);
              if (((sVar9 < 0) || ((int)(uint)*(ushort *)(param_1 + sVar4 * 8 + 10) <= sVar9 + 1))
                 || (puVar12 = (ushort *)param_1[sVar4 * 8 + 0xc], puVar12 == (ushort *)0x0)) {
                uVar3 = puVar23[4];
                if (uVar3 == 0) {
                  sVar9 = *(short *)((int)DAT_08cd0c18 + (int)param_1);
                  iVar18 = -4;
                  puVar12 = puVar23;
                  if (0 < sVar9) {
                    iVar18 = 0;
                    *(short *)((int)DAT_08cd0c18 + (int)param_1) = sVar9 + -1;
                  }
                }
                else {
                  iVar18 = -5;
                  puVar12 = puVar23;
                  if (uVar3 < *(ushort *)(*piVar24 + 10)) {
                    param_1[2] = 0;
                    iVar18 = -3;
                    puVar12 = (ushort *)
                              (*piVar24 + (uint)puVar23[4] * 2 + *(short *)((int)piVar24 + 10) * -2)
                    ;
                    (*(code *)PTR_FUN_08cd0c20)(param_1 + sVar4 * 8 + 7,puVar12);
                  }
                }
              }
              else {
                *(short *)(param_1 + sVar4 * 8 + 0xe) = sVar9 + 1;
                iVar18 = -2;
              }
            }
            else if (uVar15 < 0x12) {
              if (uVar15 == 0x10) {
                uVar10 = (uint)puVar23[2];
                if (uVar10 == 0) {
                  local_28 = 0;
                  param_1[0x28] = 0;
                  iVar18 = 1;
                }
                else {
                  local_28 = 0x52;
                  param_1[0x28] = uVar10;
                  iVar18 = 2;
                  local_34 = 0xffffffff;
                }
                if (param_1[2] != 0) {
                  sVar9 = *(short *)((int)piVar24 + 10);
                  uVar3 = puVar23[sVar9];
                  while ((uVar3 >> 0xe & 1) != 0) {
                    puVar23 = puVar23 + sVar9;
                    uVar3 = puVar23[sVar9];
                  }
                  param_1[2] = 0;
                }
                *(undefined2 *)(param_1 + sVar4 * 8 + 0xe) = 0xffff;
                *(undefined2 *)((int)param_1 + sVar4 * 0x20 + 0x3a) = 0xffff;
                *(undefined2 *)(param_1 + sVar4 * 8 + 10) = 0;
                param_1[sVar4 * 8 + 0xc] = 0;
                param_1[sVar4 * 8 + 0xd] = 0;
                puVar12 = puVar23;
              }
              else {
                iVar18 = -5;
              }
            }
            else if (uVar15 == 0x20) {
              iVar18 = (int)(char)*pbVar19;
              pbVar20 = pbVar19 + 1;
              if (iVar18 == -0x7d) {
                bVar11 = *pbVar20;
                pbVar20 = pbVar19 + 4;
                iVar18 = (int)CONCAT21(CONCAT11(bVar11,pbVar19[2]),pbVar19[3]);
              }
              else if (iVar18 < -0x7c) {
                if (iVar18 == -0x7e) {
                  bVar11 = *pbVar20;
                  pbVar20 = pbVar19 + 5;
                  iVar18 = CONCAT31(CONCAT21(CONCAT11(bVar11,pbVar19[2]),pbVar19[3]),pbVar19[4]);
                }
              }
              else if (iVar18 == -0x7c) {
                bVar11 = *pbVar20;
                pbVar20 = pbVar19 + 3;
                iVar18 = (int)CONCAT11(bVar11,pbVar19[2]);
              }
              param_1[0x28] = iVar18;
              iVar18 = 2;
              local_34 = 0xffffffff;
              pbVar19 = pbVar20;
            }
            else {
              iVar18 = -5;
            }
          }
          else if (uVar15 == 0x23) {
            bVar11 = *pbVar19;
            pbVar20 = pbVar19 + 1;
            pbVar21 = pbVar19 + 2;
            iVar18 = 2;
            pbVar19 = pbVar19 + 3;
            param_1[0x28] = (int)CONCAT21(CONCAT11(bVar11,*pbVar20),*pbVar21);
            local_34 = uVar10;
          }
          else if (uVar15 < 0x24) {
            bVar11 = *pbVar19;
            pbVar20 = pbVar19 + 1;
            iVar18 = 2;
            pbVar19 = pbVar19 + 2;
            param_1[0x28] = (int)CONCAT11(bVar11,*pbVar20);
            local_34 = DAT_08cd0c24;
          }
          else {
            bVar11 = *pbVar19;
            pbVar20 = pbVar19 + 1;
            pbVar21 = pbVar19 + 2;
            iVar18 = 2;
            pbVar22 = pbVar19 + 3;
            pbVar19 = pbVar19 + 4;
            param_1[0x28] = CONCAT31(CONCAT21(CONCAT11(bVar11,*pbVar20),*pbVar21),*pbVar22);
            local_34 = 0xffffffff;
          }
        }
        else if (uVar15 == 0x29) {
          bVar11 = *pbVar19;
          pbVar20 = pbVar19 + 1;
          pbVar21 = pbVar19 + 2;
          iVar18 = 2;
          pbVar22 = pbVar19 + 3;
          pbVar19 = pbVar19 + 4;
          param_1[0x28] = CONCAT31(CONCAT21(CONCAT11(bVar11,*pbVar20),*pbVar21),*pbVar22);
          local_34 = 0xffffffff;
        }
        else if (uVar15 < 0x2a) {
          if (uVar15 == 0x27) {
            bVar11 = *pbVar19;
            pbVar20 = pbVar19 + 1;
            iVar18 = 2;
            pbVar19 = pbVar19 + 2;
            param_1[0x28] = (uint)CONCAT11(bVar11,*pbVar20);
            local_34 = DAT_08cd0db8;
          }
          else if (uVar15 < 0x28) {
            bVar11 = *pbVar19;
            pbVar19 = pbVar19 + 1;
            iVar18 = 2;
            param_1[0x28] = (uint)bVar11;
            local_34 = (uint)DAT_08cd0db6;
          }
          else {
            bVar11 = *pbVar19;
            pbVar20 = pbVar19 + 1;
            pbVar21 = pbVar19 + 2;
            iVar18 = 2;
            pbVar19 = pbVar19 + 3;
            param_1[0x28] = (uint)CONCAT21(CONCAT11(bVar11,*pbVar20),*pbVar21);
            local_34 = uVar13;
          }
        }
        else if (uVar15 == 0x41) {
          bVar11 = *pbVar19;
          pbVar20 = pbVar19 + 1;
          uVar10 = (uint)bVar11;
          if (bVar11 == 0xff) {
            param_1[5] = 0xffffffff;
            *(undefined2 *)(param_1 + 6) = 0xffff;
          }
          else if ((char)bVar11 < '\0') {
            uVar13 = uVar10 & 0x60;
            if (uVar13 == 0x40) {
              bVar8 = *pbVar20;
              pbVar20 = pbVar19 + 2;
              uVar13 = (uVar10 & 0xf) << 8 | (uint)bVar8;
              if ((uVar10 & 0xf) >> 3 != 0) {
                uVar13 = uVar13 | (int)DAT_08cd0f76;
              }
              param_1[5] = param_1[5] + uVar13;
LAB_08cd0e2c:
              uVar10 = (uint)(bVar11 >> 2);
              bVar11 = *pbVar20;
              pbVar20 = pbVar20 + 1;
            }
            else {
              if (uVar13 < 0x41) {
                if ((bVar11 & 0x60) == 0) {
                  param_1[5] = param_1[5] + (uVar10 & 0xf);
                }
                else {
                  if (uVar13 != 0x20) {
                    uVar10 = (uint)(bVar11 >> 2);
                    bVar11 = *pbVar20;
                    pbVar20 = pbVar19 + 2;
                    goto LAB_08cd0e2e;
                  }
                  param_1[5] = param_1[5] - (uVar10 & 0xf);
                }
                goto LAB_08cd0e2c;
              }
              if (uVar13 == 0x60) {
                uVar10 = uVar10 & 0xf;
                if (uVar10 == 0xd) {
                  bVar8 = *pbVar20;
                  pbVar20 = pbVar19 + 2;
                  param_1[5] = param_1[3] + (int)(char)bVar8;
                }
                else if (uVar10 < 0xe) {
                  if (uVar10 != 0xc) {
                    bVar8 = *pbVar20;
                    goto LAB_08cd0e1c;
                  }
                  param_1[5] = param_1[3];
                }
                else if (uVar10 == 0xe) {
                  pbVar20 = pbVar19 + 4;
                }
                else {
                  bVar8 = *pbVar20;
LAB_08cd0e1c:
                  pbVar20 = pbVar19 + 3;
                  param_1[5] = uVar10 << 0x10 | (uint)CONCAT11(bVar8,pbVar19[2]);
                }
                goto LAB_08cd0e2c;
              }
              uVar10 = (uint)(bVar11 >> 2);
              bVar11 = *pbVar20;
              pbVar20 = pbVar19 + 2;
            }
LAB_08cd0e2e:
            psVar14 = (short *)(param_1 + 6);
            if (((uVar10 >> 2 ^ 1) & 1) == 0) {
              bVar8 = *pbVar20;
              pbVar20 = pbVar20 + 1;
              *psVar14 = CONCAT11(bVar11,bVar8);
            }
            else {
              *psVar14 = *psVar14 + (short)(char)bVar11;
            }
          }
          else {
            *(ushort *)(param_1 + 6) = (ushort)bVar11 + *(short *)(param_1 + 6);
          }
          iVar18 = 3;
          (*(code *)PTR_FUN_08cd0f80)((int)param_1 + (int)DAT_08cd0f78,param_1 + 5,6);
          pbVar19 = pbVar20;
        }
        else if (uVar15 < 0x42) {
          if (uVar15 == 0x40) {
            sVar9 = (short)piVar24[3];
            if (sVar9 == 0xc) {
              bVar11 = *pbVar19;
              pbVar20 = pbVar19 + 1;
              pbVar21 = pbVar19 + 2;
              pbVar19 = pbVar19 + 3;
              uVar13 = (uint)bVar11 + (*pbVar21 & 0xf) * 0x100;
              uVar10 = (uint)*pbVar20 + (uint)(*pbVar21 >> 4) * 0x100;
            }
            else if (sVar9 < 0xd) {
              if (sVar9 == 8) {
                pbVar20 = pbVar19 + 1;
                uVar13 = (uint)*pbVar19;
                pbVar19 = pbVar19 + 2;
                uVar10 = (uint)*pbVar20;
              }
              else {
                uVar13 = 0;
                uVar10 = 0;
              }
            }
            else if (sVar9 == 0x10) {
              pbVar20 = pbVar19 + 2;
              uVar13 = (uint)CONCAT11(*pbVar19,pbVar19[1]);
              pbVar21 = pbVar19 + 3;
              pbVar19 = pbVar19 + 4;
              uVar10 = (uint)CONCAT11(*pbVar20,*pbVar21);
            }
            else if (sVar9 == 0x18) {
              pbVar20 = pbVar19 + 3;
              uVar13 = (uint)CONCAT21(CONCAT11(*pbVar19,pbVar19[1]),pbVar19[2]);
              pbVar21 = pbVar19 + 4;
              pbVar22 = pbVar19 + 5;
              pbVar19 = pbVar19 + 6;
              uVar10 = (uint)CONCAT21(CONCAT11(*pbVar20,*pbVar21),*pbVar22);
            }
            else {
              uVar13 = 0;
              uVar10 = 0;
            }
            param_1[0x28] = uVar13;
            iVar18 = 4;
            param_1[0x29] = uVar10;
          }
          else {
            iVar18 = -5;
          }
        }
        else {
          param_1[0x2c] = pbVar19;
          puVar23 = (ushort *)((int)param_1 + sVar4 * 0x20 + 0x26);
          iVar18 = 7;
          *(ushort *)((int)DAT_08cd0f7a + (int)param_1) = *puVar23;
          pbVar19 = pbVar19 + *puVar23;
        }
      }
      else if (uVar15 == (int)DAT_08cd0a6c) {
        iVar18 = 2;
        param_1[0x28] = CONCAT22(puVar23[4],puVar23[5]);
        local_34 = 0xffffffff;
      }
      else if ((int)DAT_08cd0a6c < (int)uVar15) {
        uVar10 = (uint)DAT_08cd0a6e;
        if (uVar15 == uVar10) {
          iVar7 = (int)DAT_08cd113e;
          param_1[0x2c] = pbVar19;
          *(undefined2 *)(iVar7 + (int)param_1) = 0;
          if (*(short *)(param_1 + sVar4 * 8 + 10) == 0) {
            uVar10 = (uint)*(ushort *)(*piVar24 + 10);
            iVar18 = (int)*(short *)((int)piVar24 + 10);
            if ((char)puVar23[iVar18] != '\x11' && uVar10 != 0) {
              do {
                puVar23 = puVar23 + iVar18;
                uVar10 = uVar10 - iVar18;
              } while ((char)puVar23[iVar18] != '\x11' && 0 < (int)uVar10);
            }
            iVar18 = 1;
            local_28 = 0;
            local_24 = 0;
            puVar12 = puVar23;
          }
          else if (*(short *)(param_1 + sVar4 * 8 + 0xe) < 0) {
            *(short *)(param_1 + sVar4 * 8 + 0xe) = 0;
            iVar18 = -2;
            param_1[sVar4 * 8 + 0xc] = puVar23;
          }
        }
        else if ((int)uVar10 < (int)uVar15) {
          if ((int)DAT_08cd0a70 < (int)uVar15) {
            if (uVar15 != (int)DAT_08cd0a74) {
              iVar18 = -5;
            }
          }
          else if ((int)uVar15 < (int)DAT_08cd0a72) {
            if (uVar15 == (int)DAT_08cd0a72 - 1U) {
              uVar10 = (uint)puVar23[4];
              if ((uVar10 == 0) || (iVar7 = *piVar24, *(ushort *)(iVar7 + 10) <= uVar10)) {
                iVar18 = -5;
              }
              else {
                sVar9 = *(short *)((int)piVar24 + 10);
                iVar18 = 1;
                param_1[2] = 1;
                puVar12 = (ushort *)(uVar10 * 2 + iVar7 + sVar9 * -2);
              }
            }
            else {
              iVar18 = -5;
            }
          }
          else {
            uVar10 = (uint)puVar23[4];
            if (((uVar10 == 0) || (*(ushort *)(*piVar24 + 10) <= uVar10)) ||
               (*(short *)(uVar10 * 2 + *piVar24) != 0x10)) {
              iVar18 = -5;
            }
            else {
              psVar14 = (short *)((int)DAT_08cd11a2 + (int)param_1);
              if (*psVar14 < 3) {
                uVar10 = (uint)puVar23[5];
                if (uVar15 == (int)DAT_08cd0a70) {
                  uVar13 = -(uint)(puVar23[5] >> 8);
                  if ((int)uVar13 < 0) {
                    uVar13 = (uint)param_1[sVar4 * 8 + 8] >> (~uVar13 & 0x1f) + 1;
                  }
                  else {
                    uVar13 = param_1[sVar4 * 8 + 8] << (uVar13 & 0x1f);
                  }
                  uVar10 = uVar13 & (1 << (uVar10 & 0x1f)) - 1U;
                }
                sVar9 = *psVar14 + 1;
                *psVar14 = sVar9;
                (*(code *)puVar6)(param_1 + sVar9 * 8 + 7,pcVar25);
                param_1[*psVar14 * 8 + 0xb] = uVar10;
                iVar18 = -1;
              }
            }
          }
        }
        else if (uVar15 == uVar10 - 2) {
          iVar18 = (int)DAT_08cd113e;
          param_1[0x2c] = pbVar19;
          *(undefined2 *)(iVar18 + (int)param_1) = 0;
          iVar18 = 1;
          if (*(short *)(param_1 + sVar4 * 8 + 9) == 0) {
            uVar10 = (uint)*(ushort *)(*piVar24 + 10);
            do {
              puVar23 = puVar23 + *(short *)((int)piVar24 + 10);
              uVar10 = uVar10 - (int)*(short *)((int)piVar24 + 10);
            } while ((*puVar23 & 0xff) != DAT_08cd1140 && 0 < (int)uVar10);
            if ((int)uVar10 < 0) {
              iVar18 = -5;
            }
            local_28 = 0;
            local_24 = 0;
            puVar12 = puVar23;
          }
          else {
            psVar14 = (short *)((int)param_1 + sVar4 * 0x20 + 0x3a);
            if (*psVar14 < 0) {
              *psVar14 = 0;
              param_1[sVar4 * 8 + 0xd] = puVar23;
            }
            else {
              iVar18 = -5;
            }
          }
        }
        else if ((int)(uVar10 - 2) < (int)uVar15) {
          uVar3 = *(ushort *)(param_1 + sVar4 * 8 + 9);
          iVar18 = 1;
          if (uVar3 != 0) {
            psVar14 = (short *)((int)param_1 + sVar4 * 0x20 + 0x3a);
            if (-1 < *psVar14) {
              puVar12 = (ushort *)param_1[sVar4 * 8 + 0xd];
              sVar9 = *psVar14 + 1;
              if (puVar12 != (ushort *)0x0) {
                *psVar14 = sVar9;
                if ((int)(uint)uVar3 <= (int)sVar9) {
                  *psVar14 = -1;
                  puVar12 = puVar23;
                }
                goto LAB_08cd118c;
              }
            }
          }
          iVar18 = -5;
          puVar12 = puVar23;
        }
        else if (uVar15 == uVar10 - 0x21) {
          local_34 = 0xffffffff;
          if (puVar23[5] < 0x20) {
            local_34 = (1 << (puVar23[5] & 0x1f)) - 1;
          }
          uVar10 = -(uint)puVar23[4];
          if ((int)uVar10 < 0) {
            uVar10 = (uint)param_1[sVar4 * 8 + 8] >> (~uVar10 & 0x1f) + 1;
          }
          else {
            uVar10 = param_1[sVar4 * 8 + 8] << (uVar10 & 0x1f);
          }
          iVar18 = 2;
          param_1[0x28] = uVar10 & local_34;
        }
        else {
          iVar18 = -5;
        }
      }
      else if (uVar15 == 0x62) {
        param_1[0x28] = param_1[sVar4 * 8 + 0xb];
        iVar18 = 2;
        local_34 = 0xffffffff;
      }
      else if (uVar15 < 99) {
        if (uVar15 == 0x60) {
          iVar18 = 2;
          param_1[0x28] = param_1[sVar4 * 8 + 0xb] & 0xff;
          local_34 = (uint)DAT_08cd0f7c;
        }
        else if (uVar15 < 0x61) {
          if (uVar15 == 0x44) {
            param_1[0x2c] = pbVar19;
            puVar23 = (ushort *)((int)param_1 + sVar4 * 0x20 + 0x2a);
            *(ushort *)((int)DAT_08cd0f7a + (int)param_1) = *puVar23;
            pbVar19 = pbVar19 + *puVar23;
            iVar18 = 6;
            if ((byte *)(piVar24[1] + (uint)*(ushort *)(piVar24 + 2)) < pbVar19) {
              pbVar19 = (byte *)*param_1;
              iVar18 = -5;
            }
          }
          else {
            iVar18 = -5;
          }
        }
        else {
          iVar18 = 2;
          param_1[0x28] = param_1[sVar4 * 8 + 0xb] & 0xffff;
          local_34 = DAT_08cd0f84;
        }
      }
      else if (uVar15 == 100) {
        param_1[0x28] = (int)*(short *)((int)param_1 + sVar4 * 0x20 + 0x3a);
        iVar18 = 2;
        local_34 = uVar5;
      }
      else if (uVar15 < 100) {
        param_1[0x28] = (int)*(short *)(param_1 + sVar4 * 8 + 0xe);
        iVar18 = 2;
        local_34 = uVar5;
      }
      else if (uVar15 == 0x65) {
        (*(code *)PTR_FUN_08cd0f80)((int)param_1 + (int)DAT_08cd0f78,param_1 + 3,6);
        puVar23 = (ushort *)((int)DAT_08cd0f7e + (int)param_1);
        uVar3 = *puVar23;
        *puVar23 = uVar3 + 1;
        if (*(short *)(param_1 + sVar4 * 8 + 10) != 0) {
          *puVar23 = uVar3 + 1 + *(short *)(param_1 + sVar4 * 8 + 10);
        }
        if (piVar24[4] <= (int)(uint)*puVar23) {
          param_1[0x2a] = param_1[0x2a] + 1;
          *puVar23 = 0;
        }
        iVar18 = 3;
      }
      else {
        iVar18 = -5;
      }
LAB_08cd118c:
      switch(uVar2) {
      case 1:
        if (iVar18 == 2) {
          psVar14 = (short *)(param_1 + sVar4 * 8 + 9);
          if ((uVar1 >> 0xc & 1) == 0) {
            *psVar14 = (short)param_1[0x28];
          }
          else {
            *psVar14 = (short)param_1[0x28] + *psVar14;
          }
        }
        break;
      case 2:
        if (iVar18 == 2) {
          psVar14 = (short *)((int)param_1 + sVar4 * 0x20 + 0x26);
          if ((uVar1 >> 0xc & 1) != 0) {
            *psVar14 = (short)param_1[0x28] + *psVar14;
            goto switchD_08cd119e_caseD_0;
          }
          *psVar14 = (short)param_1[0x28];
        }
        break;
      case 3:
        if (iVar18 == 2) {
          piVar17 = piVar24 + 3;
          if ((uVar1 >> 0xc & 1) != 0) {
            *(short *)piVar17 = (short)param_1[0x28] + (short)*piVar17;
            goto switchD_08cd119e_caseD_0;
          }
          *(short *)piVar17 = (short)param_1[0x28];
        }
        break;
      case 4:
        if (iVar18 == 2) {
          uVar10 = param_1[sVar4 * 8 + 8];
          if ((uVar1 >> 0xc & 1) != 0) {
            param_1[sVar4 * 8 + 8] = ~local_34 & uVar10 | uVar10 + param_1[0x28] & local_34;
            goto switchD_08cd119e_caseD_0;
          }
          param_1[sVar4 * 8 + 8] = uVar10 & ~local_34 | param_1[0x28] & local_34;
        }
        break;
      case 5:
        if (iVar18 == 2) {
          uVar10 = param_1[sVar4 * 8 + 8];
          uVar13 = ~(local_34 << 8);
          if ((uVar1 >> 0xc & 1) == 0) {
            param_1[sVar4 * 8 + 8] = uVar10 & uVar13 | (param_1[0x28] & local_34) << 8;
          }
          else {
            param_1[sVar4 * 8 + 8] =
                 uVar13 & uVar10 | uVar10 + param_1[0x28] * 0x100 & local_34 << 8;
          }
          goto switchD_08cd119e_caseD_0;
        }
        break;
      case 6:
        if (iVar18 == 2) {
          uVar10 = param_1[sVar4 * 8 + 8];
          uVar13 = ~(local_34 << 0x10);
          if ((uVar1 >> 0xc & 1) == 0) {
            param_1[sVar4 * 8 + 8] = uVar10 & uVar13 | (param_1[0x28] & local_34) << 0x10;
          }
          else {
            param_1[sVar4 * 8 + 8] =
                 uVar13 & uVar10 | uVar10 + param_1[0x28] * 0x10000 & local_34 << 0x10;
          }
          goto switchD_08cd119e_caseD_0;
        }
        break;
      case 7:
        if (iVar18 == 2) {
          uVar10 = param_1[sVar4 * 8 + 8];
          uVar13 = ~(local_34 << 0x18);
          if ((uVar1 >> 0xc & 1) == 0) {
            param_1[sVar4 * 8 + 8] = uVar10 & uVar13 | (param_1[0x28] & local_34) << 0x18;
          }
          else {
            param_1[sVar4 * 8 + 8] =
                 uVar13 & uVar10 | uVar10 + param_1[0x28] * 0x1000000 & local_34 << 0x18;
          }
          goto switchD_08cd119e_caseD_0;
        }
        break;
      case 8:
        if (iVar18 == 2) {
          psVar14 = (short *)(param_1 + sVar4 * 8 + 10);
          if ((uVar1 >> 0xc & 1) == 0) {
            *psVar14 = (short)param_1[0x28];
          }
          else {
            *psVar14 = (short)param_1[0x28] + *psVar14;
          }
          goto switchD_08cd119e_caseD_0;
        }
        break;
      case 9:
        if (iVar18 == 2) {
          psVar14 = (short *)((int)param_1 + sVar4 * 0x20 + 0x2a);
          if ((uVar1 >> 0xc & 1) == 0) {
            *psVar14 = (short)param_1[0x28];
          }
          else {
            *psVar14 = (short)param_1[0x28] + *psVar14;
          }
          goto switchD_08cd119e_caseD_0;
        }
        break;
      default:
        iVar18 = -5;
      case 0:
switchD_08cd119e_caseD_0:
      }
      if ((uVar1 >> 0xd & 1) != 0) {
        pbVar19 = (byte *)*param_1;
      }
      if (local_28 != 0 || iVar18 < 1) {
        iVar7 = (int)DAT_08cd091c;
        *(ushort *)(iVar7 + (int)param_1) = uVar1;
        *(uint *)(iVar7 + 0x1e + (int)param_1) = local_28;
        param_1[0x2e] = local_24;
        param_1[sVar4 * 8 + 7] = puVar12 + *(short *)((int)piVar24 + 10);
        *param_1 = pbVar19;
        return iVar18;
      }
    }
LAB_08cd13b2:
    puVar23 = puVar12 + *(short *)((int)piVar24 + 10);
  } while( true );
}



