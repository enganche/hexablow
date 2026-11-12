# Phân tích 15 level hiện tại theo rule độ khó

Nguồn: `src/levels.json` (15 level, chưa sửa gì). Rule: [`DIFFICULTY_RULES.md`](DIFFICULTY_RULES.md), chế độ đếm **strict**, mồ côi tính là Khó.
Tái tạo: `node level-tool/analyze.mjs --detail` (hoặc mở tool, tab *Phân tích*).

> **Lưu ý trước khi đọc:** cách phân loại ô (Dễ = 1 vị trí, TB = 2–3, Khó = >3) là của yêu cầu gốc.
> Các **dải theo bậc level** dùng để chấm "đạt / lệch" là *đề xuất ban đầu của tool* (mục 4.1 của tài liệu rule), chưa được GD duyệt —
> nên cột "Kết quả" cho biết level lệch *so với đề xuất đó*, không phải sai tuyệt đối. Những nhận xét ở mục 2 không phụ thuộc vào các dải này.

## 1. Bảng tổng hợp

Dễ / TB / Khó là **số ô khay**; trong ngoặc là số ô mồ côi đã tính vào Khó. Mọi level đều **giải được bằng suy luận** (không cần đoán).

| Lv | Nhãn | Ô | Given | Ô khay | Dễ / TB / Khó | Dễ % | TB % | Khó % | Mồ côi | Ô ba | Index | Bậc | Kết quả (strict) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | normal | 7 | 4 | 3 | 2 / 1 / 0 | 67 | 33 | 0 | 0 | 0% | 1.33 | T1 | ✅ đạt |
| 2 | normal | 19 | 8 | 11 | 2 / 8 / 1 | 18 | 73 | 9 | 0 | 0% | 1.91 | T1 | ❌ Dễ ↓ (18% < 60%), TB ↑ (73% > 40%), Index ↑ (1.91 > 1.40) |
| 3 | normal | 18 | 7 | 8 | 4 / 3 / 1 | 50 | 38 | 13 | 0 | 0% | 1.63 | T1 | ❌ Dễ ↓ (50% < 60%), Khó ↑ (13% > 10%), Index ↑ (1.63 > 1.40) |
| 4 | normal | 26 | 9 | 11 | 5 / 5 / 1 (1) | 45 | 45 | 9 | 9% | 0% | 1.64 | T2 | ✅ đạt |
| 5 | normal | 28 | 9 | 11 | 4 / 4 / 3 (3) | 36 | 36 | 27 | 27% | 0% | 1.91 | T2 | ❌ Khó ↑ (27% > 25%), Mồ côi ↑ (27% > 25%), Index ↑ (1.91 > 1.80) |
| 6 | normal | 29 | 11 | 10 | 4 / 6 / 0 | 40 | 60 | 0 | 0 | 10% | 1.60 | T2 | ❌ TB ↑ (60% > 50%) |
| 7 | normal | 30 | 11 | 10 | 4 / 5 / 1 (1) | 40 | 50 | 10 | 10% | 10% | 1.70 | T2 | ✅ đạt |
| 8 | **hard** | 31 | 10 | 10 | 4 / 6 / 0 | 40 | 60 | 0 | 0 | 20% | 1.60 | T3 | ❌ TB ↑ (60% > 50%), Khó ↓ (0% < 10%) |
| 9 | normal | 33 | 11 | 12 | 5 / 6 / 1 (1) | 42 | 50 | 8 | 8% | 8% | 1.67 | T3 | ❌ Khó ↓ (8% < 10%) |
| 10 | normal | 34 | 10 | 13 | 7 / 4 / 2 (1) | 54 | 31 | 15 | 8% | 8% | 1.62 | T3 | ✅ đạt |
| 11 | normal | 37 | 12 | 12 | 6 / 4 / 2 (2) | 50 | 33 | 17 | 17% | 25% | 1.67 | T3 | ✅ đạt |
| 12 | normal | 41 | 13 | 13 | 6 / 4 / 3 (3) | 46 | 31 | 23 | 23% | 31% | 1.77 | T4 | ❌ Dễ ↑ (46% > 40%), Khó ↓ (23% < 25%), Index ↓ (1.77 < 1.90) |
| 13 | normal | 45 | 13 | 15 | 6 / 5 / 4 (4) | 40 | 33 | 27 | 27% | 33% | 1.87 | T4 | ❌ Index ↓ (1.87 < 1.90) — suýt đạt |
| 14 | normal | 49 | 13 | 17 | 6 / 6 / 5 (3) | 35 | 35 | 29 | 18% | 29% | 1.94 | T4 | ✅ đạt |
| 15 | **hard** | 53 | 15 | 16 | 8 / 6 / 2 (1) | 50 | 38 | 13 | 6% | 44% | 1.63 | T4 | ❌ Dễ ↑ (50% > 40%), Khó ↓ (13% < 25%), Index ↓ (1.63 < 1.90) |

