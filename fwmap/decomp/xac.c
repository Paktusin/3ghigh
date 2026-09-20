/* ===== FUN_08271914 @ 08271914 ===== */

undefined4 FUN_08271914(undefined4 param_1,int param_2,undefined4 param_3,int param_4)

{
  byte bVar1;
  ushort uVar2;
  uint3 uVar3;
  undefined *puVar4;
  int iVar5;
  int iVar6;
  ushort *puVar7;
  int iVar8;
  uint uVar9;
  byte *pbVar10;
  byte *pbVar11;
  ushort uVar12;
  byte *pbVar13;
  ushort *puVar14;
  char *pcVar15;
  uint uVar16;
  bool bVar17;
  int local_38;
  byte *local_2c;
  
  pcVar15 = (char *)(*(int *)(param_4 + 0x38) + *(int *)(param_2 + 0x1c));
  local_2c = (byte *)(*(int *)(param_2 + 0x28) + *(int *)(param_4 + 0x50));
  pbVar13 = (byte *)(*(int *)(param_2 + 0x20) + *(int *)(param_4 + 0x50));
  uVar16 = *(uint *)(param_2 + 0x3c);
  do {
    uVar9 = *(uint *)(param_2 + 0x2c);
    while( true ) {
      while (local_2c + uVar9 <= pbVar13) {
        if ((uVar9 & 3) != 0) {
          pbVar13 = pbVar13 + (4 - (int)uVar9 % 4);
        }
        bVar1 = *pbVar13;
        puVar7 = (ushort *)(param_2 + 0x34);
        *puVar7 = (short)(char)bVar1 << 8;
        uVar12 = CONCAT11(bVar1,pbVar13[1]);
        bVar17 = uVar12 == DAT_08271bac;
        *puVar7 = uVar12;
        if (bVar17) {
          return 0xffffffff;
        }
        puVar14 = (ushort *)(param_2 + 0x32);
        uVar12 = uVar12 + *(short *)(param_2 + 0x30);
        *puVar7 = uVar12;
        bVar1 = pbVar13[4];
        *(uint *)(param_2 + 0x2c) = (uint)bVar1 << 8;
        uVar2 = CONCAT11(bVar1,pbVar13[5]);
        *(uint *)(param_2 + 0x2c) = (uint)uVar2 << 8;
        uVar3 = CONCAT21(uVar2,pbVar13[6]);
        *(uint *)(param_2 + 0x2c) = (uint)uVar3 << 8;
        local_2c = pbVar13 + 8;
        local_38 = 0;
        *(uint *)(param_2 + 0x2c) = CONCAT31(uVar3,pbVar13[7]);
        if (uVar12 == *puVar14) {
          local_38 = (*(code *)PTR_FUN_08271bb0)(param_3);
        }
        if ((*puVar7 == *puVar14 && local_38 == 0) || (*puVar14 < *puVar7)) {
          if (-1 < *pcVar15) {
            return 0xffffffff;
          }
          uVar9 = (int)*pcVar15 & 0x7f;
          *puVar14 = (ushort)uVar9;
          if (uVar9 < 0x7e) {
            pcVar15 = pcVar15 + 1;
          }
          else if (uVar9 == 0x7e) {
            pcVar15 = pcVar15 + 2;
          }
          else if (uVar9 == 0x7f) {
            pcVar15 = pcVar15 + 3;
          }
          uVar12 = (short)*pcVar15 & 0x7f;
          *puVar14 = uVar12;
          if (uVar12 == 0x7e) {
            *puVar14 = (byte)pcVar15[1] + 0x7e;
          }
          else if (uVar12 == 0x7f) {
            uVar12 = ((short)pcVar15[1] & 0x7fU) << 8;
            *puVar14 = uVar12;
            *puVar14 = uVar12 | (byte)pcVar15[2];
          }
          *puVar14 = *puVar14 + *(short *)(param_2 + 0x30);
        }
        pbVar13 = local_2c;
        if (*puVar7 < *(ushort *)(param_2 + 0x32)) {
          pbVar13 = local_2c + *(int *)(param_2 + 0x2c);
        }
        uVar9 = *(uint *)(param_2 + 0x2c);
      }
      bVar1 = *pbVar13;
      if ((char)bVar1 < '\0') break;
      puVar7 = (ushort *)(param_2 + 0x34);
      if ((*(ushort *)(param_2 + 0x32) == *puVar7) &&
         (uVar9 = (*(code *)PTR_FUN_08271bb8)(*(undefined4 *)(param_2 + 0x14)), uVar16 == uVar9)) {
        uVar9 = (uint)CONCAT11(*pbVar13,pbVar13[1]);
        iVar5 = (*(code *)PTR_FUN_08271bb0)(*puVar7);
        if (iVar5 == 0) {
          (*(code *)PTR_FUN_08271bbc)(PTR_s_XAC__blkp__NULL_bei_block_nidnr___08271bc0,uVar16,uVar9)
          ;
          return 0xffffffff;
        }
        bVar17 = true;
        if ((-1 < *(short *)(param_2 + 0xc)) || (-1 < *(short *)(param_2 + 0xe))) {
          iVar6 = (*(code *)PTR_FUN_08271bc4)(iVar5,uVar9);
          iVar8 = (int)*(short *)(param_2 + 0xc);
          if (-1 < iVar8) {
            bVar17 = (bool)(~(iVar6 < iVar8) & 1);
          }
          if (((-1 < *(short *)(param_2 + 0xe)) && (*(short *)(param_2 + 0xe) < iVar6)) || (!bVar17)
             ) goto LAB_08271ad4;
        }
        puVar4 = PTR_FUN_08271bc8;
        *(uint *)(param_2 + 0x10) = (uint)*puVar7 << 0x10 | (int)DAT_08271ba8 & uVar9;
        iVar5 = (*(code *)puVar4)(param_1,iVar5,uVar9,1,param_3,0);
        if (iVar5 == 0) {
          *(int *)(param_2 + 0x1c) = (int)pcVar15 - *(int *)(param_4 + 0x38);
          *(int *)(param_2 + 0x28) = (int)local_2c - *(int *)(param_4 + 0x50);
          *(byte **)(param_2 + 0x20) = pbVar13 + (2 - *(int *)(param_4 + 0x50));
          return 0;
        }
      }
LAB_08271ad4:
      pbVar13 = pbVar13 + 2;
      uVar9 = *(uint *)(param_2 + 0x2c);
    }
    pbVar10 = pbVar13 + 1;
    if (DAT_08271bb4 < *(int *)(param_2 + 0x38)) {
      pbVar11 = pbVar13 + 2;
      pbVar13 = pbVar13 + 3;
      uVar16 = ((bVar1 & 0x7f) << 8 | (uint)*pbVar10) << 8 | (uint)*pbVar11;
    }
    else {
      pbVar13 = pbVar13 + 2;
      uVar16 = (bVar1 & 0x7f) << 8 | (uint)*pbVar10;
    }
    *(uint *)(param_2 + 0x3c) = uVar16;
  } while( true );
}



