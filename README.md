# Hexablow

Một game puzzle số trên lưới lục giác, chạy trên trình duyệt (Vite + Three.js). Đặt các số còn thiếu sao cho mỗi số chạm số kế tiếp, từ 1 đến N.

Dự án gồm **game**, ba **công cụ nội bộ** (level tool, config tool và bot giả lập) và các **tài liệu** tương ứng. Phần dưới giới thiệu từng cái và tài liệu nên đọc khi nào.

---

## 1. Chạy game

```bash
npm install
npm run dev        # http://localhost:5173 — mở trong cửa sổ cỡ điện thoại (khung cố định 9:16)
npm run build      # build production ra dist/
npm run preview    # xem thử bản build
```

Push lên `master` sẽ tự deploy production trên Vercel.

## 2. Công cụ nội bộ

### 2.1 Level tool — `level-tool/`
Công cụ **độc lập với game** dùng để vẽ, kiểm tra và chỉnh level. Không cần build hay npm.

- **Mở:** double-click [`level-tool/index.html`](level-tool/index.html), hoặc chạy `node level-tool/serve.mjs` rồi mở <http://localhost:5180/level-tool/> (tự nạp `src/levels.json`).
- **Làm gì:** vẽ bản đồ và đường giải, đặt given, cắt mảnh khay (tự động hoặc tay), xem tooltip và phân loại độ khó, playtest, xuất `levels.json`.
- **Phân tích bằng dòng lệnh:**
  ```bash
  node level-tool/analyze.mjs            # kiểm tra 15 level trong src/levels.json
  node level-tool/analyze.mjs --detail   # kèm từng mảnh và play-through (có cột cơ chế)
  node level-tool/check-mechanics.mjs    # luật cơ chế: <= 2 cơ chế / level, giải được, cổng được dùng, "?" mở được, khóa đạt được
  node level-tool/analysis-table.mjs --write   # ghi lại bảng trong ANALYSIS_15_LEVELS.md (cần sim/out/report.json từ npm run sim)
  ```
- **Cơ chế level:** ngoài hồ nước còn có số bí ẩn (Lv 7), cổng đôi (Lv 9), ô khóa (Lv 11); editor có công cụ Số ẩn / Cổng / Khóa. Xem GDD §6.1.
- **Sửa hàng loạt** (ghi đè `src/levels.json` — commit trước khi chạy):
  ```bash
  node level-tool/regen.mjs [fromId=5]        # sinh lại given + cắt mảnh theo mục tiêu độ khó
  node level-tool/regen-paths.mjs [fromId=5]  # thay đường giải xoắn ốc (--check để chỉ kiểm tra)
  node level-tool/regen-boss.mjs [--write]    # level boss 5 / 10 / 15
  node level-tool/regen-mechanics.mjs [--write]  # level 7–15: thêm số bí ẩn / cổng đôi / ô khóa
  ```

Chi tiết: [level-tool/README.md](level-tool/README.md).

### 2.2 Config tool — `config-tool/`
Công cụ chạy bằng HTML để **chỉnh mọi thông số của game** theo kiểu Inspector / Serialize Field của Unity: thanh trượt, ô số, bảng chọn màu, danh sách thêm / xoá / nhân đôi / đổi thứ tự phần tử. Giá trị đã sửa so với bản đã lưu được tô xanh và có nút ↺ để hoàn lại.

- **Mở (khuyên dùng):** `npm run config` (hoặc `node config-tool/serve.mjs`) rồi mở <http://localhost:5190/>. Nút **Save** (Ctrl+S) ghi thẳng vào các file JSON trong dự án.
- **Không cần server:** double-click [`config-tool/index.html`](config-tool/index.html), rồi **Open project folder** (Chrome / Edge, ghi thẳng vào thư mục) hoặc **Open files** (Save sẽ tải file về, tự chép đè lên file gốc).
- **Chỉnh được gì:** `src/tuning.json` (tim, thời gian gợi ý, khen combo, bố cục, màu bàn chơi), `economy.json`, `shop.json`, `cosmetics.json`, `collection.json` và `sim/personas.json` của bot. Level vẫn chỉnh bằng level tool.
- **Xem ngay trong game:** nút **▶ Game preview** hiện game đang chạy (`npm run dev`) ngay cạnh; Vite tự tải lại khi file JSON đổi.
- **Thêm thông số mới:** tool tự dựng giao diện từ nội dung JSON, nên giá trị mới thêm vào các file trên tự hiện ra. Muốn có nhãn, chú thích, thanh trượt thì thêm một dòng vào [`config-tool/js/meta.js`](config-tool/js/meta.js).

Chi tiết: [config-tool/README.md](config-tool/README.md).

### 2.3 Bot giả lập — `sim/`
Cho bot chơi level với nhiều kiểu người chơi để đo **độ khó** và **kinh tế** (xu, booster, revive, cosmetic, IAP) mà không cần playtest thật.

```bash
npm run sim                                   # chạy đủ: độ khó (lab) + kinh tế (career)
node sim/run.mjs --plays 200 --bots 300       # nhiều mẫu hơn, số ổn định hơn
node sim/run.mjs --only lab                   # chỉ đo độ khó (nhanh)
node sim/run.mjs --only career --days 30      # chỉ đo kinh tế, 30 ngày
node sim/run.mjs --persona newbie,casual      # chọn persona
node sim/run.mjs --levels path/to/levels.json # thử một bộ level khác trước khi chép vào src/
```

