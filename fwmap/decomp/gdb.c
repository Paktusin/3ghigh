/* ===== FUN_08cb20f0 @ 08cb20f0 ===== */

int FUN_08cb20f0(int param_1)

{
  ushort uVar1;
  ushort uVar2;
  byte bVar3;
  int iVar4;
  undefined *puVar5;
  undefined *puVar6;
  undefined2 uVar7;
  short sVar8;
  int iVar9;
  undefined4 uVar10;
  int iVar11;
  undefined4 uVar12;
  undefined4 *puVar13;
  undefined4 *puVar14;
  int iVar15;
  int iVar16;
  uint uVar17;
  int *piVar18;
  int iVar19;
  ushort *puVar20;
  int local_28 [2];
  int local_20;
  
  puVar5 = PTR_PTR_08cb220c;
  iVar4 = -(int)DAT_08cb21f6;
  *(undefined **)((int)&local_20 + iVar4) = PTR_PTR_08cb220c;
  *(int *)(&stack0xffffffe4 + iVar4) = ~((int)&local_20 + iVar4);
  if ((*(int **)PTR_DAT_08cb2210 != (int *)0x0) &&
     (iVar9 = (**(code **)(**(int **)PTR_DAT_08cb2210 + 0x14))(0x20), iVar9 != 0)) {
    *(undefined **)(&stack0xffffffe8 + iVar4) = puVar5;
    (*(code *)PTR_FUN_08cb2214)(&stack0xffffffe8 + iVar4,PTR_s_Gdb_read_header_08cb2218);
  }
  *(int *)((int)local_28 + iVar4 + 4) = DAT_08cb21f8 + param_1;
  iVar9 = (*(code *)PTR_FUN_08cb221c)
                    (param_1,param_1 + DAT_08cb21fa,param_1 + DAT_08cb21fc,param_1 + DAT_08cb21fe);
  if (iVar9 == 0) {
    if ((*(int **)PTR_DAT_08cb2210 != (int *)0x0) &&
       (iVar9 = (**(code **)(**(int **)PTR_DAT_08cb2210 + 0x14))(0x20), iVar9 != 0)) {
      *(undefined **)(&stack0xffffffec + iVar4) = PTR_PTR_08cb220c;
      (*(code *)PTR_FUN_08cb2214)
                (&stack0xffffffec + iVar4,PTR_s_Id__lu_Version__lu_08cb2220,
                 *(undefined4 *)(DAT_08cb21fc + param_1),*(undefined4 *)(DAT_08cb21fa + param_1));
    }
    iVar11 = (int)DAT_08cb2202;
    iVar9 = (int)DAT_08cb2200 + iVar4 + -0x20;
    *(undefined4 *)(&stack0xffffffe4 + iVar9 + 0x20) = 0;
    *(undefined4 *)(&stack0xffffffe8 + iVar9 + 0x20) = 0;
    iVar19 = (int)&local_20 + DAT_08cb2204 + iVar4;
    *(undefined4 *)(&stack0xffffffec + iVar9 + 0x20) = 0;
    *(undefined4 *)(&stack0xfffffff0 + iVar9 + 0x20) = 0;
    ((undefined4 *)(iVar11 + param_1))[3] = 0;
    *(undefined4 *)(iVar11 + param_1) = 0;
    puVar5 = PTR_FUN_08cb2224;
    iVar9 = (int)DAT_08cb21f8;
    *(undefined4 *)(DAT_08cb2206 + param_1) = 0;
    (*(code *)puVar5)(iVar19,0);
    puVar20 = (ushort *)(iVar9 + param_1);
    iVar9 = (*(code *)PTR_FUN_08cb2228)(iVar19,*puVar20);
    puVar5 = PTR_FUN_08cb2230;
    if (iVar9 == 0) {
      (*(code *)PTR_thunk_FUN_0924b57c_08cb222c)(iVar19);
      *(undefined4 *)(&stack0xffffffe4 + iVar4) = 0;
      iVar9 = 4;
    }
    else {
      uVar7 = *(undefined2 *)(DAT_08cb21fe + param_1);
      uVar10 = (*(code *)PTR_FUN_08cb2230)(iVar19);
      iVar9 = (*(code *)PTR_FUN_08cb2234)(param_1,uVar7,uVar10,*puVar20);
      if (iVar9 == 0) {
        (*(code *)PTR_thunk_FUN_0924b57c_08cb222c)(iVar19);
        *(undefined4 *)(&stack0xffffffe4 + iVar4) =
             *(undefined4 *)((int)&local_20 + DAT_08cb2208 + iVar4);
        iVar9 = 1;
      }
      else {
        iVar9 = (int)DAT_08cb2350;
        uVar10 = (*(code *)puVar5)(iVar19);
        iVar16 = (int)&local_20 + iVar9 + iVar4;
        iVar11 = (int)DAT_08cb2352;
        (*(code *)PTR_FUN_08cb2368)(iVar16,uVar10,0);
        iVar9 = (*(code *)puVar5)(iVar19);
        puVar5 = PTR_FUN_08cb236c;
        uVar1 = *puVar20;
        uVar10 = (*(code *)PTR_FUN_08cb236c)(iVar16);
        *(undefined4 *)(iVar11 + param_1 + 0x3c) = uVar10;
        uVar10 = (*(code *)puVar5)(iVar16);
        puVar14 = (undefined4 *)(DAT_08cb2354 + param_1);
        *puVar14 = uVar10;
        uVar10 = (*(code *)puVar5)(iVar16);
        puVar14[1] = uVar10;
        uVar10 = (*(code *)puVar5)(iVar16);
        puVar6 = PTR_DAT_08cb2370;
        puVar14[2] = uVar10;
        if ((*(int **)puVar6 != (int *)0x0) &&
           (iVar11 = (**(code **)(**(int **)puVar6 + 0x14))(0x20), iVar11 != 0)) {
          *(undefined **)((int)&local_20 + DAT_08cb2356 + iVar4) = PTR_PTR_08cb2374;
          uVar12 = *puVar14;
          *(undefined4 *)((int)local_28 + iVar4) = puVar14[1];
          uVar10 = *(undefined4 *)(DAT_08cb2358 + param_1);
          *(undefined4 *)((int)local_28 + iVar4 + 4) = puVar14[2];
          (*(code *)PTR_FUN_08cb2378)(PTR_s_Rectangle__li___li___li___li_08cb237c,uVar10,uVar12);
        }
        iVar19 = (int)DAT_08cb235a;
        puVar14 = (undefined4 *)((int)&local_20 + DAT_08cb2350 + iVar4);
        iVar11 = (int)DAT_08cb235c;
        bVar3 = *(byte *)*puVar14;
        *puVar14 = (byte *)*puVar14 + 1;
        puVar14[1] = puVar14[1] + -1;
        *(ushort *)(iVar19 + param_1) = (ushort)bVar3;
        uVar10 = (*(code *)puVar5)(puVar14);
        *(undefined4 *)(iVar11 + param_1 + 0x34) = uVar10;
        uVar10 = (*(code *)puVar5)(puVar14);
        uVar2 = *(ushort *)(iVar19 + param_1);
        *(undefined4 *)(iVar11 + param_1 + 0x38) = uVar10;
        if ((ushort)(uVar2 - 1) < 0x20) {
          iVar11 = 0;
          if (*(int **)PTR_DAT_08cb2370 != (int *)0x0) {
            iVar19 = (**(code **)(**(int **)PTR_DAT_08cb2370 + 0x14))(0x20);
            iVar11 = 0;
            if (iVar19 != 0) {
              *(undefined **)((int)&local_20 + DAT_08cb2360 + iVar4) = PTR_PTR_08cb2374;
              (*(code *)PTR_FUN_08cb2378)
                        (PTR_s_Levels__d_08cb2384,(int)*(short *)(DAT_08cb235a + param_1));
              iVar11 = 0;
            }
          }
          do {
            iVar19 = iVar11 * 4;
            iVar16 = (int)&local_20 + DAT_08cb2350 + iVar4;
            uVar10 = (*(code *)puVar5)(iVar16);
            *(undefined4 *)(&stack0xfffffff0 + iVar19 + iVar4) = uVar10;
            if (*(int *)(DAT_08cb2362 + param_1) < 0x22) {
              iVar16 = (int)DAT_08cb242c;
              uVar10 = (*(code *)PTR_FUN_08cb2440)((int)&local_20 + DAT_08cb242a + iVar4);
              *(undefined4 *)((int)&local_20 + iVar19 + iVar16 + iVar4) = uVar10;
            }
            else {
              iVar15 = (int)DAT_08cb2364;
              uVar10 = (*(code *)puVar5)(iVar16);
              *(undefined4 *)((int)&local_20 + iVar19 + iVar15 + iVar4) = uVar10;
            }
            iVar11 = iVar11 + 1;
          } while (iVar11 < 0x20);
          iVar11 = (int)DAT_08cb242e;
          iVar19 = (int)&local_20 + DAT_08cb242a + iVar4;
          uVar7 = (*(code *)PTR_FUN_08cb2440)(iVar19);
          *(undefined2 *)(iVar11 + param_1) = uVar7;
          puVar6 = PTR_FUN_08cb2444;
          (*(code *)PTR_FUN_08cb2444)(iVar19,param_1 + DAT_08cb2430,0x10);
          (*(code *)puVar6)(iVar19,param_1 + DAT_08cb2432,(int)DAT_08cb2434);
          if ((*(int **)PTR_DAT_08cb2448 != (int *)0x0) &&
             (iVar11 = (**(code **)(**(int **)PTR_DAT_08cb2448 + 0x14))(0x20), iVar11 != 0)) {
            *(undefined **)((int)&local_20 + DAT_08cb2436 + iVar4) = PTR_PTR_08cb244c;
            (*(code *)PTR_FUN_08cb2454)
                      (PTR_s_XacName__s_XacId__s_08cb2450,param_1 + DAT_08cb2432,
                       param_1 + DAT_08cb2432 + -0x10);
          }
          iVar11 = (int)&local_20 + DAT_08cb242a + iVar4;
          uVar10 = (*(code *)PTR_FUN_08cb2440)(iVar11);
          *(undefined4 *)((int)&local_20 + DAT_08cb2438 + iVar4) = uVar10;
          uVar10 = (*(code *)puVar5)(iVar11);
          *(undefined4 *)(&stack0x00000018 + DAT_08cb243a + iVar4) = uVar10;
          if (*(int *)(DAT_08cb243c + param_1) < 0x16) {
            uVar10 = (*(code *)PTR_FUN_08cb2600)((int)&local_20 + DAT_08cb25ea + iVar4);
            *(undefined4 *)(&stack0x0000001c + DAT_08cb25ec + iVar4) = uVar10;
          }
          else {
            uVar10 = (*(code *)puVar5)(iVar11);
            *(undefined4 *)(&stack0x0000001c + DAT_08cb243a + iVar4) = uVar10;
          }
          iVar11 = DAT_08cb25ee + param_1;
          if (0x1f < *(int *)(iVar11 + 0xc)) {
            iVar19 = (int)&local_20 + DAT_08cb25ea + iVar4;
            uVar10 = (*(code *)puVar5)(iVar19);
            *(undefined4 *)(&stack0xffffffe4 + DAT_08cb25f0 + iVar4) = uVar10;
            uVar10 = (*(code *)puVar5)(iVar19);
            *(undefined4 *)(&stack0xffffffe8 + DAT_08cb25f0 + iVar4) = uVar10;
            uVar10 = (*(code *)puVar5)(iVar19);
            *(undefined4 *)(&stack0xffffffec + DAT_08cb25f0 + iVar4) = uVar10;
            uVar10 = (*(code *)puVar5)(iVar19);
            *(undefined4 *)(&stack0xfffffff0 + DAT_08cb25f0 + iVar4) = uVar10;
          }
          puVar5 = PTR_FUN_08cb2604;
          piVar18 = (int *)((int)&local_20 + DAT_08cb25ea + iVar4);
          iVar19 = (iVar9 + (uint)uVar1) - *piVar18;
          iVar9 = iVar19;
          if (0x21 < *(int *)(iVar11 + 0xc) || 0xf < iVar19) {
            iVar9 = iVar19 + -0x10;
            (*(code *)PTR_FUN_08cb2604)(piVar18);
            (*(code *)puVar5)(piVar18);
            (*(code *)puVar5)(piVar18);
            (*(code *)puVar5)(piVar18);
            if (0x21 < *(int *)(iVar11 + 0xc) || 1 < iVar9) {
              iVar16 = (int)DAT_08cb25f2;
              iVar9 = iVar19 + -0x12;
              sVar8 = (*(code *)PTR_FUN_08cb2600)(piVar18);
              ((undefined4 *)(iVar16 + param_1))[3] = (uint)(sVar8 != 0);
              if (3 < iVar9) {
                iVar9 = iVar19 + -0x16;
                uVar10 = (*(code *)puVar5)(piVar18);
                iVar11 = *(int *)(iVar11 + 0xc);
                *(undefined4 *)(iVar16 + param_1) = uVar10;
                if (0x22 < iVar11 && 1 < iVar9) {
                  bVar3 = *(byte *)*piVar18;
                  *piVar18 = (int)((byte *)*piVar18 + 1);
                  uVar17 = (uint)bVar3;
                  piVar18[1] = piVar18[1] + -1;
                  iVar11 = 0;
                  *(uint *)(DAT_08cb25f4 + param_1) = uVar17;
                  if (uVar17 != 0) {
                    puVar14 = (undefined4 *)(DAT_08cb25f6 + param_1);
                    do {
                      uVar10 = (*(code *)puVar5)((int)&local_20 + DAT_08cb25ea + iVar4);
                      if (iVar11 < 0x40) {
                        *puVar14 = uVar10;
                      }
                      iVar11 = iVar11 + 1;
                      puVar14 = puVar14 + 1;
                    } while (iVar11 < (int)uVar17);
                  }
                  if (iVar11 < 0x40) {
                    puVar14 = (undefined4 *)(iVar11 * 4 + param_1 + (int)DAT_08cb25f6);
                    do {
                      iVar11 = iVar11 + 1;
                      *puVar14 = 0;
                      puVar14 = puVar14 + 1;
                    } while (iVar11 < 0x40);
                  }
                  iVar9 = iVar9 + *(int *)(DAT_08cb25f4 + param_1) * -4 + -2;
                }
              }
            }
          }
          if (0x31 < *(int *)(DAT_08cb25f8 + param_1) && 3 < iVar9) {
            puVar14 = (undefined4 *)((int)&local_20 + DAT_08cb25ea + iVar4);
            iVar19 = (*(code *)PTR_FUN_08cb2604)(puVar14);
            *(undefined4 *)((int)&local_20 + DAT_08cb25fa + iVar4) = *puVar14;
            sVar8 = 0;
            for (iVar11 = iVar19; 1 < iVar11; iVar11 = (iVar11 + -2) - iVar16) {
              piVar18 = (int *)((int)&local_20 + DAT_08cb25ea + iVar4);
              iVar16 = (*(code *)PTR_FUN_08cb2600)(piVar18);
              *piVar18 = *piVar18 + iVar16;
              piVar18[1] = piVar18[1] - iVar16;
              sVar8 = sVar8 + 1;
            }
            if (iVar11 != 0) {
              (*(code *)PTR_thunk_FUN_0924b57c_08cb2608)((int)&local_20 + DAT_08cb25fc + iVar4);
              *(undefined4 *)(&stack0xffffffe4 + iVar4) = 0;
              return 2;
            }
            iVar15 = (int)DAT_08cb2796;
            iVar16 = (int)DAT_08cb2798;
            iVar11 = (*(code *)PTR_FUN_08cb27b4)
                               (0x1c,*(undefined4 *)(iVar15 + param_1 + 0x20),iVar19);
            iVar9 = (iVar9 - iVar19) + -4;
            piVar18 = (int *)(iVar16 + param_1);
            if (iVar11 != 0) {
              (*(code *)PTR_FUN_08cb27b8)(iVar11,0x30,0);
            }
            (*(code *)PTR_FUN_08cb27bc)(piVar18,iVar11);
            if (*piVar18 != 0) {
              iVar11 = (int)DAT_08cb279a;
              *(int *)(iVar15 + param_1 + 0x18) = iVar19;
              *(short *)(iVar11 + param_1) = sVar8;
              (*(code *)PTR_FUN_08cb27c0)
                        (*piVar18 + 0x1c,*(undefined4 *)((int)&local_20 + DAT_08cb279c + iVar4),
                         iVar19);
            }
          }
          iVar19 = (int)DAT_08cb279e;
          iVar11 = (int)DAT_08cb27a0;
          *(undefined2 *)(iVar19 + param_1) = 0;
          if ((0x32 < *(int *)(iVar11 + param_1) || *(int *)(iVar11 + param_1) - 0x26U < 0xc) &&
             (1 < iVar9)) {
            uVar7 = (*(code *)PTR_FUN_08cb27c4)((int)&local_20 + DAT_08cb27a2 + iVar4);
            *(undefined2 *)(iVar19 + param_1) = uVar7;
          }
          uVar17 = 0;
          if (0 < *(short *)(DAT_08cb27a4 + param_1)) {
            iVar9 = 0;
            do {
              iVar11 = (*(code *)PTR_FUN_08cb27c8)
                                 (param_1,uVar17 & 0xffff,
                                  *(undefined4 *)(&stack0xfffffff0 + iVar9 + iVar4),
                                  *(undefined4 *)((int)&local_20 + iVar9 + DAT_08cb27a6 + iVar4));
              if (iVar11 != 0) {
                (*(code *)PTR_thunk_FUN_0924b57c_08cb27d0)((int)&local_20 + DAT_08cb27ae + iVar4);
                *(undefined4 *)(&stack0xffffffe4 + iVar4) = 0;
                return iVar11;
              }
              uVar17 = uVar17 + 1;
              iVar9 = iVar9 + 4;
            } while ((int)uVar17 < (int)*(short *)(DAT_08cb27a4 + param_1));
          }
          iVar11 = 0;
          iVar9 = *(int *)(DAT_08cb27a8 + param_1);
          *(undefined4 *)(param_1 + 0x1c) = *(undefined4 *)(iVar9 + 0x8c);
          if (0 < *(int *)(iVar9 + 0x8c)) {
            puVar14 = (undefined4 *)(param_1 + 0x20);
            puVar13 = (undefined4 *)(DAT_08cb27a6 + iVar9);
            do {
              uVar10 = *puVar13;
              puVar13 = puVar13 + 1;
              iVar11 = iVar11 + 1;
              *puVar14 = uVar10;
              puVar14 = puVar14 + 1;
            } while (iVar11 < *(int *)(iVar9 + 0x8c));
          }
          iVar9 = (int)DAT_08cb27ac + iVar4 + -0x20;
          iVar9 = (*(code *)PTR_FUN_08cb27cc)
                            (param_1,*(undefined4 *)((int)&local_20 + DAT_08cb27aa + iVar4),
                             *(undefined4 *)(&stack0x00000018 + iVar9 + 0x20),
                             *(undefined4 *)(&stack0x0000001c + iVar9 + 0x20));
          if (iVar9 == 0) {
            iVar9 = *(int *)((int)&local_20 + DAT_08cb27b0 + iVar4);
            if (0 < iVar9) {
              iVar11 = (int)DAT_08cb27aa + iVar4 + -0x24;
              *(undefined4 *)((int)local_28 + iVar4 + 4) =
                   *(undefined4 *)(&stack0xffffffec + DAT_08cb27aa + iVar4);
              iVar9 = (*(code *)PTR_FUN_08cb27d4)
                                (param_1,iVar9,*(undefined4 *)(&stack0xffffffe4 + iVar11 + 0x24),
                                 *(undefined4 *)(&stack0xffffffe8 + iVar11 + 0x24));
              if (iVar9 != 0) {
                (*(code *)PTR_thunk_FUN_0924b57c_08cb27d0)((int)&local_20 + DAT_08cb27ae + iVar4);
                *(undefined4 *)(&stack0xffffffe4 + iVar4) = 0;
                return iVar9;
              }
            }
            iVar9 = (int)&local_20 + DAT_08cb27ae + iVar4;
            (*(code *)PTR_FUN_08cb27d8)(iVar9);
            (*(code *)PTR_thunk_FUN_0924b57c_08cb27d0)(iVar9);
            *(undefined4 *)(&stack0xffffffe4 + iVar4) = 0;
            iVar9 = 0;
          }
          else {
            (*(code *)PTR_thunk_FUN_0924b57c_08cb27d0)((int)&local_20 + DAT_08cb27ae + iVar4);
            *(undefined4 *)(&stack0xffffffe4 + iVar4) = 0;
          }
        }
        else {
          (*(code *)PTR_thunk_FUN_0924b57c_08cb2380)((int)&local_20 + DAT_08cb235e + iVar4);
          iVar9 = 2;
          *(undefined4 *)(&stack0xffffffe4 + iVar4) = 0;
        }
      }
    }
  }
  else {
    *(undefined4 *)(&stack0xffffffe4 + iVar4) = 0;
  }
  return iVar9;
}



