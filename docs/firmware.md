# Прошивка: читатели форматов и инициализация

## Разгадка: зависание на 28% — это пропавший `acios_db.ini`

**Подтверждено на машине.** После частичной установки файл
`/HBpersistence/navi/db/acios_db.ini` отсутствует. Кладём его обратно —
навигация инициализируется и карта работает.

### Как выяснилось

Сборка `out/limassol` (только GDB/GD2, XAC и XAC3 — оригинальные, побайтно)
дала то же зависание на 28%. Это сняло подозрение с XAC: дело не в переносе
маршрутных данных. Проба на зависшей машине против эталона исправной:

| | Исправная | Зависшая |
|---|---|---|
| `/HBpersistence/navi/db/acios_db.ini` | есть, 923 байта, 17 записей | **отсутствует** |
| `/HBpersistence/navi/nobss/` | `AUDIMMI3G.swap`, 3.2 МБ | пусто |
| состав `/mnt/nav/db/pkgdb` | 20 каталогов | 20 каталогов, одинаково |
| `end: NDL Initialisation` | есть | нет |

Данные на разделе целы — уничтожен только описатель баз в персистентности и
кэш драйвера.

### Почему это даёт ровно такую картину

Смыкается с разбором `MMI3GApplication` до последнего звена:

```
частичная установка
 └ acios_db.ini не создан (nobss пуст)
    └ getDatabasesFromIniFile: can't open ini-file
       └ список баз пуст → каталог тома пуст
          └ FUN_08e983f4 вернёт 0 → createIterator вернёт -101
             └ «no iterator for nav cd 1» (в отключённый канал)
                └ NDL стоит в состоянии 1 и ждёт вечно
                   └ нет end: NDL Initialisation → полоса на 28%
```

Молчаливость объясняется тем же разбором: все сообщения этой ветки идут в
канал, который печатает только при ненулевом указателе, а он закрыт.

### Починка

`tools/write_fixacios.sh` кладёт на карту `tools/fixacios/run.sh` и побайтную
копию описателя, снятую с исправной машины (923 байта, проверяется при записи).
Скрипт на машине:

* не трогает файл, если тот уже есть, — только сохраняет копию;
* пишет только если **все** пути из описателя существуют;
* выставляет права 666, как на эталоне;
* `nobss` не трогает — кэш пересобирается сам.

Карту вставлять **без захода в меню обновления**, затем перезагрузить голову.

### Что это меняет

Частичная установка теперь работоспособна. Цикл проверки сокращается с
трёхчасовой полной установки до примерно получаса: правим GDB, ставим два
компонента, подкладываем описатель, перезагружаемся.

И задним числом: все прежние неудачи с переносом XAC объясняются этим же —
они все были частичными установками. Вывод прошлой фазы, будто `ndr` не может
согласовать индексы XAC и GDB, к делу отношения не имел.

## Карта читателей в прошивке — по всем форматам

Тот же приём, что вскрыл XAC: искать не по маскам, а по путям к исходникам.
Ниже полная карта модулей. Она ценна не сама по себе — по именам классов видно,
из каких сущностей состоит формат, и это **независимая проверка** того, что мы
вывели из данных.

### `common\isdb\` — общая библиотека баз (ISDB)

Версии из бинаря: `isdb_base 1.0.5c`, `isdb_heap 1.2.15`,
`isdb_access 1.12.0`, `isdb_gdb 1.10.4g`, `gdb_main 52.01` (10.05.2011).

```
isdb\base\    CBlockIterator
isdb\heap\    CHeapManagement, CHeapJobQueue, CHeapMemoryHeap — память и задания
isdb\gdb\     формат GDB          (см. ниже)
isdb\atlas\   формат ATLAS        (наши CTY и TER)
isdb\orion\   COrionDatabase      — обёртка над Orion
```

Сюда же относится сообщение `IsDb layer does not accept loaded data`,
встречавшееся при разборе инициализации NDL.

