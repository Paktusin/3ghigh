/* ===== FUN_08cdd034 @ 08cdd034 ===== */

void FUN_08cdd034(int param_1)

{
  int iVar1;
  int *piVar2;
  int iVar3;
  int iVar4;
  int iVar5;
  int iVar6;
  int iVar7;
  
  iVar6 = 0;
  iVar7 = 0;
  do {
    iVar3 = iVar6 * 2;
    iVar5 = 0;
    do {
      iVar4 = 0;
      do {
        piVar2 = (int *)((iVar3 + iVar4) * 4 + param_1);
        iVar1 = *piVar2;
        if (iVar1 != 0) {
          (*(code *)PTR_FUN_08cdd0a8)(iVar1 + 0xc);
          (*(code *)PTR__ZdlPv_08cdd0ac)(iVar1);
          *piVar2 = 0;
        }
        iVar4 = iVar4 + 1;
      } while (iVar4 < 2);
      iVar5 = iVar5 + 1;
      iVar3 = iVar3 + 2;
    } while (iVar5 < 0x14);
    iVar7 = iVar7 + 1;
    iVar6 = iVar6 + 0x14;
  } while (iVar7 < 2);
  return;
}



/* ===== thunk_FUN_08cdd034 @ 08cdd0b0 ===== */

void thunk_FUN_08cdd034(void)

{
  (*(code *)PTR_FUN_08cdd0b8)();
  return;
}



/* ===== FUN_08cdd0bc @ 08cdd0bc ===== */

/* WARNING: Removing unreachable block (ram,0x08cdd1b0) */

int FUN_08cdd0bc(int param_1,undefined4 param_2,int param_3)

{
  undefined2 uVar1;
  undefined *puVar2;
  int iVar3;
  uint uVar4;
  char cVar5;
  undefined2 *puVar6;
  int iVar7;
  undefined4 *puVar8;
  undefined1 local_54;
  undefined1 local_53;
  char local_48 [12];
  undefined1 auStack_3c [12];
  int local_30;
  int local_2c;
  int local_28;
  int local_24;
  
  local_30 = param_1;
  local_2c = param_3;
  local_28 = (*(code *)PTR__Znwj_08cdd10c)((int)DAT_08cdd108);
  if (local_28 != 0) {
    iVar7 = 0;
    (*(code *)PTR_FUN_08cdd110)(local_28,local_30,param_2,local_2c);
    puVar8 = DAT_08cdd114;
    switch(param_2) {
    case 1:
      iVar7 = 6;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2b8;
      break;
    case 2:
      iVar7 = 6;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2bc;
      break;
    case 3:
      iVar7 = 3;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2b0;
      break;
    case 4:
      iVar7 = 3;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2b4;
      break;
    case 6:
      iVar7 = 0x10;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2c0;
      break;
    case 7:
      iVar7 = 6;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2c4;
      break;
    case 8:
      iVar7 = 7;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2c8;
      break;
    case 10:
      iVar7 = 3;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2cc;
      break;
    case 0xb:
      iVar7 = 4;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2d0;
      break;
    case 0xc:
      iVar7 = 0xb;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2d4;
      break;
    case 0xd:
      iVar7 = 0xb;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2d8;
      break;
    case 0xe:
      iVar7 = 3;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2dc;
      break;
    case 0xf:
      iVar7 = 3;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2e0;
      break;
    case 0x10:
      iVar7 = 5;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2e4;
      break;
    case 0x11:
      iVar7 = 5;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2e8;
      break;
    case 0x12:
      iVar7 = 6;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2ec;
      break;
    case 0x13:
      iVar7 = 1;
      puVar8 = (undefined4 *)PTR_PTR_08cdd2f0;
    }
    iVar3 = 0;
    if (iVar7 != 0) {
      do {
        puVar2 = PTR_FUN_08cdd2f4;
        local_24 = iVar3 + 1;
        cVar5 = (puVar8[3] != 0) * '\x10';
        if (local_30 == 1) {
          (*(code *)PTR_FUN_08cdd2f4)(*puVar8,&local_54,10);
          (*(code *)puVar2)(puVar8[1],local_48,10);
          (*(code *)PTR_FUN_08cdd2f8)(local_28,&local_54,local_48,(int)*(char *)(puVar8 + 2),cVar5);
        }
        else {
          (*(code *)PTR_FUN_08cdd2f8)(local_28,*puVar8,puVar8[1],(int)*(char *)(puVar8 + 2),cVar5);
        }
        iVar3 = local_24;
        puVar8 = puVar8 + 4;
      } while (local_24 < iVar7);
    }
    puVar6 = (undefined2 *)PTR_DAT_08cdd300;
    puVar2 = PTR_FUN_08cdd2fc;
    if (local_30 == 1) {
      iVar7 = 1;
      uVar4 = 0;
      (*(code *)PTR_FUN_08cdd2fc)((int)DAT_08cdd2ac,&local_54);
      do {
        uVar1 = *puVar6;
        puVar6 = puVar6 + 1;
        (*(code *)puVar2)(uVar1,auStack_3c);
        (*(code *)PTR_FUN_08cdd2f8)(local_28,auStack_3c,&local_54,iVar7,0x10);
        uVar4 = uVar4 + 1;
        iVar7 = iVar7 + 1;
      } while (uVar4 < 0x7f);
    }
    if (local_2c != 0) {
      iVar7 = 1;
      if (local_30 == 1) {
        (*(code *)PTR_FUN_08cdd2fc)((int)DAT_08cdd2ae,&local_54);
        iVar3 = 0;
      }
      else {
        local_54 = 0xff;
        local_53 = 0;
        iVar3 = 0;
      }
      do {
        local_48[0] = (char)iVar3 + '0';
        local_48[1] = 0;
        iVar3 = iVar3 + 1;
        (*(code *)PTR_FUN_08cdd2f8)(local_28,&local_54,iVar7,0x10);
        iVar7 = iVar7 + 1;
      } while (iVar3 < 10);
    }
  }
  return local_28;
}



/* ===== FUN_08cdd3f4 @ 08cdd3f4 ===== */

void FUN_08cdd3f4(undefined4 *param_1)

{
  *param_1 = 0;
  return;
}



/* ===== FUN_08cdd528 @ 08cdd528 ===== */

int FUN_08cdd528(int param_1,uint param_2)

{
  int iVar1;
  ushort *puVar2;
  uint uVar3;
  
  uVar3 = 0;
  if (*(ushort *)(param_1 + 100) != 0) {
    iVar1 = 0;
    puVar2 = (ushort *)(*(int *)(param_1 + 0x68) + 2);
    do {
      uVar3 = uVar3 + 1;
      if (*(ushort *)(iVar1 + *(int *)(param_1 + 0x68)) == param_2) {
        return (uint)*puVar2 * (uint)DAT_08cdd56a;
      }
      iVar1 = iVar1 + 0x18;
      puVar2 = puVar2 + 0xc;
    } while (uVar3 < *(ushort *)(param_1 + 100));
  }
  return -1;
}