/* ===== FUN_08cb2920 @ 08cb2920 ===== */

undefined4 FUN_08cb2920(int param_1,int param_2)

{
  undefined4 uVar1;
  
  if ((param_2 < 0) || (*(short *)(DAT_08cb2950 + param_1) <= param_2)) {
    uVar1 = 0;
  }
  else {
    uVar1 = *(undefined4 *)(DAT_08cb2950 + 4 + param_2 * 4 + param_1);
  }
  return uVar1;
}



/* ===== FUN_08cb2a40 @ 08cb2a40 ===== */

/* WARNING: Removing unreachable block (ram,0x08cb2a96) */
/* WARNING: Removing unreachable block (ram,0x08cb2a72) */
/* WARNING: Removing unreachable block (ram,0x08cb2a88) */
/* WARNING: Removing unreachable block (ram,0x08cb2b80) */

void FUN_08cb2a40(int param_1,uint param_2,undefined4 param_3)

{
  undefined *puVar1;
  int iVar2;
  undefined4 *in_r2;
  uint uVar3;
  uint uVar4;
  uint uVar5;
  int iVar6;
  int iVar7;
  int iVar8;
  undefined *local_4c;
  uint local_48;
  undefined *local_44;
  undefined4 local_40;
  int local_3c;
  undefined *local_38;
  undefined *local_34;
  undefined4 local_30;
  int local_2c;
  undefined *local_28;
  undefined4 local_24;
  
  puVar1 = PTR_PTR_08cb2bd8;
  uVar4 = 0;
  uVar5 = param_2 & 0xffff;
  local_48 = ~(uint)&local_4c;
  uVar3 = param_2 >> 0x10;
  local_4c = PTR_PTR_08cb2bd8;
  if ((int)param_2 < 0) {
    if ((param_2 >> 0x1e & 1) == 0) {
      uVar4 = (int)uVar5 >> 0xc;
      uVar5 = uVar5 & (int)DAT_08cb2bcc;
      uVar3 = uVar3 & (int)DAT_08cb2bcc;
    }
    else {
      uVar3 = uVar3 & 0xff;
      uVar4 = uVar5 >> 8;
      uVar5 = param_2 & 0xff;
    }
  }
  else if ((param_2 >> 0xf & 1) != 0) {
    uVar4 = 1;
    uVar5 = uVar5 & (int)DAT_08cb2bce;
  }
  local_24 = param_3;
  if (((int)uVar4 < (int)*(short *)(DAT_08cb2bd0 + param_1)) &&
     (iVar6 = *(int *)(uVar4 * 4 + param_1 + (int)DAT_08cb2bd2), iVar6 != 0)) {
    uVar4 = -(int)*(short *)(iVar6 + 0x2c);
    if ((int)uVar4 < 0) {
      iVar8 = (int)uVar5 >> (~uVar4 & 0x1f) + 1;
    }
    else {
      iVar8 = uVar5 << (uVar4 & 0x1f);
    }
    uVar4 = -(int)*(short *)(iVar6 + 0x2e);
    if ((int)uVar4 < 0) {
      iVar7 = (int)uVar3 >> (~uVar4 & 0x1f) + 1;
    }
    else {
      iVar7 = uVar3 << (uVar4 & 0x1f);
    }
    if ((((*(int *)(iVar6 + 0x7c) <= iVar8) || (*(int *)(iVar6 + 0x80) <= iVar7)) &&
        (*(int **)PTR_DAT_08cb2bdc != (int *)0x0)) &&
       (iVar2 = (**(code **)(**(int **)PTR_DAT_08cb2bdc + 0x14))(2), iVar2 != 0)) {
      local_30 = 2;
      local_2c = (int)DAT_08cb2bd6;
      local_34 = puVar1;
      local_28 = PTR_s_cl_x_<_eb_>m_anz_cluster_x____cl_08cb2bec;
      (*(code *)PTR_FUN_08cb2be8)(&local_34,PTR_DAT_08cb2be4);
    }
    if (((iVar8 < 0) || (*(int *)(iVar6 + 0x7c) <= iVar8 || iVar7 < 0)) ||
       (*(int *)(iVar6 + 0x80) <= iVar7)) {
      *in_r2 = 0;
    }
    else {
      (*(code *)PTR_FUN_08cb2bf0)(iVar6,iVar8,iVar7,local_24,param_1,0);
    }
  }
  else {
    if ((((int)*(short *)(DAT_08cb2bd0 + param_1) <= (int)uVar4) ||
        (*(int *)(DAT_08cb2bd0 + 4 + uVar4 * 4 + param_1) == 0)) &&
       ((*(int **)PTR_DAT_08cb2bdc != (int *)0x0 &&
        (iVar6 = (**(code **)(**(int **)PTR_DAT_08cb2bdc + 0x14))(2), iVar6 != 0)))) {
      local_40 = 2;
      local_3c = (int)DAT_08cb2bd4;
      local_44 = puVar1;
      local_38 = PTR_s_ebene_nr_>__0____ebene_nr_<_m_an_08cb2be0;
      (*(code *)PTR_FUN_08cb2be8)(PTR_DAT_08cb2be4);
    }
    *in_r2 = 0;
  }
  return;
}