Kết quả nằm ở `sim/out/report.html` (mở bằng trình duyệt) và `sim/out/report.json`. Thư mục này không commit.

Các persona (người mới, phổ thông, kỹ tính, cao thủ, thích booster) và tham số của chúng nằm trong [`sim/personas.json`](sim/personas.json). Chi tiết: [sim/README.md](sim/README.md).

> Bot là mô hình để **so sánh tương đối** giữa các level và giữa các phương án kinh tế, không dự đoán số liệu người chơi thật.

## 3. Tài liệu

| Tài liệu | Dùng khi nào |
|---|---|
| [GDD.md](GDD.md) | Muốn biết game hiện tại làm gì: luật, booster, kinh tế, quà, Album, theme, lưu dữ liệu, kỹ thuật. Đây là nguồn chuẩn cho thiết kế. |
| [RESEARCH.md](RESEARCH.md) | Muốn xem nghiên cứu về game tham chiếu (HexaDoku) làm nền cho thiết kế. Đầu file có ghi chú những điểm Hexablow đã khác. |
| [level-tool/DIFFICULTY_RULES.md](level-tool/DIFFICULTY_RULES.md) | Làm level hoặc chỉnh độ khó: định nghĩa mảnh Dễ / Trung bình / Khó, bậc level, ràng buộc giải được và luật đường đi. |
| [level-tool/ANALYSIS_15_LEVELS.md](level-tool/ANALYSIS_15_LEVELS.md) | Xem bộ 15 level hiện tại đạt hay lệch rule, và kết quả bot cho từng level, kèm đề xuất chỉnh. |
| [level-tool/README.md](level-tool/README.md) | Hướng dẫn dùng level tool: giao diện, phím tắt, định dạng level, script sửa hàng loạt. |
| [config-tool/README.md](config-tool/README.md) | Hướng dẫn dùng config tool: file nào chỉnh được gì, cách thêm thông số mới, ghi chú về định dạng file khi lưu. |
| [sim/README.md](sim/README.md) | Hướng dẫn bot giả lập: cách bot chơi, persona, hai chế độ đo (lab và career), giới hạn cần biết khi đọc số. |

## 4. Cấu trúc thư mục

```
src/                  game (Three.js + HTML/CSS)
  main.js               giao diện: home, bản đồ level, HUD, booster, màn kết quả, shop, album, cài đặt, debug
  game.js               bàn cờ và khay: layout, kéo-thả / chạm, đặt mảnh, tim, booster, nước, khu vườn khi thắng
  progress.js           dữ liệu lưu và luật kinh tế
  hint.js, praise.js    gợi ý tự động, combo khen
  mechanics.js/.json    cơ chế level (hồ nước, số bí ẩn, cổng đôi, ô khóa): mức mở khóa, chữ màn giới thiệu, tính % tiến độ
  mechArt.js            hình SVG cho màn giới thiệu cơ chế và thanh tiến độ ở màn thắng
  debugBot.js           bot "người chơi thật" cho panel debug (chơi qua UI, theo tut)
  profile.js, audio.js  hồ sơ người chơi, âm thanh tổng hợp (không dùng file âm thanh)
  *.json                cấu hình: levels, economy, shop, cosmetics, collection, tuning (hằng số gameplay / bố cục / màu)
  assets/               ảnh WebP cho UI, booster, avatar, nền theme
level-tool/           công cụ level + tài liệu độ khó
config-tool/          công cụ chỉnh thông số (kiểu Serialize Field của Unity)
sim/                  bot giả lập + báo cáo
GDD.md  RESEARCH.md  README.md   tài liệu gốc
```

Gameplay và kinh tế được chỉnh bằng các file JSON trong `src/`; code đọc chúng lúc build. Muốn đổi số liệu thì sửa JSON — nên dùng **config tool** (mục 2.2) thay vì sửa tay — còn muốn đổi công thức thì phải sửa code (và cả `sim/career.mjs` nếu muốn bot phản ánh đúng). Sau khi đổi kinh tế, chạy `npm run sim` để xem tác động.

## 5. Debug trong game

- Nhấn **`** (backtick) để mở bảng debug (`[` và `]` để chuyển level): nhảy tới level bất kỳ, quà hằng ngày, xu, booster, tự giải, thắng/thua tức thì, mở khoá tất cả level, reset tiến trình.
- Hàng **Human bot** trong bảng debug: bot chơi qua giao diện thật (bấm nút, kéo thả, làm theo từng tut, đóng popup, bấm Continue / Try again), có tốc độ x1/x4/x10 và Copy log. Dừng tự động sau khi thắng level cuối.
- `window.__hexablow` lộ `game`, `tut`, `levels`, `startLevel`, `progress`, `bot`, `resetProgress` trong console.
- Chế độ dev: `?today=YYYY-MM-DD` giả lập ngày để kiểm tra chuỗi quà hằng ngày.
- Mua tiền thật và quảng cáo thưởng hiện chỉ là bản giả (hộp xác nhận và popup). Chưa có SDK thanh toán hay quảng cáo.