/* ===== FUN_08cdd56c @ 08cdd56c ===== */

uint FUN_08cdd56c(int param_1,uint param_2)

{
  ushort uVar1;
  uint uVar2;
  ushort *puVar3;
  
  uVar2 = 0;
  if (*(ushort *)(param_1 + 100) != 0) {
    puVar3 = *(ushort **)(param_1 + 0x68);
    do {
      uVar1 = *puVar3;
      puVar3 = puVar3 + 0xc;
      if (uVar1 == param_2) {
        return uVar2;
      }
      uVar2 = uVar2 + 1;
    } while (uVar2 < *(ushort *)(param_1 + 100));
  }
  return 0xffffffff;
}



/* ===== FUN_08cdd598 @ 08cdd598 ===== */

int FUN_08cdd598(int param_1)

{
  int iVar1;
  int iVar2;
  
  iVar1 = (*(code *)PTR_FUN_08cdd5c8)();
  iVar2 = 0;
  if (-1 < iVar1) {
    iVar2 = (int)*(char *)(iVar1 * 0x18 + *(int *)(param_1 + 0x68) + 8);
  }
  return iVar2;
}



/* ===== FUN_08cdd9e4 @ 08cdd9e4 ===== */

/* WARNING: Removing unreachable block (ram,0x08cddc6a) */
/* WARNING: Removing unreachable block (ram,0x08cdda80) */
/* WARNING: Removing unreachable block (ram,0x08cdda5c) */
/* WARNING: Removing unreachable block (ram,0x08cddb28) */
/* WARNING: Removing unreachable block (ram,0x08cddc0c) */

int FUN_08cdd9e4(int *param_1,int param_2,int *param_3,int *param_4,int *param_5,ushort param_6,
                int *param_7,int *param_8,short *param_9,undefined2 *param_10)

{
  bool bVar1;
  bool bVar2;
  int *piVar3;
  int iVar4;
  int iVar5;
  undefined1 auStack_74 [8];
  int local_6c;
  int local_68;
  int local_64;
  int local_60;
  int local_5c;
  int local_58;
  int local_54;
  int local_50;
  int local_4c;
  int local_48;
  int local_44;
  int local_40;
  int *local_3c;
  int *local_38;
  int *local_34;
  int *local_30;
  uint local_2c;
  int local_28;
  int iStack_24;
  
  local_30 = param_5;
  local_2c = (uint)param_6;
  local_28 = 0;
  local_3c = param_1;
  local_38 = param_3;
  local_34 = param_4;
  if (*(int *)(DAT_08cddba2 + param_2) == 0x22) {
    while( true ) {
      iVar5 = -1;
      piVar3 = (int *)(DAT_08cddba4 + param_2);
      local_5c = *piVar3;
      local_58 = piVar3[1];
      local_48 = piVar3[3];
      local_4c = piVar3[2];
      iStack_24 = -1;
      if (param_9 != (short *)0x0 && param_10 != (undefined2 *)0x0) {
        if (-1 < piVar3[4]) {
          local_54 = piVar3[4];
          local_50 = piVar3[5];
          (*(code *)PTR_FUN_08cddbb0)(&local_5c,&local_54,6);
          iVar5 = (int)*(short *)(DAT_08cddba6 + param_2);
        }
        if (-1 < piVar3[6]) {
          local_44 = piVar3[6];
          local_40 = piVar3[7];
          (*(code *)PTR_FUN_08cddbb0)(&local_4c,&local_44,6);
          iStack_24 = (int)*(short *)(DAT_08cddba8 + param_2);
        }
      }
      iVar4 = (int)DAT_08cddbac;
      (*(code *)PTR_FUN_08cddbb0)(auStack_74,param_2 + DAT_08cddbaa,0x18);
      iVar4 = iVar4 + param_2;
      bVar1 = false;
      if ((((*local_3c <= *(int *)(iVar4 + 0x10)) && (local_3c[1] <= *(int *)(iVar4 + 0x14))) &&
          (*(int *)(iVar4 + 8) < local_3c[2])) && (*(int *)(iVar4 + 0xc) < local_3c[3])) {
        bVar1 = true;
      }
      bVar2 = false;
      if (((*local_3c <= local_64) && (local_3c[1] <= local_60)) &&
         ((local_6c < local_3c[2] && (local_68 < local_3c[3])))) {
        bVar2 = true;
      }
      if (bVar1) {
        if (bVar2) {
          if (((iVar5 < 0 && (short)local_58 != 0) || (local_5c < *local_38)) ||
             (*local_34 < local_5c)) {
            iVar5 = (*(code *)PTR_FUN_08cddd10)(param_2,&local_5c,0,0);
            if ((iVar5 == 0) || (*(int *)(DAT_08cddd0e + param_2) != 0x22)) {
              return 0;
            }
            iVar5 = (*(code *)PTR_FUN_08cddd14)
                              (local_3c,param_2,local_38,local_34,local_30,local_2c,param_7,param_8,
                               param_9,param_10);
            if (param_7 != (int *)0x0) {
              param_7 = param_7 + iVar5;
            }
            if (param_8 != (int *)0x0) {
              param_8 = param_8 + iVar5 * 4;
            }
            if (param_9 != (short *)0x0) {
              param_9 = param_9 + iVar5;
            }
            if (param_10 != (undefined2 *)0x0) {
              param_10 = param_10 + iVar5;
            }
            local_2c = local_2c - iVar5 & 0xffff;
            local_28 = local_28 + iVar5;
          }
          else if (*local_30 == 0) {
            if (local_2c != 0) {
              local_2c = local_2c - 1 & 0xffff;
              if (param_7 != (int *)0x0) {
                *param_7 = local_5c;
                param_7 = param_7 + 1;
              }
              if (param_9 != (short *)0x0) {
                *param_9 = (short)local_58;
                param_9 = param_9 + 1;
              }
              if (param_10 != (undefined2 *)0x0) {
                *param_10 = (short)iVar5;
                param_10 = param_10 + 1;
              }
              if (param_8 != (int *)0x0) {
                *param_8 = *(int *)(iVar4 + 8);
                param_8[1] = *(int *)(iVar4 + 0xc);
                param_8[2] = *(int *)(iVar4 + 0x10);
                param_8[3] = *(int *)(iVar4 + 0x14);
                param_8 = param_8 + 4;
              }
              local_28 = local_28 + 1;
            }
          }
          else {
            *local_30 = *local_30 + -1;
          }
        }
        else {
          (*(code *)PTR_FUN_08cddd18)(&local_4c,&local_5c,6);
          (*(code *)PTR_FUN_08cddd18)(auStack_74,iVar4,0x18);
          iStack_24 = iVar5;
        }
      }
      else if (!bVar2) {
        return local_28;
      }
      if (((-1 < iStack_24 || (short)local_48 == 0) && (*local_38 <= local_4c)) &&
         (local_5c <= *local_34)) break;
      iVar5 = (*(code *)PTR_FUN_08cddd10)(param_2,&local_4c,0,0);
      if (iVar5 == 0) {
        return 0;
      }
      if (*(int *)(DAT_08cddd0e + param_2) != 0x22) {
        return local_28;
      }
    }
    if (*local_30 == 0) {
      if (local_2c != 0) {
        if (param_7 != (int *)0x0) {
          *param_7 = local_4c;
        }
        if (param_9 != (short *)0x0) {
          *param_9 = (short)local_48;
        }
        if (param_10 != (undefined2 *)0x0) {
          *param_10 = (undefined2)iStack_24;
        }
        if (param_8 != (int *)0x0) {
          *param_8 = local_6c;
          param_8[1] = local_68;
          param_8[2] = local_64;
          param_8[3] = local_60;
        }
        local_28 = local_28 + 1;
      }
    }
    else {
      *local_30 = *local_30 + -1;
    }
  }
  return local_28;
}