/* ===== FUN_08cb2bf4 @ 08cb2bf4 ===== */

void FUN_08cb2bf4(int param_1,int param_2,int param_3,int param_4,undefined4 param_5)

{
  undefined *puVar1;
  int iVar2;
  int iVar3;
  uint uVar4;
  undefined4 *in_r2;
  int *piVar5;
  code *pcVar6;
  int extraout_FPUL;
  int extraout_FPUL_00;
  undefined *local_54;
  uint local_50;
  undefined *local_4c;
  undefined4 local_48;
  int local_44;
  undefined *local_40;
  undefined *local_3c;
  undefined4 local_38;
  int local_34;
  undefined *local_30;
  int local_2c;
  int local_28;
  int local_24;
  
  puVar1 = PTR_PTR_08cb2d94;
  local_50 = ~(uint)&local_54;
  local_54 = PTR_PTR_08cb2d94;
  if ((((param_3 < *(int *)(DAT_08cb2d86 + param_1)) ||
       (piVar5 = (int *)(DAT_08cb2d88 + param_1), param_4 < *piVar5)) || (piVar5[1] <= param_3)) ||
     (piVar5[2] <= param_4)) {
    *in_r2 = 0;
  }
  else {
    local_28 = param_4;
    if (((param_2 < 0) || (*(short *)(DAT_08cb2d8a + param_1) <= param_2)) &&
       ((*(int **)PTR_DAT_08cb2d98 != (int *)0x0 &&
        (iVar2 = (**(code **)(**(int **)PTR_DAT_08cb2d98 + 0x14))(2), iVar2 != 0)))) {
      local_48 = 2;
      local_44 = (int)DAT_08cb2d8c;
      local_4c = puVar1;
      local_40 = PTR_s_ebene_nr_>__0____ebene_nr_<_m_an_08cb2d9c;
      (*(code *)PTR_FUN_08cb2da4)(PTR_DAT_08cb2da0);
    }
    if ((param_2 < 0) || (*(short *)(DAT_08cb2d8a + param_1) <= param_2)) {
      *in_r2 = 0;
    }
    else {
      iVar2 = *(int *)((int)DAT_08cb2d8e + param_2 * 4 + param_1);
      if (iVar2 == 0) {
        *in_r2 = 0;
      }
      else {
        uVar4 = (uint)*(short *)(iVar2 + 0x2c);
        if ((int)uVar4 < 0) {
          uVar4 = *(uint *)(iVar2 + 0x24) >> (~uVar4 & 0x1f) + 1;
        }
        else {
          uVar4 = *(uint *)(iVar2 + 0x24) << (uVar4 & 0x1f);
        }
        pcVar6 = (code *)PTR_FUN_08cb2da8;
        (*(code *)PTR_FUN_08cb2da8)(param_3 - *(int *)(DAT_08cb2d86 + param_1),uVar4);
        uVar4 = (uint)*(short *)(iVar2 + 0x2e);
        if ((int)uVar4 < 0) {
          uVar4 = *(uint *)(iVar2 + 0x28) >> (~uVar4 & 0x1f) + 1;
        }
        else {
          uVar4 = *(uint *)(iVar2 + 0x28) << (uVar4 & 0x1f);
        }
        iVar3 = extraout_FPUL;
        local_24 = extraout_FPUL;
        (*pcVar6)(local_28 - *(int *)(DAT_08cb2d88 + param_1),uVar4);
        if ((((*(int *)(iVar2 + 0x7c) <= iVar3) || (*(int *)(iVar2 + 0x80) <= extraout_FPUL_00)) &&
            (*(int **)PTR_DAT_08cb2d98 != (int *)0x0)) &&
           (iVar3 = (**(code **)(**(int **)PTR_DAT_08cb2d98 + 0x14))(2), iVar3 != 0)) {
          local_3c = PTR_PTR_08cb2d94;
          local_38 = 2;
          local_34 = (int)DAT_08cb2d90;
          local_30 = PTR_s_cl_x_<_eb_>m_anz_cluster_x____cl_08cb2dac;
          (*(code *)PTR_FUN_08cb2da4)(&local_3c,PTR_DAT_08cb2da0);
        }
        puVar1 = PTR_FUN_08cb2db4;
        (*(code *)PTR_FUN_08cb2db0)(iVar2,local_24,extraout_FPUL_00,param_5,param_1,0);
        if (local_2c == 0) {
          *in_r2 = 0;
          (*(code *)puVar1)(&local_2c);
        }
        else {
          (*(code *)PTR_FUN_08cb2db8)(param_3,local_28,param_1,iVar2,param_5);
          (*(code *)puVar1)(&local_2c);
        }
      }
    }
  }
  return;
}