### GDB: имена классов совпали с нашей моделью

```
isdb\gdb\main\      CGdb, CGdbLevel, CGdbCluster, CGdbTile, CGdbBlob,
                    CGdbBlobDirectory, CGdbTileElementBag, CGdbTileElementIterator,
                    CGdbRefTable, CGdbRefTableDirectory, CGdbRefTableMainDirectory,
                    CGdbRefTableCache, CGdbRefCache, CGdbRefFinder, CGdbLineRef,
                    CGdbCoordinateRectSet, CGdbTileSetIterator
isdb\gdb\content\   CGdbTileContent, CGdbTileContentElement, CGdbTileBagContent,
                    CGdbContentNamingIterator, CGdbRawRouteContent
isdb\gdb\access\    CGdbTileAccessor, CGdbRouteTileAccessor
isdb\gdb\route\     CGdbRouteTile, CGdbRouteMatcher, CGdbRawRoute, CGdbConvRoute,
                    CGdbMrdWay, CGdbMrdRoot, CGdbMrdObject, CGdbMrdTrip,
                    CGdbRoutePosition, CGdbRouteKnotKiller
```

**Сопоставление с тем, что мы вывели из данных сами:**

| Наше название | Класс в прошивке |
|---|---|
| двенадцать уровней | `CGdbLevel` |
| сетка кластеров | `CGdbCluster` |
| 19-байтные записи тайлов | `CGdbTile` |
| блобы, дописываемые в `.gd2` | `CGdbBlob`, `CGdbBlobDirectory` |
| поток элементов | `CGdbTileElementBag`, `CGdbTileElementIterator` |
| реестр S1 | семейство `CGdbRefTable*`, `CGdbLineRef` |
| таблица имён S2 | `CGdbContentNamingIterator` |

Совпадение полное — наша модель GDB описывает те же сущности, что и код.

### ATLAS (компоненты CTY и TER)

```
isdb\atlas\main\    CAtlasSurfaceModule, CAtlasSurfaceLevel, CAtlasSurfaceTileObject,
                    CAtlasSoarTerrainModule
isdb\atlas\access\  CAtlasSurfaceAccessor, CAtlasSoarTerrainAccessor,
                    CAtlasSceneryAccessor, CAtlasImageAccessor
заголовки:          CAtlasBaseContainer.h, CAtlasSurfaceContainer.h,
                    CAtlasSoarTerrainContainer.h
```

Видно, что у ATLAS **две разные сущности**: `Surface` (поверхности — то, что
рисуется зелёным) и `SoarTerrain` (рельеф). Плюс отдельные читатели сцен и
изображений. Это объясняет, почему у нас два семейства компонентов: `CTY`
(города, поверхности) и `TER` (рельеф).

### XAC — разобран

```
NavCore\xaclib\private\   xac_vect, xac_vect_iter, xac_vtre, xac_fe, xac_glob,
                          xac_korr, xac_dbm, xac_name, xac_basic_name,
                          xac_search_name, xac_string, xac_country, xac_language,
                          xac_build_infos, xac_neighbour, xac_poi, xac_tmc
```

### Чего по-прежнему не видно

Читатели `LIT` и `PIT` отдельными модулями не нашлись. Учитывая, что диспетчер
NDL раскладывает `.LIT`/`.LI2`…`.LI9` вместе с `.GDB`/`.GD2`, вероятнее всего
они читаются тем же `isdb\gdb` — но подтверждения нет.

## Кто в прошивке читает какой файл

Собрано через GhidraMCP по путям к исходникам. Это опора для проверки
генерации: чтобы сверять наши файлы, надо знать, каким кодом они разбираются.