/* ===== FUN_08271dbc @ 08271dbc ===== */

int FUN_08271dbc(short *param_1,int param_2)

{
  undefined *puVar1;
  int iVar2;
  int iVar3;
  int iVar4;
  
  if (param_1 == (short *)0x0) {
    (*(code *)PTR_FUN_08271e8c)(0,PTR_s_Q___platform_mostdev_collect_nav_08271e90,(int)DAT_08271e84)
    ;
    iVar2 = -1;
  }
  else if (param_2 == 0) {
    (*(code *)PTR_FUN_08271e8c)(0,PTR_s_Q___platform_mostdev_collect_nav_08271e90,(int)DAT_08271e86)
    ;
    iVar2 = -1;
  }
  else {
    iVar2 = -1;
    if (*param_1 != 0) {
      iVar3 = (*(code *)PTR_FUN_08271e94)();
      puVar1 = PTR_FUN_08271ea0;
      if (iVar3 == 0) {
        *param_1 = 0;
        iVar2 = -1;
      }
      else {
        iVar2 = -1;
        (*(code *)PTR_FUN_08271e98)(PTR_PTR_08271e9c);
        iVar4 = (*(code *)puVar1)();
        if ((*(int *)(param_1 + 4) == iVar4) || (*param_1 == 8)) {
          iVar2 = (**(code **)(param_1 + 2))(iVar3,param_1,param_2);
          if ((iVar2 == 0) &&
             ((iVar3 = (*(code *)puVar1)(), *(int *)(param_1 + 4) != iVar3 && (*param_1 != 8)))) {
            iVar2 = -1;
            (*(code *)PTR_FUN_08271ea4)(PTR_s_XAC__check___bei_get_nextvect___08271eac);
          }
        }
        else {
          (*(code *)PTR_FUN_08271ea4)(PTR_s_XAC__check___vor_get_nextvect___08271ea8);
        }
        (*(code *)PTR_FUN_08271eb0)(PTR_PTR_08271e9c,(int)DAT_08271e88);
        if (iVar2 != 0) {
          *param_1 = 0;
        }
      }
    }
  }
  return iVar2;
}



/* ===== FUN_08271eb4 @ 08271eb4 ===== */

undefined4
FUN_08271eb4(undefined2 *param_1,int param_2,undefined4 *param_3,undefined4 *param_4,
            undefined2 param_5,undefined2 param_6,int param_7)

{
  undefined *puVar1;
  undefined4 uVar2;
  int iVar3;
  undefined2 uVar4;
  
  uVar2 = 0xffffffff;
  if ((((param_2 != 0) && (param_1 != (undefined2 *)0x0)) && (param_3 != (undefined4 *)0x0)) &&
     (param_4 != (undefined4 *)0x0)) {
    iVar3 = (*(code *)PTR_FUN_08271f68)();
    *(int *)(param_1 + 4) = iVar3;
    if (iVar3 < 0) {
      (*(code *)PTR_FUN_08271f6c)(PTR_s_XAC__check<0_bei_get_firstvect_i_08271f70);
      uVar2 = 0xffffffff;
      *param_1 = 0;
    }
    else {
      uVar4 = 8;
      if (param_7 == 0) {
        uVar4 = 1;
      }
      *param_1 = uVar4;
      puVar1 = PTR_FUN_08271f78;
      *(undefined **)(param_1 + 2) = PTR_LAB_08271f74;
      param_1[6] = param_5;
      param_1[7] = param_6;
      (*(code *)puVar1)(param_1 + 8,0,0x34);
      puVar1 = PTR_FUN_08271f7c;
      *(undefined4 *)(param_1 + 0x16) = *param_3;
      *(undefined4 *)(param_1 + 0x18) = param_3[1];
      *(undefined4 *)(param_1 + 0x1a) = *param_4;
      *(undefined4 *)(param_1 + 0x1c) = param_4[1];
      *(char *)(param_1 + 0x21) = '\x01' - (param_7 == 0);
      uVar2 = (*(code *)puVar1)(param_1,param_2);
    }
  }
  return uVar2;
}



/* ===== FUN_08271f80 @ 08271f80 ===== */

undefined4
FUN_08271f80(undefined2 *param_1,undefined4 param_2,undefined4 param_3,undefined2 param_4,
            undefined2 param_5)

{
  undefined *puVar1;
  undefined4 uVar2;
  int iVar3;
  
  if (param_1 == (undefined2 *)0x0) {
    (*(code *)PTR_FUN_08272004)(0,PTR_s_Q___platform_mostdev_collect_nav_08272008,(int)DAT_08272000)
    ;
    uVar2 = 0xffffffff;
  }
  else {
    iVar3 = (*(code *)PTR_FUN_0827200c)();
    *(int *)(param_1 + 4) = iVar3;
    if (iVar3 < 0) {
      (*(code *)PTR_FUN_08272010)(PTR_s_XAC__check<0_bei_get_firstvect_i_08272014,param_3);
      uVar2 = 0xffffffff;
    }
    else {
      *param_1 = 2;
      puVar1 = PTR_FUN_0827201c;
      *(undefined **)(param_1 + 2) = PTR_LAB_08272018;
      param_1[6] = param_4;
      param_1[7] = param_5;
      (*(code *)puVar1)(param_1 + 8,0,0x30);
      puVar1 = PTR_FUN_08272020;
      *(undefined4 *)(param_1 + 10) = param_3;
      uVar2 = (*(code *)puVar1)(param_1,param_2);
    }
  }
  return uVar2;
}