/* ===== FUN_08cb2fc4 @ 08cb2fc4 ===== */

/* WARNING: Removing unreachable block (ram,0x08cb300e) */
/* WARNING: Removing unreachable block (ram,0x08cb2ff8) */
/* WARNING: Removing unreachable block (ram,0x08cb301c) */

undefined4 * FUN_08cb2fc4(int param_1,uint param_2,undefined4 param_3,int param_4)

{
  undefined *puVar1;
  uint uVar2;
  uint uVar3;
  undefined4 *in_r2;
  uint uVar4;
  uint uVar5;
  uint uVar6;
  int iVar7;
  undefined *local_4c;
  uint local_48;
  int local_40;
  undefined1 auStack_3c [4];
  undefined4 *local_38;
  int local_34;
  undefined4 local_30;
  int local_2c;
  short *local_28;
  short *local_24;
  
  uVar5 = 0;
  uVar6 = param_2 & 0xffff;
  local_4c = PTR_PTR_08cb3128;
  uVar4 = param_2 >> 0x10;
  local_48 = ~(uint)&local_4c;
  if ((int)param_2 < 0) {
    if ((param_2 >> 0x1e & 1) == 0) {
      uVar5 = (int)uVar6 >> 0xc;
      uVar6 = uVar6 & (int)DAT_08cb311e;
      uVar4 = uVar4 & (int)DAT_08cb311e;
    }
    else {
      uVar4 = uVar4 & 0xff;
      uVar5 = uVar6 >> 8;
      uVar6 = param_2 & 0xff;
    }
  }
  else if ((param_2 >> 0xf & 1) != 0) {
    uVar5 = 1;
    uVar6 = uVar6 & (int)DAT_08cb3120;
  }
  local_38 = in_r2;
  if ((int)uVar5 < (int)*(short *)(param_1 + DAT_08cb3122)) {
    iVar7 = *(int *)((int)DAT_08cb3124 + uVar5 * 4 + param_1);
    local_28 = (short *)(iVar7 + 0x2c);
    local_24 = (short *)(iVar7 + 0x2e);
    uVar5 = -(int)*local_28;
    if ((int)uVar5 < 0) {
      uVar5 = (int)uVar6 >> (~uVar5 & 0x1f) + 1;
    }
    else {
      uVar5 = uVar6 << (uVar5 & 0x1f);
    }
    uVar2 = -(int)*local_24;
    if ((int)uVar2 < 0) {
      uVar2 = (int)uVar4 >> (~uVar2 & 0x1f) + 1;
    }
    else {
      uVar2 = uVar4 << (uVar2 & 0x1f);
    }
    if (((int)uVar5 < *(int *)(iVar7 + 0x7c)) && ((int)uVar2 < *(int *)(iVar7 + 0x80))) {
      local_40 = 0;
      local_34 = param_1;
      local_30 = param_3;
      local_2c = param_4;
      (*(code *)PTR_FUN_08cb312c)(iVar7,uVar5,uVar2,param_3,param_1,0);
      puVar1 = PTR_FUN_08cb3134;
      (*(code *)PTR_FUN_08cb3130)(&local_40,auStack_3c);
      (*(code *)puVar1)(auStack_3c);
      if (local_40 == 0) {
        *local_38 = 0;
        (*(code *)puVar1)(&local_40);
      }
      else {
        uVar3 = (uint)*local_28;
        if ((int)uVar3 < 0) {
          uVar5 = uVar5 >> (~uVar3 & 0x1f) + 1;
        }
        else {
          uVar5 = uVar5 << (uVar3 & 0x1f);
        }
        uVar3 = (uint)*local_24;
        if ((int)uVar3 < 0) {
          uVar2 = uVar2 >> (~uVar3 & 0x1f) + 1;
        }
        else {
          uVar2 = uVar2 << (uVar3 & 0x1f);
        }
        (*(code *)PTR_FUN_08cb3138)
                  (uVar6 - uVar5,uVar4 - uVar2,local_34,iVar7,local_30,local_2c == 1);
        (*(code *)puVar1)(&local_40);
      }
    }
    else {
      *in_r2 = 0;
    }
  }
  else {
    *in_r2 = 0;
  }
  return local_38;
}



/* ===== FUN_08cb313c @ 08cb313c ===== */

undefined4 FUN_08cb313c(int *param_1,int *param_2,int *param_3,undefined2 *param_4)

{
  undefined *puVar1;
  uint uVar2;
  int iVar3;
  uint uVar4;
  undefined4 uVar5;
  uint uVar6;
  
  *param_2 = 0;
  *param_3 = 0;
  *param_4 = 0;
  uVar5 = 0;
  if (2 < (uint)param_1[1]) {
    uVar2 = (*(code *)PTR_FUN_08cb31b0)(param_1);
    puVar1 = PTR_FUN_08cb31b4;
    *param_2 = *param_1;
    iVar3 = (*(code *)puVar1)();
    uVar4 = iVar3 + 1;
    uVar5 = 0;
    if (uVar4 < uVar2) {
      iVar3 = *param_1;
      *param_1 = iVar3 + uVar4;
      param_1[1] = param_1[1] - uVar4;
      *param_3 = iVar3 + uVar4;
      uVar6 = uVar2 - uVar4 & 0xffff;
      *param_4 = (short)(uVar2 - uVar4);
      *param_1 = *param_1 + uVar6;
      param_1[1] = param_1[1] - uVar6;
      uVar5 = 1;
    }
  }
  return uVar5;
}



/* ===== FUN_08cb31b8 @ 08cb31b8 ===== */

undefined4
FUN_08cb31b8(int param_1,undefined4 param_2,undefined4 *param_3,undefined4 *param_4,
            undefined2 *param_5)

{
  undefined4 uVar1;
  int iVar2;
  
  iVar2 = *(int *)(DAT_08cb321c + param_1);
  if ((iVar2 != 0) && (2 < *(uint *)(DAT_08cb321c + 4 + param_1))) {
    (*(code *)PTR_FUN_08cb3220)(param_2,iVar2 + 0x1c);
    uVar1 = (*(code *)PTR_FUN_08cb3224)(param_1,param_2,param_3,param_4);
    return uVar1;
  }
  *param_3 = 0;
  *param_4 = 0;
  *param_5 = 0;
  return 0;
}



/* ===== FUN_08cb32ac @ 08cb32ac ===== */

void FUN_08cb32ac(int param_1,undefined4 *param_2)

{
  undefined4 *in_r2;
  
  if (param_2 != (undefined4 *)0x0) {
    *param_2 = 0;
  }
  if (*(int *)(DAT_08cb32d6 + param_1) == 0) {
    *in_r2 = 0;
  }
  else {
    (*(code *)PTR_FUN_08cb32d8)();
  }
  return;
}



/* ===== FUN_08cb32dc @ 08cb32dc ===== */

undefined4
FUN_08cb32dc(undefined4 param_1,int param_2,undefined4 param_3,int param_4,undefined4 param_5)

{
  uint uVar1;
  undefined4 uVar2;
  undefined1 auStack_3c [44];
  undefined4 local_10 [2];
  
  (*(code *)PTR_FUN_08cb335c)(auStack_3c,param_3,param_1,param_5);
  uVar2 = 6;
  if (param_4 != 0) {
    uVar2 = 7;
  }
  uVar1 = (*(code *)PTR_FUN_08cb3360)(auStack_3c,uVar2,local_10,0);
  if (((param_2 == 0) && (param_4 != 0)) && ((uVar1 & 1) != 0)) {
    uVar1 = (*(code *)PTR_FUN_08cb3364)(auStack_3c,2,local_10);
  }
  if ((((int)DAT_08cb3358 & uVar1) != 0) &&
     ((param_2 < 1 || (local_10[0] = 0, ((int)DAT_08cb3358 & uVar1) != 8)))) {
    local_10[0] = 0xffffffff;
  }
  return local_10[0];
}



/* ===== FUN_08cb3368 @ 08cb3368 ===== */

int FUN_08cb3368(int param_1,int param_2,int param_3)

{
  if ((param_2 <= param_1) && (param_2 = param_3, param_1 <= param_3)) {
    param_2 = param_1;
  }
  return param_2;
}



/* ===== FUN_08cb3a38 @ 08cb3a38 ===== */

undefined4 FUN_08cb3a38(int param_1)

{
  return *(undefined4 *)(DAT_08cb3a3e + param_1);
}



/* ===== FUN_08cb3a40 @ 08cb3a40 ===== */

undefined4 FUN_08cb3a40(int param_1)

{
  return *(undefined4 *)(DAT_08cb3a46 + param_1);
}



/* ===== FUN_08cb3aa4 @ 08cb3aa4 ===== */

undefined * FUN_08cb3aa4(void)

{
  return PTR_s__14_Q___platform_common_isdb_gdb_08cb3aac;
}



/* ===== FUN_08cb3ab0 @ 08cb3ab0 ===== */

void FUN_08cb3ab0(undefined4 *param_1)

{
  *param_1 = 0xffffffff;
  *(undefined1 *)(param_1 + 1) = 0;
  *(undefined1 *)((int)param_1 + 5) = 0;
  *(undefined1 *)((int)param_1 + 6) = 0;
  param_1[1] = param_1[1] & DAT_08cb3adc & DAT_08cb3ae0;
  param_1[2] = 0;
  param_1[3] = 0;
  (*(code *)PTR_FUN_08cb3ae4)(param_1 + 4);
  return;
}



/* ===== FUN_08cb3ae8 @ 08cb3ae8 ===== */

int FUN_08cb3ae8(int param_1)

{
  return ~-(uint)(0x22 < *(int *)(DAT_08cb3af8 + param_1)) + 0x13;
}



/* ===== FUN_08cb3b54 @ 08cb3b54 ===== */

