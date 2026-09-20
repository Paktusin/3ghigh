
undefined4 target(int param_1)

{
  char cVar1;
  undefined *puVar2;
  undefined *puVar3;
  undefined *puVar4;
  undefined *puVar5;
  undefined *puVar6;
  undefined *puVar7;
  undefined *puVar8;
  undefined *puVar9;
  undefined2 uVar10;
  undefined4 uVar11;
  int iVar12;
  int iVar13;
  int *piVar14;
  int iVar15;
  int iVar16;
  
  iVar12 = *(int *)(DAT_08cc8942 + param_1);
  while (iVar12 == 0) {
    (*(code *)PTR_FUN_08cc894c)(param_1,0,2);
    iVar12 = *(int *)(DAT_08cc8942 + param_1);
  }
  iVar12 = (int)DAT_08cc8944;
  iVar16 = 0;
  uVar10 = (*(code *)PTR_FUN_08cc8950)(param_1);
  *(undefined2 *)(iVar12 + param_1) = uVar10;
  iVar12 = (*(code *)PTR_FUN_08cc8954)(param_1);
  puVar2 = PTR_FUN_08cc8958;
  if (iVar12 == 0) {
                    /* WARNING: Could not recover jumptable at 0x08cc8846. Too many branches */
                    /* WARNING: Treating indirect jump as call */
    uVar11 = (*(code *)((int)&DAT_08cc884a + (int)DAT_08cc884a))();
    return uVar11;
  }
  iVar12 = (int)DAT_08cc8946;
  *(uint *)(iVar12 + param_1 + 0x34) = (uint)*(ushort *)(param_1 + 0x10);
  *(undefined4 *)(iVar12 + param_1 + 0x24) = 1;
  iVar12 = (*(code *)puVar2)(param_1);
  puVar9 = PTR_FUN_08cc9a18;
  puVar8 = PTR_FUN_08cc96dc;
  puVar7 = PTR_FUN_08cc9534;
  puVar6 = PTR_FUN_08cc921c;
  puVar5 = PTR_FUN_08cc9214;
  puVar4 = PTR_FUN_08cc8e90;
  puVar3 = PTR_FUN_08cc8c10;
  if ((iVar12 < -4) || ((*(short *)(DAT_08cc8948 + param_1) < 1 && (iVar12 < -1)))) {
                    /* WARNING: Could not recover jumptable at 0x08cc887c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
    uVar11 = (*(code *)((int)&DAT_08cc8880 + (int)DAT_08cc8880))();
    return uVar11;
  }
  iVar13 = *(int *)(DAT_08cc894a + param_1);
  if (iVar13 == 0x52 && iVar12 == 2) {
    iVar16 = *(int *)(param_1 + 0xa0);
  }
  if (iVar16 != 0x18) {
    if (0x18 < iVar16) {
      if (iVar16 == 0x26) {
                    /* WARNING: Could not recover jumptable at 0x08cc89a2. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc89a6 + (int)DAT_08cc89a6))();
        return uVar11;
      }
      if (0x26 < iVar16) {
        if (iVar16 == 0x32) {
                    /* WARNING: Could not recover jumptable at 0x08cc89fc. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8a00 + (int)DAT_08cc8a00))();
          return uVar11;
        }
        if (iVar16 < 0x33) {
          if (iVar16 == 0x30) {
                    /* WARNING: Could not recover jumptable at 0x08cc8a0e. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8a12 + (int)DAT_08cc8a12))();
            return uVar11;
          }
          if (iVar16 != 0x31) {
                    /* WARNING: Could not recover jumptable at 0x08cc8a20. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8a24 + (int)DAT_08cc8a24))();
            return uVar11;
          }
                    /* WARNING: Could not recover jumptable at 0x08cc8a18. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8a1c + (int)DAT_08cc8a1c))();
          return uVar11;
        }
        if (iVar16 != 0x34) {
          if (iVar16 < 0x34) {
                    /* WARNING: Could not recover jumptable at 0x08cc8a38. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8a3c + (int)DAT_08cc8a3c))();
            return uVar11;
          }
          if (iVar16 == 0x80) {
                    /* WARNING: Could not recover jumptable at 0x08cc8a46. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8a4a + (int)DAT_08cc8a4a))();
            return uVar11;
          }
LAB_08cc8a4c:
                    /* WARNING: Could not recover jumptable at 0x08cc8a4e. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8a52 + (int)DAT_08cc8a52))();
          return uVar11;
        }
        if (iVar13 == 0x60) {
          if (iVar12 == 4) {
            iVar16 = (int)DAT_08cc9526;
            iVar12 = (int)DAT_08cc952a;
            *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
            iVar13 = (int)DAT_08cc9466;
                    /* WARNING: Could not recover jumptable at 0x08cc9462. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
            uVar11 = (*(code *)((int)&DAT_08cc9466 + iVar13))();
            return uVar11;
          }
LAB_08cc9446:
                    /* WARNING: Could not recover jumptable at 0x08cc9448. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc944c + (int)DAT_08cc944c))();
          return uVar11;
        }
        if (0x60 < iVar13) {
          if (iVar13 == 99) {
            if (iVar12 == 4) {
              iVar16 = (int)DAT_08cc9526;
              iVar12 = (int)DAT_08cc9530;
              *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
              iVar13 = (int)DAT_08cc94b4;
                    /* WARNING: Could not recover jumptable at 0x08cc94b0. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
              uVar11 = (*(code *)((int)&DAT_08cc94b4 + iVar13))();
              return uVar11;
            }
          }
          else {
            if (iVar13 < 100) {
              if (iVar13 != 0x61) {
                if (iVar13 != 0x62) {
                    /* WARNING: Could not recover jumptable at 0x08cc9374. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                  uVar11 = (*(code *)((int)&DAT_08cc9378 + (int)DAT_08cc9378))();
                  return uVar11;
                }
                (*(code *)PTR_FUN_08cc953c)(param_1 + DAT_08cc951e,param_1 + DAT_08cc952c,6);
                    /* WARNING: Could not recover jumptable at 0x08cc94c8. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc94cc + (int)DAT_08cc94cc))();
                return uVar11;
              }
              if (iVar12 == 4) {
                iVar16 = (int)DAT_08cc9526;
                iVar12 = (int)DAT_08cc9528;
                *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
                *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
                goto LAB_08cc9446;
              }
              goto LAB_08cc9428;
            }
            if (iVar13 != 100) {
              if (iVar13 == 0x65) {
                iVar12 = (int)DAT_08cc941e;
                    /* WARNING: Could not recover jumptable at 0x08cc941a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                *(undefined4 *)(DAT_08cc9518 + param_1) = *(undefined4 *)(param_1 + 0xa0);
                uVar11 = (*(code *)((int)&DAT_08cc941e + iVar12))();
                return uVar11;
              }
                    /* WARNING: Could not recover jumptable at 0x08cc93a6. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc93aa + (int)DAT_08cc93aa))();
              return uVar11;
            }
            if (iVar12 != 4) goto LAB_08cc9478;
            iVar16 = (int)DAT_08cc9526;
            iVar12 = (int)DAT_08cc952e;
            *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
            *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
          }
                    /* WARNING: Could not recover jumptable at 0x08cc9496. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc949a + (int)DAT_08cc949a))();
          return uVar11;
        }
        if (iVar13 != 0x4f) {
          if (iVar13 < 0x50) {
            if (iVar13 == 0x2b) {
              iVar12 = (int)DAT_08cc9410;
                    /* WARNING: Could not recover jumptable at 0x08cc940c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              *(uint *)(DAT_08cc9522 + param_1) = (uint)(*(int *)(param_1 + 0xa0) != 0);
              uVar11 = (*(code *)((int)&DAT_08cc9410 + iVar12))();
              return uVar11;
            }
            if (iVar13 == 0x38) {
              iVar12 = (int)DAT_08cc93fa;
                    /* WARNING: Could not recover jumptable at 0x08cc93f6. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              *(uint *)(DAT_08cc9520 + param_1) = (uint)(*(int *)(param_1 + 0xa0) != 0);
              uVar11 = (*(code *)((int)&DAT_08cc93fa + iVar12))();
              return uVar11;
            }
                    /* WARNING: Could not recover jumptable at 0x08cc933a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc933e + (int)DAT_08cc933e))();
            return uVar11;
          }
          if (iVar13 == 0x52) {
            iVar12 = (int)DAT_08cc9514;
            iVar16 = (int)DAT_08cc9516;
            *(undefined4 *)(iVar12 + param_1 + 0x14) = 0;
            *(undefined4 *)(iVar12 + param_1 + 0x18) = 0;
            iVar12 = (int)DAT_08cc951a;
            *(undefined4 *)(DAT_08cc9518 + param_1) = 0;
            *(undefined4 *)(iVar16 + param_1 + 0x20) = 0;
            (*(code *)puVar7)(param_1 + iVar12);
            (*(code *)puVar7)(param_1 + DAT_08cc951c);
            puVar2 = PTR_FUN_08cc9538;
            (*(code *)PTR_FUN_08cc9538)(iVar16 + param_1);
            (*(code *)puVar2)(param_1 + DAT_08cc951e);
                    /* WARNING: Could not recover jumptable at 0x08cc93e2. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc93e6 + (int)DAT_08cc93e6))();
            return uVar11;
          }
          if (iVar13 != 0x5f) {
                    /* WARNING: Could not recover jumptable at 0x08cc9350. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc9354 + (int)DAT_08cc9354))();
            return uVar11;
          }
          (*(code *)PTR_FUN_08cc953c)(param_1 + DAT_08cc9516,param_1 + DAT_08cc952c,6);
LAB_08cc9478:
                    /* WARNING: Could not recover jumptable at 0x08cc947a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc947e + (int)DAT_08cc947e))();
          return uVar11;
        }
        *(undefined4 *)(DAT_08cc9524 + param_1) = *(undefined4 *)(param_1 + 0xa0);
LAB_08cc9428:
                    /* WARNING: Could not recover jumptable at 0x08cc942a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc942e + (int)DAT_08cc942e))();
        return uVar11;
      }
      if (iVar16 == 0x22) {
        if (iVar13 == 0x62) {
          (*(code *)PTR_FUN_08cc9390)(param_1 + DAT_08cc9386,param_1 + DAT_08cc9380,6);
                    /* WARNING: Could not recover jumptable at 0x08cc929a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc929e + (int)DAT_08cc929e))();
          return uVar11;
        }
        if (iVar13 < 99) {
          if (iVar13 == 0x5f) {
            (*(code *)PTR_FUN_08cc9390)(param_1 + DAT_08cc937e,param_1 + DAT_08cc9380,6);
LAB_08cc924a:
                    /* WARNING: Could not recover jumptable at 0x08cc924c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc9250 + (int)DAT_08cc9250))();
            return uVar11;
          }
          if (0x5f < iVar13) {
            if (iVar13 == 0x60) {
              if (iVar12 == 4) {
                iVar16 = (int)DAT_08cc937a;
                iVar12 = (int)DAT_08cc937c;
                *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
                iVar13 = (int)DAT_08cc9238;
                    /* WARNING: Could not recover jumptable at 0x08cc9234. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
                uVar11 = (*(code *)((int)&DAT_08cc9238 + iVar13))();
                return uVar11;
              }
            }
            else {
              if (iVar13 != 0x61) {
                    /* WARNING: Could not recover jumptable at 0x08cc9154. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc9158 + (int)DAT_08cc9158))();
                return uVar11;
              }
              if (iVar12 != 4) goto LAB_08cc91d8;
              iVar16 = (int)DAT_08cc9210;
              iVar12 = (int)DAT_08cc9212;
              *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
              *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
            }
                    /* WARNING: Could not recover jumptable at 0x08cc91f6. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc91fa + (int)DAT_08cc91fa))();
            return uVar11;
          }
          if (iVar13 == 0x42) {
            iVar12 = (int)DAT_08cc92dc;
                    /* WARNING: Could not recover jumptable at 0x08cc92d8. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            *(undefined4 *)(DAT_08cc938c + param_1) = *(undefined4 *)(param_1 + 0xa0);
            uVar11 = (*(code *)((int)&DAT_08cc92dc + iVar12))();
            return uVar11;
          }
          if (iVar13 != 0x52) {
                    /* WARNING: Could not recover jumptable at 0x08cc913c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc9140 + (int)DAT_08cc9140))();
            return uVar11;
          }
          (*(code *)PTR_FUN_08cc921c)(param_1 + DAT_08cc9208);
          (*(code *)puVar6)(param_1 + DAT_08cc920a);
          puVar2 = PTR_FUN_08cc9214;
          (*(code *)PTR_FUN_08cc9214)(param_1 + DAT_08cc91fe);
          (*(code *)puVar2)(param_1 + DAT_08cc920c);
          (*(code *)puVar2)(param_1 + DAT_08cc9200);
          (*(code *)puVar2)(param_1 + DAT_08cc9202);
          iVar12 = (int)DAT_08cc920e;
          *(undefined4 *)(iVar12 + param_1 + 0x2c) = 0;
          *(undefined4 *)(iVar12 + param_1 + 0x30) = 0;
LAB_08cc91d8:
                    /* WARNING: Could not recover jumptable at 0x08cc91da. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc91de + (int)DAT_08cc91de))();
          return uVar11;
        }
        if (iVar13 == 0x79) {
          (*(code *)PTR_FUN_08cc9390)(param_1 + DAT_08cc9388,param_1 + DAT_08cc9380,6);
                    /* WARNING: Could not recover jumptable at 0x08cc92b2. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc92b6 + (int)DAT_08cc92b6))();
          return uVar11;
        }
        if (iVar13 < 0x7a) {
          if (iVar13 == 99) {
            if (iVar12 == 4) {
              iVar16 = (int)DAT_08cc937a;
              iVar12 = (int)DAT_08cc9384;
              *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
              iVar13 = (int)DAT_08cc9286;
                    /* WARNING: Could not recover jumptable at 0x08cc9282. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
              uVar11 = (*(code *)((int)&DAT_08cc9286 + iVar13))();
              return uVar11;
            }
          }
          else {
            if (iVar13 != 100) {
                    /* WARNING: Could not recover jumptable at 0x08cc917c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc9180 + (int)DAT_08cc9180))();
              return uVar11;
            }
            if (iVar12 != 4) goto LAB_08cc924a;
            iVar16 = (int)DAT_08cc937a;
            iVar12 = (int)DAT_08cc9382;
            *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
            *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
          }
                    /* WARNING: Could not recover jumptable at 0x08cc9268. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc926c + (int)DAT_08cc926c))();
          return uVar11;
        }
        if (iVar13 == 0x7a) {
          (*(code *)PTR_FUN_08cc9390)(param_1 + DAT_08cc938a,param_1 + DAT_08cc9380,6);
                    /* WARNING: Could not recover jumptable at 0x08cc92ca. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc92ce + (int)DAT_08cc92ce))();
          return uVar11;
        }
        if (iVar13 != 0x7b) {
                    /* WARNING: Could not recover jumptable at 0x08cc9196. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc919a + (int)DAT_08cc919a))();
          return uVar11;
        }
        *(undefined4 *)(DAT_08cc938e + param_1) = *(undefined4 *)(param_1 + 0xa0);
      }
      else {
        if (iVar16 < 0x23) {
          if (iVar16 != 0x20) {
            if (iVar16 != 0x21) {
                    /* WARNING: Could not recover jumptable at 0x08cc89cc. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc89d0 + (int)DAT_08cc89d0))();
              return uVar11;
            }
            if (iVar13 == 0x4c) {
              iVar12 = (int)DAT_08cc90b4;
                    /* WARNING: Could not recover jumptable at 0x08cc90b0. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              *(short *)(DAT_08cc9204 + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
              uVar11 = (*(code *)((int)&DAT_08cc90b4 + iVar12))();
              return uVar11;
            }
            if (0x4c < iVar13) {
              if (iVar13 == 0x5f) {
                (*(code *)PTR_FUN_08cc9218)(param_1 + DAT_08cc91fe,param_1 + DAT_08cc9206,6);
                    /* WARNING: Could not recover jumptable at 0x08cc90d8. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc90dc + (int)DAT_08cc90dc))();
                return uVar11;
              }
              if (0x5f < iVar13) {
                if (iVar13 == 0x62) {
                  (*(code *)PTR_FUN_08cc9218)(param_1 + DAT_08cc9200,param_1 + DAT_08cc9206,6);
                    /* WARNING: Could not recover jumptable at 0x08cc90f0. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                  uVar11 = (*(code *)((int)&DAT_08cc90f4 + (int)DAT_08cc90f4))();
                  return uVar11;
                }
                    /* WARNING: Could not recover jumptable at 0x08cc9076. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc907a + (int)DAT_08cc907a))();
                return uVar11;
              }
              if (iVar13 == 0x52) {
                iVar12 = (int)DAT_08cc91fc;
                iVar16 = (int)DAT_08cc91fe;
                *(undefined4 *)(iVar12 + param_1) = 0;
                *(undefined2 *)(iVar12 + -8 + param_1) = 0;
                (*(code *)puVar5)(param_1 + iVar16);
                (*(code *)puVar5)(param_1 + DAT_08cc9200);
                (*(code *)puVar5)(param_1 + DAT_08cc9202);
                    /* WARNING: Could not recover jumptable at 0x08cc90a0. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc90a4 + (int)DAT_08cc90a4))();
                return uVar11;
              }
                    /* WARNING: Could not recover jumptable at 0x08cc906a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc906e + (int)DAT_08cc906e))();
              return uVar11;
            }
            if (iVar13 == 0x2b) {
              (*(code *)PTR_FUN_08cc9218)(param_1 + DAT_08cc9202,param_1 + DAT_08cc9206,6);
                    /* WARNING: Could not recover jumptable at 0x08cc910a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc910e + (int)DAT_08cc910e))();
              return uVar11;
            }
            if (iVar13 == 0x41) {
              iVar12 = (int)DAT_08cc90c2;
                    /* WARNING: Could not recover jumptable at 0x08cc90be. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              *(undefined4 *)(DAT_08cc91fc + param_1) = *(undefined4 *)(param_1 + 0xa0);
              uVar11 = (*(code *)((int)&DAT_08cc90c2 + iVar12))();
              return uVar11;
            }
                    /* WARNING: Could not recover jumptable at 0x08cc904e. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc9052 + (int)DAT_08cc9052))();
            return uVar11;
          }
          if (iVar13 == 0x44) {
            iVar12 = (int)DAT_08cc8fce;
                    /* WARNING: Could not recover jumptable at 0x08cc8fca. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            *(undefined4 *)(DAT_08cc9028 + param_1) = *(undefined4 *)(param_1 + 0xa0);
            uVar11 = (*(code *)((int)&DAT_08cc8fce + iVar12))();
            return uVar11;
          }
          if (0x44 < iVar13) {
            if (iVar13 == 0x52) {
              iVar12 = (int)DAT_08cc9028;
              iVar16 = (int)DAT_08cc902a;
              *(undefined4 *)(iVar12 + param_1) = 0;
              puVar2 = PTR_FUN_08cc9034;
              *(undefined2 *)(iVar12 + -8 + param_1) = 0;
              *(undefined2 *)(DAT_08cc902c + param_1) = 0;
              (*(code *)puVar2)(param_1 + iVar16);
                    /* WARNING: Could not recover jumptable at 0x08cc8fba. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8fbe + (int)DAT_08cc8fbe))();
              return uVar11;
            }
            if (iVar13 != 0x54) {
                    /* WARNING: Could not recover jumptable at 0x08cc8f9a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8f9e + (int)DAT_08cc8f9e))();
              return uVar11;
            }
            if (iVar12 == 3) {
              (*(code *)PTR_FUN_08cc9030)(param_1 + DAT_08cc902a,param_1 + DAT_08cc9018,6);
                    /* WARNING: Could not recover jumptable at 0x08cc9010. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc9014 + (int)DAT_08cc9014))();
              return uVar11;
            }
LAB_08cc8ff0:
                    /* WARNING: Could not recover jumptable at 0x08cc8ff2. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8ff6 + (int)DAT_08cc8ff6))();
            return uVar11;
          }
          if (iVar13 == 0x40) {
            if (iVar12 == 2) {
              *(short *)(DAT_08cc902c + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
              goto LAB_08cc8ff0;
            }
          }
          else {
            if (iVar13 != 0x43) {
                    /* WARNING: Could not recover jumptable at 0x08cc8f86. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8f8a + (int)DAT_08cc8f8a))();
              return uVar11;
            }
            *(short *)(DAT_08cc902e + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
          }
                    /* WARNING: Could not recover jumptable at 0x08cc8fda. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8fde + (int)DAT_08cc8fde))();
          return uVar11;
        }
        if (iVar16 == 0x24) {
                    /* WARNING: Could not recover jumptable at 0x08cc89dc. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc89e0 + (int)DAT_08cc89e0))();
          return uVar11;
        }
        if (0x24 < iVar16) {
                    /* WARNING: Could not recover jumptable at 0x08cc89e8. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc89ec + (int)DAT_08cc89ec))();
          return uVar11;
        }
        if (iVar13 == 0x42) {
          iVar12 = (int)DAT_08cc9310;
                    /* WARNING: Could not recover jumptable at 0x08cc930c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          *(undefined4 *)(DAT_08cc938c + param_1) = *(undefined4 *)(param_1 + 0xa0);
          uVar11 = (*(code *)((int)&DAT_08cc9310 + iVar12))();
          return uVar11;
        }
        if (iVar13 == 0x52) {
          iVar12 = (int)DAT_08cc9300;
                    /* WARNING: Could not recover jumptable at 0x08cc92fc. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          *(undefined4 *)(DAT_08cc938c + param_1) = 0;
          uVar11 = (*(code *)((int)&DAT_08cc9300 + iVar12))();
          return uVar11;
        }
      }
                    /* WARNING: Could not recover jumptable at 0x08cc92e8. Too many branches */
                    /* WARNING: Treating indirect jump as call */
      uVar11 = (*(code *)((int)&DAT_08cc92ec + (int)DAT_08cc92ec))();
      return uVar11;
    }
    if (iVar16 == 5) {
                    /* WARNING: Could not recover jumptable at 0x08cc88c8. Too many branches */
                    /* WARNING: Treating indirect jump as call */
      uVar11 = (*(code *)((int)&DAT_08cc88cc + (int)DAT_08cc88cc))();
      return uVar11;
    }
    if (5 < iVar16) {
      if (iVar16 != 8) {
        if (8 < iVar16) {
          if (iVar16 == 0x11) {
                    /* WARNING: Could not recover jumptable at 0x08cc8966. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc896a + (int)DAT_08cc896a))();
            return uVar11;
          }
          if (0x11 < iVar16) {
            if (iVar16 != 0x12) {
                    /* WARNING: Could not recover jumptable at 0x08cc8994. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8998 + (int)DAT_08cc8998))();
              return uVar11;
            }
                    /* WARNING: Could not recover jumptable at 0x08cc898c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8990 + (int)DAT_08cc8990))();
            return uVar11;
          }
          if (iVar16 != 0x10) {
                    /* WARNING: Could not recover jumptable at 0x08cc897e. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8982 + (int)DAT_08cc8982))();
            return uVar11;
          }
                    /* WARNING: Could not recover jumptable at 0x08cc8976. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc897a + (int)DAT_08cc897a))();
          return uVar11;
        }
        if (iVar16 == 6) {
                    /* WARNING: Could not recover jumptable at 0x08cc892a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc892e + (int)DAT_08cc892e))();
          return uVar11;
        }
        if (iVar16 != 7) {
                    /* WARNING: Could not recover jumptable at 0x08cc893c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8940 + (int)DAT_08cc8940))();
          return uVar11;
        }
                    /* WARNING: Could not recover jumptable at 0x08cc8934. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc8938 + (int)DAT_08cc8938))();
        return uVar11;
      }
      if (iVar13 == 0x37) {
        if ((iVar12 != 5) || (*(short *)(DAT_08cc96d2 + param_1) != 3)) {
LAB_08cc95f4:
                    /* WARNING: Could not recover jumptable at 0x08cc95f6. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc95fa + (int)DAT_08cc95fa))();
          return uVar11;
        }
        (*(code *)PTR_FUN_08cc96e4)(param_1 + DAT_08cc96ba,*(undefined4 *)(param_1 + 0xb0),3);
        *(undefined1 *)(DAT_08cc96d4 + param_1) = 0;
      }
      else {
        if (0x37 < iVar13) {
          if (iVar13 == 0x3e) {
            if (iVar12 != 4) {
LAB_08cc963c:
                    /* WARNING: Could not recover jumptable at 0x08cc963e. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc9642 + (int)DAT_08cc9642))();
              return uVar11;
            }
            iVar16 = (int)DAT_08cc96d6;
            iVar12 = (int)DAT_08cc96d8;
            *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
            *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
          }
          else {
            if (0x3e < iVar13) {
              if (iVar13 == 0x52) {
                iVar12 = (int)DAT_08cc96b6;
                *(undefined2 *)(DAT_08cc96b8 + param_1) = 0;
                (*(code *)puVar8)(param_1 + iVar12);
                iVar12 = (int)DAT_08cc96bc;
                *(undefined1 *)(DAT_08cc96ba + param_1) = 0;
                puVar2 = PTR_FUN_08cc96e0;
                (*(code *)PTR_FUN_08cc96e0)(param_1 + iVar12);
                (*(code *)puVar2)(param_1 + DAT_08cc96be);
                (*(code *)puVar2)(param_1 + DAT_08cc96c0);
                (*(code *)puVar2)(param_1 + DAT_08cc96c2);
                (*(code *)puVar2)(param_1 + DAT_08cc96c4);
                (*(code *)puVar2)(param_1 + DAT_08cc96c6);
                (*(code *)puVar2)(param_1 + DAT_08cc96c8);
                (*(code *)puVar2)(param_1 + DAT_08cc96ca);
                (*(code *)puVar2)(param_1 + DAT_08cc96cc);
                (*(code *)puVar2)(param_1 + DAT_08cc96ce);
                (*(code *)puVar2)(param_1 + DAT_08cc96d0);
                    /* WARNING: Could not recover jumptable at 0x08cc95e6. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc95ea + (int)DAT_08cc95ea))();
                return uVar11;
              }
              if (iVar13 != DAT_08cc96b4) {
                    /* WARNING: Could not recover jumptable at 0x08cc9572. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc9576 + (int)DAT_08cc9576))();
                return uVar11;
              }
              *(short *)(DAT_08cc96b8 + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
              goto LAB_08cc95f4;
            }
            if (iVar13 != 0x3d) {
                    /* WARNING: Could not recover jumptable at 0x08cc955a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc955e + (int)DAT_08cc955e))();
              return uVar11;
            }
            if (iVar12 == 4) {
              iVar16 = (int)DAT_08cc96d6;
              iVar12 = (int)DAT_08cc96da;
              *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
              *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
LAB_08cc9674:
                    /* WARNING: Could not recover jumptable at 0x08cc9676. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc967a + (int)DAT_08cc967a))();
              return uVar11;
            }
          }
                    /* WARNING: Could not recover jumptable at 0x08cc965a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc965e + (int)DAT_08cc965e))();
          return uVar11;
        }
        if (iVar13 == 0x2a) {
          if (iVar12 == 3) {
            if (*(int *)(param_1 + 0xb8) == 4) {
              (*(code *)PTR_FUN_08cc9864)(param_1 + DAT_08cc9860,param_1 + DAT_08cc9852,6);
                    /* WARNING: Could not recover jumptable at 0x08cc97e4. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc97e8 + (int)DAT_08cc97e8))();
              return uVar11;
            }
            if (*(int *)(param_1 + 0xb8) == 0x15) {
              (*(code *)PTR_FUN_08cc9864)(param_1 + DAT_08cc9862,param_1 + DAT_08cc9852,6);
                    /* WARNING: Could not recover jumptable at 0x08cc97fc. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc9800 + (int)DAT_08cc9800))();
              return uVar11;
            }
                    /* WARNING: Could not recover jumptable at 0x08cc97ca. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc97ce + (int)DAT_08cc97ce))();
            return uVar11;
          }
LAB_08cc97ac:
                    /* WARNING: Could not recover jumptable at 0x08cc97ae. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc97b2 + (int)DAT_08cc97b2))();
          return uVar11;
        }
        if (0x2a < iVar13) {
          if (iVar13 == 0x2b) {
            if (iVar12 == 3) {
              if (*(int *)(param_1 + 0xb8) == 4) {
                (*(code *)PTR_FUN_08cc9864)(param_1 + DAT_08cc985c,param_1 + DAT_08cc9852,6);
                    /* WARNING: Could not recover jumptable at 0x08cc9796. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc979a + (int)DAT_08cc979a))();
                return uVar11;
              }
              if (*(int *)(param_1 + 0xb8) != 0x15) {
                    /* WARNING: Could not recover jumptable at 0x08cc977c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc9780 + (int)DAT_08cc9780))();
                return uVar11;
              }
              (*(code *)PTR_FUN_08cc9864)(param_1 + DAT_08cc985e,param_1 + DAT_08cc9852,6);
              goto LAB_08cc97ac;
            }
          }
          else {
            if (iVar13 != 0x36) {
                    /* WARNING: Could not recover jumptable at 0x08cc950e. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc9512 + (int)DAT_08cc9512))();
              return uVar11;
            }
            if (iVar12 != 3) goto LAB_08cc9674;
            iVar12 = *(int *)(param_1 + 0xb8);
            if (iVar12 == 7) {
              (*(code *)PTR_FUN_08cc9864)(param_1 + DAT_08cc9856,param_1 + DAT_08cc9852,6);
                    /* WARNING: Could not recover jumptable at 0x08cc972e. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc9732 + (int)DAT_08cc9732))();
              return uVar11;
            }
            if (iVar12 < 8) {
              if (iVar12 == 3) {
                (*(code *)PTR_FUN_08cc9864)(param_1 + DAT_08cc9854,param_1 + DAT_08cc9852,6);
                    /* WARNING: Could not recover jumptable at 0x08cc9714. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc9718 + (int)DAT_08cc9718))();
                return uVar11;
              }
              if (iVar12 == 4) {
                (*(code *)PTR_FUN_08cc9864)(param_1 + DAT_08cc9850,param_1 + DAT_08cc9852,6);
                    /* WARNING: Could not recover jumptable at 0x08cc96fa. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc96fe + (int)DAT_08cc96fe))();
                return uVar11;
              }
                    /* WARNING: Could not recover jumptable at 0x08cc969e. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc96a2 + (int)DAT_08cc96a2))();
              return uVar11;
            }
            if (iVar12 != 0x10) {
              if (iVar12 == 0x15) {
                (*(code *)PTR_FUN_08cc9864)(param_1 + DAT_08cc9858,param_1 + DAT_08cc9852,6);
                    /* WARNING: Could not recover jumptable at 0x08cc9746. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc974a + (int)DAT_08cc974a))();
                return uVar11;
              }
                    /* WARNING: Could not recover jumptable at 0x08cc96ae. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc96b2 + (int)DAT_08cc96b2))();
              return uVar11;
            }
            (*(code *)PTR_FUN_08cc9864)(param_1 + DAT_08cc985a,param_1 + DAT_08cc9852,6);
          }
                    /* WARNING: Could not recover jumptable at 0x08cc9760. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc9764 + (int)DAT_08cc9764))();
          return uVar11;
        }
        if (iVar13 != 0x22) {
                    /* WARNING: Could not recover jumptable at 0x08cc94f4. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc94f8 + (int)DAT_08cc94f8))();
          return uVar11;
        }
        if (iVar12 == 4) {
          iVar16 = (int)DAT_08cc96d6;
          iVar12 = (int)DAT_08cc96b6;
          *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
          *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
          goto LAB_08cc963c;
        }
      }
                    /* WARNING: Could not recover jumptable at 0x08cc9622. Too many branches */
                    /* WARNING: Treating indirect jump as call */
      uVar11 = (*(code *)((int)&DAT_08cc9626 + (int)DAT_08cc9626))();
      return uVar11;
    }
    if (iVar16 != 2) {
      if (iVar16 < 3) {
        if ((iVar16 == 0) || (iVar16 != 1)) {
                    /* WARNING: Could not recover jumptable at 0x08cc88ee. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc88f2 + (int)DAT_08cc88f2))();
          return uVar11;
        }
        if (iVar13 == 0x54) {
          if (iVar12 != 3) {
LAB_08cc8c4e:
                    /* WARNING: Could not recover jumptable at 0x08cc8c50. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8c54 + (int)DAT_08cc8c54))();
            return uVar11;
          }
          (*(code *)PTR_FUN_08cc8d68)(param_1 + DAT_08cc8d52,param_1 + DAT_08cc8d4e,6);
LAB_08cc8c6c:
                    /* WARNING: Could not recover jumptable at 0x08cc8c6e. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8c72 + (int)DAT_08cc8c72))();
          return uVar11;
        }
        if (iVar13 < 0x55) {
          if (iVar13 == 0x36) {
            if ((iVar12 != 3) || (*(int *)(param_1 + 0xb8) != 0x10)) {
LAB_08cc8bdc:
                    /* WARNING: Could not recover jumptable at 0x08cc8bde. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8be2 + (int)DAT_08cc8be2))();
              return uVar11;
            }
            (*(code *)PTR_FUN_08cc8d68)(param_1 + DAT_08cc8d4c,param_1 + DAT_08cc8d4e,6);
          }
          else {
            if (iVar13 < 0x37) {
              if ((iVar13 < 0x27) || (iVar13 < 0x29)) goto LAB_08cc8a4c;
              if (iVar13 != 0x2e) {
                    /* WARNING: Could not recover jumptable at 0x08cc8a86. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc8a8a + (int)DAT_08cc8a8a))();
                return uVar11;
              }
              if (iVar12 == 2) {
                *(undefined4 *)(DAT_08cc8c08 + param_1) = *(undefined4 *)(param_1 + 0xa0);
                goto LAB_08cc8ba8;
              }
              goto LAB_08cc8b92;
            }
            if (iVar13 == 0x4a) {
              if (iVar12 != 3) {
LAB_08cc8bbe:
                    /* WARNING: Could not recover jumptable at 0x08cc8bc0. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                uVar11 = (*(code *)((int)&DAT_08cc8bc4 + (int)DAT_08cc8bc4))();
                return uVar11;
              }
              (*(code *)PTR_FUN_08cc8c14)(param_1 + DAT_08cc8bf0,param_1 + DAT_08cc8c0c,6);
              goto LAB_08cc8bdc;
            }
            if (0x4a < iVar13) {
              if (iVar13 != 0x52) goto LAB_08cc8ab4;
              iVar12 = DAT_08cc8bee + param_1;
              *(undefined4 *)(iVar12 + 0x18) = 0;
              *(undefined4 *)(iVar12 + 0x1c) = 0;
              *(undefined4 *)(iVar12 + 0x20) = 0;
              (*(code *)puVar3)(param_1 + DAT_08cc8bf0);
              (*(code *)puVar3)(param_1 + DAT_08cc8bf2);
              iVar12 = (int)DAT_08cc8bf6;
              *(undefined2 *)(DAT_08cc8bf4 + param_1) = 0;
              (*(code *)puVar3)(param_1 + iVar12);
              (*(code *)puVar3)(param_1 + DAT_08cc8bf8);
              (*(code *)puVar3)(param_1 + DAT_08cc8bfa);
              (*(code *)puVar3)(param_1 + DAT_08cc8bfc);
              *(undefined4 *)(DAT_08cc8bfe + param_1) = 0;
              iVar12 = (int)DAT_08cc8c00;
              *(undefined1 *)(iVar12 + param_1) = 0x25;
              *(undefined1 *)(iVar12 + -4 + param_1) = 0;
              *(undefined1 *)(DAT_08cc8c02 + param_1) = 0;
              *(undefined4 *)(DAT_08cc8c04 + param_1) = 0;
              goto LAB_08cc8b7a;
            }
            if (iVar13 != 0x40) {
                    /* WARNING: Could not recover jumptable at 0x08cc8aa6. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8aaa + (int)DAT_08cc8aaa))();
              return uVar11;
            }
            if (iVar12 == 2) {
              *(short *)(DAT_08cc8d50 + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
              goto LAB_08cc8c4e;
            }
          }
                    /* WARNING: Could not recover jumptable at 0x08cc8c3a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8c3e + (int)DAT_08cc8c3e))();
          return uVar11;
        }
        if (iVar13 == DAT_08cc8be4) {
          if (iVar12 != 2) {
LAB_08cc8b7a:
                    /* WARNING: Could not recover jumptable at 0x08cc8b7c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8b80 + (int)DAT_08cc8b80))();
            return uVar11;
          }
          *(undefined4 *)(DAT_08cc8c06 + param_1) = *(undefined4 *)(param_1 + 0xa0);
LAB_08cc8b92:
                    /* WARNING: Could not recover jumptable at 0x08cc8b94. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8b98 + (int)DAT_08cc8b98))();
          return uVar11;
        }
        if (iVar13 <= DAT_08cc8be4) {
          iVar16 = (int)DAT_08cc8be6;
          if (iVar13 != iVar16) {
            if (iVar16 < iVar13) {
LAB_08cc8ab4:
                    /* WARNING: Could not recover jumptable at 0x08cc8ab6. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8aba + (int)DAT_08cc8aba))();
              return uVar11;
            }
            if (iVar13 != iVar16 + -1) {
                    /* WARNING: Could not recover jumptable at 0x08cc8ae0. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8ae4 + (int)DAT_08cc8ae4))();
              return uVar11;
            }
            if (iVar12 == 2) {
              *(undefined4 *)(DAT_08cc8c0a + param_1) = *(undefined4 *)(param_1 + 0xa0);
              goto LAB_08cc8bbe;
            }
LAB_08cc8ba8:
                    /* WARNING: Could not recover jumptable at 0x08cc8baa. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8bae + (int)DAT_08cc8bae))();
            return uVar11;
          }
          if (iVar12 == 2) {
            *(char *)(DAT_08cc8d54 + param_1) = (char)*(undefined4 *)(param_1 + 0xa0);
LAB_08cc8c82:
                    /* WARNING: Could not recover jumptable at 0x08cc8c84. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8c88 + (int)DAT_08cc8c88))();
            return uVar11;
          }
          goto LAB_08cc8c6c;
        }
        iVar16 = (int)DAT_08cc8be8;
        if (iVar13 != iVar16) {
          if (iVar16 < iVar13) {
            if (iVar13 == DAT_08cc8bea) {
              if ((iVar12 - 5U < 2) &&
                 (iVar16 = (int)*(short *)(DAT_08cc8d5c + param_1), -1 < iVar16)) {
                if (DAT_08cc8d5e < iVar16) {
                  iVar16 = (int)DAT_08cc8d5e;
                }
                iVar13 = (int)DAT_08cc8d60;
                (*(code *)PTR_FUN_08cc8d6c)(param_1 + iVar13,*(undefined4 *)(param_1 + 0xb0),iVar16)
                ;
                *(undefined1 *)(iVar16 + param_1 + iVar13) = 0;
                iVar16 = (int)DAT_08cc8d16;
                    /* WARNING: Could not recover jumptable at 0x08cc8d12. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                *(uint *)(DAT_08cc8d62 + param_1) = (uint)(iVar12 == 6);
                uVar11 = (*(code *)((int)&DAT_08cc8d16 + iVar16))();
                return uVar11;
              }
              goto LAB_08cc8cce;
            }
            if (iVar13 != DAT_08cc8bec) {
                    /* WARNING: Could not recover jumptable at 0x08cc8b1c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8b20 + (int)DAT_08cc8b20))();
              return uVar11;
            }
            if (iVar12 != 3) goto LAB_08cc8c82;
            (*(code *)PTR_FUN_08cc8d68)(param_1 + DAT_08cc8d56,param_1 + DAT_08cc8d4e,6);
          }
          else {
            if (iVar13 != iVar16 + -1) {
                    /* WARNING: Could not recover jumptable at 0x08cc8b00. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8b04 + (int)DAT_08cc8b04))();
              return uVar11;
            }
            if (iVar12 == 3) {
              (*(code *)PTR_FUN_08cc8d68)(param_1 + DAT_08cc8d58,param_1 + DAT_08cc8d4e,6);
                    /* WARNING: Could not recover jumptable at 0x08cc8cc0. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8cc4 + (int)DAT_08cc8cc4))();
              return uVar11;
            }
          }
                    /* WARNING: Could not recover jumptable at 0x08cc8ca2. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8ca6 + (int)DAT_08cc8ca6))();
          return uVar11;
        }
        *(undefined4 *)(DAT_08cc8d5a + param_1) = *(undefined4 *)(param_1 + 0xa0);
LAB_08cc8cce:
                    /* WARNING: Could not recover jumptable at 0x08cc8cd0. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc8cd4 + (int)DAT_08cc8cd4))();
        return uVar11;
      }
      if (iVar16 == 3) {
                    /* WARNING: Could not recover jumptable at 0x08cc88fe. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc8902 + (int)DAT_08cc8902))();
        return uVar11;
      }
      if (iVar16 != 4) {
                    /* WARNING: Could not recover jumptable at 0x08cc890c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc8910 + (int)DAT_08cc8910))();
        return uVar11;
      }
      if (iVar13 == 0x3d) {
        if (iVar12 == 4) {
          iVar16 = (int)DAT_08cc9020;
          iVar12 = (int)DAT_08cc9026;
          *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
          iVar13 = (int)DAT_08cc8f6e;
                    /* WARNING: Could not recover jumptable at 0x08cc8f6a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
          uVar11 = (*(code *)((int)&DAT_08cc8f6e + iVar13))();
          return uVar11;
        }
LAB_08cc8f4e:
                    /* WARNING: Could not recover jumptable at 0x08cc8f50. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc8f54 + (int)DAT_08cc8f54))();
        return uVar11;
      }
      if (0x3d < iVar13) {
        if (iVar13 == 0x52) {
          (*(code *)PTR_FUN_08cc8e90)(param_1 + DAT_08cc8e82);
          (*(code *)puVar4)(param_1 + DAT_08cc8e84);
          (*(code *)puVar4)(param_1 + DAT_08cc8e86);
          (*(code *)puVar4)(param_1 + DAT_08cc8e88);
          (*(code *)puVar4)(param_1 + DAT_08cc8e8a);
          (*(code *)PTR_FUN_08cc8e94)(param_1 + DAT_08cc8e8c);
        }
        else {
          if (iVar13 < 0x53) {
            if (iVar13 != 0x3e) {
                    /* WARNING: Could not recover jumptable at 0x08cc8dee. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc8df2 + (int)DAT_08cc8df2))();
              return uVar11;
            }
            if (iVar12 != 4) goto LAB_08cc8f32;
            iVar16 = (int)DAT_08cc9020;
            iVar12 = (int)DAT_08cc9024;
            *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
            *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
            goto LAB_08cc8f4e;
          }
          if (iVar13 != 0x66) {
                    /* WARNING: Could not recover jumptable at 0x08cc8dfa. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc8dfe + (int)DAT_08cc8dfe))();
            return uVar11;
          }
          if (iVar12 == 3) {
            (*(code *)PTR_FUN_08cc8e98)(param_1 + DAT_08cc8e82,param_1 + DAT_08cc8e8e,6);
            goto switchD_08cc8e74_default;
          }
        }
                    /* WARNING: Could not recover jumptable at 0x08cc8e38. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc8e3c + (int)DAT_08cc8e3c))();
        return uVar11;
      }
      if (iVar13 == 0x22) {
        if (iVar12 == 4) {
          iVar16 = (int)DAT_08cc9020;
          iVar12 = (int)DAT_08cc9022;
          *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x1c);
          *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar16 + param_1 + 0x20);
LAB_08cc8f32:
                    /* WARNING: Could not recover jumptable at 0x08cc8f34. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8f38 + (int)DAT_08cc8f38))();
          return uVar11;
        }
LAB_08cc8f16:
                    /* WARNING: Could not recover jumptable at 0x08cc8f18. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc8f1c + (int)DAT_08cc8f1c))();
        return uVar11;
      }
      if (iVar13 != 0x36) {
                    /* WARNING: Could not recover jumptable at 0x08cc8dd0. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc8dd4 + (int)DAT_08cc8dd4))();
        return uVar11;
      }
      if (iVar12 == 3) {
        switch(*(undefined4 *)(param_1 + 0xb8)) {
        case 4:
          (*(code *)PTR_FUN_08cc9030)(param_1 + DAT_08cc9016,param_1 + DAT_08cc9018,6);
                    /* WARNING: Could not recover jumptable at 0x08cc8eca. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8ece + (int)DAT_08cc8ece))();
          return uVar11;
        case 5:
        case 8:
        case 9:
        case 10:
        case 0xb:
        case 0xc:
        case 0xd:
        case 0xe:
        case 0xf:
          goto switchD_08cc8e74_caseD_5;
        case 6:
          (*(code *)PTR_FUN_08cc9030)(param_1 + DAT_08cc901c,param_1 + DAT_08cc9018,6);
                    /* WARNING: Could not recover jumptable at 0x08cc8efe. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8f02 + (int)DAT_08cc8f02))();
          return uVar11;
        case 7:
          (*(code *)PTR_FUN_08cc9030)(param_1 + DAT_08cc901a,param_1 + DAT_08cc9018,6);
                    /* WARNING: Could not recover jumptable at 0x08cc8ee4. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc8ee8 + (int)DAT_08cc8ee8))();
          return uVar11;
        case 0x10:
          (*(code *)PTR_FUN_08cc9030)(param_1 + DAT_08cc901e,param_1 + DAT_08cc9018,6);
          goto LAB_08cc8f16;
        }
      }
switchD_08cc8e74_default:
                    /* WARNING: Could not recover jumptable at 0x08cc8e56. Too many branches */
                    /* WARNING: Treating indirect jump as call */
      uVar11 = (*(code *)((int)&DAT_08cc8e5a + (int)DAT_08cc8e5a))();
      return uVar11;
    }
    if (iVar13 == 0x3a) {
      iVar12 = (int)DAT_08cc9988;
                    /* WARNING: Could not recover jumptable at 0x08cc9984. Too many branches */
                    /* WARNING: Treating indirect jump as call */
      *(short *)(DAT_08cc9a10 + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
      uVar11 = (*(code *)((int)&DAT_08cc9988 + iVar12))();
      return uVar11;
    }
    if (iVar13 < 0x3b) {
      if (iVar13 == 0x2b) {
        if (iVar12 == 3) {
          iVar12 = *(int *)(param_1 + 0xb8);
          if (iVar12 == 7) {
            (*(code *)PTR_FUN_08cc9b84)(param_1 + DAT_08cc9b7a,param_1 + DAT_08cc9b70,6);
                    /* WARNING: Could not recover jumptable at 0x08cc9aea. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc9aee + (int)DAT_08cc9aee))();
            return uVar11;
          }
          if (iVar12 < 8) {
            if (iVar12 == 4) {
              (*(code *)PTR_FUN_08cc9b84)(param_1 + DAT_08cc9b78,param_1 + DAT_08cc9b70,6);
                    /* WARNING: Could not recover jumptable at 0x08cc9ad0. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc9ad4 + (int)DAT_08cc9ad4))();
              return uVar11;
            }
                    /* WARNING: Could not recover jumptable at 0x08cc9aac. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc9ab0 + (int)DAT_08cc9ab0))();
            return uVar11;
          }
          if (iVar12 != 0x15) {
                    /* WARNING: Could not recover jumptable at 0x08cc9ab8. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc9abc + (int)DAT_08cc9abc))();
            return uVar11;
          }
          (*(code *)PTR_FUN_08cc9b84)(param_1 + DAT_08cc9b7c,param_1 + DAT_08cc9b70,6);
LAB_08cc9b00:
                    /* WARNING: Could not recover jumptable at 0x08cc9b02. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc9b06 + (int)DAT_08cc9b06))();
          return uVar11;
        }
      }
      else {
        if (iVar13 < 0x2c) {
          if (iVar13 == 0x22) {
            if (iVar12 == 4) {
              iVar13 = (int)DAT_08cc9cde;
              iVar12 = (int)DAT_08cc9ce0;
              *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar13 + param_1 + 0x1c);
              *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar13 + param_1 + 0x20);
            }
          }
          else {
            if (iVar13 != 0x2a) {
                    /* WARNING: Could not recover jumptable at 0x08cc9830. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              uVar11 = (*(code *)((int)&DAT_08cc9834 + (int)DAT_08cc9834))();
              return uVar11;
            }
            if (iVar12 != 3) goto LAB_08cc9b00;
            iVar12 = *(int *)(param_1 + 0xb8);
            if (iVar12 == 7) {
              (*(code *)PTR_FUN_08cc9b84)(param_1 + DAT_08cc9b80,param_1 + DAT_08cc9b70,6);
            }
            else if (iVar12 < 8) {
              if (iVar12 == 4) {
                (*(code *)PTR_FUN_08cc9b84)(param_1 + DAT_08cc9b7e,param_1 + DAT_08cc9b70,6);
              }
            }
            else if (iVar12 == 0x15) {
              (*(code *)PTR_FUN_08cc9b84)(param_1 + DAT_08cc9b82,param_1 + DAT_08cc9b70,6);
            }
          }
          goto switchD_08cc8e74_caseD_5;
        }
        if (iVar13 != 0x36) {
          if (iVar13 != 0x37) {
                    /* WARNING: Could not recover jumptable at 0x08cc984a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc984e + (int)DAT_08cc984e))();
            return uVar11;
          }
          if ((iVar12 == 5) && (*(short *)(DAT_08cc9a0c + param_1) == 3)) {
            (*(code *)PTR_FUN_08cc9a20)(param_1 + DAT_08cc99f4,*(undefined4 *)(param_1 + 0xb0),3);
            iVar12 = (int)DAT_08cc997a;
                    /* WARNING: Could not recover jumptable at 0x08cc9976. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            *(undefined1 *)(DAT_08cc9a0e + param_1) = 0;
            uVar11 = (*(code *)((int)&DAT_08cc997a + iVar12))();
            return uVar11;
          }
          goto LAB_08cc994a;
        }
        if (iVar12 != 3) goto LAB_08cc9992;
        iVar12 = *(int *)(param_1 + 0xb8);
        if (iVar12 == 7) {
          (*(code *)PTR_FUN_08cc9b84)(param_1 + DAT_08cc9b74,param_1 + DAT_08cc9b70,6);
                    /* WARNING: Could not recover jumptable at 0x08cc9a6e. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc9a72 + (int)DAT_08cc9a72))();
          return uVar11;
        }
        if (iVar12 < 8) {
          if (iVar12 == 3) {
            (*(code *)PTR_FUN_08cc9b84)(param_1 + DAT_08cc9b6e,param_1 + DAT_08cc9b70,6);
                    /* WARNING: Could not recover jumptable at 0x08cc9a3c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc9a40 + (int)DAT_08cc9a40))();
            return uVar11;
          }
          if (iVar12 == 4) {
            (*(code *)PTR_FUN_08cc9a24)(param_1 + DAT_08cc99f6,param_1 + DAT_08cc9a14,6);
                    /* WARNING: Could not recover jumptable at 0x08cc99e4. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc99e8 + (int)DAT_08cc99e8))();
            return uVar11;
          }
                    /* WARNING: Could not recover jumptable at 0x08cc99bc. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc99c0 + (int)DAT_08cc99c0))();
          return uVar11;
        }
        if (iVar12 != 0x10) {
          if (iVar12 == 0x15) {
            (*(code *)PTR_FUN_08cc9b84)(param_1 + DAT_08cc9b72,param_1 + DAT_08cc9b70,6);
                    /* WARNING: Could not recover jumptable at 0x08cc9a54. Too many branches */
                    /* WARNING: Treating indirect jump as call */
            uVar11 = (*(code *)((int)&DAT_08cc9a58 + (int)DAT_08cc9a58))();
            return uVar11;
          }
                    /* WARNING: Could not recover jumptable at 0x08cc99cc. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc99d0 + (int)DAT_08cc99d0))();
          return uVar11;
        }
        (*(code *)PTR_FUN_08cc9b84)(param_1 + DAT_08cc9b76,param_1 + DAT_08cc9b70,6);
      }
                    /* WARNING: Could not recover jumptable at 0x08cc9a88. Too many branches */
                    /* WARNING: Treating indirect jump as call */
      uVar11 = (*(code *)((int)&DAT_08cc9a8c + (int)DAT_08cc9a8c))();
      return uVar11;
    }
    if (iVar13 == 0x52) {
      iVar12 = (int)DAT_08cc99ee;
      *(undefined2 *)(iVar12 + param_1) = 0;
      iVar16 = (int)DAT_08cc99f0;
      *(undefined2 *)(iVar12 + 2 + param_1) = 0;
      *(undefined2 *)(iVar12 + 4 + param_1) = 0;
      (*(code *)puVar9)(param_1 + iVar16);
      puVar2 = PTR_FUN_08cc9a1c;
      iVar12 = (int)DAT_08cc99f2;
      *(undefined1 *)(DAT_08cc99f4 + param_1) = 0;
      (*(code *)puVar2)(param_1 + iVar12);
      (*(code *)puVar9)(param_1 + DAT_08cc99f6);
      (*(code *)puVar9)(param_1 + DAT_08cc99f8);
      (*(code *)puVar9)(param_1 + DAT_08cc99fa);
      (*(code *)puVar9)(param_1 + DAT_08cc99fc);
      (*(code *)puVar9)(param_1 + DAT_08cc99fe);
      (*(code *)puVar9)(param_1 + DAT_08cc9a00);
      (*(code *)puVar9)(param_1 + DAT_08cc9a02);
      (*(code *)puVar9)(param_1 + DAT_08cc9a04);
      (*(code *)puVar9)(param_1 + DAT_08cc9a06);
      (*(code *)puVar9)(param_1 + DAT_08cc9a08);
      (*(code *)puVar9)(param_1 + DAT_08cc9a0a);
                    /* WARNING: Could not recover jumptable at 0x08cc993a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
      uVar11 = (*(code *)((int)&DAT_08cc993e + (int)DAT_08cc993e))();
      return uVar11;
    }
    if (iVar13 < 0x53) {
      if (iVar13 == 0x3d) {
        if (iVar12 == 4) {
          iVar13 = (int)DAT_08cc9cde;
          iVar12 = (int)DAT_08cc9ce4;
          *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar13 + param_1 + 0x1c);
          *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar13 + param_1 + 0x20);
        }
      }
      else {
        if (iVar13 != 0x3e) {
                    /* WARNING: Could not recover jumptable at 0x08cc9886. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc988a + (int)DAT_08cc988a))();
          return uVar11;
        }
        if (iVar12 == 4) {
          iVar13 = (int)DAT_08cc9cde;
          iVar12 = (int)DAT_08cc9ce2;
          *(undefined4 *)(iVar12 + param_1) = *(undefined4 *)(iVar13 + param_1 + 0x1c);
          *(undefined4 *)(iVar12 + 4 + param_1) = *(undefined4 *)(iVar13 + param_1 + 0x20);
        }
      }
    }
    else {
      if (iVar13 == DAT_08cc99ea) {
        *(short *)(DAT_08cc99ee + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
LAB_08cc994a:
                    /* WARNING: Could not recover jumptable at 0x08cc994c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc9950 + (int)DAT_08cc9950))();
        return uVar11;
      }
      if (DAT_08cc99ea < iVar13) {
        if (iVar13 != DAT_08cc99ec) {
                    /* WARNING: Could not recover jumptable at 0x08cc98b4. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          uVar11 = (*(code *)((int)&DAT_08cc98b8 + (int)DAT_08cc98b8))();
          return uVar11;
        }
        *(short *)(DAT_08cc9a12 + param_1) = (short)*(undefined4 *)(param_1 + 0xa0);
LAB_08cc9992:
                    /* WARNING: Could not recover jumptable at 0x08cc9994. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc9998 + (int)DAT_08cc9998))();
        return uVar11;
      }
      if (iVar13 != 0x68) {
                    /* WARNING: Could not recover jumptable at 0x08cc98a2. Too many branches */
                    /* WARNING: Treating indirect jump as call */
        uVar11 = (*(code *)((int)&DAT_08cc98a6 + (int)DAT_08cc98a6))();
        return uVar11;
      }
      (*(code *)PTR_FUN_08cc9d00)(param_1 + DAT_08cc9cda,param_1 + DAT_08cc9cdc,6);
    }
switchD_08cc8e74_caseD_5:
    iVar12 = (*(code *)puVar2)(param_1);
    if ((-5 < iVar12) && ((0 < *(short *)(DAT_08ccac50 + param_1) || (-2 < iVar12)))) {
                    /* WARNING: Could not recover jumptable at 0x08ccab1a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
      uVar11 = (*(code *)((int)&DAT_08ccab1e + (int)DAT_08ccab1e))();
      return uVar11;
    }
    if ((iVar12 == -2) && (*(short *)(DAT_08ccac50 + param_1) == 0)) {
      iVar12 = (int)DAT_08ccac52;
      *(undefined2 *)(iVar12 + param_1) = *(undefined2 *)(param_1 + 0x28);
      *(undefined2 *)(iVar12 + 2 + param_1) = 0xffff;
      puVar2 = PTR_FUN_08ccac70;
      iVar13 = (int)DAT_08ccac54;
      *(undefined4 *)(iVar12 + 8 + param_1) = 0;
      (*(code *)puVar2)(param_1,param_1 + iVar13);
    }
    else {
      iVar12 = (int)DAT_08ccac52;
      *(undefined2 *)(iVar12 + param_1) = 0xffff;
      *(undefined2 *)(iVar12 + 2 + param_1) = 0xffff;
      *(undefined4 *)(iVar12 + 8 + param_1) = 1;
    }
    if (iVar16 == 6) {
      if (-1 < *(short *)(DAT_08ccac52 + param_1)) {
        *(short *)(DAT_08ccac6a + param_1) = *(short *)(DAT_08ccac52 + param_1);
      }
    }
    else if (iVar16 == 7) {
      iVar13 = (int)DAT_08ccac56;
      iVar12 = (*(code *)PTR_FUN_08ccac74)(iVar13 + param_1);
      if ((iVar12 != 0) && (iVar12 = (*(code *)PTR_FUN_08ccac78)(iVar13 + param_1), iVar12 == 0)) {
        cVar1 = *(char *)(DAT_08ccac58 + param_1);
        if (cVar1 == '\x01') {
          iVar13 = (int)DAT_08ccac5a;
          iVar12 = (int)DAT_08ccac62;
          iVar15 = *(int *)(iVar13 + param_1 + 0x38);
          piVar14 = (int *)(DAT_08ccac5e + param_1);
          *piVar14 = iVar15 + iVar12;
          iVar13 = *(int *)(iVar13 + param_1 + 0x3c);
          piVar14[1] = iVar12 + iVar13;
          iVar12 = (int)DAT_08ccac64;
          piVar14[2] = iVar15 + iVar12;
          piVar14[3] = iVar13 + iVar12;
        }
        else if (cVar1 < '\x02') {
          if (cVar1 == '\0') {
            iVar13 = (int)DAT_08ccac5a;
            iVar12 = (int)DAT_08ccac5c;
            iVar15 = *(int *)(iVar13 + param_1 + 0x38);
            piVar14 = (int *)(DAT_08ccac5e + param_1);
            *piVar14 = iVar15 + iVar12;
            iVar13 = *(int *)(iVar13 + param_1 + 0x3c);
            piVar14[1] = iVar12 + iVar13;
            iVar12 = (int)DAT_08ccac60;
            piVar14[2] = iVar15 + iVar12;
            piVar14[3] = iVar13 + iVar12;
          }
        }
        else if (cVar1 == '\x02') {
          iVar13 = (int)DAT_08ccac5a;
          iVar12 = (int)DAT_08ccac66;
          iVar15 = *(int *)(iVar13 + param_1 + 0x38);
          piVar14 = (int *)(DAT_08ccac5e + param_1);
          *piVar14 = iVar15 + iVar12;
          iVar13 = *(int *)(iVar13 + param_1 + 0x3c);
          piVar14[1] = iVar12 + iVar13;
          iVar12 = (int)DAT_08ccac68;
          piVar14[2] = iVar15 + iVar12;
          piVar14[3] = iVar13 + iVar12;
        }
      }
    }
    iVar12 = (int)DAT_08ccac6e;
    *(int *)(iVar12 + param_1 + 0x30) = iVar16;
    return *(undefined4 *)(iVar12 + param_1 + 0x24);
  }
  if (iVar13 != 0x21) {
    if (iVar13 < 0x22) {
      if (iVar13 == 0x20) {
        if ((iVar12 == 7 || iVar12 == 5) || (iVar12 == 6)) {
          *(int *)(DAT_08cc8e7c + param_1) = (int)*(short *)(DAT_08cc8e7a + param_1);
          iVar12 = (int)DAT_08cc8db0;
                    /* WARNING: Could not recover jumptable at 0x08cc8dac. Too many branches */
                    /* WARNING: Treating indirect jump as call */
          *(short *)(DAT_08cc8e80 + param_1) =
               (short)*(undefined4 *)(param_1 + 0xb0) -
               (short)*(undefined4 *)(DAT_08cc8e7e + param_1);
          uVar11 = (*(code *)((int)&DAT_08cc8db0 + iVar12))();
          return uVar11;
        }
        goto LAB_08cc8d7a;
      }
    }
    else if (iVar13 == 0x52) {
      iVar12 = (int)DAT_08cc8d64;
      *(undefined4 *)(iVar12 + param_1) = 0;
      *(undefined4 *)(iVar12 + -0x34 + param_1) = 0;
      iVar12 = (int)DAT_08cc8d4a;
                    /* WARNING: Could not recover jumptable at 0x08cc8d46. Too many branches */
                    /* WARNING: Treating indirect jump as call */
      *(undefined2 *)(DAT_08cc8d66 + param_1) = 0xffff;
      uVar11 = (*(code *)((int)&DAT_08cc8d4a + iVar12))();
      return uVar11;
    }
                    /* WARNING: Could not recover jumptable at 0x08cc8d2a. Too many branches */
                    /* WARNING: Treating indirect jump as call */
    uVar11 = (*(code *)((int)&DAT_08cc8d2e + (int)DAT_08cc8d2e))();
    return uVar11;
  }
  *(undefined4 *)(DAT_08cc8e78 + param_1) = *(undefined4 *)(param_1 + 0xa0);
LAB_08cc8d7a:
                    /* WARNING: Could not recover jumptable at 0x08cc8d7c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
  uVar11 = (*(code *)((int)&DAT_08cc8d80 + (int)DAT_08cc8d80))();
  return uVar11;
}