/* ===== FUN_082722d8 @ 082722d8 ===== */

/* WARNING: Removing unreachable block (ram,0x08272306) */

void FUN_082722d8(int param_1)

{
  undefined4 uVar1;
  uint uVar2;
  
  if (((param_1 != 0) && (*(int *)(param_1 + 0x30) == 0)) &&
     ((*(uint *)(param_1 + 0x1c) >> 9 & 3) == 1)) {
    uVar2 = *(uint *)(param_1 + 0x10);
    uVar1 = (*(code *)PTR_FUN_08272320)
                      (*(undefined4 *)(param_1 + 0x2c),uVar2 >> 10 & 7,uVar2 & 7,uVar2 >> 5 & 7);
    *(undefined4 *)(param_1 + 0x30) = uVar1;
  }
  return;
}



/* ===== FUN_08272324 @ 08272324 ===== */

void FUN_08272324(int param_1,undefined4 param_2)

{
  int iVar1;
  
  iVar1 = param_1 + 0x2c;
  if ((*(uint *)(param_1 + 0x1c) >> 9 & 3) != 1) {
    iVar1 = 0;
  }
  (*(code *)PTR_FUN_0827234c)(param_2,iVar1,param_1 + 0x34);
  return;
}



/* ===== FUN_08272350 @ 08272350 ===== */

uint FUN_08272350(int param_1,int param_2)

{
  uint uVar1;
  ushort *puVar2;
  ushort *puVar3;
  
  puVar2 = (ushort *)(param_1 + param_2);
LAB_0827235a:
  do {
    uVar1 = (uint)(short)*puVar2;
    puVar2 = puVar2 + 1;
    while( true ) {
      while( true ) {
        uVar1 = (uVar1 & 0xff) << 8 | (uVar1 & 0xff00) >> 8;
        if ((uVar1 & DAT_082723a4) == 0) break;
        if (-1 < (short)uVar1) goto LAB_0827235a;
        do {
          puVar3 = puVar2;
          puVar2 = puVar3 + 1;
        } while ((short)(*puVar3 << 8 | *puVar3 >> 8) < 0);
        uVar1 = (uint)(short)puVar3[1];
        puVar2 = puVar3 + 2;
      }
      if (uVar1 != 0) {
        return uVar1 * 2 & 0xffff;
      }
      if (-1 < (short)(puVar2[5] << 8 | puVar2[5] >> 8)) break;
      uVar1 = (uint)(short)puVar2[8];
      puVar2 = puVar2 + 9;
    }
    puVar2 = puVar2 + 6;
  } while( true );
}



/* ===== FUN_08272410 @ 08272410 ===== */

int FUN_08272410(int param_1,int param_2,uint param_3,uint param_4,undefined2 *param_5)

{
  byte bVar1;
  int iVar2;
  uint uVar3;
  uint uVar4;
  byte *pbVar5;
  
  if ((param_4 == 0) || (param_3 <= param_4)) {
    iVar2 = 0;
  }
  else {
    pbVar5 = (byte *)(param_3 * 2 + param_2 + 2 + param_4);
    bVar1 = *pbVar5;
    while (uVar3 = (uint)bVar1, uVar3 == 0) {
      pbVar5 = pbVar5 + -1;
      param_4 = param_4 - 1 & 0xffff;
      bVar1 = *pbVar5;
    }
    if (param_5 != (undefined2 *)0x0) {
      *param_5 = (short)param_4;
    }
    uVar4 = (uint)*(short *)(param_4 * 2 + param_2);
    iVar2 = ((uVar4 & 0xff) << 8 | (uVar4 & 0xff00) >> 8) * 2;
    if (uVar3 == 1) {
      uVar3 = (uint)*(short *)(param_1 + iVar2 + -2);
      uVar3 = (uVar3 & 0xff) << 8 | (uVar3 & 0xff00) >> 8;
    }
    else if (uVar3 == (int)DAT_0827249a) {
      return 0;
    }
    iVar2 = iVar2 + uVar3 * -2;
    if (((int)*(char *)(param_1 + iVar2) & 0xc0U) == (int)DAT_0827249c) {
      iVar2 = iVar2 + 0x16;
    }
  }
  return iVar2;
}



/* ===== FUN_08272548 @ 08272548 ===== */

uint FUN_08272548(int param_1,uint param_2,undefined2 *param_3)

{
  uint uVar1;
  int local_18;
  uint local_14;
  
  if (param_1 == 0) {
    return 0;
  }
  if ((((int)*(short *)(param_1 + 0x14) & 0xffU) << 8 |
      ((int)*(short *)(param_1 + 0x14) & 0xff00U) >> 8) < 5) {
LAB_082725a8:
    local_18 = 0;
    local_14 = 0;
LAB_082725b4:
    if (local_18 == 0) {
      if (param_3 != (undefined2 *)0x0) {
        *param_3 = 0;
      }
    }
    else {
      uVar1 = param_2 >> 1;
      param_2 = 0;
      if (uVar1 < local_14) {
        param_2 = (*(code *)PTR_FUN_082725e8)(param_3);
      }
    }
  }
  else {
    uVar1 = ((int)*(short *)(param_1 + 0x72) & 0xffU) << 8 |
            ((int)*(short *)(param_1 + 0x72) & 0xff00U) >> 8;
    if (uVar1 == 1) {
      uVar1 = *(uint *)(param_1 + 0x6c);
      uVar1 = ((uVar1 & 0xff) << 8 | (uVar1 & 0xff00) >> 8) << 0x10 |
              ((uVar1 & 0xff0000) >> 0x10) << 8 | uVar1 >> 0x18;
      local_18 = uVar1 + param_1;
      if (uVar1 != 0) {
        local_14 = ((int)*(short *)(param_1 + 0x70) & 0xffU) << 8 |
                   ((int)*(short *)(param_1 + 0x70) & 0xff00U) >> 8;
        goto LAB_082725b4;
      }
    }
    else if (uVar1 == 0) goto LAB_082725a8;
    param_2 = 0;
  }
  return param_2;
}



/* ===== FUN_082727e8 @ 082727e8 ===== */