/* WARNING: Removing unreachable block (ram,0x08cb3c4e) */
/* WARNING: Removing unreachable block (ram,0x08cb3c40) */
/* WARNING: Removing unreachable block (ram,0x08cb3c2e) */
/* WARNING: Removing unreachable block (ram,0x08cb3c1c) */
/* WARNING: Removing unreachable block (ram,0x08cb3c02) */
/* WARNING: Removing unreachable block (ram,0x08cb3bf0) */
/* WARNING: Removing unreachable block (ram,0x08cb3bcc) */
/* WARNING: Removing unreachable block (ram,0x08cb3bba) */
/* WARNING: Removing unreachable block (ram,0x08cb3ba8) */
/* WARNING: Removing unreachable block (ram,0x08cb3b96) */
/* WARNING: Removing unreachable block (ram,0x08cb3b84) */
/* WARNING: Removing unreachable block (ram,0x08cb3b64) */
/* WARNING: Removing unreachable block (ram,0x08cb3b6c) */
/* WARNING: Removing unreachable block (ram,0x08cb3b8a) */
/* WARNING: Removing unreachable block (ram,0x08cb3b9c) */
/* WARNING: Removing unreachable block (ram,0x08cb3bae) */
/* WARNING: Removing unreachable block (ram,0x08cb3bc0) */
/* WARNING: Removing unreachable block (ram,0x08cb3bd2) */
/* WARNING: Removing unreachable block (ram,0x08cb3bf6) */
/* WARNING: Removing unreachable block (ram,0x08cb3c08) */
/* WARNING: Removing unreachable block (ram,0x08cb3c22) */
/* WARNING: Removing unreachable block (ram,0x08cb3c34) */
/* WARNING: Removing unreachable block (ram,0x08cb3c46) */
/* WARNING: Removing unreachable block (ram,0x08cb3c56) */

void FUN_08cb3b54(uint *param_1,uint param_2)

{
  *param_1 = ((((((((((((((((*param_1 & 0xffffffc0 | param_2 & 0x3f) & (int)DAT_08cb3c6a |
                           (param_2 >> 6 & 7) << 6) & (int)DAT_08cb3c68 |
                          (int)DAT_08cb3c6c & param_2) & (int)DAT_08cb3c6e |
                         (param_2 >> 0xb & 1) << 0xb) & (int)DAT_08cb3c70 |
                        (param_2 >> 0xc & 1) << 0xc) & (int)DAT_08cb3c72 |
                       (param_2 >> 0xd & 1) << 0xd) & (int)DAT_08cb3c74 |
                      (param_2 >> 0xe & 1) << 0xe) & DAT_08cb3c7c | (param_2 >> 0xf & 3) << 0xf) &
                     DAT_08cb3c80 | (param_2 >> 0x11 & 7) * 0x20000) & DAT_08cb3c84 |
                   (param_2 >> 0x14 & 7) << 0x14) & DAT_08cb3c88 | (param_2 >> 0x17 & 1) << 0x17) &
                  DAT_08cb3c78 | DAT_08cb3c8c & param_2) & DAT_08cb3c90 |
                (param_2 >> 0x19 & 3) << 0x19) & DAT_08cb3c94 | (param_2 >> 0x1b & 3) << 0x1b) &
               DAT_08cb3c98 | (param_2 >> 0x1d & 1) << 0x1d) & DAT_08cb3c9c |
             (param_2 >> 0x1e & 1) << 0x1e) & DAT_08cb3ca0;
  return;
}



/* ===== FUN_08cb3ca4 @ 08cb3ca4 ===== */

void FUN_08cb3ca4(void)

{
  (*(code *)PTR_FUN_08cb3cac)(0);
  return;
}



/* ===== FUN_08cb3cb0 @ 08cb3cb0 ===== */

/* WARNING: Removing unreachable block (ram,0x08cb3ccc) */
/* WARNING: Removing unreachable block (ram,0x08cb3cd2) */

void FUN_08cb3cb0(uint *param_1,uint param_2)

{
  *param_1 = (((*param_1 & 0xffffff80 | param_2 & 0x3f | param_2 & 0x40) & (int)DAT_08cb3cea |
              (param_2 >> 7 & 1) << 7) & DAT_08cb3cec | DAT_08cb3cf0 & param_2) & DAT_08cb3cf4;
  return;
}



/* ===== FUN_08cb3cf8 @ 08cb3cf8 ===== */

void FUN_08cb3cf8(void)

{
  (*(code *)PTR_FUN_08cb3d00)(0);
  return;
}



/* ===== FUN_08cb3d04 @ 08cb3d04 ===== */

undefined4 FUN_08cb3d04(int param_1)

{
  return *(undefined4 *)(param_1 + 0x20);
}



/* ===== FUN_08cb3d08 @ 08cb3d08 ===== */

undefined4 FUN_08cb3d08(int param_1)

{
  return *(undefined4 *)(param_1 + 0x24);
}



/* ===== FUN_08cb3d0c @ 08cb3d0c ===== */

undefined4 FUN_08cb3d0c(int param_1)

{
  return *(undefined4 *)(param_1 + 0x28);
}



/* ===== FUN_08cb3d10 @ 08cb3d10 ===== */

undefined4 FUN_08cb3d10(int param_1)

{
  return *(undefined4 *)(param_1 + 0x2c);
}



/* ===== FUN_08cb3d14 @ 08cb3d14 ===== */

void FUN_08cb3d14(int param_1,undefined4 param_2,undefined4 param_3,undefined4 param_4,
                 undefined4 param_5)

{
  *(undefined4 *)(param_1 + 0x20) = param_2;
  *(undefined4 *)(param_1 + 0x24) = param_3;
  *(undefined4 *)(param_1 + 0x28) = param_4;
  *(undefined4 *)(param_1 + 0x2c) = param_5;
  return;
}



/* ===== FUN_08cb3d20 @ 08cb3d20 ===== */

void FUN_08cb3d20(int param_1,undefined2 param_2)

{
  *(undefined2 *)(param_1 + 0x1c) = param_2;
  return;
}



/* ===== FUN_08cb3d26 @ 08cb3d26 ===== */

undefined4 FUN_08cb3d26(int param_1)

{
  undefined4 uVar1;
  
  uVar1 = 0;
  if ((-1 < *(int *)(param_1 + 0x38)) && (-1 < *(int *)(param_1 + 0x5c))) {
    uVar1 = 1;
  }
  return uVar1;
}



/* ===== FUN_08cb3d40 @ 08cb3d40 ===== */

int FUN_08cb3d40(int param_1)

{
  int iVar1;
  int iVar2;
  
  iVar1 = (*(code *)PTR_FUN_08cb3d88)();
  iVar2 = 0;
  if (iVar1 != 0) {
    if ((*(int *)(param_1 + 0x60) == 0) || (iVar1 = *(int *)(param_1 + 0x58), iVar1 == 0)) {
      iVar2 = 0;
    }
    else {
      iVar2 = *(int *)(param_1 + 0x60) -
              (iVar1 + 0x1c + (uint)*(ushort *)(iVar1 + 0x1e) + (uint)*(ushort *)(iVar1 + 0x20));
    }
  }
  return iVar2;
}



/* ===== FUN_08cb3d8c @ 08cb3d8c ===== */

undefined4 FUN_08cb3d8c(int param_1,undefined1 *param_2)

{
  undefined *puVar1;
  undefined2 uVar2;
  int iVar3;
  undefined4 uVar4;
  
  iVar3 = (*(code *)PTR_FUN_08cb3e5c)();
  uVar4 = 0;
  if (iVar3 != 0) {
    *param_2 = *(undefined1 *)(param_1 + 8);
    param_2[1] = *(undefined1 *)(param_1 + 9);
    param_2[2] = *(undefined1 *)(param_1 + 10);
    param_2[3] = *(undefined1 *)(param_1 + 0xb);
    *(undefined2 *)(param_2 + 4) = *(undefined2 *)(param_1 + 0xc);
    puVar1 = PTR_FUN_08cb3e64;
    iVar3 = *(int *)(param_1 + 0x10);
    if (iVar3 == DAT_08cb3e60) {
      iVar3 = -1;
    }
    *(short *)(param_2 + 0xe) = (short)iVar3;
    uVar2 = (*(code *)puVar1)(param_1);
    *(undefined2 *)(param_2 + 8) = uVar2;
    if (*(int *)(param_1 + 100) == 0) {
      *(short *)(param_2 + 10) = -1;
    }
    else {
      iVar3 = *(int *)(param_1 + 0x58);
      *(short *)(param_2 + 10) =
           (short)*(int *)(param_1 + 100) -
           ((short)iVar3 + 0x1c + *(short *)(iVar3 + 0x1e) + *(short *)(iVar3 + 0x20));
    }
    *(short *)(param_2 + 6) = (short)*(undefined4 *)(param_1 + 0x38);
    *(undefined4 *)(param_2 + 0x14) = *(undefined4 *)(param_1 + 0x18);
    *(short *)(param_2 + 0xc) = (short)*(undefined4 *)(param_1 + 0x44);
    (*(code *)PTR_FUN_08cb3e68)(param_2,(int)*(short *)(param_1 + 0x40));
    (*(code *)PTR_FUN_08cb3e6c)
              (param_2,*(undefined4 *)(param_1 + 0x28),*(undefined4 *)(param_1 + 0x2c),
               *(undefined4 *)(param_1 + 0x30),*(undefined4 *)(param_1 + 0x34));
    uVar4 = 1;
  }
  return uVar4;
}



/* ===== FUN_08cb3e70 @ 08cb3e70 ===== */

void FUN_08cb3e70(int *param_1)

{
  int iVar1;
  int iVar2;
  int iVar3;
  
  *(undefined1 *)((int)param_1 + 9) = 0xff;
  *(undefined1 *)((int)param_1 + 10) = 0;
  *(undefined1 *)((int)param_1 + 0xb) = 0;
  iVar3 = DAT_08cb3f1c;
  iVar1 = (int)DAT_08cb3f18;
  *(undefined2 *)(param_1 + 3) = 0;
  iVar2 = DAT_08cb3f20;
  *(undefined2 *)(iVar1 + (int)param_1) = 0;
  *(int *)(iVar1 + 4 + (int)param_1) = iVar3;
  param_1[5] = iVar2;
  param_1[0xe] = -1;
  *(undefined4 *)(iVar1 + 8 + (int)param_1) = 0;
  param_1[0x17] = 0;
  param_1[0x18] = 0;
  param_1[0x19] = 0;
  param_1[4] = iVar3;
  iVar3 = param_1[0x16];
  if (iVar3 != 0) {
    *param_1 = (uint)*(ushort *)(iVar3 + 0x1e) + iVar3 + 0x1c + (uint)*(ushort *)(iVar3 + 0x20);
    iVar2 = (uint)*(ushort *)(iVar3 + 0x1e) + iVar3 + 0x1c;
    if ((((uint)*(ushort *)(iVar3 + 0x20) + iVar2 == 0) ||
        ((uint)*(ushort *)(iVar3 + 0x26) + iVar2 == 0)) ||
       (iVar2 + (uint)*(ushort *)(iVar3 + 0x24) == 0)) {
      param_1[0x17] = 0;
    }
    else {
      iVar3 = (*(code *)PTR_FUN_08cb3f24)();
      param_1[0x17] = iVar3;
    }
  }
  return;
}



