
/* WARNING: Removing unreachable block (ram,0x08cc7df2) */
/* WARNING: Removing unreachable block (ram,0x08cc864a) */
/* WARNING: Removing unreachable block (ram,0x08cc8702) */
/* WARNING: Removing unreachable block (ram,0x08cc86a4) */
/* WARNING: Removing unreachable block (ram,0x08cc8286) */
/* WARNING: Removing unreachable block (ram,0x08cc877a) */
/* WARNING: Removing unreachable block (ram,0x08cc7e22) */
/* WARNING: Removing unreachable block (ram,0x08cc804a) */

undefined4 target(int param_1,int param_2,int param_3)

{
  byte bVar1;
  short sVar2;
  code *pcVar3;
  undefined *puVar4;
  undefined2 uVar5;
  int iVar6;
  int iVar7;
  uint uVar8;
  int iVar9;
  int iVar10;
  short *psVar11;
  int iVar12;
  int iStack_30;
  int iStack_2c;
  int iStack_28;
  int iStack_24;
  
  iVar10 = (int)DAT_08cc7c8a;
  if (*(int *)(iVar10 + param_1 + 0x24) == 0) {
    iStack_2c = param_2;
    iStack_28 = param_3;
    iVar6 = (*(code *)PTR_FUN_08cc7cb0)();
    puVar4 = PTR_FUN_08cc7cb4;
    if (iVar6 != 0) {
      iVar10 = (int)DAT_08cc7c8e;
      *(short *)(DAT_08cc7c8c + param_1) = *(short *)(DAT_08cc7c8c + param_1) + 1;
      uVar5 = (*(code *)PTR_FUN_08cc7cb8)(param_1);
      *(undefined2 *)(iVar10 + param_1) = uVar5;
      iVar6 = DAT_08cc7c90 + param_1;
      iStack_30 = *(int *)(iVar6 + 0x18);
      iStack_24 = 0;
      iVar10 = (int)DAT_08cc7c92;
      *(undefined4 *)(iVar6 + 0x18) = 0;
      (*(code *)puVar4)(param_1 + iVar10);
      if ((iStack_2c != 0) && (*(int *)(iVar6 + 0x38) != 0)) {
        (*(code *)PTR_FUN_08cc7cbc)(iStack_2c);
      }
      iVar10 = *(int *)(DAT_08cc7c94 + param_1);
      if (iVar10 == 0x20) {
        iVar10 = (int)DAT_08cc7ca6;
        *(undefined2 *)(DAT_08cc7ca4 + param_1) = 0;
        (*(code *)puVar4)(param_1 + iVar10);
        iVar6 = DAT_08cc7ca8 + param_1;
        iVar10 = (int)DAT_08cc7caa;
        psVar11 = (short *)(DAT_08cc7c9c + param_1);
        *(undefined4 *)(iVar6 + 0x38) = 0;
        *(undefined4 *)(iVar6 + 0x3c) = 0;
        *(undefined4 *)(iVar6 + 0x34) = 0;
        sVar2 = *psVar11;
        iVar6 = (int)DAT_08cc7c9e;
        *(undefined1 *)(iVar10 + param_1) = 0;
        psVar11[2] = 0;
        psVar11[3] = 0;
        *(undefined1 *)(sVar2 + param_1 + iVar6) = 0;
        *(undefined1 *)(iVar10 + 1 + param_1) = 0;
        iVar6 = (int)DAT_08cc7cac;
        *(undefined4 *)(iVar10 + 0x3e + param_1) = 0;
        *(undefined2 *)(iVar10 + 0x42 + param_1) = 0;
        puVar4 = PTR_FUN_08cc7cc0;
        iVar10 = (int)DAT_08cc7ca0;
        *(undefined2 *)(iVar10 + param_1) = 0;
        *(undefined1 *)(iVar10 + 2 + param_1) = 0;
        (*(code *)puVar4)(param_1 + iVar6);
      }
      else if (iVar10 < 0x21) {
        if (iVar10 == 7) {
          (*(code *)PTR_FUN_08cc7cc0)(param_1 + DAT_08cc7cae);
        }
        else {
          if (iVar10 < 8) {
            if (iVar10 != 1) goto LAB_08cc7ccc;
          }
          else if (iVar10 != 8) goto LAB_08cc7ccc;
          iVar10 = (int)DAT_08cc7c98;
          *(undefined2 *)(DAT_08cc7c96 + param_1) = 0;
          (*(code *)puVar4)(param_1 + iVar10);
          *(undefined1 *)(DAT_08cc7c9a + param_1) = 0;
        }
      }
      else {
        if (iVar10 != 0x30) {
          if (iVar10 < 0x31) {
            if (iVar10 == 0x26) {
              iVar10 = (int)DAT_08cc7dd6;
              *(undefined4 *)(iVar10 + param_1 + 0x2c) = 0;
              *(undefined4 *)(iVar10 + param_1 + 0x30) = 0;
            }
            goto LAB_08cc7ccc;
          }
          if (iVar10 != 0x32) goto LAB_08cc7ccc;
        }
        psVar11 = (short *)(DAT_08cc7c9c + param_1);
        *(undefined1 *)(*psVar11 + param_1 + (int)DAT_08cc7c9e) = 0;
        iVar10 = (int)DAT_08cc7ca0;
        psVar11[2] = 0;
        psVar11[3] = 0;
        *(undefined2 *)(iVar10 + param_1) = 0;
        *(undefined1 *)(iVar10 + 2 + param_1) = 0;
        *(undefined4 *)(DAT_08cc7ca2 + param_1) = 0;
      }
LAB_08cc7ccc:
      iVar10 = (*(code *)PTR_FUN_08cc7de0)(param_1);
      if (-5 < iVar10) {
        sVar2 = *(short *)(DAT_08cc7dd8 + param_1);
        pcVar3 = (code *)PTR_FUN_08cc87f8;
        while ((PTR_FUN_08cc87f8 = pcVar3, 0 < sVar2 || (-2 < iVar10))) {
          iVar7 = DAT_08cc7dda + param_1;
          iVar6 = *(int *)(iVar7 + 0x30);
          iVar9 = *(int *)(DAT_08cc7ddc + param_1);
          if (iVar6 == 0x20) {
            if (iVar9 == 0x54) {
              if (iVar10 == 3) {
                (*(code *)PTR_FUN_08cc81ac)(param_1 + DAT_08cc818c,param_1 + DAT_08cc8188,6);
              }
            }
            else if (iVar9 < 0x55) {
              if (iVar9 == 0x3e) {
                if (iVar10 == 4) {
                  iVar10 = (int)DAT_08cc8190;
                  *(undefined4 *)(iVar10 + param_1) = *(undefined4 *)(iVar7 + 0x1c);
                  *(undefined4 *)(iVar10 + 4 + param_1) = *(undefined4 *)(iVar7 + 0x20);
                }
              }
              else if (iVar9 < 0x3f) {
                if (iVar9 == 0x3c) {
                  if (iVar10 == 3) {
                    (*(code *)PTR_FUN_08cc81ac)(param_1 + DAT_08cc8186,param_1 + DAT_08cc8188,6);
                  }
                }
                else if (iVar9 < 0x3d) {
                  if ((iVar9 == 0x22) && (iVar10 == 4)) {
                    iVar10 = (int)DAT_08cc818e;
                    *(undefined4 *)(iVar10 + param_1) = *(undefined4 *)(iVar7 + 0x1c);
                    *(undefined4 *)(iVar10 + 4 + param_1) = *(undefined4 *)(iVar7 + 0x20);
                  }
                }
                else if (iVar10 == 4) {
                  iVar10 = (int)DAT_08cc8192;
                  *(undefined4 *)(iVar10 + param_1) = *(undefined4 *)(iVar7 + 0x1c);
                  *(undefined4 *)(iVar10 + 4 + param_1) = *(undefined4 *)(iVar7 + 0x20);
                }
              }
              else if (iVar9 == 0x49) {
                if (iVar10 == 2) {
                  if ((*(ushort *)(DAT_08cc807a + param_1) >> 0xc & 1) == 0) {
                    iStack_30 = *(int *)(param_1 + 0xa0);
                  }
                  else {
                    iStack_30 = iStack_30 + *(int *)(param_1 + 0xa0);
                  }
                  *(int *)(DAT_08cc807c + param_1) = iStack_30;
                }
              }
              else if (iVar9 < 0x4a) {
                if ((iVar9 == 0x40) && (iVar10 == 2)) {
                  *(short *)(DAT_08cc818a + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
                }
              }
              else if (iVar9 == 0x4e) {
                *(undefined4 *)(DAT_08cc819c + param_1) = *(undefined4 *)(param_1 + 0xa0);
              }
            }
            else if (iVar9 == 0x77) {
              *(undefined4 *)(DAT_08cc819e + param_1) = *(undefined4 *)(param_1 + 0xa0);
            }
            else if (iVar9 < 0x78) {
              if (iVar9 == 0x75) {
                *(char *)(DAT_08cc8194 + param_1) = (char)*(undefined4 *)(param_1 + 0xa0);
              }
              else if (iVar9 < 0x76) {
                if (iVar9 == 0x74) {
                  *(undefined4 *)(DAT_08cc8196 + param_1) = *(undefined4 *)(param_1 + 0xa0);
                }
              }
              else {
                iVar10 = (int)DAT_08cc8198;
                bVar1 = *(byte *)(iVar10 + param_1);
                if (bVar1 < 4) {
                  *(char *)((int)DAT_08cc819a + (uint)bVar1 + param_1) =
                       (char)*(undefined4 *)(param_1 + 0xa0);
                  *(byte *)(iVar10 + param_1) = bVar1 + 1;
                }
              }
            }
            else if (iVar9 == DAT_08cc8076) {
              *(short *)(DAT_08cc81a2 + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
            }
            else if (DAT_08cc8076 < iVar9) {
              if ((iVar9 == DAT_08cc8078) && (iVar10 - 5U < 2)) {
                *(undefined4 *)(DAT_08cc81a4 + param_1) = *(undefined4 *)(param_1 + 0xb0);
                iVar6 = (int)DAT_08cc81a8;
                *(undefined2 *)(iVar6 + param_1) = *(undefined2 *)(DAT_08cc81a6 + param_1);
                *(char *)(iVar6 + 2 + param_1) = (char)iVar10;
              }
            }
            else if (iVar9 == 0x78) {
              *(undefined4 *)(DAT_08cc81a0 + param_1) = *(undefined4 *)(param_1 + 0xa0);
            }
          }
          else if (iVar6 < 0x21) {
            if (iVar6 == 6) {
              if ((iVar9 == 0x57) && (iVar10 == 3)) {
                (*(code *)PTR_FUN_08cc8758)(param_1 + DAT_08cc8748,param_1 + DAT_08cc874a,6);
              }
            }
            else if (iVar6 < 7) {
              if (iVar6 - 1U < 3) {
LAB_08cc7d7c:
                if (iVar9 == 0x40) {
                  if (*(int *)(DAT_08cc8070 + param_1) == 1 && iVar10 == 2) {
                    *(short *)(DAT_08cc8072 + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
                  }
                }
                else if (iVar9 < 0x41) {
                  if (iVar9 == 0x37) {
                    if ((iVar10 == 5) && (*(short *)(DAT_08cc7f06 + param_1) == 3)) {
                      (*(code *)PTR_FUN_08cc7f14)
                                (param_1 + DAT_08cc7f08,*(undefined4 *)(param_1 + 0xb0),3);
                      *(undefined1 *)(DAT_08cc7f0a + param_1) = 0;
                    }
                  }
                  else if (iVar9 < 0x38) {
                    if ((iVar9 == 0x36) && (iVar10 == 3)) {
                      if (*(int *)(DAT_08cc7f0c + param_1) == 1) {
                        if (*(int *)(param_1 + 0xb8) == 2) {
                          (*(code *)PTR_FUN_08cc7f10)
                                    (param_1 + DAT_08cc7f02,param_1 + DAT_08cc7f04,6);
                        }
                        else if (*(int *)(param_1 + 0xb8) == 0x14) {
                          (*(code *)PTR_FUN_08cc7f10)
                                    (param_1 + DAT_08cc7f0e,param_1 + DAT_08cc7f04,6);
                        }
                      }
                      else if ((*(int *)(DAT_08cc7f0c + param_1) - 2U < 2) &&
                              (*(int *)(param_1 + 0xb8) == 0xd)) {
                        (*(code *)PTR_FUN_08cc8080)(param_1 + DAT_08cc806c,param_1 + DAT_08cc806e,6)
                        ;
                      }
                    }
                  }
                  else if ((iVar9 == 0x3c) && (iVar10 == 3)) {
                    (*(code *)PTR_FUN_08cc7f10)(param_1 + DAT_08cc7f02,param_1 + DAT_08cc7f04,6);
                  }
                }
                else if (iVar9 == 0x54) {
                  if (*(int *)(DAT_08cc8070 + param_1) == 1 && iVar10 == 3) {
                    (*(code *)PTR_FUN_08cc8080)(param_1 + DAT_08cc8074,param_1 + DAT_08cc806e,6);
                  }
                }
                else if (iVar9 < 0x55) {
                  if ((iVar9 == 0x49) && (iVar10 == 2)) {
                    if ((*(ushort *)(DAT_08cc7efc + param_1) >> 0xc & 1) == 0) {
                      iStack_30 = *(int *)(param_1 + 0xa0);
                    }
                    else {
                      iStack_30 = iStack_30 + *(int *)(param_1 + 0xa0);
                    }
                    *(int *)(DAT_08cc7efe + param_1) = iStack_30;
                  }
                }
                else if (iVar9 == 0x68) {
                  if (*(int *)(DAT_08cc7f0c + param_1) == 1 && iVar10 == 3) {
                    (*(code *)PTR_FUN_08cc7f10)(param_1 + DAT_08cc7f0e,param_1 + DAT_08cc7f04,6);
                  }
                }
                else if ((iVar9 == DAT_08cc7dde) && (iVar10 == 2)) {
                  if ((*(ushort *)(DAT_08cc7efc + param_1) >> 0xc & 1) == 0) {
                    *(short *)(DAT_08cc7f00 + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
                  }
                  else {
                    *(short *)(DAT_08cc7f00 + param_1) =
                         (short)*(undefined4 *)(param_1 + 0xa0) + *(short *)(DAT_08cc7f00 + param_1)
                    ;
                  }
                }
              }
            }
            else if (iVar6 == 7) {
              if (iVar9 == 0x7c) {
                if (iVar10 == 4) {
                  iVar10 = (int)DAT_08cc874c;
                  *(undefined4 *)(iVar10 + param_1) = *(undefined4 *)(iVar7 + 0x1c);
                  *(undefined4 *)(iVar10 + 4 + param_1) = *(undefined4 *)(iVar7 + 0x20);
                }
              }
              else if (iVar9 < 0x7d) {
                if ((iVar9 == 0x56) && (iVar10 == 3)) {
                  (*(code *)PTR_FUN_08cc8758)(param_1 + DAT_08cc8748,param_1 + DAT_08cc874a,6);
                }
              }
              else if ((iVar9 == 0x7d) && (iVar10 == 2)) {
                if ((*(ushort *)(DAT_08cc874e + param_1) >> 0xc & 1) == 0) {
                  iStack_30 = *(int *)(param_1 + 0xa0);
                }
                else {
                  iStack_30 = iStack_30 + *(int *)(param_1 + 0xa0);
                }
                *(int *)(DAT_08cc8750 + param_1) = iStack_30;
              }
            }
            else if (iVar6 == 8) goto LAB_08cc7d7c;
          }
          else if (iVar6 == 0x31) {
            if (iVar9 == 0x3c) {
              if (iVar10 == 3) {
                (*(code *)PTR_FUN_08cc85dc)(param_1 + DAT_08cc85c0,param_1 + DAT_08cc85be,6);
              }
              puVar4 = PTR_FUN_08cc85e0;
              if ((iStack_28 < 2) &&
                 ((int)*(short *)(DAT_08cc85c4 + param_1) <
                  (int)(uint)*(ushort *)(DAT_08cc85c2 + param_1))) {
                iVar7 = (int)DAT_08cc85c6;
                iVar6 = (*(code *)PTR_FUN_08cc85e0)(iVar7 + param_1);
                if ((-5 < iVar6) &&
                   ((0 < *(short *)((int)DAT_08cc85c8 + iVar7 + param_1) || (-2 < iVar10)))) {
                  while ((iVar6 != 3 ||
                         (*(int *)((int)DAT_08cc85ca + DAT_08cc85c6 + param_1) != 0x56))) {
                    iVar7 = (int)DAT_08cc85c6;
                    iVar6 = (*(code *)puVar4)(iVar7 + param_1);
                    if ((iVar6 < -4) ||
                       ((*(short *)((int)DAT_08cc85c8 + iVar7 + param_1) < 1 && (iVar10 < -1))))
                    goto LAB_08cc8798;
                  }
                  (*(code *)PTR_FUN_08cc85dc)
                            (param_1 + DAT_08cc85bc,DAT_08cc85c6 + param_1 + (int)DAT_08cc85be,6);
                }
              }
            }
            else if (iVar9 < 0x3d) {
              if ((iVar9 == 0x23) && (iVar10 == -1)) {
                (*(code *)PTR_FUN_08cc85d8)(param_1,iStack_2c,iStack_28);
              }
            }
            else if ((iVar9 == 0x56) && (iVar10 == 3)) {
              (*(code *)PTR_FUN_08cc85dc)(param_1 + DAT_08cc85bc,param_1 + DAT_08cc85be,6);
            }
          }
          else if (iVar6 < 0x32) {
            if (iVar6 == 0x26) {
              if (iVar9 == DAT_08cc8752) {
                if (iVar10 == 2) {
                  if ((*(ushort *)(DAT_08cc874e + param_1) >> 0xc & 1) == 0) {
                    iStack_30 = *(int *)(param_1 + 0xa0);
                  }
                  else {
                    iStack_30 = iStack_30 + *(int *)(param_1 + 0xa0);
                  }
                  iVar6 = (int)DAT_08cc8754;
                  *(int *)(DAT_08cc8750 + param_1) = iStack_30;
                  iVar6 = iVar6 + param_1;
                  iVar10 = *(int *)(iVar6 + 0x2c) * 4;
                  if (iVar10 + 4U < 0x79) {
                    (*(code *)PTR_FUN_08cc8758)(iVar10 + param_1 + (int)DAT_08cc8756,&iStack_30,4);
                  }
                  *(int *)(iVar6 + 0x2c) = *(int *)(iVar6 + 0x2c) + 1;
                }
              }
              else if ((iVar9 == DAT_08cc8752 + 1) && (iVar10 == 3)) {
                iVar7 = (int)DAT_08cc87e8;
                iVar6 = (int)DAT_08cc87ec;
                (*pcVar3)(iVar7 + param_1,param_1 + DAT_08cc87ea,6);
                iVar6 = iVar6 + param_1;
                iVar10 = *(int *)(iVar6 + 0x30) * 8;
                if (iVar10 + 8U <= (uint)(int)DAT_08cc87ee) {
                  (*pcVar3)(iVar10 + param_1 + (int)DAT_08cc87f0,iVar7 + param_1,8);
                }
                *(int *)(iVar6 + 0x30) = *(int *)(iVar6 + 0x30) + 1;
              }
            }
            else if (iVar6 == 0x30) {
              if (iVar9 == 0x3c) {
                if (iVar10 == 3) {
                  (*(code *)PTR_FUN_08cc8418)(param_1 + DAT_08cc840a,param_1 + DAT_08cc840c,6);
                }
              }
              else if (iVar9 < 0x3d) {
                if (iVar9 == 0x23) {
                  if (iVar10 == -1) {
                    (*(code *)PTR_FUN_08cc8424)(param_1,iStack_2c,iStack_28);
                  }
                }
                else if (iVar9 < 0x24) {
                  if (iVar9 == 0x22) {
                    iVar6 = (int)DAT_08cc8414;
                    iVar10 = (int)DAT_08cc8406;
                    *(undefined4 *)(iVar10 + param_1) = *(undefined4 *)(iVar6 + param_1 + 0x1c);
                    *(undefined4 *)(iVar10 + 4 + param_1) = *(undefined4 *)(iVar6 + param_1 + 0x20);
                  }
                }
                else if (iVar9 == 0x35) {
                  if ((*(ushort *)(DAT_08cc82c0 + param_1) >> 0xc & 1) == 0) {
                    iStack_24 = *(int *)(param_1 + 0xa0);
                  }
                  else {
                    iStack_24 = iStack_24 + *(int *)(param_1 + 0xa0);
                  }
                  iVar6 = 0x77 - *(short *)(DAT_08cc82c2 + param_1);
                  if (iVar6 < iStack_24) {
LAB_08cc82ae:
                    iStack_24 = iVar6;
                  }
                }
                else if (iVar9 == 0x3b) {
                  iVar6 = iStack_24;
                  if ((1 < iVar10 - 5U) ||
                     (iVar7 = (int)*(short *)(DAT_08cc83fc + param_1), iVar7 < 0))
                  goto LAB_08cc82ae;
                  psVar11 = (short *)(DAT_08cc83fe + param_1);
                  iVar6 = (-iStack_24 - (int)*psVar11) + 0x77;
                  if (iVar6 < iVar7) {
                    iVar7 = iVar6;
                  }
                  iVar9 = (int)DAT_08cc8400;
                  iVar6 = (int)DAT_08cc8402;
                  (*(code *)PTR_FUN_08cc8418)(*psVar11 + param_1 + iVar6,iVar9 + param_1,iStack_24);
                  puVar4 = PTR_FUN_08cc841c;
                  (*(code *)PTR_FUN_08cc841c)
                            (*psVar11 + param_1 + iStack_24 + iVar6,*(undefined4 *)(param_1 + 0xb0),
                             iVar7);
                  sVar2 = *psVar11;
                  iVar7 = iStack_24 + sVar2 + iVar7;
                  *(undefined1 *)(iVar7 + param_1 + iVar6) = 0;
                  if (0xe < iVar7) {
                    iVar7 = 0x10;
                  }
                  (*(code *)puVar4)(iVar9 + param_1,param_1 + sVar2 + iVar6,iVar7);
                  *(uint *)(DAT_08cc8404 + param_1) = (uint)(iVar10 == 6);
                }
              }
              else if (iVar9 == DAT_08cc82bc) {
                *(char *)(DAT_08cc8408 + param_1) = (char)*(undefined4 *)(param_1 + 0xa0);
              }
              else if (DAT_08cc82bc < iVar9) {
                if (iVar9 == DAT_08cc82be) {
                  *(char *)(DAT_08cc8412 + param_1) = (char)*(undefined4 *)(param_1 + 0xa0);
                }
                else if ((iVar9 == DAT_08cc82be + 1) && (iVar10 == -1)) {
                  (*(code *)PTR_FUN_08cc8420)(param_1 + DAT_08cc8406);
                  iVar10 = (int)DAT_08cc8408;
                  *(undefined1 *)(iVar10 + param_1) = 0xff;
                  *(undefined1 *)(iVar10 + 1 + param_1) = 0;
                  *(undefined4 *)(iVar10 + -4 + param_1) = 1;
                }
              }
              else if (((iVar9 != 0x52) && (iVar9 == 0x67)) && (iVar10 - 5U < 2)) {
                *(undefined4 *)(DAT_08cc840e + param_1) = *(undefined4 *)(param_1 + 0xb0);
                iVar6 = (int)DAT_08cc8410;
                *(undefined2 *)(iVar6 + param_1) = *(undefined2 *)(DAT_08cc83fc + param_1);
                *(char *)(iVar6 + 2 + param_1) = (char)iVar10;
              }
            }
          }
          else if (iVar6 == 0x33) {
            if (iVar9 == 0x3c) {
              if (iVar10 == 3) {
                (*(code *)PTR_FUN_08cc8758)(param_1 + DAT_08cc8748,param_1 + DAT_08cc874a,6);
              }
            }
            else if ((iVar9 == 0x49) && (iVar10 == 2)) {
              if ((*(ushort *)(DAT_08cc874e + param_1) >> 0xc & 1) == 0) {
                iStack_30 = *(int *)(param_1 + 0xa0);
              }
              else {
                iStack_30 = iStack_30 + *(int *)(param_1 + 0xa0);
              }
              *(int *)(DAT_08cc8750 + param_1) = iStack_30;
            }
          }
          else if (iVar6 < 0x33) {
            if (iVar9 == 0x3c) {
              if (iVar10 == 3) {
                (*(code *)PTR_FUN_08cc85dc)(param_1 + DAT_08cc85c0,param_1 + DAT_08cc85be,6);
              }
            }
            else if (iVar9 < 0x3d) {
              if ((iVar9 == 0x23) && (iVar10 == -1)) {
                (*(code *)PTR_FUN_08cc85d8)(param_1,iStack_2c,iStack_28);
              }
            }
            else if (iVar9 == 0x53) {
              if (iVar10 == 2) {
                uVar8 = *(uint *)(param_1 + 0xa0) & 0xffff;
                if ((uint)(int)DAT_08cc85cc < uVar8) {
                  (*(code *)PTR_FUN_08cc85e4)
                            (*(short *)(DAT_08cc85ce + param_1) + param_1 + (int)DAT_08cc85d0);
                }
                else {
                  iVar10 = (int)DAT_08cc85d0;
                  iVar6 = *(short *)(DAT_08cc85ce + param_1) + param_1;
                  *(char *)(iVar10 + iVar6) = (char)uVar8;
                  *(undefined1 *)(iVar10 + 1 + iVar6) = 0;
                }
              }
              else if ((iVar10 - 5U < 2) &&
                      (iVar6 = (int)*(short *)(DAT_08cc85d2 + param_1), -1 < iVar6)) {
                iVar12 = (int)DAT_08cc85ce;
                iVar9 = (int)*(short *)(iVar12 + param_1);
                iVar7 = 0x77 - iVar9;
                if (iVar7 < iVar6) {
                  iVar6 = iVar7;
                }
                iVar7 = (int)DAT_08cc85d0;
                (*(code *)PTR_FUN_08cc85e8)
                          (iVar9 + param_1 + iVar7,*(undefined4 *)(param_1 + 0xb0),iVar6);
                *(undefined1 *)(*(short *)(iVar12 + param_1) + param_1 + iVar6 + iVar7) = 0;
                *(uint *)(DAT_08cc85d4 + param_1) = (uint)(iVar10 == 6);
              }
            }
          }
          else if (iVar6 == 0x34) {
            if (iVar9 == 0x3c) {
              if (iVar10 == 3) {
                (*(code *)PTR_FUN_08cc82c4)(param_1 + DAT_08cc82b4,param_1 + DAT_08cc82b6,6);
              }
            }
            else if (iVar9 < 0x3d) {
              if ((iVar9 == 0x22) && (iVar10 == 4)) {
                iVar6 = (int)DAT_08cc82b8;
                iVar10 = (int)DAT_08cc82ba;
                *(undefined4 *)(iVar10 + param_1) = *(undefined4 *)(iVar6 + param_1 + 0x1c);
                *(undefined4 *)(iVar10 + 4 + param_1) = *(undefined4 *)(iVar6 + param_1 + 0x20);
              }
            }
            else if ((iVar9 != 0x49) && (iVar9 == 0x4f)) {
              *(undefined4 *)(DAT_08cc82b2 + param_1) = *(undefined4 *)(param_1 + 0xa0);
            }
          }
LAB_08cc8798:
          iVar10 = (*(code *)PTR_FUN_08cc87fc)(param_1);
          if (iVar10 < -4) break;
          sVar2 = *(short *)(DAT_08cc87f2 + param_1);
          pcVar3 = (code *)PTR_FUN_08cc87f8;
        }
      }
      if ((iVar10 == -2) && (*(short *)(DAT_08cc87f2 + param_1) == 0)) {
        *(undefined4 *)(DAT_08cc87f4 + param_1) = 0;
      }
      else {
        *(undefined4 *)(DAT_08cc87f4 + param_1) = 1;
      }
      return 1;
    }
    *(undefined4 *)(iVar10 + param_1 + 0x24) = 1;
  }
  return 0;
}


