# Bàn giao — làm tiếp ở máy nhà (2026-11-11)

## Khởi động lại
```bash
git clone https://github.com/enganche/hexablow.git   # hoặc: git pull origin master
cd hexablow
npm install
npm run dev        # http://localhost:5173, mở cửa sổ cỡ điện thoại (khung 9:16)
npm run build      # ra dist/
```
`node_modules/`, `dist/`, `.vercel`, `.env*` bị gitignore.

## Trạng thái
- Nhánh `master` đã push đủ lên `origin` (github.com/enganche/hexablow).
- Gần đây: booster Reveal/Find/Picker thay Hint trả phí, combo praise + streak decay, cảnh báo tim thấp, nhạc thắng/thua, vườn thắng pixel-art, Album sưu tập, Shop cosmetic, lưu tiến trình (localStorage `hexablow.progress.v1`, schema v2).
- Cấu hình dễ chỉnh bằng JSON: `src/economy.json`, `src/cosmetics.json`, `src/collection.json`, `src/levels.json` (sinh bằng `npm run levels`).

## Vercel
- Project `hexablow` (team `tuanraccoon`) đã nối repo GitHub; push `master` là tự deploy production.
- Production: https://hexablow-6cp3vi1te-tuanraccoon.vercel.app (có thể đang bật Deployment Protection).
- Ở máy nhà muốn dùng CLI: `npm i -g vercel`, `vercel login`, `vercel link --project hexablow`. `.vercel/` không được commit.

## Lưu ý
- Đọc `GDD.md` và cuối `TEAM_LOG.md` trước khi sửa; mỗi công đoạn ghi 1 dòng vào cuối `TEAM_LOG.md`, không sửa dòng cũ.
- Không redesign visual khi chưa có yêu cầu mới.
- Các file `*-preview.png` ở thư mục gốc là ảnh chụp thử, chưa commit (chưa quyết định giữ hay xoá).
- `README.md` còn nhắc "Hints" cũ trong phần How to play — nên cập nhật theo boosters.