/* ===== FUN_08cddfec @ 08cddfec ===== */

/* WARNING: Removing unreachable block (ram,0x08cde23c) */
/* WARNING: Removing unreachable block (ram,0x08cde0be) */
/* WARNING: Removing unreachable block (ram,0x08cde3b6) */

void FUN_08cddfec(undefined4 *param_1,int param_2,undefined4 param_3,int param_4,undefined2 param_5,
                 int param_6)

{
  undefined *puVar1;
  undefined *puVar2;
  int iVar3;
  int iVar4;
  uint uVar5;
  int iVar6;
  short *psVar7;
  ushort *puVar8;
  uint uVar9;
  undefined2 *puVar10;
  uint uVar11;
  int iVar12;
  int *piVar13;
  uint uVar14;
  undefined *local_a8;
  uint local_a4;
  undefined *local_a0 [2];
  int local_98;
  undefined *local_94;
  undefined *local_8c;
  undefined *local_88 [2];
  undefined *local_80;
  undefined4 local_7c;
  int local_78;
  undefined *local_74;
  undefined *local_70 [3];
  undefined *local_64;
  undefined4 local_60;
  undefined4 local_5c;
  undefined4 local_58;
  undefined4 local_54;
  undefined4 local_50;
  undefined4 local_4c;
  int local_48;
  uint local_44;
  int local_40;
  int local_3c;
  undefined4 *puStack_38;
  longlong local_34;
  uint uStack_2c;
  undefined8 local_28;
  
  piVar13 = *(int **)((int)&local_a8 + (int)DAT_08cde174);
  (*(code *)PTR_FUN_08cde180)(0x11,0);
  *param_1 = PTR_PTR_08cde184;
  (*(code *)PTR_FUN_08cde188)(param_1 + 7);
  (*(code *)PTR_FUN_08cde188)(param_1 + 0xe);
  local_a4 = ~(uint)&local_a8;
  local_a8 = PTR_PTR_08cde190;
  (*(code *)PTR_FUN_08cde18c)(param_1 + 7,piVar13,6);
  iVar6 = *piVar13;
  iVar12 = 0;
  param_1[0xb] = param_3;
  param_1[0xc] = 0;
  param_1[10] = iVar6 + 1;
  param_1[9] = 0;
  *(short *)(param_1 + 0x15) = (short)param_4;
  puVar1 = PTR_FUN_08cde18c;
  puStack_38 = param_1 + 0x17;
  *(undefined2 *)puStack_38 = param_5;
  *(undefined2 *)(param_1 + 0x19) = (undefined2)param_6;
  param_1[0x11] = 0;
  param_1[0x12] = 0;
  param_1[0x13] = 0;
  param_1[0x14] = 0;
  local_5c = *(undefined4 *)(DAT_08cde176 + param_2 + 0x38);
  local_60 = *(undefined4 *)(DAT_08cde176 + param_2 + 0x34);
  (*(code *)puVar1)(param_1 + 0xe,6);
  *(undefined2 *)(param_1 + 0x10) = *(undefined2 *)(DAT_08cde178 + param_2);
  param_1[0x16] = param_1 + 0x1b;
  for (iVar6 = param_4; iVar6 != 0; iVar6 = iVar6 + -1) {
    if (param_1[0x16] + iVar12 != 0) {
      (*(code *)PTR_FUN_08cde194)();
    }
    iVar12 = iVar12 + 8;
  }
  iVar12 = (int)DAT_08cde17a;
  uVar14 = 0;
  param_1[0x18] = param_1[0x16] + param_4 * 8;
  if (*(int *)((int)&local_a8 + iVar12) != 0) {
    iVar12 = 0;
    do {
      if (param_1[0x18] + iVar12 != 0) {
        (*(code *)PTR_FUN_08cde188)(param_1[0x18] + iVar12 + 0xc);
      }
      uVar14 = uVar14 + 1;
      iVar12 = iVar12 + 0x24;
    } while (uVar14 < *(uint *)((int)&local_a8 + (int)DAT_08cde17a));
  }
  iVar12 = (int)DAT_08cde17a;
  uVar14 = 0;
  param_1[0x1a] = param_1[0x18] + *(int *)((int)&local_a8 + iVar12) * 0x24;
  if (*(int *)((int)&local_a4 + iVar12) != 0) {
    iVar12 = 0;
    do {
      if (param_1[0x1a] + iVar12 != 0) {
        (*(code *)PTR_FUN_08cde188)(param_1[0x1a] + iVar12 + 0xc);
      }
      uVar14 = uVar14 + 1;
      iVar12 = iVar12 + 0x18;
    } while (uVar14 < *(uint *)((int)&local_a8 + (int)DAT_08cde17c));
  }
  iVar12 = (int)DAT_08cde17c;
  iVar6 = param_1[0x1a] + *(int *)((int)&local_a8 + iVar12) * 0x18;
  if (*(int *)((int)&local_a4 + iVar12) != 0 && *(int *)((int)local_a0 + iVar12) != 0) {
    (*(code *)PTR_FUN_08cde18c)
              (iVar6,*(int *)((int)&local_a4 + iVar12),*(int *)((int)local_a0 + iVar12));
  }
  if (((*(int *)(DAT_08cde17e + param_2) != 0x20) && (*(int **)PTR_DAT_08cde198 != (int *)0x0)) &&
     (iVar12 = (**(code **)(**(int **)PTR_DAT_08cde198 + 0x14))(2), iVar12 != 0)) {
    local_a0[1] = (undefined *)0x2;
    local_98 = (int)DAT_08cde318;
    local_a0[0] = PTR_PTR_08cde328;
    local_94 = PTR_s_iter_getRecordType______ISLit_PO_08cde32c;
    (*(code *)PTR_FUN_08cde330)(PTR_s_wrong_record_type_08cde334);
  }
  puVar1 = PTR_FUN_08cde338;
  (*(code *)PTR_FUN_08cde338)(param_2);
  iVar12 = *(int *)((int)&local_a8 + (int)DAT_08cde31a);
  while ((0 < iVar12 && (iVar3 = (*(code *)PTR_FUN_08cde33c)(param_2,0,1), iVar3 != 0))) {
    iVar12 = iVar12 + -1;
  }
  uVar14 = 0;
  if (*(int *)((int)&local_a8 + (int)DAT_08cde31c) != 0) {
    iVar12 = 0;
    do {
      iVar3 = (*(code *)PTR_FUN_08cde33c)(param_2,0,0);
      if (iVar3 == 0) {
        *(short *)puStack_38 = (short)uVar14;
        break;
      }
      local_54 = *(undefined4 *)(DAT_08cde31e + param_2 + 0x20);
      local_58 = *(undefined4 *)(DAT_08cde31e + param_2 + 0x1c);
      (*(code *)PTR_FUN_08cde340)(param_1[0x18] + iVar12 + 0xc,6);
      local_34 = (longlong)DAT_08cde344 * (longlong)(int)*(uint *)(DAT_08cde320 + param_2);
      *(ushort *)(iVar12 + param_1[0x18]) =
           (short)(int)(local_34 >> 0x26) +
           (ushort)((*(uint *)(DAT_08cde320 + param_2) & 0x80000000) != 0);
      iVar3 = (int)DAT_08cde322;
      *(undefined2 *)(param_1[0x18] + iVar12 + 2) = 0;
      puVar2 = PTR_FUN_08cde348;
      if (((*(int *)(iVar3 + param_2) == 0) || (*(short *)(iVar3 + 4 + param_2) == 0)) ||
         (*(int *)(iVar3 + param_2) == 0)) {
        *(undefined2 *)(param_1[0x18] + iVar12 + 4) = 0;
        *(undefined4 *)(param_1[0x18] + iVar12 + 8) = 0;
      }
      else {
        *(undefined2 *)(param_1[0x18] + iVar12 + 4) = *(undefined2 *)(DAT_08cde324 + param_2);
        *(int *)(param_1[0x18] + iVar12 + 8) = iVar6;
        iVar3 = (*(code *)puVar2)(iVar6);
        iVar6 = iVar6 + iVar3 + 1;
      }
      uVar14 = uVar14 + 1;
      iVar3 = (*(code *)PTR_FUN_08cde34c)(param_2);
      *(undefined4 *)(param_1[0x18] + iVar12 + 0x14) = *(undefined4 *)(iVar3 + 8);
      *(undefined4 *)(param_1[0x18] + iVar12 + 0x18) = *(undefined4 *)(iVar3 + 0xc);
      *(undefined4 *)(param_1[0x18] + iVar12 + 0x1c) = *(undefined4 *)(iVar3 + 0x10);
      iVar4 = (int)DAT_08cde31c;
      *(undefined4 *)(param_1[0x18] + iVar12 + 0x20) = *(undefined4 *)(iVar3 + 0x14);
      iVar12 = iVar12 + 0x24;
    } while (uVar14 < *(uint *)((int)&local_a8 + iVar4));
  }
  uVar14 = 0;
  (*(code *)puVar1)(param_2);
  uStack_2c = 1;
  if (param_6 != 0) {
    iVar12 = 0;
    do {
      iVar6 = (*(code *)PTR_FUN_08cde33c)(param_2,0,0);
      if (iVar6 == 0) {
        if (*(int **)PTR_DAT_08cde350 != (int *)0x0) {
          iVar12 = (**(code **)(**(int **)PTR_DAT_08cde350 + 0x14))(2);
          if (iVar12 != 0) {
            local_8c = PTR_PTR_08cde328;
            (*(code *)PTR_FUN_08cde358)
                      (&local_8c,PTR_s_Error_in_reading_POI_type__u_08cde354,uVar14);
          }
        }
        break;
      }
      *(short *)(iVar12 + param_1[0x1a]) = (short)*(undefined4 *)(DAT_08cde494 + param_2);
      *(undefined2 *)(param_1[0x1a] + iVar12 + 6) = *(undefined2 *)(DAT_08cde496 + param_2);
      if ((uStack_2c != 0) && (uVar14 != 0)) {
        uStack_2c = uStack_2c &
                    -(uint)(((ushort *)(param_1[0x1a] + iVar12))[-0xc] <=
                           *(ushort *)(param_1[0x1a] + iVar12));
      }
      local_28 = (longlong)DAT_08cde4a4 * (longlong)(int)*(uint *)(DAT_08cde498 + param_2);
      uVar9 = (int)(local_28 >> 0x26) +
              (uint)((*(uint *)(DAT_08cde498 + param_2) & 0x80000000) != 0) & 0xffff;
      if (uVar9 != 0) goto LAB_08cde4aa;
      uVar5 = (uint)*(ushort *)(param_1[0x1a] + iVar12);
      if (uVar5 == 0x1f) {
LAB_08cde48c:
        uVar9 = 100;
      }
      else if (uVar5 < 0x20) {
        uVar9 = (uint)DAT_08cde49a;
        if (uVar5 != 0x12) {
          if (uVar5 < 0x13) {
            if (uVar5 == 7) {
LAB_08cde490:
              uVar9 = 0x32;
            }
            else if (uVar5 < 8) {
              uVar9 = (uint)DAT_08cde49c;
              if ((uVar5 != 1) && (uVar9 = (uint)DAT_08cde49e, uVar5 != 2)) {
                uVar9 = 0x14;
              }
            }
            else {
              if ((uVar5 == 0xe) || (uVar5 == 0x11)) goto LAB_08cde490;
              uVar9 = 0x14;
            }
          }
          else if (uVar5 < 0x1c) {
            if (0x19 < uVar5) goto LAB_08cde490;
            if ((uVar5 == 0x13) || (uVar5 == 0x15)) goto LAB_08cde48c;
            uVar9 = 0x14;
          }
          else {
            if (uVar5 == 0x1c) goto LAB_08cde48c;
            uVar9 = 0x14;
          }
        }
      }
      else {
        if (uVar5 == 0x3e) goto LAB_08cde48c;
        if (0x3e < uVar5) {
          if (uVar5 < 0x4a) {
            uVar9 = 100;
            if (uVar5 < 0x48) {
              if (uVar5 == 0x43) goto LAB_08cde48c;
              uVar9 = 0x14;
            }
          }
          else if ((uVar5 == 0x4b) ||
                  ((uVar9 = 0x14, 0x4a < uVar5 && (uVar5 + (int)DAT_08cde4a0 < 3))))
          goto LAB_08cde48c;
          goto LAB_08cde4aa;
        }
        if (uVar5 == 0x2a) goto LAB_08cde490;
        if (uVar5 < 0x2b) {
          if ((uVar5 == 0x21) || (uVar5 == 0x24)) goto LAB_08cde48c;
          uVar9 = 0x14;
        }
        else {
          if (uVar5 == 0x2c) goto LAB_08cde48c;
          if (uVar5 == 0x38) goto LAB_08cde490;
          uVar9 = 0x14;
        }
      }
LAB_08cde4aa:
      iVar6 = (int)DAT_08cde612;
      *(ushort *)(param_1[0x1a] + iVar12 + 2) = (ushort)uVar9;
      puVar1 = PTR_FUN_08cde620;
      *(undefined1 *)(param_1[0x1a] + iVar12 + 8) = *(undefined1 *)(iVar6 + param_2);
      local_4c = *(undefined4 *)(DAT_08cde614 + param_2 + 0x38);
      local_50 = *(undefined4 *)(DAT_08cde614 + param_2 + 0x34);
      (*(code *)puVar1)(param_1[0x1a] + iVar12 + 0xc,6);
      *(undefined2 *)(param_1[0x1a] + iVar12 + 0x14) = *(undefined2 *)(DAT_08cde616 + param_2);
      uVar11 = 0;
      local_44 = *(uint *)(DAT_08cde618 + param_2 + 0x20);
      local_48 = *(int *)(DAT_08cde618 + param_2 + 0x1c);
      uVar5 = local_44;
      while ((uVar11 < *(ushort *)(param_1 + 0x17) &&
             ((iVar6 = param_1[0x18] + uVar11 * 0x24, *(int *)(iVar6 + 0xc) != local_48 ||
              ((short)local_44 != *(short *)(iVar6 + 0x10)))))) {
        uVar11 = uVar11 + 1 & 0xffff;
      }
      local_44 = uVar5;
      if (uVar11 < *(ushort *)(param_1 + 0x17)) {
        *(short *)(param_1[0x1a] + iVar12 + 4) = (short)uVar11;
        psVar7 = (short *)(param_1[0x18] + uVar11 * 0x24 + 2);
        *psVar7 = *psVar7 + 1;
        puVar8 = (ushort *)(param_1[0x18] + uVar11 * 0x24);
        if (*puVar8 < uVar9) {
          *puVar8 = (ushort)uVar9;
        }
      }
      else {
        if (*(int **)PTR_DAT_08cde624 != (int *)0x0) {
          iVar6 = (**(code **)(**(int **)PTR_DAT_08cde624 + 0x14))(2);
          if (iVar6 != 0) {
            local_88[0] = PTR_PTR_08cde628;
            (*(code *)PTR_FUN_08cde630)
                      (local_88,PTR_s_POI_type__u__index__u__is_assign_08cde62c,
                       *(undefined2 *)(param_1[0x1a] + iVar12),uVar14,local_48,local_44 & 0xffff);
          }
        }
        *(undefined2 *)(param_1[0x1a] + iVar12 + 4) = 0xffff;
      }
      uVar14 = uVar14 + 1;
      iVar12 = iVar12 + 0x18;
    } while (uVar14 < *(uint *)((int)&local_a8 + (int)DAT_08cde61a));
  }
  uVar14 = 0;
  iVar12 = 0;
  if (*(int *)((int)&local_a8 + (int)DAT_08cde61c) != 0) {
    do {
      puVar1 = PTR_FUN_08cde7e0;
      puVar10 = (undefined2 *)(param_1[0x18] + iVar12);
      if (*(int *)(puVar10 + 6) < 0) {
        *puVar10 = 0;
        *(undefined2 *)(param_1[0x18] + iVar12 + 2) = 0;
        iVar6 = param_1[0x18] + iVar12;
        *(undefined4 *)(iVar6 + 0x18) = 0;
        *(undefined4 *)(iVar6 + 0x14) = 0;
        *(undefined4 *)(iVar6 + 0x1c) = 0;
        *(undefined4 *)(iVar6 + 0x20) = 0;
      }
      else if ((((*(int *)(puVar10 + 10) == 0) && (*(int *)(puVar10 + 0xc) == 0)) &&
               (*(int *)(puVar10 + 0xe) == 0)) && (*(int *)(puVar10 + 0x10) == 0)) {
        iVar6 = (*(code *)PTR_FUN_08cde7e0)(param_2,param_1[0x18] + iVar12 + 0xc,0,0);
        if ((iVar6 != 0) && (*(int *)(DAT_08cde7cc + param_2) == 0x21)) {
          iVar6 = *(int *)(DAT_08cde7ce + param_2);
          if (-1 < iVar6) {
            local_40 = iVar6;
            local_3c = ((int *)(DAT_08cde7ce + param_2))[1];
            iVar6 = (*(code *)puVar1)(param_2,0,0);
            if (iVar6 != 0) {
              if (*(int *)(DAT_08cde7cc + param_2) == 0x22) {
                iVar6 = (int)DAT_08cde7d0;
                iVar3 = (int)DAT_08cde7d2;
                *(undefined4 *)(param_1[0x18] + iVar12 + 0x14) =
                     *(undefined4 *)(iVar6 + param_2 + 8);
                *(undefined4 *)(param_1[0x18] + iVar12 + 0x18) =
                     *(undefined4 *)(iVar6 + param_2 + 0xc);
                *(undefined4 *)(param_1[0x18] + iVar12 + 0x1c) =
                     *(undefined4 *)(iVar3 + param_2 + 0x10);
                *(undefined4 *)(param_1[0x18] + iVar12 + 0x20) =
                     *(undefined4 *)(iVar3 + param_2 + 0x14);
              }
              else {
                if ((*(int *)(DAT_08cde7cc + param_2) != 0x23) &&
                   (*(int **)PTR_DAT_08cde7e4 != (int *)0x0)) {
                  iVar6 = (**(code **)(**(int **)PTR_DAT_08cde7e4 + 0x14))(2);
                  if (iVar6 != 0) {
                    local_80 = PTR_PTR_08cde7e8;
                    local_7c = 2;
                    local_78 = (int)DAT_08cde7d4;
                    local_74 = PTR_s_iter_getRecordType______ISLit_PO_08cde7f0;
                    (*(code *)PTR_FUN_08cde7f4)(&local_80,PTR_s_POI_tile_expected_08cde7ec);
                  }
                }
                iVar6 = DAT_08cde7d6 + param_2;
                uVar9 = (int)*(short *)(DAT_08cde7d8 + iVar6) +
                        (int)*(short *)(DAT_08cde7d8 + 2 + iVar6);
                if ((int)uVar9 < 0) {
                  uVar9 = 1 >> (~uVar9 & 0x1f) + 1;
                }
                else {
                  uVar9 = 1 << (uVar9 & 0x1f);
                }
                iVar3 = (int)DAT_08cde7da;
                *(undefined4 *)(param_1[0x18] + iVar12 + 0x14) =
                     *(undefined4 *)(iVar3 + iVar6 + 0x14);
                *(undefined4 *)(param_1[0x18] + iVar12 + 0x18) =
                     *(undefined4 *)(iVar3 + iVar6 + 0x18);
                *(uint *)(param_1[0x18] + iVar12 + 0x1c) =
                     *(int *)(param_1[0x18] + iVar12 + 0x1c) + uVar9;
                *(uint *)(param_1[0x18] + iVar12 + 0x20) =
                     *(int *)(param_1[0x18] + iVar12 + 0x20) + uVar9;
              }
              goto LAB_08cde762;
            }
          }
        }
        if (*(int **)PTR_DAT_08cde7e4 != (int *)0x0) {
          iVar6 = (**(code **)(**(int **)PTR_DAT_08cde7e4 + 0x14))(2);
          if (iVar6 != 0) {
            local_70[0] = PTR_PTR_08cde7e8;
            (*(code *)PTR_FUN_08cde7fc)
                      (local_70,PTR_s_Did_not_find_layer_header__u___d_08cde7f8,uVar14,
                       *(undefined4 *)(param_1[0x18] + iVar12 + 0xc),
                       *(undefined2 *)(param_1[0x18] + iVar12 + 0x10));
          }
        }
      }
LAB_08cde762:
      uVar14 = uVar14 + 1;
      iVar12 = iVar12 + 0x24;
    } while (uVar14 < *(uint *)((int)&local_a8 + (int)DAT_08cde7dc));
  }
  iVar12 = (*(code *)PTR_FUN_08cde800)(param_1);
  if (iVar12 < 1) {
    if (*(int **)PTR_DAT_08cde7e4 != (int *)0x0) {
      iVar12 = (**(code **)(**(int **)PTR_DAT_08cde7e4 + 0x14))(2);
      if (iVar12 != 0) {
        local_64 = PTR_PTR_08cde7e8;
        (*(code *)PTR_FUN_08cde7fc)(PTR_s_Can_not_open_CLitPoiTileDb_08cde804);
      }
    }
  }
  else {
    for (uVar14 = (uint)*(ushort *)(param_1 + 0x17); uVar14 != 0; uVar14 = uVar14 - 1) {
    }
  }
  return;
}