**6 / 15 đạt** (L1, 4, 7, 10, 11, 14), **9 / 15 lệch** (L2, 3, 5, 6, 8, 9, 12, 13, 15).

## 2. Nhận xét (không phụ thuộc dải bậc)

1. **Đường cong độ khó gần như phẳng rồi gập.** Index theo level:
   `1.33 · 1.91 · 1.63 · 1.64 · 1.91 · 1.60 · 1.70 · 1.60 · 1.67 · 1.62 · 1.67 · 1.77 · 1.87 · 1.94 · 1.63`.
   Từ L3 đến L11 dao động quanh 1.6–1.7 (không tăng), chỉ L12→L14 mới đi lên, rồi **L15 tụt về 1.63** — dễ hơn L12–L14 dù là level cuối.
2. **Hai level nhãn `hard` không khó theo rule.** L8 (`hard`) có **0 ô Khó**, 60% Trung bình, index 1.60 — bằng L6 và thấp hơn L5. L15 (`hard`) có 50% Dễ và chỉ 2 ô Khó, index thấp hơn cả L13–L14.
3. **L2 và L5 là hai đỉnh nhọn.** L2 (level hướng dẫn tap-to-jump, 19 ô) có 73% ô Trung bình và 1 ô Khó (`14` có 4 vị trí) — khó hơn L3 và L4. L5 có 3/11 ô mồ côi (`12`, `19`, `20+24`), nhiều hơn mọi level tới tận L11.
4. **Ô Khó thực sự hiếm.** Tổng cả 15 level chỉ có **26 ô Khó trên 172 ô khay (≈15%)**, và 20 trong số đó là ô mồ côi (không có mốc). Ô Khó theo đúng nghĩa ">3 vị trí" (có mốc) chỉ xuất hiện ở L2 (`14`), L3 (`17`), L10 (`7+25`), L14 (`5`, `39`), L15 (`19`) — 6 ô trong cả game.
5. **Ô ghép nhiều số thường là ô Dễ.** Ô 2–3 số hay có nhiều mốc (vd `22+23+34`, `9+27+29`) và bị hình dạng ràng buộc nên chỉ còn 1 vị trí. Thêm ô ba làm level *dễ đi*, không khó lên: L15 có 44% ô ba nhưng 50% ô Dễ. Nếu GD muốn ô ba tạo độ khó thì cần cắt sao cho chúng ít mốc (hoặc kề ô nước/biên).
6. **Chỉ số động (play-through):** ở **mọi level**, lúc nào cũng có sẵn ít nhất một ô chỉ có đúng 1 vị trí để đặt tiếp — đỉnh `peak = 1` ở 14/15 level (chỉ L2 có `peak = 2`, một bước phải chọn giữa 2 chỗ), và **không có lần kẹt** nào. Nói cách khác, chỉ cần luôn lấy ô dễ nhất là xong: không level nào ép người chơi cân nhắc nhiều chỗ ở giữa trận. Độ khó hiện tại chỉ nằm ở *số ô* và *mặt bằng ban đầu*, không ở nhịp chơi.
7. **Mật độ given** giảm đều (57% → 28%) nhưng index không theo kịp — given ít hơn chưa chắc làm ô khó hơn vì given vẫn rải đều (cách nhau ≤ 5) nên hầu hết ô đều có mốc ngay.