/* ===== FUN_08cb3f28 @ 08cb3f28 ===== */

bool FUN_08cb3f28(int param_1)

{
  int iVar1;
  int iVar2;
  undefined4 local_14;
  undefined4 local_10 [2];
  
  iVar2 = DAT_08cb3f8a + param_1;
  iVar1 = (*(code *)PTR_FUN_08cb3f8c)(iVar2,&local_14,local_10);
  if (iVar1 != 0) {
    *(uint *)(param_1 + 0x44) = ((uint)*(ushort *)(iVar2 + 0x28) - *(int *)(iVar2 + 0x60)) + -1;
    *(undefined4 *)(param_1 + 0x48) = local_14;
    *(undefined4 *)(param_1 + 0x4c) = local_10[0];
    *(int *)(param_1 + 0x50) = (int)*(short *)(iVar2 + 0x72);
    *(char *)(param_1 + 0x54) = (char)*(undefined4 *)(iVar2 + 0x78);
    *(char *)(param_1 + 0x55) = (char)*(undefined4 *)(iVar2 + 0x74);
  }
  return iVar1 != 0;
}



/* ===== FUN_08cb3f90 @ 08cb3f90 ===== */

/* WARNING: Removing unreachable block (ram,0x08cb47da) */
/* WARNING: Removing unreachable block (ram,0x08cb474e) */
/* WARNING: Removing unreachable block (ram,0x08cb47cc) */
/* WARNING: Removing unreachable block (ram,0x08cb440e) */

undefined4 FUN_08cb3f90(int *param_1)

