# 💬 HEXABLOW — TEAM LOG

Nhóm chat chung của dự án. Chỉ ghi **vắn tắt** việc vừa làm, mới nhất ở **cuối** file.

## Thành viên

| Tag | Vai trò | Phạm vi |
|---|---|---|
| **Tuan** | Chủ dự án / Game designer | Quyết định hướng đi, duyệt kết quả |
| **Claude** | Code & game logic | `src/`, `scripts/`, level, GDD, build |
| **Codex** | Art & 3D model | Thiết kế art, model, asset (đặt trong `assets/`) |

## Quy tắc

1. **Sau mỗi công đoạn, người làm PHẢI ghi 1 dòng vào cuối file này** (kể cả sửa nhỏ).
2. Chỉ ghi: *làm gì – file/thư mục nào – trạng thái*. Tối đa 1–3 dòng.
3. Cần người khác làm gì thì dùng `@Tên` (ví dụ `@Codex cần model ô hex 3 biến thể`).
4. Không sửa/xoá dòng cũ của người khác; sai thì ghi dòng mới đính chính.
5. Đọc vài dòng cuối trước khi bắt đầu để tránh làm trùng.

## Định dạng

```
[YYYY-MM-DD HH:mm] **Tên**: <việc đã làm> — `file/đường dẫn` — ✅ xong | 🚧 dở | ❌ lỗi | 🙋 cần @ai đó
```

---

## Log

[2026-11-09 00:00] **Claude**: Khởi tạo dự án Vite + Three.js, cơ chế lõi, 5 level, settings, GDD, research — `src/`, `GDD.md` — ✅ (commit 804d988)
[2026-11-09 00:00] **Claude**: Đang có thay đổi chưa commit ở GDD, generate-levels, game.js, levels.json, main.js — 🚧
[2026-11-09 00:00] **Claude**: Tạo file log chung này theo yêu cầu của Tuan — `TEAM_LOG.md` — ✅
[2026-11-09 00:00] **Tuan**: Thêm Codex vào team phụ trách art & model game — ✅
[2026-11-09 00:00] **Claude**: 🙋 @Codex chào mừng! Đọc `GDD.md` trước; cho biết định dạng model bạn xuất (glb/gltf?) và thư mục asset để mình nối vào `src/`.
[2026-11-09 12:28] **Codex**: Nhận bàn giao art & 3D; đề xuất xuất `.glb` vào `assets/models/`, giữ số ô do game vẽ để @Claude tích hợp — `GDD.md`, `src/game.js` — ✅
[2026-11-09 13:38] **Codex**: Dựng model tổ ong trong Three.js: hốc sáp, quân mật ong, ô ghim, cầu nối và viền đích kéo; build và thử Level 1 — `src/game.js` — ✅
[2026-11-09 13:47] **Codex**: @Claude bộ model tổ ong đã tích hợp trực tiếp bằng hình học Three.js và số vẽ động trong `src/game.js`. Build và đặt quân bằng chạm ở Level 1 đã qua; còn kiểm tra kéo-thả trên điện thoại — ✅
[2026-11-09 14:30] **Claude**: Sửa luật ô cần xếp: mỗi mảnh là chuỗi 1–3 số liên tiếp (tối đa 3), nối theo mọi hướng (thẳng/gập 60°/120°). Generator đổi: tách đoạn số thiếu thành mảnh 1/2/3 theo trọng số mỗi level (`sizes`), đoạn thiếu dài hơn (`maxGap`/`gapP`), bộ giải logic dùng hình dạng mảnh làm manh mối → ít số cho sẵn hơn (30–40%). Sinh lại 10 level, đều giải được bằng logic, build OK; `game.js` không cần đổi — `scripts/generate-levels.mjs`, `src/levels.json`, `GDD.md` — ✅ (chưa test kéo-thả thủ công)
[2026-11-09 15:10] **Claude**: Chỉnh pacing: 10 → 15 level, số ô tăng chậm 7→19→18→26→28→29→30→31→33→34→**37 (L11, khớp bản gốc)**→41→45→49→53 (L15 hard); thêm helper `blob()` tạo hồ nước gọn. Thêm debug: nhấn **`** mở bảng chọn level (click số, hoặc phím `[` `]` lùi/tiến) — `scripts/generate-levels.mjs`, `src/levels.json`, `src/main.js` — ✅ (đã thử trên trình duyệt)
[2026-11-09 15:20] **Claude**: 🙋 @Codex đã commit luật mới (mảnh 1–3 ô nối mọi hướng), 15 level với pacing mới và debug level picker (phím `). Art/model tổ ong của bạn không bị ảnh hưởng; nếu mảnh 2–3 ô cần model cầu nối/viền riêng thì báo mình. Mở game: `npm run dev`, nhấn ` để nhảy level — `src/`, `scripts/` — ✅
[2026-11-09 15:52] **Codex**: @Claude Tuan tạm chốt visual hiện tại: tile và nền map liền nhau; bỏ ghim/cờ; ô số trên board đồng nhất cam, ô cuối violet; lục giác trong và nối phẳng, nối ngang thẳng, nối chéo bù độ sâu theo góc nhìn ô — `src/game.js` — ✅ commit `b3d672d` (local, chưa push).
[2026-11-09 15:52] **Codex**: Thử nghiệm khoét lõm đã bỏ theo feedback; giữ nguyên bản trước thử nghiệm, không redesign tiếp khi chưa có yêu cầu mới. Hình học tích hợp trực tiếp bằng Three.js, không có model GLB riêng; `npm run build` thành công, chỉ cảnh báo bundle lớn — `src/game.js` — ✅

---

## 📦 BÀN GIAO CUỐI NGÀY 2026-11-09 — cho Claude ở nhà của Tuan

> Tuan chuyển sang làm việc ở nhà. Đọc mục này trước, sau đó `git pull` rồi `npm install && npm run dev`. Nhấn **`** trong game để chọn level nhanh (hoặc `[` `]` lùi/tiến).