/* WARNING: Removing unreachable block (ram,0x0827286e) */
/* WARNING: Removing unreachable block (ram,0x08272812) */
/* WARNING: Removing unreachable block (ram,0x08272840) */
/* WARNING: Removing unreachable block (ram,0x08272880) */

void FUN_082727e8(int param_1,int param_2,int *param_3)

{
  uint uVar1;
  char cVar2;
  uint uVar3;
  uint uVar4;
  int iVar5;
  uint uVar6;
  short *psVar7;
  byte *pbVar8;
  short *psVar9;
  int iVar10;
  
  psVar7 = (short *)(param_1 + param_2);
  uVar3 = (uint)*psVar7;
  pbVar8 = (byte *)(psVar7 + 1);
  uVar4 = uVar3 & 0xff;
  uVar1 = (uVar3 & 0xff00) >> 8;
  uVar6 = uVar4 << 8 | uVar1;
  cVar2 = '\0';
  if ((uVar6 & DAT_08272920) == DAT_08272924) {
    uVar1 = uVar1 & 0xf;
    if ((uVar4 >> 5 & 1) == 0) {
      psVar9 = psVar7 + 3;
      iVar10 = uVar1 * 0x10000 +
               (((int)*(short *)pbVar8 & 0xffU) << 8 | ((int)*(short *)pbVar8 & 0xff00U) >> 8) +
               DAT_0827292c;
      iVar5 = ((int)DAT_08272916 & uVar6) * 0x1000 +
              (((int)psVar7[2] & 0xffU) << 8 | ((int)psVar7[2] & 0xff00U) >> 8) + DAT_0827292c;
    }
    else {
      iVar10 = (((uVar1 << 8 | (uint)*pbVar8) << 8 | (uint)*(byte *)((int)psVar7 + 3)) << 8 |
               (uint)*(byte *)(psVar7 + 2)) + DAT_08272928;
      psVar9 = psVar7 + 4;
      iVar5 = (((((int)DAT_08272916 & uVar6) << 4 | (uint)*(byte *)((int)psVar7 + 5)) << 8 |
               (uint)*(byte *)(psVar7 + 3)) << 8 | (uint)*(byte *)((int)psVar7 + 7)) + DAT_08272928;
    }
    if ((uVar4 >> 4 & 1) != 0) {
      if ((uVar6 & (int)DAT_08272918) == (int)DAT_08272918) {
        uVar3 = (((int)*psVar9 & 0xffU) << 8 | ((int)*psVar9 & 0xff00U) >> 8) + 1;
      }
      else {
        uVar3 = uVar3 & 0xf;
      }
      cVar2 = ((byte)psVar9[uVar3] & 0x1f) - 0x10;
    }
  }
  else {
    if ((uVar6 & DAT_08272920) == DAT_08272920) {
      (*(code *)PTR_FUN_08272934)(PTR_s_XAC__Fehler_bei_u_get_koord_c__p_08272930,param_1,param_2);
      return;
    }
    iVar10 = ((int)DAT_0827291a & uVar6) + (int)DAT_0827291c;
    iVar5 = (((int)*(short *)pbVar8 & 0xffU) << 8 | ((int)*(short *)pbVar8 & 0xff00U) >> 8) -
            DAT_08272924;
  }
  uVar4 = *(uint *)(param_1 + 0x28);
  *param_3 = iVar10 + (((uVar4 & 0xff) << 8 | (uVar4 & 0xff00) >> 8) << 0x10 |
                       ((uVar4 & 0xff0000) >> 0x10) << 8 | uVar4 >> 0x18);
  uVar4 = *(uint *)(param_1 + 0x2c);
  param_3[1] = iVar5 + (((uVar4 & 0xff) << 8 | (uVar4 & 0xff00) >> 8) << 0x10 |
                        ((uVar4 & 0xff0000) >> 0x10) << 8 | uVar4 >> 0x18);
  *(undefined1 *)(param_3 + 2) = 0;
  *(char *)((int)param_3 + 9) = cVar2;
  *(ushort *)((int)param_3 + 10) =
       *(ushort *)(param_1 + 0x16) << 8 | *(ushort *)(param_1 + 0x16) >> 8;
  return;
}



/* ===== FUN_08272938 @ 08272938 ===== */

/* WARNING: Removing unreachable block (ram,0x08272e4a) */
/* WARNING: Removing unreachable block (ram,0x08272e0e) */
/* WARNING: Removing unreachable block (ram,0x08272de8) */
/* WARNING: Removing unreachable block (ram,0x08272db0) */
/* WARNING: Removing unreachable block (ram,0x08272ce8) */
/* WARNING: Removing unreachable block (ram,0x08272cd2) */
/* WARNING: Removing unreachable block (ram,0x08272cbc) */
/* WARNING: Removing unreachable block (ram,0x08272b7a) */
/* WARNING: Removing unreachable block (ram,0x08272b46) */
/* WARNING: Removing unreachable block (ram,0x08272b0e) */
/* WARNING: Removing unreachable block (ram,0x08272b56) */
/* WARNING: Removing unreachable block (ram,0x08272bb6) */
/* WARNING: Removing unreachable block (ram,0x08272cc2) */
/* WARNING: Removing unreachable block (ram,0x08272cd8) */
/* WARNING: Removing unreachable block (ram,0x08272cf2) */
/* WARNING: Removing unreachable block (ram,0x08272dc2) */
/* WARNING: Removing unreachable block (ram,0x08272e00) */
/* WARNING: Removing unreachable block (ram,0x08272e18) */
/* WARNING: Removing unreachable block (ram,0x08272e7a) */
/* WARNING: Removing unreachable block (ram,0x08272e4e) */
/* WARNING: Removing unreachable block (ram,0x08272e7c) */

int FUN_08272938(int param_1,int param_2,uint param_3,uint param_4,short param_5)