/* ===== FUN_08cdeea8 @ 08cdeea8 ===== */

void FUN_08cdeea8(undefined4 *param_1)

{
  *param_1 = 0;
  return;
}



/* ===== thunk_FUN_08cc48b4 @ 08cdeeb0 ===== */

void thunk_FUN_08cc48b4(void)

{
  (*(code *)PTR_FUN_08cdeeb8)();
  return;
}



/* ===== FUN_08cdeebc @ 08cdeebc ===== */

int FUN_08cdeebc(int param_1,int param_2)

{
  if (param_2 != param_1) {
    (*(code *)PTR_FUN_08cdeed4)();
  }
  return param_1;
}



/* ===== FUN_08cdeed8 @ 08cdeed8 ===== */

undefined4 FUN_08cdeed8(undefined4 *param_1)

{
  return *param_1;
}



/* ===== FUN_08cdeedc @ 08cdeedc ===== */

void FUN_08cdeedc(undefined4 *param_1,undefined4 param_2,undefined4 param_3)

{
  *param_1 = param_2;
  param_1[1] = param_3;
  return;
}



/* ===== FUN_08cdeee4 @ 08cdeee4 ===== */

/* WARNING: Removing unreachable block (ram,0x08cdf066) */
/* WARNING: Removing unreachable block (ram,0x08cdf0fe) */

