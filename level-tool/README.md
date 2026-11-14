# Hexablow Level Tool

Tool xếp level cho GD, **chạy độc lập với game** (không import gì từ `src/`, không cần build, không cần npm).

## Mở tool

- **Cách 1 (đơn giản nhất):** double-click [`index.html`](index.html). Dùng *Mở levels.json* (hoặc kéo thả file) để nạp `src/levels.json`.
- **Cách 2:** `node level-tool/serve.mjs` rồi mở <http://localhost:5180/level-tool/> — tự nạp `../src/levels.json`.

Công việc đang làm tự lưu trong trình duyệt (localStorage). *Lưu levels.json* tải về file đúng định dạng game; chép đè `src/levels.json` khi muốn đưa vào game.

## Giao diện

- **Một bản đồ duy nhất + thanh công cụ dọc** (không còn tab chế độ): chọn công cụ rồi thao tác thẳng trên bản đồ. Phím tắt: **B** vẽ ô · **W** nước · **E** xoá · **P** vẽ đường · **G** given · **H** ghép ô · **X** tách ô · **V** soi ô · **D** bật/tắt tô màu độ khó · **F** vừa khung · **Ctrl+Z / Ctrl+Shift+Z** hoàn tác / làm lại.
- **Thanh bước** phía trên (Bản đồ → Đường đi → Given → Cắt ô → Giải được → Đạt rule) cho biết đang ở đâu; bấm vào bước để chọn công cụ tương ứng.
- Rê chuột lên ô: tooltip số, ô khay và độ khó. **Soi ô (V)** hoặc bấm một dòng trong bảng độ khó: hiện mọi vị trí kéo vào được (nét đứt, vị trí đúng viền xanh liền, mốc nét đứt xanh).
- Cuộn chuột để zoom, kéo chuột phải / giữa (hoặc giữ Space + kéo) để di chuyển. Nút nổi góc phải: hoàn tác, zoom, hiện độ khó / số / đường.
- Panel phải gồm các thẻ gập được: **Level** (id, tên, nhãn, mẫu bản đồ), **Độ khó** (cập nhật tức thì), **Tự động** (tự vẽ đường, tự đặt given, tự cắt ô), **Tạo level theo độ khó**, **Luật**.
- **▶ Playtest** (góc trên phải): chơi thử đúng luật game (3 tim, kéo-thả hoặc bấm-bấm), thống kê số lần sai theo độ khó của ô.
- Chấm màu trong danh sách level: xanh = đạt rule và giải được bằng suy luận, đỏ = lệch / không giải được, xám = chưa hoàn chỉnh.

## Phân tích bằng dòng lệnh

```bash
node level-tool/analyze.mjs                  # 15 level trong src/levels.json, chế độ strict
node level-tool/analyze.mjs --detail         # kèm từng ô khay + play-through
node level-tool/analyze.mjs --loose          # đếm kiểu "chạm một mốc là đủ"
node level-tool/analyze.mjs path/to/levels.json
```

## Script sửa hàng loạt (ghi đè `src/levels.json` — commit trước khi chạy)

```bash
node level-tool/regen.mjs [fromId=5]           # giữ map + đường đi, sinh lại given + cắt ô theo mục tiêu độ khó từng level
node level-tool/regen-paths.mjs [fromId=5]     # thay đường giải xoắn ốc (thêm --check để chỉ kiểm tra)
node level-tool/regen-boss.mjs [--write]       # level boss 5 / 10 / 15: ít ô dễ, nhiều ô khó / mồ côi, nhãn "hard"
```

Sau khi đổi level, chạy bot để xem độ khó thực tế với nhiều kiểu người chơi: `npm run sim -- --only lab` (xem [`../sim/README.md`](../sim/README.md)). Kết quả hiện tại: [`ANALYSIS_15_LEVELS.md`](ANALYSIS_15_LEVELS.md).

## Cấu trúc

```
level-tool/
  index.html  tool.css
  js/hexcore.js   toán hex, RNG
  js/rules.js     ★ rule độ khó (ô khay, level, bậc)
  js/solver.js    bộ giải suy luận + đếm nghiệm
  js/model.js     draft chỉnh sửa <-> định dạng level của game
  js/generator.js đường đi / given / cắt ô / sinh theo độ khó
  js/view.js  js/playtest.js  js/app.js
  analyze.mjs  serve.mjs
  regen.mjs  regen-paths.mjs  regen-boss.mjs   script sửa hàng loạt
  DIFFICULTY_RULES.md   ANALYSIS_15_LEVELS.md
```

Mọi file JS là script thường (không ES module) nên chạy được từ `file://`; `analyze.mjs` nạp chính các file đó.

## Định dạng level (giống `src/levels.json`)

```json
{ "id": 1, "name": "Level 1", "difficulty": "normal",
  "cells": [[q,r]], "blocked": [[q,r]],
  "givens": {"1": [q,r]}, "pieces": [[2],[4,25]], "solution": {"1": [q,r]} }
```
`pieces` = các ô khay (số tăng dần); ô khay giữ hình dạng như trong `solution`. Cắt ô độc lập với đường đi nên một ô có thể chứa số không liên tiếp (vd `[4,25]`).

## Giới hạn hiện tại

- Mảnh không xoay (đúng GDD). Tool chưa chỉnh `tutorial` hay các field khác ngoài định dạng trên.
- Ô nước chỉ là ô chặn; hình dáng bờ / hoa sen do game tự vẽ.
- Sinh tự động là tìm kiếm ngẫu nhiên có giới hạn thời gian — bản đồ lớn hoặc mục tiêu khắt khe có thể chỉ ra "kết quả gần nhất".

## Công cụ liên quan

Thông số kinh tế, tim, quà, màu… (không phải level) chỉnh bằng [config tool](../config-tool/README.md).