{
  undefined *puVar1;
  short sVar2;
  int iVar3;
  undefined4 uVar4;
  uint uVar5;
  uint uVar6;
  uint *puVar7;
  short *psVar8;
  short *psVar9;
  uint uVar10;
  undefined2 local_60 [2];
  uint local_5c;
  int local_58;
  uint local_54;
  uint local_50;
  uint local_4c;
  uint local_48;
  uint local_44;
  int local_40;
  int local_3c;
  short *local_38;
  uint local_34;
  int local_30;
  uint local_2c;
  uint local_28;
  int local_24;
  
  local_40 = (int)param_5;
  if (param_1 == 0) {
    return -1;
  }
  if (param_4 < 2) {
    return -1;
  }
  local_44 = param_3;
  if ((param_2 == 0) && (param_2 = (*(code *)PTR_FUN_08272ad8)(param_3), param_2 == 0)) {
    return -1;
  }
  puVar1 = PTR_FUN_08272adc;
  uVar5 = ((uint)(int)*(char *)(param_2 + 0x39) >> 1 & 3) - 1 & 3;
  if ((int)uVar5 < 0) {
    uVar5 = (uint)*(byte *)(param_1 + 4) << (~uVar5 & 0x1f);
  }
  else {
    uVar5 = (int)(uint)*(byte *)(param_1 + 4) >> uVar5 + 1;
  }
  if (((uVar5 ^ 1) & 1) != 0) {
    return 1;
  }
  local_3c = DAT_08272ad4 + param_1;
  iVar3 = (*(code *)PTR_FUN_08272adc)();
  if (iVar3 == *(int *)(local_3c + 8)) {
    iVar3 = (*(code *)PTR_FUN_08272ae4)(local_3c,local_44,param_4);
    if (iVar3 != 0) {
      uVar5 = *(uint *)(local_3c + 0xc);
      *(uint *)(local_3c + 0xc) = uVar5 + 1;
      *(uint *)(local_3c + 0x10) = *(int *)(local_3c + 0x10) + (uint)(0xfffffffe < uVar5);
      sVar2 = (ushort)(local_40 < (int)(*(uint *)(iVar3 + 0x3c) & 7)) * 2;
      goto LAB_08272e90;
    }
  }
  else {
    (*(code *)PTR_FUN_08272ae0)(local_3c);
    uVar4 = (*(code *)puVar1)();
    *(undefined4 *)(local_3c + 8) = uVar4;
  }
  uVar5 = *(uint *)(local_3c + 0x14);
  *(uint *)(local_3c + 0x14) = uVar5 + 1;
  *(uint *)(local_3c + 0x18) = *(int *)(local_3c + 0x18) + (uint)(0xfffffffe < uVar5);
  local_34 = ((int)*(short *)(param_2 + 0x14) & 0xffU) << 8 |
             ((int)*(short *)(param_2 + 0x14) & 0xff00U) >> 8;
  if (local_34 < 5) {
LAB_08272a5e:
    local_58 = 0;
    local_54 = 0;
  }
  else {
    uVar5 = ((int)*(short *)(param_2 + 0x72) & 0xffU) << 8 |
            ((int)*(short *)(param_2 + 0x72) & 0xff00U) >> 8;
    if (uVar5 != 1) {
      if (uVar5 != 0) {
        return -1;
      }
      goto LAB_08272a5e;
    }
    uVar5 = *(uint *)(param_2 + 0x6c);
    uVar5 = ((uVar5 & 0xff) << 8 | (uVar5 & 0xff00) >> 8) << 0x10 |
            ((uVar5 & 0xff0000) >> 0x10) << 8 | uVar5 >> 0x18;
    local_58 = uVar5 + param_2;
    if (uVar5 == 0) {
      return -1;
    }
    local_54 = ((int)*(short *)(param_2 + 0x70) & 0xffU) << 8 |
               ((int)*(short *)(param_2 + 0x70) & 0xff00U) >> 8;
  }
  if (local_58 == 0) {
    local_24 = 0;
    local_60[0] = 0;
    uVar5 = param_4;
  }
  else {
    if (local_54 <= param_4 >> 1) {
      return -1;
    }
    uVar5 = (uint)*(short *)((param_4 >> 1) * 2 + local_58);
    local_24 = (*(code *)PTR_FUN_08272ae8)(param_2,local_58,local_60);
    uVar5 = ((uVar5 & 0xff) << 8 | (uVar5 & 0xff00) >> 8) * 2;
  }
  psVar8 = (short *)(param_2 + uVar5);
  local_2c = ((int)*psVar8 & 0xffU) << 8 | ((int)*psVar8 & 0xff00U) >> 8;
  uVar5 = local_2c & DAT_08272aec;
  if (uVar5 == DAT_08272aec) {
    local_2c = (int)DAT_08272c64 & local_2c;
    psVar9 = psVar8 + 2;
    uVar5 = (int)psVar8[1] & 0xff;
    uVar6 = uVar5 << 8 | ((int)psVar8[1] & 0xff00U) >> 8;
    local_28 = local_44;
    local_30 = param_2;
    if (((uVar5 >> 6 ^ 1) & 1) == 0) {
      local_28 = (((int)*(short *)(param_2 + 0x36) & 0xffU) << 8 |
                 ((int)*(short *)(param_2 + 0x36) & 0xff00U) >> 8) +
                 ((((int)*psVar9 & 0xffU) << 8 | ((int)*psVar9 & 0xff00U) >> 8) & (int)DAT_08272c66)
                 & 0xffff;
      local_30 = (*(code *)PTR_FUN_08272c6c)(local_28);
      sVar2 = 3;
      if (local_30 == 0) goto LAB_08272ad0;
    }
    local_38 = (short *)0x0;
    if ((uVar5 >> 3 & 1) != 0) {
      local_38 = psVar9;
      if ((uVar5 >> 6 & 1) != 0) {
        local_38 = psVar8 + 3;
      }
      psVar9 = (short *)((int)psVar9 - (((int)DAT_08272c68 & uVar6) * 2 + 2));
      uVar6 = (uint)*psVar9;
      psVar9 = psVar9 + 1;
      uVar6 = (uVar6 & 0xff) << 8 | (uVar6 & 0xff00) >> 8;
    }
    if ((uVar6 >> 0xe & 1) != 0) {
      psVar9 = psVar9 + 1;
    }
    uVar10 = (uint)DAT_08272c68;
    iVar3 = (*(code *)PTR_FUN_08272c70)();
    sVar2 = -1;
    if (iVar3 != 0) {
      uVar10 = *(uint *)(iVar3 + 0x1c + (uVar10 & uVar6) * 4);
      uVar6 = ((uVar10 & 0xff0000) >> 0x10) << 8;
      local_50 = ((uVar10 & 0xff) << 8 | (uVar10 & 0xff00) >> 8) << 0x10 | uVar6 | uVar10 >> 0x18;
      if ((int)local_50 < 0) {
        sVar2 = *psVar9;
        psVar9 = psVar9 + 1;
        local_50 = uVar6 | uVar10 >> 0x18 |
                   (((int)sVar2 & 0xffU) << 8 | ((int)sVar2 & 0xff00U) >> 8) << 0x10;
      }
      if ((local_50 >> 0xf & 1) != 0) {
        sVar2 = *psVar9;
        psVar9 = psVar9 + 1;
        local_50 = local_50 & DAT_08272c74 | ((int)sVar2 & 0xffU) << 8 | ((int)sVar2 & 0xff00U) >> 8
        ;
      }
      (*(code *)PTR_FUN_08272c78)(&local_5c,&local_50,4);
      if (local_40 < (int)(local_5c & 7)) {
        return 2;
      }
      iVar3 = (*(code *)PTR_FUN_08272c7c)(local_3c,local_44,param_4);
      (*(code *)PTR_FUN_08272c78)(iVar3 + 0x3c,&local_5c,4);
      if (local_24 == 0) {
        local_24 = (*(code *)PTR_FUN_08272c80)(param_2,param_4);
      }
      puVar1 = PTR_FUN_08272c84;
      *(undefined2 *)(iVar3 + 0xe) = local_60[0];
      *(int *)(iVar3 + 4) = local_24;
      (*(code *)puVar1)(param_2,local_24,iVar3 + 0x14);
      *(undefined2 *)(iVar3 + 0x10) = 0;
      if (local_30 == param_2) {
        if (local_58 == 0) {
          local_2c = local_2c * 2;
        }
        else {
          local_2c = (*(code *)PTR_FUN_08272c88)
                               (param_2,local_54,local_2c & 0xffff,(undefined2 *)(iVar3 + 0x10));
        }
      }
      else {
        local_2c = (*(code *)PTR_FUN_08272eac)(local_30,local_2c * 2 & 0xffff);
      }
      (*(code *)puVar1)(local_30,local_2c,iVar3 + 0x20);
      *(undefined2 *)(iVar3 + 0xc) = (undefined2)local_28;
      uVar6 = DAT_08272eb0;
      *(uint *)(iVar3 + 8) = local_2c;
      puVar7 = (uint *)(iVar3 + 0x40);
      *(uint *)(iVar3 + 0x3c) = *(uint *)(iVar3 + 0x3c) & uVar6 | (uVar5 >> 5 & 1) << 0x16;
      uVar6 = DAT_08272eb8;
      *(uint *)(iVar3 + 0x3c) = *(uint *)(iVar3 + 0x3c) & DAT_08272eb4 | (uVar5 >> 4 & 1) << 0x15;
      uVar6 = *(uint *)(iVar3 + 0x3c) & uVar6 | (uVar5 >> 6 & 1) << 0x14;
      uVar5 = uVar6 & DAT_08272ebc;
      *(uint *)(iVar3 + 0x3c) = uVar6;
      if (uVar5 == 0) {
        (*(code *)PTR_FUN_08272ec0)(puVar7,PTR_DAT_08272ecc,4);
      }
      else {
        local_4c = (((int)*psVar9 & 0xffU) << 8 | ((int)*psVar9 & 0xff00U) >> 8) << 0x10 |
                   ((int)psVar9[1] & 0xffU) << 8 | ((int)psVar9[1] & 0xff00U) >> 8;
        (*(code *)PTR_FUN_08272ec0)(puVar7,&local_4c,4);
        psVar9 = psVar9 + 2;
        *puVar7 = *puVar7 & DAT_08272ec4 & DAT_08272ec8;
      }
      if ((*(uint *)(iVar3 + 0x3c) & DAT_08272ed0) == 0) {
        (*(code *)PTR_FUN_08272ec0)(iVar3 + 0x44,PTR_DAT_08272ed4,4);
      }
      else {
        local_48 = (((int)*psVar9 & 0xffU) << 8 | ((int)*psVar9 & 0xff00U) >> 8) << 0x10 |
                   ((int)psVar9[1] & 0xffU) << 8 | ((int)psVar9[1] & 0xff00U) >> 8;
        (*(code *)PTR_FUN_08272ec0)(&local_48,4);
        psVar9 = psVar9 + 2;
        *(uint *)(iVar3 + 0x44) = *(uint *)(iVar3 + 0x44) & DAT_08272ec4 & DAT_08272ec8;
      }
      *(uint *)(iVar3 + 0x3c) = *(uint *)(iVar3 + 0x3c) & DAT_08272ed8 | DAT_08272edc | DAT_08272ee0
      ;
      uVar4 = DAT_08272ee4;
      *(undefined4 *)(iVar3 + 0x50) = DAT_08272ee4;
      *(undefined4 *)(iVar3 + 0x54) = uVar4;
      (*(code *)PTR_FUN_08272ee8)(param_2,iVar3 + 0x48);
      if ((*(uint *)(iVar3 + 0x3c) & DAT_08272eec) != 0) {
        sVar2 = *psVar9;
        while (psVar9 = psVar9 + 1, (((int)sVar2 & 0xffU) >> 6 & 1) != 0) {
          sVar2 = *psVar9;
        }
      }
      if (local_38 != (short *)0x0) {
        psVar9 = local_38;
      }
      if ((3 < local_34) && ((*(uint *)(iVar3 + 0x3c) & DAT_08272ef0) != 0)) {
        uVar5 = (int)*psVar9 & 0xff;
        psVar8 = psVar9 + 1;
        while (psVar9 = psVar8, (uVar5 >> 6 & 1) != 0) {
          uVar5 = (int)*psVar9 & 0xff;
          psVar8 = psVar9 + 1;
          if (((uVar5 >> 5 & 1) != 0) &&
             (psVar8 = psVar9 + 2, (((int)psVar9[1] & 0xffU) >> 6 & 1) != 0)) {
            psVar8 = psVar9 + 3;
          }
        }
      }
      if (((*(uint *)(iVar3 + 0x48) >> 9 & 3) - 1 & 3) + 1 < 2) {
        *(undefined4 *)(iVar3 + 0x58) = 0;
        *(undefined2 *)(iVar3 + 0x60) = 0;
        *(undefined4 *)(iVar3 + 0x5c) = 0;
      }
      else {
        uVar10 = (uint)DAT_08272ea8;
        uVar6 = (uint)DAT_08272eaa;
        uVar5 = ((int)*psVar9 & 0xffU) << 8 | ((int)*psVar9 & 0xff00U) >> 8;
        *(uint *)(iVar3 + 0x58) = (uVar5 & uVar6) << ((int)(uVar5 & uVar10) >> 0xb);
        *(undefined2 *)(iVar3 + 0x60) = 0xffff;
        if ((local_34 == 2) || ((2 < local_34 && (*(char *)(param_2 + 0x3d) < '\0')))) {
          uVar5 = ((int)psVar9[1] & 0xffU) << 8 | ((int)psVar9[1] & 0xff00U) >> 8;
          *(uint *)(iVar3 + 0x5c) = (uVar6 & uVar5) << ((int)(uVar5 & uVar10) >> 0xb);
        }
        else {
          *(undefined4 *)(iVar3 + 0x5c) = 0;
        }
      }
      sVar2 = 0;
      goto LAB_08272e90;
    }
  }
  else {
    if (uVar5 == 0) {
      (*(code *)PTR_FUN_08272af0)(PTR_s_XAC__kein_Vektor_u_gvi__p___d__08272af4,param_4);
      sVar2 = -1;
LAB_08272e90:
      return (int)sVar2;
    }
    (*(code *)PTR_FUN_08272af0)(PTR_s_XAC__nicht_hier_u_gvi__p___d__08272af8,param_2,param_4);
    sVar2 = -1;
  }
LAB_08272ad0:
  return (int)sVar2;
}