void FUN_08cdeee4(undefined4 *param_1,int param_2,uint param_3,undefined4 param_4)

{
  short sVar1;
  bool bVar2;
  undefined *puVar3;
  undefined1 uVar4;
  int iVar5;
  undefined4 *puVar6;
  int iVar7;
  short *psVar8;
  uint uVar9;
  short *psVar10;
  undefined4 *puVar11;
  byte *pbVar12;
  undefined *local_a0;
  uint local_9c;
  short local_98 [40];
  undefined *local_48;
  undefined *local_44;
  undefined4 *local_40;
  uint local_3c;
  undefined4 local_38;
  uint local_34;
  uint local_30;
  uint local_2c;
  longlong local_28;
  
  local_40 = param_1;
  local_3c = param_3;
  local_38 = param_4;
  (*(code *)PTR_FUN_08cdf018)(0x13,0);
  *local_40 = PTR_PTR_08cdf01c;
  local_40[7] = 0;
  (*(code *)PTR_FUN_08cdf020)(local_40 + 8,local_3c,*(undefined4 *)(DAT_08cdf00e + param_2));
  puVar6 = local_40;
  local_9c = ~(uint)&local_a0;
  puVar11 = local_40 + 10;
  local_a0 = PTR_PTR_08cdf024;
  if (puVar11 != (undefined4 *)0x0) {
    (*(code *)PTR_FUN_08cdf028)(param_2,local_98,0x14);
    pbVar12 = (byte *)((int)puVar6 + 0x35);
    local_34 = 0;
    if (local_3c != 0) {
      do {
        do {
          iVar5 = (*(code *)PTR_FUN_08cdf02c)(param_2);
          puVar3 = PTR_FUN_08cdf1d4;
          if (iVar5 == 0) {
            if ((*(int **)PTR_DAT_08cdf030 != (int *)0x0) &&
               (iVar5 = (**(code **)(**(int **)PTR_DAT_08cdf030 + 0x14))(2), iVar5 != 0)) {
              local_48 = PTR_PTR_08cdf024;
              (*(code *)PTR_FUN_08cdf034)
                        (PTR_s_POI__u___u__not_found_08cdf038,local_34,
                         *(undefined4 *)(DAT_08cdf010 + param_2));
            }
            puVar3 = PTR_FUN_08cdf028;
            local_40[8] = local_34;
            (*(code *)puVar3)(param_2,0,0);
            return;
          }
        } while ((-1 < *(short *)(DAT_08cdf012 + param_2)) &&
                (*(int *)(DAT_08cdf014 + param_2) != 0x32));
        if (*(int *)(DAT_08cdf014 + param_2) != 0x24) {
          if ((*(int **)PTR_DAT_08cdf030 != (int *)0x0) &&
             (iVar5 = (**(code **)(**(int **)PTR_DAT_08cdf030 + 0x14))(2), iVar5 != 0)) {
            local_44 = PTR_PTR_08cdf024;
            (*(code *)PTR_FUN_08cdf034)
                      (PTR_s_Element__u_is_not_a_POI__index___08cdf03c,
                       *(undefined4 *)(DAT_08cdf016 + param_2 + 0x34),local_34,
                       *(undefined4 *)(DAT_08cdf016 + param_2 + 0x30));
          }
          local_40[8] = local_34;
          break;
        }
        uVar9 = *(uint *)(DAT_08cdf1be + param_2 + 0x24);
        local_30 = uVar9 & 0xffff;
        local_2c = 0;
        if ((DAT_08cdf1cc < (int)uVar9) &&
           ((int)DAT_08cdf1c0 < *(int *)(DAT_08cdf1be + param_2 + 0x20))) {
          local_2c = (int)((longlong)DAT_08cdf1d0 * (longlong)(int)uVar9 >> 0x2c) +
                     (uint)((uVar9 & 0x80000000) != 0);
          local_30 = uVar9 - local_2c * (int)DAT_08cdf1c2 & 0xffff;
          local_2c = local_2c & 0xffff;
        }
        puVar6 = (undefined4 *)(*(code *)PTR_FUN_08cdf1d4)(param_2);
        *puVar11 = *puVar6;
        iVar5 = (*(code *)puVar3)(param_2);
        iVar7 = (int)DAT_08cdf1c4;
        puVar11[1] = *(undefined4 *)(iVar5 + 4);
        uVar9 = *(uint *)(iVar7 + param_2);
        *(short *)(puVar11 + 2) = (short)uVar9;
        *(undefined2 *)((int)puVar11 + 10) = (undefined2)local_30;
        iVar5 = (int)DAT_08cdf1c6;
        *(undefined1 *)(puVar11 + 3) = (undefined1)local_2c;
        *pbVar12 = 0;
        *(undefined2 *)(puVar11 + 4) = *(undefined2 *)(iVar5 + param_2);
        puVar3 = PTR_FUN_08cdf1d8;
        *(undefined1 *)((int)puVar11 + 0xf) = *(undefined1 *)(iVar5 + 2 + param_2);
        uVar4 = (*(code *)puVar3)(local_38,uVar9 & 0xffff);
        *(undefined1 *)((int)puVar11 + 0xe) = uVar4;
        uVar9 = (*(code *)PTR_FUN_08cdf1dc)(local_38,*(undefined2 *)(puVar11 + 2));
        local_28 = (longlong)DAT_08cdf1e0 * (longlong)(int)uVar9;
        iVar5 = (int)DAT_08cdf1c8;
        *(ushort *)((int)puVar11 + 0x12) =
             (short)(int)((longlong)DAT_08cdf1e0 * (longlong)(int)uVar9 >> 0x26) +
             (ushort)((uVar9 & 0x80000000) != 0);
        iVar7 = (int)DAT_08cdf1ca;
        *(short *)(puVar11 + 5) = (short)*(undefined4 *)(iVar5 + param_2);
        puVar11[6] = 0;
        puVar11[7] = 0;
        uVar9 = (uint)*(ushort *)(iVar7 + param_2);
        if (uVar9 != 0) {
          psVar8 = local_98 + 1;
          psVar10 = local_98;
          do {
            sVar1 = *psVar10;
            if (sVar1 == 0x17) {
              sVar1 = *psVar8;
              puVar11[7] = (int)sVar1;
              if (sVar1 != 0) {
                *pbVar12 = *pbVar12 | 4;
              }
            }
            else if (sVar1 < 0x18) {
              if ((sVar1 == 0x16) && (sVar1 = *psVar8, puVar11[6] = (int)sVar1, sVar1 != 0)) {
                *pbVar12 = *pbVar12 | 8;
              }
            }
            else if ((sVar1 == 0x19) && (*psVar8 != 0)) {
              *pbVar12 = *pbVar12 | 2;
            }
            bVar2 = uVar9 != 1;
            uVar9 = uVar9 - 1;
            psVar10 = psVar10 + 2;
            psVar8 = psVar8 + 2;
          } while (bVar2);
        }
        puVar11 = puVar11 + 8;
        pbVar12 = pbVar12 + 0x20;
        local_34 = local_34 + 1;
      } while (local_34 < local_3c);
    }
    (*(code *)PTR_FUN_08cdf1e4)(param_2,0,0);
  }
  return;
}



