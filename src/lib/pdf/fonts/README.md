# Шрифты PDF маршрута

- `DejaVuSans*.ttf` — основной шрифт: латиница, кириллица, греческий, армянский, грузинский, арабский, иврит.
- `NotoSansCJK-Subset.ttf` — китайский, японский, корейский. SIL Open Font License 1.1, проект Noto
  (`notofonts/noto-cjk`, `NotoSansCJKsc-Regular.otf`). Уменьшенная сборка: GB2312, Big5, JIS X 0208, KS X 1001,
  кана и знаки препинания. Латиницы и цифр в ней нет, их рисует DejaVu. Штатный файл брать нельзя: `fontkit`
  портит подмножество CFF-шрифтов с подпрограммами и TrueType с нечётной длиной глифов (текст выходит пустым или
  крестиками). Поэтому сборка в два шага: `pyftsubset … --desubroutinize --no-hinting --layout-features=''
  --notdef-outline --drop-tables+=GPOS,GSUB,GDEF,BASE,VORG,vhea,vmtx`, затем контуры переведены в TrueType
  (`fontTools`, `Cu2QuPen`, `max_err=1`) с выравниванием глифов до чётной длины (`glyf.padding = 2`).
- остальные `NotoSans*-Regular.ttf` — тайский, деванагари, бенгальский, тамильский, сингальский, кхмерский, мьянманский,
  эфиопский. SIL Open Font License 1.1, проект Noto (`notofonts/notofonts.github.io`, каталог `hinted/ttf`).

Текст лицензии Noto лежит в `LICENSE-Noto-OFL.txt`, лицензия DejaVu — в `LICENSE`.

Запасные шрифты подключаются к документу, только если в поездке есть текст на этой письменности.
