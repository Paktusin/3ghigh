# Адреса прошивки MMI3GApplication по темам

Бинарь `out/ndr/MMI3GApplication` (MD5 `dbbfc29f…`), SH4A little-endian.
Подробные разборы — в `docs/firmware.md` и `docs/formats/*.md`; здесь только
указатель, чтобы не искать заново.

## Память и загрузка

| адрес | что |
|---|---|
| `FUN_08eb6678`, `FUN_08ec034c` | `load_layer`: область блоков тайла XAC грузится одним куском |
| `FUN_08c9586c` | запрос области GDB, лимит 999 контейнеров |
| `FUN_08238080` | автомат инициализации NDL |

## XAC

| адрес | что |
|---|---|
| `FUN_08272350` | обход списка узла v3 |
| `FUN_082707e8` | запреты поворотов через узел |
| `FUN_08279074` | сжатие `ZF-NAMEN` |
| `FUN_0826f300` | `u_get_vecttree_of_vid_or_vinfo`, нульвекторы |
| `FUN_08281d90` | имя страны по языку (`COUNTRY` / `BASIC NAME` / `STRING` в `.xah`) |
| `FUN_0827e02c` | тайл → страна по `FE GRUPPEN` |
| `0x08f498fc`, `0x08f4a374` | `u_get_next_hnr`, `u_get_next_hnr_vector` (дома) |
| `FUN_08ef3b48` | точка дома из XAC |

## Маршрут

| адрес | что |
|---|---|
| `0x082b8834` | строка `KOORDINATE_IM_OFFROAD ohne twids -> waytoxy!` (фаза OFFROAD) |
| `FUN_08ed4bfc` | `calc_nid_to_twid_zb`: twid цели |
| `FUN_08ed420c` | `sort_add_vectors_at_coord`: поиск векторов у координаты |
| `FUN_0827134c`, `FUN_08270da0` | обход блока v5 **только по цепочке заголовков под-блоков** (без них цель без twid → OFFROAD); эмулятор — `rt/emu.js` из разбора 23.10, раздел «Маршрут уходит в OFFROAD» в `docs/formats/xac.md` |
| `FUN_08ed44a4` | тип цели: 5 «AN_STRASSE» (дорога ближе 60 м), 6 «IM_OFFROAD» |
| `FUN_08eac8fc` | `acdbm_get_fe_list_at_koordinate`: тайлы у точки |
| `FUN_08eb3e6c` | `acdbm_load_binary_scout`: подготовка поиска маршрута |
| `FUN_08cc148c` | `CGdbConvRoute::convertVectors`: линия маршрута через таблицы ссылок GDB |

## LIT

| адрес | что |
|---|---|
| `FUN_08cc7b3c` | селектор 0x33, запись приращениями (флаг ADD) |
| `FUN_08cd7490`, `FUN_08ccefac` | блок домов 0x1002 у улицы 0x07 |
| `FUN_08f2829c` | `CLwtSimpleSurroundingSearch`: поиск рядом |
| `FUN_08f115d0` | `getCountryFromCarPosition`: страна по умолчанию берётся из XAC по имени |
| `FUN_08f0ee68` | `CLwtLocDescTransform`: ищет имя страны в LIT |
| `FUN_08ccd098` | путь «`\t#` код язык» |
