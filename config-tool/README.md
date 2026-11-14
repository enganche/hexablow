# Hexablow Config Tool

Tool HTML để **chỉnh mọi thông số của game** theo kiểu Inspector / Serialize Field của Unity. Chạy độc lập với game (không import gì từ `src/`, không cần build).

## Mở tool

- **Cách 1 (khuyên dùng):** `npm run config` (hoặc `node config-tool/serve.mjs [port]`) rồi mở <http://localhost:5190/>. Tool tự nạp các file JSON, nút **Save** ghi thẳng vào chúng.
- **Cách 2:** double-click [`index.html`](index.html) rồi chọn:
  - **Open project folder** (Chrome / Edge): chọn thư mục gốc dự án, Save ghi thẳng vào file.
  - **Open files**: chọn tay các file JSON (`tuning.json`, `economy.json`…). Save tải file về, bạn tự chép đè lên file gốc.

## File nào chỉnh được gì

| File | Nội dung |
|---|---|
| `src/tuning.json` | Hằng số trước đây nằm cứng trong code: số tim tối đa, thời gian chờ trước khi hiện gợi ý, level mở quà hằng ngày, giá avatar, thời gian combo và các bậc khen, khoảng cách bố cục bàn / khay, màu bàn chơi (nền, nước, gợi ý, preview thả). |
| `src/economy.json` | Xu khởi đầu, thưởng thắng và thưởng sao, giá revive, booster (giá, gói, level mở khoá), bảng quà 7 ngày và rương chuỗi 7 / 14 / 21 / 28 ngày. |
| `src/shop.json` | Gói khởi đầu, bundle, gói xu, quà miễn phí hằng ngày (giá USD của bản mua giả). |
| `src/cosmetics.json` | Skin ô / theme: giá, màu ô, màu ô trống, toàn bộ biến CSS của giao diện. |
| `src/collection.json` | Album: bộ sưu tập, thưởng hoàn thành bộ, loài và level xuất hiện. |
| `sim/personas.json` | Persona của bot giả lập (không dùng trong game). |

Level (`src/levels.json`) không nằm ở đây, dùng [level tool](../level-tool/README.md).

## Giao diện

- Bên trái: danh sách file (chấm vàng = có thay đổi chưa lưu), ô tìm kiếm (**Ctrl+F**, tìm theo tên, đường dẫn hoặc giá trị), Expand / Collapse all.
- Ở giữa là Inspector, dựng từ chính nội dung JSON:
  - số → ô nhập, kèm thanh trượt nếu có khoảng; ngoài khoảng hoặc không phải số nguyên thì viền đỏ (không chặn lưu)
  - chuỗi hex → bảng chọn màu (giữ nguyên phần alpha của `#rrggbbaa`)
  - true / false → ô tick; chuỗi → ô chữ
  - danh sách giá trị → các ô nhỏ cùng hàng, có `+` và `✕`
  - danh sách đối tượng → từng phần tử là một mục gập được: ↑ ↓ đổi thứ tự, ⧉ nhân đôi, ✕ xoá, **+ Add element** thêm một bản sao phần tử cuối
  - đối tượng dạng từ điển (ví dụ `starBonus`, `boosters` trong quà) có **+ Add key** và `✕` ở mỗi khoá
- **Giá trị đã sửa** so với bản lưu gần nhất có nhãn xanh đậm và vạch xanh bên trái (như prefab override của Unity); **↺** hoàn lại riêng giá trị đó. Phần tử mới thêm có chữ *(new)*.
- Rê chuột lên nhãn có **ⓘ** để đọc chú thích.
- **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z khi không đang gõ trong ô), **Revert file** bỏ hết thay đổi của file đang mở, **Save** (Ctrl+S), **Save all** (Ctrl+Shift+S).
- **▶ Game preview**: khung game 9:16 chạy ngay cạnh (cần `npm run dev` ở cổng 5173, đổi được URL). Vite tự tải lại game khi file JSON đổi; ô *reload on save* tải lại khung sau mỗi lần Save.

## Cách code dùng các giá trị

Game `import` các file JSON này lúc build (`import tuning from './tuning.json'`), nên **đổi xong cần tải lại game** (Vite dev tự làm). Một số giá trị suy ra từ file khác:

- `economy.boosters.*.unlockLevel` quyết định cả level nào dạy booster đó (tutorial) và level nào có khoảng trống cho bong bóng hướng dẫn.
- `economy.daily.milestones` mục cuối cùng quyết định độ dài chu kỳ chuỗi quà.
- Thưởng sao dựa trên số tim còn lại, nên `tuning.hearts.max` ≠ 3 sẽ làm 3 sao khó hoặc dễ đạt hơn dự định.
- Công thức (không chỉ con số) nằm trong code. Bot giả lập (`sim/career.mjs`) có bản sao công thức kinh tế; số liệu đổi thì bot đổi theo, còn công thức đổi thì phải sửa cả bot.

Sau khi đổi kinh tế hoặc độ khó, chạy `npm run sim` để xem tác động.

## Thêm thông số mới

Tool không cần khai báo trước: thêm trường vào JSON (hoặc thêm file mới vào danh sách) là nó tự xuất hiện, hiển thị theo kiểu giá trị. Muốn đẹp hơn thì khai báo trong [`js/meta.js`](js/meta.js), tương tự `[Header]`, `[Tooltip]`, `[Range]` của Unity:

```js
{ path: 'hearts.max', label: 'Max hearts', tip: 'Mistakes allowed per attempt…', int: true, min: 1, max: 9 },
```

- `path`: đường dẫn chấm, `*` khớp một đoạn (`boosters.*.price`). Entry sau đè entry trước.
- Khoá dùng được: `label`, `tip`, `min` + `max` (thành thanh trượt), `step`, `int`, `unit`, `type` (`color` / `text` / `multiline` / `select` + `options`), `header`, `dict`, `title` (mẫu tiêu đề phần tử mảng, ví dụ `'{name} ({id})'`, `{#}` là số thứ tự), `open`.
- Thêm file cấu hình mới: thêm vào `CONFIG_FILES` cuối `meta.js` (tên, đường dẫn tương đối từ gốc dự án, nhóm) và viết `M['tên.json']` nếu cần mô tả. Server dùng chính danh sách này làm whitelist ghi file.
- Muốn game dùng thông số mới: thêm vào `src/tuning.json` (hoặc file liên quan) rồi `import` trong code thay cho hằng số.

## Định dạng khi lưu

Tool ghi JSON 2 space, giữ kiểu của từng file: mảng giá trị đơn nằm trên một dòng nếu file gốc làm vậy (`economy.json`, `tuning.json`), ngược lại xổ từng dòng. Vì vậy lần Save đầu tiên của `economy.json` / `collection.json` có thể đổi định dạng một số dòng ngoài phần bạn sửa (ví dụ `{ "coins": 20 }` thành nhiều dòng). Chỉ file có thay đổi mới được ghi. Server chỉ ghi các file trong danh sách và từ chối JSON không hợp lệ.

## Cấu trúc

```
config-tool/
  index.html  tool.css
  js/meta.js     nhãn / chú thích / khoảng giá trị + danh sách file
  js/format.js   in JSON giữ định dạng từng file
  js/app.js      Inspector (render, tìm kiếm, undo, lưu, preview)
  serve.mjs      server tĩnh + API đọc / ghi file (cổng 5190)
```

Mọi file JS là script thường (không ES module) nên chạy được từ `file://`.