| Наш компонент | Формат | Модуль-читатель в прошивке |
|---|---|---|
| XAC, XAC2, XAC3, `.xah` | FLDB + VEKTORBLOCK | `NavCore\xaclib\private\` — 17 файлов |
| GDB, GD2 | контейнер `DEADBEEF`, тайлы | `devctrl\collect\hydra\server\src\gdb\private\` (управление) + декодер геометрии `FUN_092526f0` |
| CTY, TER (`.ATLAS`) | Orion | `common\isdb\orion\main\private\COrionDatabase.cpp` |
| TMC | | `NavCore\tmc\private\t_daten.cpp`, `xaclib\xac_tmc.cpp` |
| контейнеры, каталог | FLDB | `NavCore\cdm\private\` |
| открытие базы | | `NavCore\dbm\private\dbm_opendb.cpp` |
| загрузка в движок | | `NavCore\ndl\private\` — `XacInterface.cpp`, `Loader.cpp`, `CDMLoader.cpp` |
| маршрутизация | | `NavCore\scout\private\scout509\` — `_KOSTEN`, `_SCOUT`, `_TW`, `_SW`, `Vias` |

Модуль `isdb` объясняет и сообщение `IsDb layer does not accept loaded data`,
которое встречалось при разборе инициализации NDL: это слой Orion-баз.

Читатели `LIT` и `PIT` по строкам не нашлись — поиск по `.LIT`, `lit` и
`Orion` их не дал. Возможно, они разбираются тем же `isdb` или лежат в модуле
без характерных строк.

### `xaclib` покрывает все разделы `.xah`

Имена файлов ложатся на разделы один в один, что подтверждает разбор `.xah`:

```
xac_string.cpp      -> STRING          xac_country.cpp     -> COUNTRY
xac_basic_name.cpp  -> BASIC NAME      xac_language.cpp    -> LANGUAGE
xac_build_infos.cpp -> BUILD INFOS     xac_neighbour.cpp   -> NACHBARN
xac_poi.cpp         -> POI             xac_name.cpp        -> имена
xac_vect.cpp, xac_vect_iter.cpp, xac_vtre.cpp  -> векторные блоки
xac_fe.cpp (Fahrbahnelement), xac_glob.cpp, xac_korr.cpp, xac_dbm.cpp
```

### Кодирование точек в тайле GDB — из `FUN_092526f0`

Декодер геометрии найден по строке проверки `Illegal tile coordinate width!`.
Что из него читается:

**Ширина координаты тайла** — только `8, 12, 16, 24, 32` бита, иначе
срабатывает проверка. Это подтверждает прежнее наблюдение про бит-упаковку.

**Головной байт элемента** раскладывается так:

```
бит 7      признак полигона   (проверки «Polygon flag set» / «not set»)
биты 6..5  формат упаковки 0/1/2   (иначе «Illegal bitpack format»)
биты 4..0  разрядность дельты
```

Остальные проверки называют ограничения формата прямо:

* `illegal use of 2 point encoding` — формат 2 допустим только при ровно двух точках;
* `Point has illegal number of coordinates` — у точечного объекта координат ровно одна;
* `Point has z coordinates` и `Polygon has z coordinates` — поле `zCoordFormat` должно быть нулевым;
* `Default case in switch statement` — иных типов объектов нет.

Наш `encodePoints` реализует один из этих вариантов (тот, что round-trip
проходит побайтно на 809 тайлах). Теперь видно, какие ещё варианты существуют и
чего они требуют.

## Инициализация NDL: автомат разобран по бинарю

Разобрана `MMI3GApplication` (SH-4 LE, 27 МБ кода, Ghidra). Код инициализации
NDL автоанализатором пропущен — туда попадают только по указателям, поэтому
функции пришлось поднимать вручную: найти строку, найти слот литерального пула
с указателем на неё, от него — инструкцию `mov.l @(disp,PC)` и уже от неё
раскрутить пролог назад. Скрипты в `scratchpad/gs/Ndl*.java`.

### Автомат `FUN_08238080`

Бесконечный цикл `do { ... } while(true)` с опросом и нарастающей паузой
(счётчик растёт до 100 и передаётся в задержку; единица измерения из кода не
видна). Пять состояний:

| Состояние | Что делает | Куда уходит |
|---|---|---|
| 0 | ждёт, пока глобальный статус (`FUN_08eb2664`) станет 3, и пока `FUN_08236070` не захватит объект | → 1 |
| 1 | `FUN_08236b50`: >0 — готово, 0 — надо открывать БД, <0 — молча ждать | → 3 / → 2 |
| 2 | печатает `opening databases...`, зовёт открытие баз | → 3 |
| 3 | опрашивает готовность, ведёт таймаут | печатает `end:` |
| 4 | `starting loadtest` — похож на отладочный; встречается ли в работе, по журналу сказать нельзя (сообщение подавлено) | → 3 |

### Главное следствие для диагностики

`end: NDL Initialisation` печатается **только в состоянии 3** — и оттуда оно
печатается при любом исходе: либо по общему таймауту (вместе со строкой
`The NDL reached a timeout during start up`), либо когда прогресс затих дольше
100 тиков. Поэтому:

> **нет `end:` в журнале ⇒ автомат не дошёл до состояния 3.**

Это и есть точный смысл нашего сигнала «прошло / не прошло»: зависание сидит в
состояниях 0, 1 или 2. Какое из трёх — по журналу неразличимо, все переходы
между ними молчаливые.

### Почему в журнале ничего не видно

Логгеров два. `start:` и `end:` идут через `FUN_08e89ac0` — он виден в
`sloginfo`. А `opening databases`, `enter state %d, leave state %d` (пишет
`setState`, `FUN_08237fa8`) и `no iterator for nav cd 1` идут через
`FUN_08e832b0`, который печатает только если указатель на канал не NULL:

```c
if (param_9 != 0) { ... }        // канал не зарегистрирован — сообщения нет
```

На машине этот канал закрыт, поэтому различить состояния 0/1/2 по журналу
нельзя. Судя по самой проверке, включить его — значит сделать указатель канала
ненулевым в памяти процесса; способа сделать это извне не найдено.

Рядом есть рантайм-ручка `/hbsystem/multicore/navi/dbglvl`: её отдаёт
`multicored -D1`, файл размером 1 байт с правами `r--r--r--`. Его содержимое
наш `cat` вернул пустым (байт непечатаемый), так что значение неизвестно —
`1` только в аргументе демона. Влияет ли она на этот канал, не проверено.

### Шлюз, на котором всё стоит

Состояние 1 уходит в молчаливое ожидание ровно в одном месте:

```c
iVar1 = (*PTR_FUN_08236bbc)();     // FUN_08236ab4
if (iVar1 == 0) return 0xffffffff; // -1 → ждать и повторить
```

`FUN_08236ab4` — это «дай итератор по nav cd 1»; при отказе она пишет
(в закрытый канал) `no iterator for nav cd 1` и возвращает 0. Дальше:

* `FUN_08e8c364` — таблица навигационных дисков **ровно на две записи** (0 и 1),
  по 0x50 байт, заполняется один раз; для номера <2 указатель всегда есть;
* значит отказ даёт создание итератора — перечисление тома.

### Что именно перечисляется

`FUN_082368f0` обходит каталог по маске `*`, берёт имя (до 0x50 байт), ищет в нём
последнюю точку и раскладывает файлы по типам:

```
.GDB → тип 0
.LIT .LI2 .LI3 .LI4 .LI5 .LI6 .LI7 .LI8 .LI9 → список, индексы 0..8
.BLB .DON → пропускаются
.GD2 → отдельный тип
```

**XAC в этом перечислении нет** — расширения `.XAC` в таблице диспетчера просто
не существует. Рядом в бинаре есть отдельный набор сообщений `cdm_loader`
(`cdm_loader: error finding xac-header file!`,
`Failed to load %s, offset=%i, size=%i`), поэтому похоже, что XAC грузится
своим путём, но связь не прослежена. В журналах зависания ни одно из этих
сообщений не встречалось — правда, канал их вывода мы тоже не проверяли, так
что это ничего не доказывает.

### Цепочка отказа прослежена до конца

```
NDL, состояние 1
 └ FUN_08236ab4 — «дай итератор по nav cd 1»
    │  при отказе пишет (в закрытый канал) no iterator for nav cd 1 и вернёт 0
    └ FUN_08e8becc — менеджер дисков → запись таблицы → метод +8
       │  драйвер тома выбирается в FUN_08e8c2d4:
       │    multi db file driver  /  iso9660 driver  /  «No valid driver configuration!»
       └ FUN_08e98538 createIterator
          │  iterState[0]=запись диска, iterState[1]=*(том+4), iterState[2]=-1
          └ FUN_08e983f4 — три условия, все обязательны:
               1. *(байт)(том + 0x90348) != 0
               2. iterState[1] == *(том + 4)
               3. *(том + 8) != 0
             нарушено любое → 0 → createIterator вернёт -101 (0xffffff9b)
                             → итератора нет → NDL ждёт вечно