## 3. Từng level

Ô liệt kê dạng `số+số (số vị trí)`; `–` = mồ côi.

| Lv | Ô Dễ | Ô Trung bình | Ô Khó |
|---|---|---|---|
| 1 | `2` `5` | `4`(2) | — |
| 2 | `16` `2` | `4`(3) `7`(3) `8`(2) `10`(2) `11`(3) `13`(3) `18`(2) `5`(3) | `14`(4) |
| 3 | `2+14` `5` `7+16` `10+11` | `3`(3) `8`(3) `13`(2) | `17`(4) |
| 4 | `2` `4+25` `8+10` `11+13` `20+22` | `5`(3) `7`(3) `14+17`(2) `15`(3) `24`(2) | mồ côi: `18+19` |
| 5 | `9+11` `13+15` `16+18` `21+23` | `2+3`(2) `5`(2) `7+10`(2) `25+26`(3) | mồ côi: `12` `19` `20+24` |
| 6 | `2+5+15` `10+28` `18+20` `25+26` | `3`(2) `7+8`(3) `12+21`(2) `13+17`(2) `22`(2) `24`(2) | — |
| 7 | `6+8` `10+12` `13+16` `22+26` | `2+3`(2) `5+24`(2) `14`(2) `18+20`(3) `19+28+29`(2) | mồ côi: `21` |
| 8 | `9+11+13` `14+17` `19+26` `20+22+24` | `2+3`(2) `4+8`(2) `6+21`(2) `15`(2) `25+30`(2) `28+29`(3) | — |
| 9 | `4+21` `6` `9+27+29` `12+31` `25+32` | `2+26`(2) `8`(2) `10`(2) `14+15`(3) `16+17`(3) `19+23`(3) | mồ côi: `20+22` |
| 10 | `3+21` `8+9` `11+12` `13+33` `15` `17+19` `23+28+30` | `2`(3) `4+22`(3) `6+24`(3) `27+31`(2) | `7+25`(4); mồ côi: `18` |
| 11 | `2+19+30` `5+21` `6+23` `10+25+34` `15+17+29` `20+32` | `8+9`(2) `12+26`(3) `13+27`(3) `35`(3) | mồ côi: `3+4` `14` |
| 12 | `6+8` `10+12+14` `16+18+40` `20+22+39` `23+36+38` `27+32` | `2+5`(2) `25+35`(3) `26+34`(2) `29+30`(2) | mồ côi: `3+4` `11` `13` |
| 13 | `11+42+43` `18+20+29` `21+22+27` `25+32+34` `35+37` `39+41` | `2+4+19`(2) `5+16`(2) `7+15`(3) `9+13`(2) `24`(3) | mồ côi: `3` `8+14` `30+31` `40` |
| 14 | `2+3+34` `6+47+48` `8+11` `10+13+32` `19+21+25` `44+45` | `15+31`(3) `17+28`(2) `22+24+37`(2) `26+36`(3) `30+33`(3) `41+43`(2) | `5`(4) `39`(4); mồ côi: `14` `18+27` `38+42` |
| 15 | `2+25` `7+29+49` `9+50` `11+51` `16+41+43` `21+35+39` `22+23+34` `47+52` | `3+26+32`(2) `4+27+31`(2) `6+28`(3) `13+45`(2) `18+40`(2) `37+38`(3) | `19`(5); mồ côi: `14+15+44` |

## 4. Đối chiếu chế độ `loose`