{
  byte bVar1;
  undefined1 uVar2;
  bool bVar3;
  undefined *puVar4;
  undefined2 uVar5;
  short sVar6;
  int iVar7;
  uint uVar8;
  undefined4 uVar9;
  int iVar10;
  uint uVar11;
  int iVar12;
  uint uVar13;
  byte *pbVar14;
  undefined4 *puVar15;
  byte bVar16;
  undefined4 *puVar17;
  int iVar18;
  int *piVar19;
  bool bVar20;
  uint local_2c [3];
  int local_20;
  
  iVar10 = -(int)DAT_08cb4054;
  if (param_1[0x17] < 1) {
    param_1[0xe] = -1;
    return 0;
  }
  piVar19 = param_1 + 0x16;
  if (*piVar19 == 0) {
    return 0;
  }
  param_1[0x17] = param_1[0x17] + -1;
  param_1[0xe] = param_1[0xe] + 1;
  bVar1 = *(byte *)*param_1;
  *param_1 = (int)((byte *)*param_1 + 1);
  param_1[1] = param_1[1] + -1;
  while (uVar8 = (uint)bVar1, (char)bVar1 < '\0') {
    uVar11 = (uint)DAT_08cb4056;
    uVar13 = uVar8 & 0xe0;
    if (uVar13 == uVar11) {
      *(ushort *)((int)DAT_08cb405a + (int)param_1) = bVar1 & 0xf;
    }
    else if ((int)uVar11 < (int)uVar13) {
      if (uVar13 != (int)DAT_08cb4058) goto LAB_08cb40b2;
      switch(uVar8 - uVar13) {
      case 0:
        uVar2 = *(undefined1 *)*param_1;
        *param_1 = (int)((undefined1 *)*param_1 + 1);
        param_1[1] = param_1[1] + -1;
        *(undefined1 *)((int)param_1 + 9) = uVar2;
        break;
      case 1:
        uVar2 = *(undefined1 *)*param_1;
        *param_1 = (int)((undefined1 *)*param_1 + 1);
        param_1[1] = param_1[1] + -1;
        *(undefined1 *)((int)param_1 + 10) = uVar2;
        break;
      case 2:
        uVar2 = *(undefined1 *)*param_1;
        *param_1 = (int)((undefined1 *)*param_1 + 1);
        param_1[1] = param_1[1] + -1;
        *(undefined1 *)((int)param_1 + 0xb) = uVar2;
        break;
      case 3:
        uVar5 = (*(code *)PTR_FUN_08cb41bc)(param_1);
        *(undefined2 *)(param_1 + 3) = uVar5;
        break;
      default:
        return 0;
      }
    }
    else {
      if (uVar13 != uVar11 - 0x20) {
LAB_08cb40b2:
        if (*(int **)PTR_DAT_08cb41c0 != (int *)0x0) {
          iVar12 = (**(code **)(**(int **)PTR_DAT_08cb41c0 + 0x14))(4);
          if (iVar12 != 0) {
            *(int *)(&stack0xffffffe4 + iVar10) = ~((int)&local_20 + iVar10);
            *(undefined4 *)(&stack0xffffffec + iVar10) = 4;
            *(undefined **)((int)&local_20 + iVar10) = PTR_PTR_08cb41c4;
            *(int *)(&stack0xfffffff0 + iVar10) = (int)DAT_08cb41b6;
            *(undefined **)(&stack0xffffffe8 + iVar10) = PTR_PTR_08cb41c4;
            *(undefined **)(&stack0xfffffff4 + iVar10) = PTR_s_False_08cb41c8;
            (*(code *)PTR_FUN_08cb41cc)(PTR_s_default_case_in_switch_08cb41d0);
            *(undefined4 *)(&stack0xffffffe4 + iVar10) = 0;
          }
        }
        return 0;
      }
      uVar8 = uVar8 & 0x1f;
      if ((bVar1 & 0x1f) == 0) {
        iVar12 = (*(code *)PTR_FUN_08cb405c)(param_1);
        param_1[5] = iVar12;
      }
      else if (uVar8 < 0x10) {
        param_1[5] = param_1[5] + uVar8;
      }
      else {
        param_1[5] = param_1[5] + uVar8 + -0x20;
      }
    }
    bVar1 = *(byte *)*param_1;
    *param_1 = (int)((byte *)*param_1 + 1);
    param_1[1] = param_1[1] + -1;
  }
  bVar16 = (byte)*(undefined2 *)((int)DAT_08cb41b8 + (int)param_1);
  *(byte *)(param_1 + 2) = bVar16;
  iVar12 = *piVar19;
  pbVar14 = (byte *)*param_1;
  param_1[0xf] = (int)(pbVar14 +
                      (*(int *)(iVar12 + 0x50) - (iVar12 + 0x1c + (uint)*(ushort *)(iVar12 + 0x1e)))
                      );
  if (bVar16 != 1) {
    if (bVar16 < 2) {
      if (bVar16 == 0) {
        if ((((char)bVar1 < '\0') && (*(int **)PTR_DAT_08cb41c0 != (int *)0x0)) &&
           (iVar12 = (**(code **)(**(int **)PTR_DAT_08cb41c0 + 0x14))(2), iVar12 != 0)) {
          *(uint *)(&stack0xfffffffc + iVar10) = ~(uint)(&stack0xfffffff8 + iVar10);
          *(undefined4 *)(&stack0x00000004 + iVar10) = 2;
          *(undefined **)(&stack0xfffffff8 + iVar10) = PTR_PTR_08cb41d4;
          *(int *)(&stack0x00000008 + iVar10) = (int)DAT_08cb41ba;
          *(undefined **)(&stack0x00000000 + iVar10) = PTR_PTR_08cb41d4;
          *(undefined **)(&stack0x0000000c + iVar10) = PTR_s_kopfbyte_<_128_08cb41d8;
          (*(code *)PTR_FUN_08cb41cc)((int)&stack0x00000000 + iVar10,PTR_s_head_byte_>_128_08cb41dc)
          ;
          *(undefined4 *)(&stack0xfffffffc + iVar10) = 0;
        }
        switch(uVar8 & 3) {
        case 0:
          param_1[4] = *(int *)((int)DAT_08cb422a + (int)param_1);
          break;
        case 1:
          param_1[4] = DAT_08cb4230;
          break;
        case 2:
          iVar12 = (int)DAT_08cb422c;
          sVar6 = (*(code *)PTR_FUN_08cb4234)(param_1);
          param_1[4] = *(int *)((int)param_1 + iVar12 + 0x3c) + (int)sVar6;
          break;
        case 3:
          iVar12 = (*(code *)PTR_FUN_08cb4238)(param_1);
          param_1[4] = iVar12;
        }
        *(int *)((int)DAT_08cb422a + (int)param_1) = param_1[4];
        iVar12 = 0;
        switch(uVar8 & 0xc) {
        case 0:
          iVar12 = *(int *)((int)DAT_08cb4336 + (int)param_1);
          break;
        case 4:
          bVar16 = *(byte *)*param_1;
          *param_1 = (int)((byte *)*param_1 + 1);
          uVar8 = (uint)bVar16;
          param_1[1] = param_1[1] + -1;
          iVar7 = *piVar19;
          if (iVar7 + 0x1c + (uint)*(ushort *)(iVar7 + 0x1e) + (uint)*(ushort *)(iVar7 + 0x26) != 0)
          {
            piVar19 = (int *)((int)&local_20 + DAT_08cb4338 + iVar10);
            (*(code *)PTR_FUN_08cb4340)(piVar19,0);
            *piVar19 = *piVar19 + uVar8 * 4;
            piVar19[1] = piVar19[1] + uVar8 * -4;
            iVar12 = (*(code *)PTR_FUN_08cb4344)(piVar19);
          }
          break;
        case 8:
          iVar7 = (*(code *)PTR_FUN_08cb4348)(param_1);
          if (((iVar7 < 0) && (*(int **)PTR_DAT_08cb434c != (int *)0x0)) &&
             (iVar18 = (**(code **)(**(int **)PTR_DAT_08cb434c + 0x14))(2), iVar18 != 0)) {
            *(undefined **)(&stack0x00000028 + iVar10) = PTR_PTR_08cb4350;
            *(uint *)(&stack0x0000002c + iVar10) = ~(uint)(&stack0x00000028 + iVar10);
            *(undefined4 *)(&stack0x00000034 + iVar10) = 2;
            *(undefined **)(&stack0x00000030 + iVar10) = PTR_PTR_08cb4350;
            *(int *)(&stack0x00000038 + iVar10) = (int)DAT_08cb433a;
            *(undefined **)(&stack0x0000003c + iVar10) = PTR_s_atoffset_>__0_08cb4354;
            (*(code *)PTR_FUN_08cb435c)(PTR_s_invalid_offset_08cb4358);
            *(undefined4 *)(&stack0x0000002c + iVar10) = 0;
          }
          iVar18 = *piVar19;
          if (iVar18 + 0x1c + (uint)*(ushort *)(iVar18 + 0x1e) + (uint)*(ushort *)(iVar18 + 0x26) !=
              0) {
            piVar19 = (int *)((int)&local_20 + DAT_08cb433c + iVar10);
            (*(code *)PTR_FUN_08cb4340)(piVar19,0);
            *piVar19 = *piVar19 + iVar7 * 4;
            piVar19[1] = piVar19[1] + iVar7 * -4;
            iVar12 = (*(code *)PTR_FUN_08cb4344)(piVar19);
          }
          break;
        case 0xc:
          iVar12 = (*(code *)PTR_FUN_08cb44f0)(param_1);
        }
        puVar4 = PTR_FUN_08cb44f4;
        iVar7 = (int)DAT_08cb44de;
        param_1[6] = iVar12;
        *(int *)(iVar7 + (int)param_1) = iVar12;
        (*(code *)puVar4)(param_1 + 8,iVar12);
        uVar8 = bVar1 >> 4 & 7;
        bVar20 = (bVar1 >> 4 & 7) != 0;
        if (uVar8 == 1) {
          bVar1 = *(byte *)*param_1;
          *param_1 = (int)((byte *)*param_1 + 1);
          uVar8 = (uint)bVar1;
          param_1[1] = param_1[1] + -1;
          bVar20 = uVar8 != 0;
          if (uVar8 == (int)DAT_08cb44e0) {
            uVar8 = (*(code *)PTR_FUN_08cb44f8)(param_1);
            bVar20 = 0 < (int)uVar8;
          }
        }
        param_1[0x11] = uVar8;
        if (((!bVar20) && (*(int **)PTR_DAT_08cb44fc != (int *)0x0)) &&
           (iVar12 = (**(code **)(**(int **)PTR_DAT_08cb44fc + 0x14))(2), iVar12 != 0)) {
          *(undefined **)(&stack0x00000040 + iVar10) = PTR_PTR_08cb4500;
          *(uint *)(&stack0x00000044 + iVar10) = ~(uint)(&stack0x00000040 + iVar10);
          *(undefined4 *)(&stack0x0000004c + iVar10) = 2;
          *(undefined **)(&stack0x00000048 + iVar10) = PTR_PTR_08cb4500;
          *(int *)(&stack0x00000050 + iVar10) = (int)DAT_08cb44e2;
          *(undefined **)(&stack0x00000054 + iVar10) = PTR_s_m_anzahl_punkte_>_0_08cb4504;
          (*(code *)PTR_FUN_08cb450c)(PTR_s_Polygon_with_0_points_08cb4508);
          *(undefined4 *)(&stack0x00000044 + iVar10) = 0;
        }
        puVar4 = PTR_FUN_08cb4510;
        iVar12 = (int)DAT_08cb44e4;
        iVar7 = (int)DAT_08cb44e6;
        param_1[0x19] = 0;
        (*(code *)puVar4)((int)param_1 + iVar12,0);
        puVar4 = PTR_FUN_08cb4514;
        iVar7 = iVar7 + (int)param_1;
        param_1[0x18] = *param_1;
        uVar9 = (*(code *)puVar4)(param_1);
        uVar8 = param_1[8];
        uVar13 = param_1[0x11];
        *(undefined4 *)((int)local_2c + iVar10) = 0;
        *(uint *)((int)local_2c + iVar10 + 8) = uVar8 >> 6 & 1;
        *(undefined4 *)((int)local_2c + iVar10 + 4) = 0;
        (*(code *)PTR_FUN_08cb4518)(iVar7,0,uVar9,uVar13 & 0xffff);
        *param_1 = *param_1 + (uint)*(ushort *)(iVar7 + 0x3a);
        param_1[0x10] = 0;
        bVar3 = false;
        bVar20 = bVar3;
        if ((((*(int *)(iVar7 + 0x50) == 0) && (bVar20 = false, *(int *)(iVar7 + 0x54) == 0)) &&
            (bVar20 = bVar3, *(int *)(iVar7 + 0x58) == 0)) && (*(int *)(iVar7 + 0x5c) == 0)) {
          bVar20 = true;
        }
        if (bVar20) {
          (*(code *)PTR_FUN_08cb451c)((int)param_1 + (int)DAT_08cb44e6);
        }
        piVar19 = (int *)((int)DAT_08cb44e8 + (int)param_1);
        iVar12 = *piVar19;
        if (iVar12 == 0) {
          if (((piVar19[1] == 0) && (piVar19[2] == 0)) &&
             ((piVar19[3] == 0 &&
              ((*(int **)PTR_DAT_08cb44fc != (int *)0x0 &&
               (iVar12 = (**(code **)(**(int **)PTR_DAT_08cb44fc + 0x14))(2), iVar12 != 0)))))) {
            *(undefined **)(&stack0x00000058 + iVar10) = PTR_PTR_08cb4520;
            *(uint *)(&stack0x0000005c + iVar10) = ~(uint)(&stack0x00000058 + iVar10);
            puVar15 = (undefined4 *)((int)&local_20 + DAT_08cb44ea + iVar10);
            puVar15[1] = 2;
            *puVar15 = PTR_PTR_08cb4520;
            puVar15[2] = (int)DAT_08cb44ec;
            puVar15[3] = PTR_s__br_isNull___08cb4524;
            (*(code *)PTR_FUN_08cb450c)(PTR_s_unknown_bounding_rectangle_08cb4528);
            *(undefined4 *)(&stack0x0000005c + iVar10) = 0;
          }
          iVar12 = *piVar19;
        }
        param_1[10] = iVar12;
        param_1[0xb] = piVar19[1];
        param_1[0xc] = piVar19[2];
        param_1[0xd] = piVar19[3];
        return 1;
      }
    }
    else if (bVar16 == 2) {
      uVar8 = uVar8 & 0x3f;
      if (uVar8 == 0x3e) {
        bVar1 = *pbVar14;
        param_1[1] = param_1[1] + -1;
        uVar8 = (uint)bVar1;
        *param_1 = (int)(pbVar14 + 1);
      }
      else if (uVar8 == 0x3f) {
        uVar8 = (*(code *)PTR_FUN_08cb492c)(param_1);
      }
      else if (uVar8 == 0x3d) {
        uVar8 = (*(code *)PTR_FUN_08cb4ac4)(param_1);
      }
      iVar12 = (int)DAT_08cb4aae;
      param_1[6] = uVar8;
      *(uint *)(iVar12 + (int)param_1) = uVar8;
      iVar18 = (int)DAT_08cb4ab0;
      (*(code *)PTR_FUN_08cb4ac8)(param_1 + 9,uVar8);
      iVar18 = iVar18 + (int)param_1;
      iVar12 = (*(code *)PTR_FUN_08cb4acc)(param_1);
      iVar7 = (int)DAT_08cb4ab2;
      param_1[4] = iVar12;
      puVar4 = PTR_FUN_08cb4ad0;
      param_1[0x19] = 0;
      (*(code *)puVar4)((int)param_1 + iVar7,0);
      puVar4 = PTR_FUN_08cb4ad4;
      param_1[0x18] = *param_1;
      param_1[0x11] = 1;
      param_1[0x18] = *param_1;
      uVar9 = (*(code *)puVar4)(param_1);
      *(undefined4 *)((int)local_2c + iVar10) = 0;
      *(undefined4 *)((int)local_2c + iVar10 + 4) = 0;
      *(undefined4 *)((int)local_2c + iVar10 + 8) = 0;
      (*(code *)PTR_FUN_08cb4ad8)(iVar18,2,uVar9,1);
      *param_1 = *param_1 + (uint)*(ushort *)(iVar18 + 0x3a);
      bVar3 = false;
      bVar20 = bVar3;
      if ((((*(int *)(iVar18 + 0x50) == 0) && (bVar20 = false, *(int *)(iVar18 + 0x54) == 0)) &&
          (bVar20 = bVar3, *(int *)(iVar18 + 0x58) == 0)) && (*(int *)(iVar18 + 0x5c) == 0)) {
        bVar20 = true;
      }
      if (bVar20) {
        (*(code *)PTR_FUN_08cb4adc)((int)param_1 + (int)DAT_08cb4ab0);
      }
      piVar19 = (int *)((int)DAT_08cb4ab4 + (int)param_1);
      iVar12 = *piVar19;
      if (iVar12 == 0) {
        if (((piVar19[1] == 0) && (piVar19[2] == 0)) &&
           ((piVar19[3] == 0 &&
            ((*(int **)PTR_DAT_08cb4ae0 != (int *)0x0 &&
             (iVar12 = (**(code **)(**(int **)PTR_DAT_08cb4ae0 + 0x14))(2), iVar12 != 0)))))) {
          puVar17 = (undefined4 *)((int)&local_20 + DAT_08cb4ab6 + iVar10);
          *puVar17 = PTR_PTR_08cb4ae4;
          puVar17[1] = ~(uint)puVar17;
          puVar15 = (undefined4 *)((int)&local_20 + DAT_08cb4ab8 + iVar10);
          puVar15[1] = 2;
          *puVar15 = PTR_PTR_08cb4ae4;
          puVar15[2] = (int)DAT_08cb4aba;
          puVar15[3] = PTR_s__br_isNull___08cb4ae8;
          (*(code *)PTR_FUN_08cb4af0)(PTR_s_unknown_bounding_rectangle_08cb4aec);
          puVar17[1] = 0;
        }
        iVar12 = *piVar19;
      }
      puVar4 = PTR_FUN_08cb4af4;
      param_1[10] = iVar12;
      param_1[0xb] = piVar19[1];
      param_1[0xc] = piVar19[2];
      param_1[0xd] = piVar19[3];
      param_1[0x10] = 0;
      (*(code *)puVar4)(param_1);
      return 1;
    }
    if ((*(int **)PTR_DAT_08cb4ae0 != (int *)0x0) &&
       (iVar12 = (**(code **)(**(int **)PTR_DAT_08cb4ae0 + 0x14))(2), iVar12 != 0)) {
      puVar17 = (undefined4 *)((int)&local_20 + DAT_08cb4abc + iVar10);
      *puVar17 = PTR_PTR_08cb4af8;
      puVar17[1] = ~(uint)puVar17;
      puVar15 = (undefined4 *)((int)&local_20 + DAT_08cb4abe + iVar10);
      puVar15[1] = 2;
      *puVar15 = PTR_PTR_08cb4af8;
      puVar15[2] = (int)DAT_08cb4ac0;
      puVar15[3] = PTR_s_False_08cb4afc;
      (*(code *)PTR_FUN_08cb4af0)(PTR_s_tile_element_next_failed__08cb4b00);
      puVar17[1] = 0;
    }
    param_1[0x17] = 0;
    return 0;
  }
  if ((((char)bVar1 < '\0') && (*(int **)PTR_DAT_08cb458c != (int *)0x0)) &&
     (iVar12 = (**(code **)(**(int **)PTR_DAT_08cb458c + 0x14))(2), iVar12 != 0)) {
    puVar17 = (undefined4 *)((int)&local_20 + DAT_08cb4586 + iVar10);
    *puVar17 = PTR_PTR_08cb4590;
    puVar17[1] = ~(uint)puVar17;
    puVar15 = (undefined4 *)((int)&local_20 + DAT_08cb4588 + iVar10);
    puVar15[1] = 2;
    *puVar15 = PTR_PTR_08cb4590;
    puVar15[2] = (int)DAT_08cb458a;
    puVar15[3] = PTR_s_kopfbyte_<_128_08cb4594;
    (*(code *)PTR_FUN_08cb459c)(PTR_s_invalid_head_byte_08cb4598);
    puVar17[1] = 0;
  }
  switch(uVar8 & 3) {
  case 0:
    param_1[4] = *(int *)((int)DAT_08cb45ea + (int)param_1);
    break;
  case 1:
    param_1[4] = DAT_08cb45f0;
    break;
  case 2:
    iVar12 = (int)DAT_08cb45ec;
    sVar6 = (*(code *)PTR_FUN_08cb45f4)(param_1);
    param_1[4] = *(int *)((int)param_1 + iVar12 + 0x3c) + (int)sVar6;
    break;
  case 3:
    iVar12 = (*(code *)PTR_FUN_08cb45f8)(param_1);
    param_1[4] = iVar12;
  }
  *(int *)((int)DAT_08cb45ea + (int)param_1) = param_1[4];
  iVar12 = 0;
  switch(uVar8 & 0xc) {
  case 0:
    iVar12 = *(int *)((int)DAT_08cb475c + (int)param_1);
    break;
  case 4:
    iVar12 = *piVar19;
    piVar19 = (int *)((int)&local_20 + DAT_08cb475e + iVar10);
    (*(code *)PTR_FUN_08cb476c)
              (piVar19,iVar12 + 0x1c + (uint)*(ushort *)(iVar12 + 0x1e) +
                       (uint)*(ushort *)(iVar12 + 0x26),0);
    puVar4 = PTR_FUN_08cb4770;
    bVar16 = *(byte *)*param_1;
    *param_1 = (int)((byte *)*param_1 + 1);
    uVar13 = (uint)bVar16;
    param_1[1] = param_1[1] + -1;
    *piVar19 = *piVar19 + uVar13 * 4;
    piVar19[1] = piVar19[1] + uVar13 * -4;
    iVar12 = (*(code *)puVar4)(piVar19);
    break;
  case 8:
    iVar12 = *piVar19;
    piVar19 = (int *)((int)&local_20 + DAT_08cb4760 + iVar10);
    (*(code *)PTR_FUN_08cb476c)
              (piVar19,iVar12 + 0x1c + (uint)*(ushort *)(iVar12 + 0x1e) +
                       (uint)*(ushort *)(iVar12 + 0x26),0);
    iVar12 = (*(code *)PTR_FUN_08cb4774)(param_1);
    *piVar19 = *piVar19 + iVar12 * 4;
    piVar19[1] = piVar19[1] + iVar12 * -4;
    iVar12 = (*(code *)PTR_FUN_08cb4770)(piVar19);
    break;
  case 0xc:
    iVar12 = (*(code *)PTR_FUN_08cb4770)(param_1);
  }
  puVar4 = PTR_FUN_08cb4778;
  iVar7 = (int)DAT_08cb475c;
  param_1[6] = iVar12;
  *(int *)(iVar7 + (int)param_1) = iVar12;
  (*(code *)puVar4)(param_1 + 7,iVar12);
  uVar8 = uVar8 & 0x30;
  uVar13 = 0;
  if (uVar8 == 0x10) {
    uVar13 = 3;
  }
  else if (uVar8 < 0x11) {
    bVar20 = false;
    if ((bVar1 & 0x30) != 0) goto LAB_08cb4704;
    uVar13 = 2;
  }
  else if (uVar8 == 0x20) {
    uVar13 = 4;
  }
  else {
    bVar20 = false;
    if (uVar8 != 0x30) goto LAB_08cb4704;
    bVar16 = *(byte *)*param_1;
    *param_1 = (int)((byte *)*param_1 + 1);
    uVar13 = (uint)bVar16;
    param_1[1] = param_1[1] + -1;
    bVar20 = uVar13 != 0;
    if (uVar13 != (int)DAT_08cb4762) goto LAB_08cb4704;
    uVar13 = (*(code *)PTR_FUN_08cb4774)(param_1);
  }
  bVar20 = 0 < (int)uVar13;
LAB_08cb4704:
  param_1[0x11] = uVar13;
  if (((!bVar20) && (*(int **)PTR_DAT_08cb477c != (int *)0x0)) &&
     (iVar12 = (**(code **)(**(int **)PTR_DAT_08cb477c + 0x14))(2), iVar12 != 0)) {
    puVar17 = (undefined4 *)((int)&local_20 + DAT_08cb4764 + iVar10);
    *puVar17 = PTR_PTR_08cb4780;
    puVar17[1] = ~(uint)puVar17;
    puVar15 = (undefined4 *)((int)&local_20 + DAT_08cb4766 + iVar10);
    puVar15[1] = 2;
    *puVar15 = PTR_PTR_08cb4780;
    puVar15[2] = (int)DAT_08cb4768;
    puVar15[3] = PTR_s_m_anzahl_punkte_>_0_08cb4784;
    (*(code *)PTR_FUN_08cb478c)(PTR_s_Line_with_0_points_08cb4788);
    puVar17[1] = 0;
  }
  if ((bVar1 >> 6 & 1) == 0) {
    param_1[0x19] = 0;
  }
  else {
    param_1[0x19] = *param_1;
  }
  iVar12 = (int)DAT_08cb48ea + (int)param_1;
  (*(code *)PTR_FUN_08cb48f8)(iVar12,param_1[0x19]);
  (*(code *)PTR_FUN_08cb48fc)(iVar12);
  iVar18 = (int)DAT_08cb48ec + (int)param_1;
  iVar12 = (*(code *)PTR_FUN_08cb4900)(iVar12);
  puVar4 = PTR_FUN_08cb4904;
  iVar7 = *param_1;
  *param_1 = iVar7 + iVar12;
  param_1[0x18] = iVar7 + iVar12;
  uVar9 = (*(code *)puVar4)(param_1);
  uVar8 = param_1[7];
  uVar13 = param_1[0x11];
  *(uint *)((int)local_2c + iVar10) = uVar8 >> 0xf & 3;
  *(undefined4 *)((int)local_2c + iVar10 + 8) = 0;
  *(uint *)((int)local_2c + iVar10 + 4) = uVar8 >> 0x1e & 1;
  (*(code *)PTR_FUN_08cb4908)(iVar18,1,uVar9,uVar13 & 0xffff);
  *param_1 = *param_1 + (uint)*(ushort *)(iVar18 + 0x3a);
  bVar3 = false;
  bVar20 = bVar3;
  if (((*(int *)(iVar18 + 0x50) == 0) && (bVar20 = false, *(int *)(iVar18 + 0x54) == 0)) &&
     ((bVar20 = bVar3, *(int *)(iVar18 + 0x58) == 0 && (*(int *)(iVar18 + 0x5c) == 0)))) {
    bVar20 = true;
  }
  if (bVar20) {
    (*(code *)PTR_FUN_08cb490c)((int)param_1 + (int)DAT_08cb48ec);
  }
  piVar19 = (int *)((int)DAT_08cb48ee + (int)param_1);
  iVar12 = *piVar19;
  if (iVar12 == 0) {
    if ((((piVar19[1] == 0) && (piVar19[2] == 0)) && (piVar19[3] == 0)) &&
       ((*(int **)PTR_DAT_08cb4910 != (int *)0x0 &&
        (iVar12 = (**(code **)(**(int **)PTR_DAT_08cb4910 + 0x14))(2), iVar12 != 0)))) {
      puVar17 = (undefined4 *)((int)&local_20 + DAT_08cb48f0 + iVar10);
      *puVar17 = PTR_PTR_08cb4914;
      puVar17[1] = ~(uint)puVar17;
      puVar15 = (undefined4 *)((int)&local_20 + DAT_08cb48f2 + iVar10);
      puVar15[1] = 2;
      *puVar15 = PTR_PTR_08cb4914;
      puVar15[2] = (int)DAT_08cb48f4;
      puVar15[3] = PTR_s__br_isNull___08cb4918;
      (*(code *)PTR_FUN_08cb4920)(PTR_s_unknown_bounding_rectangle_08cb491c);
      puVar17[1] = 0;
    }
    iVar12 = *piVar19;
  }
  param_1[10] = iVar12;
  param_1[0xb] = piVar19[1];
  param_1[0xc] = piVar19[2];
  param_1[0xd] = piVar19[3];
  param_1[0x12] = 0;
  param_1[0x13] = 0;
  if ((param_1[7] & DAT_08cb4924) == 0) {
    param_1[0x10] = 0;
  }
  else {
    iVar10 = (*(code *)PTR_FUN_08cb4928)((int)param_1 + (int)DAT_08cb48ec);
    param_1[0x10] = iVar10;
  }
  return 1;
}