### Tổng quan tiến trình hôm nay (8 commit, thứ tự thời gian)

| Giờ | Commit | Nội dung |
|---|---|---|
| 11:44 | `804d988` | Khởi tạo Vite + Three.js, cơ chế lõi, 5 level, settings, GDD, RESEARCH |
| 12:26 | `2015d40` | Làm lại level theo game tham chiếu: 10 level dễ hơn, bộ giải logic làm cổng kiểm tra |
| 13:48 | `0c83445` | (Codex) Model tổ ong bằng hình học Three.js: hốc sáp, quân mật ong, cầu nối |
| 14:06 | `fe9e051` | Mảnh ghép = chuỗi 1–3 số liên tiếp, nối mọi hướng; 15 level, pacing mới; debug level picker |
| 15:50 | `b3d672d` | (Codex) Chốt visual: tile liền nền, bỏ ghim/cờ, ô cuối violet, nối phẳng |
| 16:00 | `4364d07` | Ghi chú bàn giao visual vào log |
| 17:12 | `af3f143` | Tile **cam phẳng**, chữ số đậm hơn, ô **xanh lá** khi có chuỗi liên kết, khôi phục ô nước |
| 17:34 | `999c301` | Ô nước: texture caustic liền mạch, bờ lõm ở cạnh trên, lá súng + hoa sen |

### Trạng thái hiện tại của game (đã làm xong)

- **Luật**: mỗi mảnh là chuỗi 1–3 số liên tiếp, nối theo mọi hướng (thẳng / gập 60° / 120°). Người chơi đặt mảnh vào ô trống sao cho số liền kề phải kề nhau trên lưới hex.
- **Level**: 15 level, số ô tăng dần 7→…→37 (L11, khớp bản gốc)→…→53 (L15). Sinh bằng `scripts/generate-levels.mjs` (ra `src/levels.json`), mỗi level đều giải được bằng logic. Ô nước (hồ) tạo bằng helper `blob()`.
- **Visual tile** (`src/game.js`, hàm `makeTile`):
  - Ô số thường: cam phẳng (`TILE_FACE/TILE_RIM`), chữ nâu đậm `#7a3d12` nét viền 6px, font 900.
  - Ô **xanh lá** (`CONNECTED_FACE/RIM`): chuỗi số liên tiếp *và kề nhau* (≥2 ô) có chứa ít nhất 1 ô do người chơi đặt. Chuỗi chỉ gồm ô cho sẵn thì giữ màu cam. Tính trong phần "linked" của hàm render nội dung.
  - Ô cuối: violet. Không còn ghim/cờ, không còn đoạn nối vẽ riêng giữa các tile (`makeTile` giờ không dùng `directions`, truyền `[]`).
- **Ô nước** (`src/game.js`, quanh `WATER_GEO` / `waterTextureMaterial` / `shoreGeo` / `decorMaterial` / `waterDecor`):
  - Hex sắc cạnh để các ô nước kề nhau liền khít; texture Voronoi caustic lấy mẫu theo toạ độ bàn cờ (`WATER_TILE_UNITS = 4.2`) nên tiếp nối giữa các ô.
  - Bờ lõm (`SHORE_MAT`, `SHORE_W = 0.2`) chỉ ở 2 cạnh trên (`SHORE_EDGES = {1,2}`) tiếp giáp đất, nối góc vát.
  - Lá súng / hoa sen vẽ bằng canvas (`decorMaterial`), có vòng gợn; vẽ sóng nhỏ bằng `waveMaterial`.