```

Сами условия прочитаны из кода дословно. **Что означают эти три поля — не
установлено**, имена им не присвоены: правдоподобно, что это признак готовности
тома, его идентификатор и число записей каталога, но подтверждения нет. Ясно
одно и без имён: любое из трёх даёт молчаливое вечное ожидание.

Структура тома большая — проверяемый байт лежит по смещению 0x90348, то есть
внутри неё кэшируется что-то объёмное.

Побочно: в `FUN_08e983f4` есть верхняя граница `iterState[2] < 0x20`, иначе
`invalid file handle, handle > nr1…`. Похоже на предел в 32 дескриптора, но
что именно считается — не проверено.

### Откуда берётся каталог тома: `acios_db.ini`

Список баз строит слой CDM из ini-файла. Имена функций дали строки в бинаре:

```
getDatabasesFromIniFile: can't open ini-file '%s', error number: %s
addDirectoryFiles2List: ignore file: %s
can't add files from directory %s to list: limit reached: %d
CCdmDatabaseList::add failed, because list is full! Entries %d
unhandled file type: %s!
iso and db file mismatch!!!!
CDM cannot handle more than one iso-image!!!!
checkForConsistency() has detected an error!
```

Сам файл снят с **исправной** машины — `/HBpersistence/navi/db/acios_db.ini`,
17 активных записей и 2 закомментированные:

```
# This file has been generated by the LVM (epoche 37)