/* ===== FUN_08272ef4 @ 08272ef4 ===== */

undefined4 FUN_08272ef4(int param_1,int param_2,uint param_3,char param_4,int param_5,uint param_6)

{
  bool bVar1;
  bool bVar2;
  undefined *puVar3;
  short sVar4;
  int iVar5;
  code *extraout_r3;
  code *extraout_r3_00;
  int iVar6;
  int iVar7;
  
  if ((param_1 != 0) && (param_5 != 0)) {
    iVar5 = (*(code *)PTR_FUN_08273038)(7);
    if (iVar5 != -1) {
      if (iVar5 != 0) {
        return 0xffffffff;
      }
      iVar5 = *(int *)(DAT_08273032 + param_1);
      bVar1 = false;
      if (((param_6 >> 4 & 1) != 0) && (*(int *)(iVar5 + 0x5c) == 0)) {
        bVar1 = true;
      }
      bVar2 = false;
      if ((bVar1) || ((param_6 >> 3 & 1) != 0)) {
        bVar2 = true;
        if ((*(int *)(iVar5 + 0x58) == 0) || (*(short *)(iVar5 + 0x60) < 0)) {
          (*(code *)PTR_FUN_08273044)(iVar5 + 0x2c,iVar5 + 0x14,iVar5 + 0x20);
        }
        if (bVar1) {
          (*(code *)PTR_FUN_08273048)(iVar5 + 0x2c);
        }
      }
      (*(code *)PTR_FUN_0827304c)(param_5 + 0xc,iVar5 + 0x2c,0x38);
      puVar3 = PTR_FUN_08273050;
      *(uint *)(param_5 + 0xc) = (int)DAT_08273034 & param_3 | param_2 << 0x10;
      *(char *)(param_5 + 0x42) = param_4;
      iVar6 = iVar5 + 0x20;
      iVar7 = param_5 + 0x10;
      if (param_4 == '\0') {
        (*(code *)puVar3)(param_5,iVar6,iVar7);
        (*extraout_r3_00)(iVar7,iVar5 + 0x14);
        if (bVar2) {
          sVar4 = (*(code *)PTR_FUN_08273054)((int)*(short *)(param_5 + 0x40));
          *(short *)(param_5 + 0x40) = sVar4;
        }
      }
      else {
        (*(code *)puVar3)(param_5,iVar5 + 0x14);
        (*extraout_r3)(iVar7,iVar6);
      }
      return 0;
    }
    (*(code *)PTR_FUN_0827303c)(PTR_s_XAC__u_gvi__4X__4X__failed_08273040,param_2,param_3);
  }
  return 0xffffffff;
}