- **Debug**: phím `` ` `` mở bảng chọn level (`src/main.js`).

### Việc còn dở / cần kiểm tra ở nhà

1. 🚧 **Chưa test kéo-thả thủ công trên điện thoại** (Codex và Claude đều mới thử đặt bằng chạm / trình duyệt desktop).
2. 🚧 Chưa xem lại visual ô nước trên nhiều level khác nhau (L1–L15) — nên lướt qua bằng level picker để tìm cạnh/góc bờ bị lỗi, lá súng/hoa sen chồng nhau hoặc đè lên tile.
3. 🚧 Hiệu năng: `npm run build` có cảnh báo bundle lớn; texture nước 512px + nhiều canvas label — nên đo FPS trên máy yếu/điện thoại.
4. Quy ước Tuan đã chốt: **không redesign visual khi chưa có yêu cầu mới** (thử nghiệm khoét lõm đã bị bỏ). Chỉ chỉnh màu/ô nước khi Tuan yêu cầu.
5. Chưa có model GLB riêng — toàn bộ hình học là Three.js dựng trực tiếp. Chưa có asset trong `assets/`.

### Lưu ý khi tiếp tục

- Đọc `GDD.md` (luật + pacing) và vài dòng cuối log này trước khi sửa.
- Mỗi công đoạn ghi 1 dòng vào cuối `TEAM_LOG.md` (quy tắc nhóm); đừng sửa dòng cũ của người khác.
- `dist/` và `node_modules/` bị gitignore — cần `npm install` ở máy nhà.
- Remote: `origin = https://github.com/enganche/hexablow.git`, nhánh `master`.

[2026-11-09 18:00] **Claude**: Cập nhật mục bàn giao cuối ngày cho Claude ở nhà của Tuan (tiến trình 8 commit, trạng thái visual, việc còn dở) — `TEAM_LOG.md` — ✅
[2026-11-09 19:00] **Claude**: Khung game cố định tỉ lệ: landscape 16:9, portrait 390:844 (iPhone), căn giữa, letterbox ngoài khung — `index.html`, `src/style.css` — ✅ (đã kiểm tra 1280×800 và 390×844)
[2026-11-09 19:30] **Claude**: Đổi khung game thành 9:16 cho mọi hướng màn hình (landscape cũng 9:16, luôn hiển thị dạng màn hình điện thoại) — `src/style.css` — ✅ (kiểm tra 1280×800 → khung 450×800)
[2026-11-10 12:00] **Claude**: Màn thắng/thua mới: 3 sao theo số tim còn lại (tối thiểu 1), thống kê tim, nút Next/Replay/Home; màn thua có tim vỡ + Retry/Home — `index.html`, `src/main.js`, `src/style.css` — ✅ (kiểm tra trên trình duyệt)
[2026-11-10 13:00] **Claude**: Lưu tiến trình: module `src/progress.js` (localStorage `hexablow.progress.v1`, sao tốt nhất mỗi level), thắng tự lưu + chuyển level tiếp theo, màn kết quả hiện First clear / New best / Best, home hiện tổng sao và nút Continue — `src/progress.js`, `src/main.js` — ✅ (kiểm tra reload trên trình duyệt)
[2026-11-10 14:00] **Claude**: Hệ tiền tệ: ví xu lưu cùng tiến trình (`progress.js`), cấu hình giá/thưởng ở `src/economy.json` (thắng 10+0/5/10, replay x0.3, hint 15, hồi sinh 20, khởi đầu 30); nút Hint (tự đặt mảnh số nhỏ nhất) + thanh xu trên khay, nút Revive ở màn thua — `src/economy.json`, `src/progress.js`, `src/game.js`, `src/main.js`, `index.html`, `src/style.css` — ✅ (kiểm tra trên trình duyệt)
[2026-11-10 15:00] **Claude**: Màn chọn level: lưới 3 cột 15 level (sao, số ô, khóa), mở từ nút level ở home; mở khóa khi level trước đã qua; Continue nhảy tới level chưa qua đầu tiên — `index.html`, `src/main.js`, `src/style.css` — ✅ (kiểm tra trên trình duyệt)
[2026-11-10 16:00] **Claude**: Cosmetic: `src/cosmetics.json` (4 skin ô số, 4 nền; giá/màu chỉnh trong JSON), sở hữu + trang bị lưu trong progress, game.setTileSkin/setBackground đổi runtime, nền SVG theo biến CSS, màn Shop mở từ nút 🎨 trên home. Mặc định Honey/Meadow giữ nguyên visual cũ — `src/cosmetics.json`, `src/progress.js`, `src/game.js`, `src/main.js`, `index.html`, `src/style.css` — ✅ (kiểm tra mua/trang bị trên trình duyệt)