ANY: /mnt/nav/db/pkgdb/LABEL/Label.DB
ANY: /mnt/nav/db/pkgdb/XAC/kN221EUx01_0.db      (XAC2, XAC3)
ANY: /mnt/nav/db/pkgdb/GDB/EJ211_v37a.gdb       (GDB2)
ANY: /mnt/nav/db/pkgdb/TMC/kN221EUx01t01.db
ANY: /mnt/nav/db/pkgdb/LIT/EJ211Ga_L1.db        (LIT2, LIT3, LIT4)
#SDS: …/SDS/SDS_Data.iso                        ← выключено
#MNT(SDS): …/SDS/SDS_Data.iso                   ← выключено
ANY: /mnt/nav/db/pkgdb/PIT/EJ211a.PIT
ANY: /mnt/nav/db/pkgdb/TER/72_Europe.4_2.0.ATLAS   (TER2)
ANY: /mnt/nav/db/pkgdb/CTY/…ATLAS                 (CTY2, CTY3)
```

**Файл генерирует LVM** — так написано в его собственной первой строке
(«epoche 37»), и в `logvolmgr` есть `res_if_update_acios_db`,
`res_if_replicate_acios_db` и сообщения `acios_db.ini update OK/failed`.
Переписывается ли он при каждой установке и при каких условиях — по коду пока
не прослежено.

### `checkForConsistency` (FUN_08e93f6c)

```c
if (*(param_1 + 0x10) - 1U < 0x20) { ... }      // записей должно быть 1..32
```

Проход по записям: у кого есть расширение — определяется тип (db или образ);
у кого двоеточие — путь вида `\\.\C:`; остальное даёт `unhandled file type: %s!`.
В конце:

```c
if (((flagA | flagB) & flagC) != 0)   // сообщение: одновременно iso и db
    log("iso and db file mismatch!!!!"), return 0;