/* ===== FUN_08273058 @ 08273058 ===== */

undefined4
FUN_08273058(undefined4 param_1,uint param_2,undefined4 param_3,undefined4 param_4,
            undefined4 param_5)

{
  int iVar1;
  undefined4 uVar2;
  
  iVar1 = (*(code *)PTR_FUN_082730b0)(param_2 >> 0x10);
  uVar2 = 0xffffffff;
  if (iVar1 != 0) {
    uVar2 = (*(code *)PTR_FUN_082730b4)
                      (param_1,iVar1,param_2 >> 0x10,param_2 & (int)DAT_082730ae,param_3,param_4,
                       param_5);
  }
  return uVar2;
}



/* ===== FUN_082730b8 @ 082730b8 ===== */

undefined4 FUN_082730b8(undefined4 param_1,undefined4 param_2,int param_3,undefined4 param_4)

{
  undefined *puVar1;
  int iVar2;
  int iVar3;
  
  iVar2 = (*(code *)PTR_FUN_08273178)(param_4);
  if (iVar2 != 0) {
    if (param_3 == 0) {
      (*(code *)PTR_FUN_0827317c)
                (0,PTR_s_Q___platform_mostdev_collect_nav_08273180,(int)DAT_08273172);
    }
    puVar1 = PTR_FUN_0827318c;
    (*(code *)PTR_FUN_08273184)(PTR_PTR_08273188);
    iVar3 = (*(code *)puVar1)();
    if (iVar3 < 0) {
      (*(code *)PTR_FUN_08273190)(PTR_s_XAC__check<0_bei_get_vectinfo(VI_08273194,param_1,param_2);
    }
    else {
      iVar2 = (*(code *)PTR_FUN_08273198)(iVar2,param_1,param_2,param_3,param_4);
      if (iVar2 == 0) {
        iVar2 = (*(code *)puVar1)();
        if (iVar3 == iVar2) {
          (*(code *)PTR_FUN_082731a0)(PTR_PTR_08273188,(int)DAT_08273174);
          return 0;
        }
        (*(code *)PTR_FUN_08273190)(PTR_s_XAC__check___bei_get_vectinfo_VI_0827319c,param_1,param_2)
        ;
      }
    }
    (*(code *)PTR_FUN_082731a0)(PTR_PTR_08273188,(int)DAT_08273176);
  }
  return 0xffffffff;
}



/* ===== FUN_082731ec @ 082731ec ===== */

/* WARNING: Removing unreachable block (ram,0x0827324e) */
/* WARNING: Removing unreachable block (ram,0x08273230) */
/* WARNING: Removing unreachable block (ram,0x0827327c) */

uint FUN_082731ec(short *param_1)

{
  int iVar1;
  uint uVar2;
  uint uVar3;
  short *psVar4;
  uint uVar5;
  
  uVar2 = 0xffffffff;
  if (param_1 != (short *)0x0) {
    uVar2 = (uint)*param_1;
    uVar2 = (uVar2 & 0xffff0000 | (uVar2 & 0xff) << 8 | (uVar2 & 0xff00) >> 8) & DAT_082732a8;
    if (uVar2 == DAT_082732a8) {
      psVar4 = param_1 + 2;
      uVar2 = (int)param_1[1] & 0xff;
      uVar3 = uVar2 << 8 | ((int)param_1[1] & 0xff00U) >> 8;
      if ((uVar2 >> 3 & 1) != 0) {
        psVar4 = (short *)((int)psVar4 - (((int)DAT_082732a4 & uVar3) * 2 + 2));
        uVar2 = (uint)*psVar4;
        psVar4 = psVar4 + 1;
        uVar3 = (uVar2 & 0xff) << 8 | (uVar2 & 0xff00) >> 8;
      }
      if ((uVar3 >> 0xe & 1) != 0) {
        psVar4 = psVar4 + 1;
      }
      uVar5 = (uint)DAT_082732a4;
      iVar1 = (*(code *)PTR_FUN_082732b8)();
      uVar2 = 0xffffffff;
      if (iVar1 != 0) {
        uVar3 = *(uint *)(iVar1 + 0x1c + (uVar5 & uVar3) * 4);
        uVar2 = ((uVar3 & 0xff) << 8 | (uVar3 & 0xff00) >> 8) << 0x10 |
                ((uVar3 & 0xff0000) >> 0x10) << 8 | uVar3 >> 0x18;
        if ((int)uVar2 < 0) {
          psVar4 = psVar4 + 1;
        }
        if ((uVar3 & 0xff0000) >> 0x17 != 0) {
          uVar2 = uVar2 & DAT_082732bc | ((int)*psVar4 & 0xff00U) >> 8;
        }
        uVar2 = uVar2 & 7;
      }
    }
    else if (uVar2 == 0) {
      (*(code *)PTR_FUN_082732ac)(PTR_s_XAC__kein_Vektor_u_get_vector_cl_082732b0,param_1);
      uVar2 = 0xffffffff;
    }
    else {
      (*(code *)PTR_FUN_082732ac)(PTR_s_XAC__nicht_hier_u_get_vector_cla_082732b4,param_1);
      uVar2 = 0xffffffff;
    }
  }
  return uVar2;
}



/* ===== FUN_082732c0 @ 082732c0 ===== */

undefined4 FUN_082732c0(int param_1,uint param_2)

{
  uint uVar1;
  undefined4 uVar2;
  int local_10;
  uint local_c;
  
  if (param_1 == 0) {
    return 0xffffffff;
  }
  if (4 < (((int)*(short *)(param_1 + 0x14) & 0xffU) << 8 |
          ((int)*(short *)(param_1 + 0x14) & 0xff00U) >> 8)) {
    uVar1 = ((int)*(short *)(param_1 + 0x72) & 0xffU) << 8 |
            ((int)*(short *)(param_1 + 0x72) & 0xff00U) >> 8;
    if (uVar1 == 1) {
      uVar1 = *(uint *)(param_1 + 0x6c);
      uVar1 = ((uVar1 & 0xff) << 8 | (uVar1 & 0xff00) >> 8) << 0x10 |
              ((uVar1 & 0xff0000) >> 0x10) << 8 | uVar1 >> 0x18;
      if (uVar1 == 0) {
        return 0xffffffff;
      }
      local_10 = uVar1 + param_1;
      local_c = ((int)*(short *)(param_1 + 0x70) & 0xffU) << 8 |
                ((int)*(short *)(param_1 + 0x70) & 0xff00U) >> 8;
      goto LAB_08273328;
    }
    if (uVar1 != 0) {
      return 0xffffffff;
    }
  }
  local_10 = 0;
  local_c = 0;
LAB_08273328:
  if (local_10 != 0) {
    if (local_c <= param_2 >> 1) {
      return 0xffffffff;
    }
    uVar1 = (uint)*(short *)((param_2 >> 1) * 2 + local_10);
    param_2 = ((uVar1 & 0xff) << 8 | (uVar1 & 0xff00) >> 8) * 2;
  }
  uVar2 = (*(code *)PTR_FUN_0827335c)(param_1 + param_2);
  return uVar2;
}



/* ===== FUN_08273360 @ 08273360 ===== */

int FUN_08273360(ushort *param_1)

{
  int iVar1;
  ushort uVar2;
  uint uVar3;
  ushort *puVar4;
  
  iVar1 = -1;
  if (param_1 != (ushort *)0x0) {
    uVar3 = ((int)(short)*param_1 & 0xffU) << 8 | ((int)(short)*param_1 & 0xff00U) >> 8;
    uVar2 = (ushort)uVar3;
    puVar4 = param_1;
    if ((uVar3 & DAT_082733b0) == 0) {
      iVar1 = 0;
      if ((uVar3 == 0) && (iVar1 = 0x12, -1 < (short)(param_1[6] << 8 | param_1[6] >> 8))) {
        iVar1 = 0xe;
      }
    }
    else {
      while (puVar4 = puVar4 + 1, (short)uVar2 < 0) {
        uVar2 = *puVar4 << 8 | *puVar4 >> 8;
      }
      iVar1 = (int)(short)((short)puVar4 - (short)param_1);
    }
  }
  return iVar1;
}