/* ===== FUN_08cdf1e8 @ 08cdf1e8 ===== */

/* WARNING: Removing unreachable block (ram,0x08cdf25a) */

void FUN_08cdf1e8(int param_1,undefined4 param_2,undefined4 param_3)

{
  undefined *puVar1;
  int iVar2;
  int iVar3;
  undefined *local_30;
  uint local_2c;
  undefined *local_28;
  undefined4 local_24;
  undefined4 local_20;
  undefined *local_1c;
  code *local_14;
  
  puVar1 = PTR_PTR_08cdf294;
  local_14 = FUN_08cdeebc;
  local_2c = ~(uint)&local_30;
  local_30 = PTR_PTR_08cdf294;
  (*(code *)PTR_FUN_08cdf298)();
  if (*(int *)(DAT_08cdf28e + param_1) == 0x23) {
    iVar3 = *(int *)(DAT_08cdf290 + param_1);
    iVar2 = (*(code *)PTR_FUN_08cdf2ac)(0x28,param_2,iVar3 << 5);
    if (iVar2 != 0) {
      (*(code *)PTR_FUN_08cdf2b0)(iVar2,param_1,iVar3,param_3);
      (*(code *)PTR_FUN_08cdf2b4)(iVar2);
    }
  }
  else if ((*(int **)PTR_DAT_08cdf29c != (int *)0x0) &&
          (iVar2 = (**(code **)(**(int **)PTR_DAT_08cdf29c + 0x14))(2), iVar2 != 0)) {
    local_24 = 2;
    local_20 = 0x1f;
    local_28 = puVar1;
    local_1c = PTR_s_parser_getRecordType______ISLit__08cdf2a0;
    (*(code *)PTR_FUN_08cdf2a4)(PTR_DAT_08cdf2a8);
  }
  return;
}