Nếu GD chọn nghĩa đen "chạm một mốc là đủ" (`--loose`), mọi level đều *khó hơn* trên giấy: Index 1.67 – 2.36, **chỉ còn 4/15 đạt** (L10, 11, 13, 14) và phần lớn level lệch vì thiếu ô Dễ (L2: 0 ô Dễ, L8: 0 ô Dễ, L12: 1/13). Lý do: ô kẹp giữa hai given được cộng cả hai vòng 6 ô. Vì vậy mặc định là `strict`; xem mục 6.1 của tài liệu rule.

## 5. Hướng sửa gợi ý (GD tự quyết)

Dùng tab **Tạo tự động** với cờ *giữ đường đi* để sinh lại given + cách cắt cho cùng bản đồ, hoặc sửa tay ở tab 3.

| Mục tiêu | Level | Gợi ý |
|---|---|---|
| Hạ độ khó tutorial | L2, L3 | Thêm given quanh `14` (L2) / `17` (L3) hoặc gộp ô kề để giảm số vị trí; giữ 0–1 ô Khó. |
| Giảm đỉnh nhọn | L5 | Bớt 1–2 ô mồ côi (thêm given gần `12`, `19`) để index về ≤ 1.8. |
| Cân Trung bình ↔ Khó | L6, L8, L9 | Chuyển 1–2 ô Trung bình thành Khó (bỏ bớt given sát cạnh ô đó); L8 đang gắn `hard` mà chưa có ô Khó nào. |
| Khôi phục dốc cuối | L12, L15 | Nâng index lên ≥ 1.9: nhiều ô ở khoảng mở (ít bị chắn) và ít given hơn; L15 hiện dễ hơn L13–L14. |
| Thêm nhịp chơi | cả hai nhãn `hard` | Cân nhắc ràng buộc động "peak ≥ 2" (mục 6.5 tài liệu rule) để có lúc buộc phải cân nhắc. |

## 6. Đã sửa L5–L15 (`node level-tool/regen.mjs 5`)

Giữ nguyên **bản đồ, ô nước và đường đi (solution)** của từng level; chỉ sinh lại **given + cách cắt khay** để tỉ lệ ô trúng mục tiêu riêng của level (Dễ giảm, Khó tăng dần) và nằm trong dải bậc. Kết quả: **L5–L15 đều đạt rule và giải được bằng suy luận**.

| Lv | Dễ / TB / Khó % | Mồ côi | Ô ba | Given | Index |
|---|---|---|---|---|---|
| 5 | 50 / 40 / 10 | 1 | 20% | 11/28 | 1.60 |
| 6 | 46 / 38 / 15 | 2 | 15% | 11/29 | 1.69 |
| 7 | 42 / 42 / 17 | 2 | 0% | 12/30 | 1.75 |
| 8 *(hard)* | 40 / 40 / 20 | 2 | 30% | 9/31 | 1.80 |
| 9 | 38 / 38 / 23 | 2 | 8% | 12/33 | 1.85 |
| 10 | 33 / 42 / 25 | 1 | 17% | 12/34 | 1.92 |
| 11 | 31 / 38 / 31 | 2 | 31% | 11/37 | 2.00 |
| 12 | 29 / 41 / 29 | 3 | 12% | 12/41 | 2.00 |
| 13 | 29 / 35 / 35 | 5 | 35% | 12/45 | 2.06 |
| 14 | 28 / 33 / 39 | 6 | 17% | 16/49 | 2.11 |
| 15 *(hard)* | 23 / 36 / 41 | 6 | 27% | 14/53 | 2.18 |

Còn lại: **L2, L3 vẫn lệch** (chưa sửa theo yêu cầu "từ 5 trở đi"). L5 (1.60) hơi thấp hơn L4 (1.64) vì L4 chưa sửa. Hạn chế: ô Khó mới chủ yếu là ô mồ côi (độ khó "thiếu mốc"), và play-through vẫn luôn có ô 1 vị trí để đặt tiếp.
