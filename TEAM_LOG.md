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