/* ===== FUN_08cdf408 @ 08cdf408 ===== */

void FUN_08cdf408(undefined4 *param_1,undefined4 param_2)

{
  undefined4 *puVar1;
  int iVar2;
  
  iVar2 = (int)DAT_08cdf442;
  (*(code *)PTR_FUN_08cdf448)(0x12,param_2);
  *param_1 = PTR_PTR_08cdf44c;
  puVar1 = param_1 + 8;
  do {
    iVar2 = iVar2 + -1;
    (*(code *)PTR_FUN_08cdf450)(puVar1);
    puVar1 = puVar1 + 2;
  } while (iVar2 != -1);
  param_1[7] = (int)DAT_08cdf444;
  return;
}



/* ===== FUN_08cdf4ec @ 08cdf4ec ===== */

/* WARNING: Removing unreachable block (ram,0x08cdf506) */

void FUN_08cdf4ec(int param_1,uint param_2)

{
  if (param_2 <= (uint)(int)DAT_08cdf51c) {
    (*(code *)PTR_thunk_FUN_08cc48b4_08cdf524)(param_1 + param_2 * 8 + 0x20);
    return;
  }
  (*(code *)PTR_FUN_08cdf520)();
  return;
}



/* ===== FUN_08cdf528 @ 08cdf528 ===== */

/* WARNING: Removing unreachable block (ram,0x08cdf54c) */

void FUN_08cdf528(int param_1,uint param_2,undefined4 param_3)