```

Какой из трёх признаков какому типу файла соответствует, по декомпиляции
однозначно не разделяется; достоверно только само правило «нельзя мешать».

Отсюда жёсткие рамки набора: **не меньше одной и не больше 32 записей**, и
нельзя мешать образ с обычными файлами. У рабочей машины 17 — запас есть.

### Драйвер баз `nobss` и описатель тома

В бинаре есть драйвер `cdm_nav_db_driver_nobss` (имя из пути к исходнику), и его
сообщения говорят о чтении заголовка и каталога db-файла и о текстовом блоке
`!dbinfo0001 … !enddbinfo`, который он зовёт «db-header»:

```
DBDRV: reading header of db-file (%ld Byte)
DBDRV: reading directory of db-file (%ld Byte)
DBDRV: found db-header '%s'
DBDRV: illegal header
found dbinfo label '%s'   /   no dbinfo label found!
nobss - no dbinfos found. generate dbinfos!
```

В первых 512 КБ файлов набора блок есть **только у LABEL и XAC/XAC2/XAC3**;
у GDB, GD2, LIT, PIT, TER, CTY его там нет. Строка
`nobss - no dbinfos found. generate dbinfos!` намекает, что для таких файлов
описатель создаётся на ходу, но код этой ветки не разбирался.

`Label.DB` — всего 2048 байт, FLDB с **нулём файловых записей**, то есть чистый
описатель тома, и он первым идёт в `acios_db.ini`:

```
!dbinfo0001
cdtype navcd              ← объявляет: это навигационный диск
cdlabel DB_ECE_PDU2
date 01.04.2009
cdtitle DB_ECE_PDU2
!enddbinfo
```

У XAC блок другой — про части набора:

```
!dbinfo0001
skip_db update
PPD XACDB=EJ211
DB=1/3                    ← XAC2: 2/3, XAC3: 3/3
!enddbinfo
```

Отсюда рабочее правило для урезанных наборов: считать компонент LABEL паспортом
тома и не выбрасывать его, сохраняя `cdtype navcd` и метку. **Опытом это не
подтверждено** — набор без LABEL мы не ставили.

### Типы дисков и два слота таблицы

`CCdmNavMediaRecognition` различает:

```
standard_navcd (first time seen) / (already known)
stdnavcd or updnavcd, tag 'cdtype navcd%s' found
cdm_cdst_external_navcd, tag 'cdtype %s' found
no tag cdtype found
already other navcd active
no match to internal label
```

То есть видов носителя как минимум три: `standard_navcd`, `updnavcd`
(обновление) и `external_navcd`. Заманчиво связать их со слотами таблицы
`FUN_08e8c364`, но **сходимости нет**: видов три, а записей в таблице ровно две.
Чему соответствует номер 1, который спрашивает шлюз, пока неизвестно.

Сообщение `no match to internal label` говорит, что метка с чем-то сверяется.
Догадка (не проверенная): это то же сравнение, что и строковое в состоянии 1
автомата NDL (`FUN_08236b50`, поле +0x28), где совпадение уводит в состояние 3,
а несовпадение — в состояние 2.

Есть и функции про сквозной номер изделия:
`cdm_get_nav_cd_db_part_number_of_cd_set`,
`dbm_mount_navcd_of_same_set fakes db_part_number %ld`. Похоже, части набора
как-то сверяются по номеру (у нас `PartNumber="8R0060884KL"` в `DBInfo.txt`),
но сама проверка не найдена.

### Чего не хватает для доказательства

`acios_db.ini` снят только с исправной машины. С зависшей его не снимали ни
разу: строка `acios_db.ini not found` в старых снимках — это наш же
sysinfo-скрипт смотрел не туда, она есть и в рабочих логах.

Ближайший решающий замер: снять `/HBpersistence/navi/db/acios_db.ini` с
зависшей машины и сравнить с эталоном. Проба `tools/baseline/run.sh` его уже
берёт (`acios_2`), отдельный инструмент не нужен.

### Тома и их имена: откуда берутся расширения `.LIT`/`.LI2`

Установлено по отдельности две вещи, связь между ними — пока догадка.

Из кода: диспетчер `FUN_082368f0` берёт имя записи (до 0x50 байт), ищет в нём
последнюю точку и сравнивает расширение с `.GDB`, `.GD2`, `.LIT`, `.LI2`…`.LI9`,
`.BLB`, `.DON`.

Из данных: на разделе файлы называются иначе (`EJ211Ga_L1.db`), но **внутри
FLDB-контейнеров** лежат записи ровно с такими расширениями:

| Компонент | Файл на разделе | Формат | Запись в каталоге | Индекс у NDL |
|---|---|---|---|---|
| LIT  | `EJ211Ga_L1.db` | FLDB | `EJ211Ga.LIT` | 0 |
| LIT2 | `EJ211Ga_L2.db` | FLDB | `EJ211Ga.LI2` | 1 |
| LIT3 | `EJ211Ga_L3.db` | FLDB | `EJ211Ga.LI3` | 2 |
| LIT4 | `EJ211Ga_L4.db` | FLDB | `EJ211Ga.LI4` | 3 |

Совпадение расширений один в один — сильный довод, что диспетчер перечисляет
именно записи контейнеров, но **доказательства нет**, и против него есть факт:
у GDB/GD2 никакого FLDB-каталога нет вовсе, а `.GDB` в таблице диспетчера
присутствует. Значит имена как минимум частично собираются самой прошивкой.

Диспетчер знает до `.LI9` — формат допускает девять томов; в наборе их четыре.
Что `LIT` это база подписей — вывод по читаемому внутри тексту
(`Europa NavTeq Q1/2022 MMI3G`, `ECE2022 MMI3G`, `© 2005-2022 Harman`, `"DVD"`),
а не по разбору формата.

Твёрдо: **LIT — это те же FLDB-контейнеры, что и XAC**, они открываются готовым
`src/fldb.js`, и в каждом ровно одна запись на весь том.

### Три части одной базы

Шапки XAC несут текстовый описатель:

```
!dbinfo0001
skip_db update
PPD XACDB=EJ211
DB=1/3            ← XAC2: DB=2/3, XAC3: DB=3/3
!enddbinfo
```

То есть XAC/XAC2/XAC3 — не три базы, а **три части одной**. С таблицей
навигационных дисков это не сходится: там ровно две записи, а частей три, —
значит `DB=n/3` нумерует что-то своё, а не слоты той таблицы.

### Прочие форматы

| Компонент | Магия | Что это |
|---|---|---|
| GDB, GD2 | `DEADBEEF`, v37 | отрисовка; внутри имя тома `EJ211` и метка сборки `20220218092956` |
| LIT…LIT4 | `FLDB` | подписи |
| XAC…XAC3 | `FLDB` | маршрутизация |
| PIT | `Lit\x02` … `HBIS` | назначение не установлено (магия совпадает с «Lit») |
| CTY, CTY2, CTY3, TER, TER2 | `\x06HEADER` + `Orion` + `Atlas` | формат Orion Atlas, не разбирался |
| SDS | ISO | голосовые данные |

Имён вида `*.GDB`/`*.GD2` ни в одном контейнере нет — устройство синтезирует их
само из `type=` в `.conf` и имени тома. Размеры томов внутри шапок GDB/GD2 тоже
не продублированы (проверен первый мегабайт обоих на все варианты BE/LE и
посекторные), поэтому рост `.gd2` при `--grow` перечисление не ломает.