{
  undefined *puVar1;
  undefined4 uVar2;
  int iVar3;
  undefined *local_28;
  uint local_24;
  undefined *local_20;
  undefined4 local_1c;
  undefined4 local_18;
  undefined *local_14;
  
  puVar1 = PTR_PTR_08cdf5a4;
  local_24 = ~(uint)&local_28;
  local_28 = PTR_PTR_08cdf5a4;
  if ((uint)(int)DAT_08cdf5a2 < param_2) {
    if ((*(int **)PTR_DAT_08cdf5b0 != (int *)0x0) &&
       (iVar3 = (**(code **)(**(int **)PTR_DAT_08cdf5b0 + 0x14))(2), iVar3 != 0)) {
      local_1c = 2;
      local_18 = 0x45;
      local_20 = puVar1;
      local_14 = PTR_s_indexInSubDir_<_SizeOfLitTileSub_08cdf5b4;
      (*(code *)PTR_FUN_08cdf5b8)(PTR_DAT_08cdf5bc);
    }
  }
  else {
    uVar2 = (*(code *)PTR_FUN_08cdf5a8)(param_3);
    (*(code *)PTR_FUN_08cdf5ac)(param_2 * 8 + param_1 + 0x20,uVar2);
    if ((int)param_2 < *(int *)(param_1 + 0x1c)) {
      *(uint *)(param_1 + 0x1c) = param_2;
    }
  }
  return;
}



/* ===== FUN_08cdf7c8 @ 08cdf7c8 ===== */

char * FUN_08cdf7c8(char *param_1)

{
  undefined *puVar1;
  int iVar2;
  char *pcVar3;
  uint uVar4;
  undefined4 *puVar5;
  
  uVar4 = 0;
  (*(code *)PTR_FUN_08cdf830)(PTR_DAT_08cdf834);
  puVar1 = PTR_DAT_08cdf838;
  puVar5 = (undefined4 *)PTR_DAT_08cdf83c;
  if (*(int *)PTR_DAT_08cdf838 != 0) {
    do {
      pcVar3 = (char *)*puVar5;
      if ((*pcVar3 == *param_1) &&
         (iVar2 = (*(code *)PTR_FUN_08cdf840)(param_1 + 1,pcVar3 + 1,*param_1), iVar2 == 0)) {
        (*(code *)PTR_FUN_08cdf844)(PTR_DAT_08cdf834);
        return pcVar3;
      }
      uVar4 = uVar4 + 1;
      puVar5 = puVar5 + 1;
    } while (uVar4 < *(uint *)puVar1);
  }
  (*(code *)PTR_FUN_08cdf844)(PTR_DAT_08cdf834);
  return (char *)0x0;
}



/* ===== FUN_08cdfa8c @ 08cdfa8c ===== */

void FUN_08cdfa8c(undefined4 *param_1,undefined4 param_2,undefined4 param_3,undefined4 param_4)

{
  undefined *puVar1;
  undefined *puVar2;
  
  (*(code *)PTR_FUN_08cdfafc)(0x26,0);
  puVar1 = PTR_PTR_08cdfb00;
  param_1[8] = param_4;
  *param_1 = puVar1;
  puVar1 = PTR_PTR_08cdfb04;
  param_1[7] = param_3;
  param_1[9] = puVar1;
  puVar1 = PTR_PTR_08cdfb08;
  param_1[0xb] = param_2;
  param_1[10] = puVar1;
  (*(code *)PTR_FUN_08cdfb0c)(param_1 + 0x10);
  param_1[0xd] = 0;
  puVar1 = PTR_FUN_08cdfb10;
  param_1[0xf] = 0;
  param_1[0xe] = 0;
  puVar2 = PTR_s_COrionDatabase_mSqueezerMutex_08cdfb14;
  param_1[0x12] = 0;
  (*(code *)puVar1)(param_1 + 0x13,puVar2);
  *(undefined1 *)(param_1 + 0xc) = 0;
  *(undefined2 *)((int)param_1 + 0x32) = 0;
  *(undefined1 *)((int)param_1 + 0x31) = 0;
  return;
}



/* ===== FUN_08ce0b3c @ 08ce0b3c ===== */

void FUN_08ce0b3c(undefined4 *param_1,undefined4 param_2,undefined4 param_3)

{
  short sVar1;
  int iVar2;
  
  (*(code *)PTR_FUN_08ce0b7c)();
  sVar1 = DAT_08ce0b78;
  iVar2 = (int)DAT_08ce0b7a;
  *param_1 = PTR_PTR_08ce0b80;
  *(undefined4 *)((int)param_1 + sVar1 + 0x20) = 0;
  *(undefined4 *)((int)param_1 + sVar1 + 0x14) = param_2;
  *(undefined4 *)((int)param_1 + sVar1 + 0x18) = param_3;
  *(undefined4 *)((int)param_1 + sVar1 + 0x1c) = 0;
  *(undefined4 *)((int)param_1 + sVar1 + 0x24) = 0;
  *(undefined1 *)(iVar2 + (int)param_1) = 0;
  return;
}



/* ===== FUN_08ce0c00 @ 08ce0c00 ===== */

undefined4
FUN_08ce0c00(undefined4 param_1,undefined4 param_2,undefined4 param_3,undefined4 param_4,
            undefined4 param_5,int *param_6)

{
  undefined *puVar1;
  int iVar2;
  undefined4 uVar3;
  int iVar4;
  undefined *local_38;
  uint local_34;
  undefined *local_30;
  undefined4 local_2c;
  undefined4 local_28;
  undefined *local_24;
  
  puVar1 = PTR_PTR_08ce0cb8;
  local_34 = ~(uint)&local_38;
  local_38 = PTR_PTR_08ce0cb8;
  iVar2 = (*(code *)PTR__Znwj_08ce0cb4)((int)DAT_08ce0cae);
  if (iVar2 != 0) {
    (*(code *)PTR_FUN_08ce0cbc)(iVar2,param_4,param_5);
  }
  *param_6 = iVar2;
  if (iVar2 == 0) {
    if ((*(int **)PTR_DAT_08ce0cc0 != (int *)0x0) &&
       (iVar2 = (**(code **)(**(int **)PTR_DAT_08ce0cc0 + 0x14))(2), iVar2 != 0)) {
      local_2c = 2;
      local_28 = 0x51;
      local_30 = puVar1;
      local_24 = PTR_s_oContainerJob____Null_08ce0cc4;
      (*(code *)PTR_FUN_08ce0cc8)(PTR_s_Can_not_instantiate_COrionContai_08ce0ccc);
    }
    uVar3 = 0;
  }
  else {
    (*(code *)PTR_FUN_08ce0cd0)(iVar2,0,0);
    uVar3 = 1;
    iVar4 = (int)DAT_08ce0cb0;
    iVar2 = *param_6 + iVar4;
    *(undefined4 *)(iVar2 + 0x1c) = param_1;
    *(undefined4 *)(iVar2 + 0x20) = param_2;
    *(undefined4 *)(*param_6 + iVar4 + 0x24) = param_3;
  }
  return uVar3;
}



