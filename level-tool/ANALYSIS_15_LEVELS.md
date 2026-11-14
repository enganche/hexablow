# Phân tích 15 level hiện tại (2026-11-14, sau khi xếp lại cơ chế level 8–15)

Nguồn: `src/levels.json` hiện tại (level 7–15 đã xếp lại số bí ẩn, cổng đôi, ô khóa: mỗi cơ chế dùng lại 3 level liên tiếp sau level mở khóa). Có hai góc nhìn:
- **Rule tĩnh** ([DIFFICULTY_RULES.md](DIFFICULTY_RULES.md)): đếm số vị trí kéo vào được của từng ô khay, chế độ strict, ô mồ côi tính là Khó. Đã hiểu cơ chế mới (xem mục 3).
- **Bot giả lập** ([../sim/README.md](../sim/README.md)): 5 persona chơi thật từng level, đã hiểu cơ chế mới.

Tạo lại số liệu:
```bash
node level-tool/analyze.mjs --detail                       # rule tĩnh (kèm cột cơ chế)
node level-tool/check-mechanics.mjs                         # luật cơ chế: <= 2 cơ chế / level, solver, cổng được dùng...
node sim/run.mjs --plays 100 --bots 150 --seed 1            # bot, xem sim/out/report.html
node level-tool/analysis-table.mjs --write                  # ghi lại bảng ở mục 1 từ hai nguồn trên
```
Mix = trung bình theo tỉ trọng persona: Người mới 30%, Phổ thông 40%, Kỹ tính 20%, Cao thủ 5%, Thích booster 5%.

> Các **dải theo bậc** dùng để chấm đạt/lệch là đề xuất ban đầu của tool, chưa được GD duyệt. Cột "Rule" chỉ cho biết level lệch *so với dải đó*.
> Bot là mô hình, nên dùng để so sánh các level với nhau, không nên đọc như số liệu người chơi thật.

## 1. Bảng tổng hợp

Cột Dễ / TB / Khó là số ô khay; số trong ngoặc là ô mồ côi đã tính vào Khó. Cột Given đếm cả given bị che thành "?". Cơ chế: nước = hồ, ẩn = số bí ẩn, cổng = cổng đôi, khóa = ô khóa (mỗi level tối đa 2 trong ba cơ chế mới, hồ nước không tính). Cả 15 level đều **giải được bằng suy luận**.

<!-- table:start -->
| Lv | Nhãn | Cơ chế | Ô | Given | Ô khay | Dễ / TB / Khó | Index | Rule | Đỉnh play-through | Bot: thắng lần đầu (mix) | Người mới / Phổ thông | Sai mỗi lượt | 3★ | Thời gian tới khi thắng |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | normal | – | 7 | 4 | 3 | 2 / 1 / 0 | 1.33 | ✅ | 1 | 100% | 100 / 100 | 0.04 | 97% | 0.2 ph |
| 2 | normal | – | 19 | 9 | 10 | 3 / 7 / 0 | 1.70 | ❌ Ô dễ ↓, Ô trung bình ↑, Chỉ số độ khó ↑ | 1 | 100% | 100 / 100 | 0.15 | 86% | 0.8 ph |
| 3 | normal | nước | 18 | 7 | 8 | 4 / 3 / 1 | 1.63 | ❌ Ô dễ ↓, Ô khó ↑, Chỉ số độ khó ↑ | 1 | 100% | 100 / 100 | 0.13 | 89% | 0.6 ph |
| 4 | normal | nước | 26 | 9 | 11 | 5 / 5 / 1 (1) | 1.64 | ✅ | 1 | 100% | 100 / 100 | 0.15 | 87% | 0.9 ph |
| 5 | **hard** | nước | 28 | 8 | 16 | 3 / 6 / 7 (7) | 2.25 | ❌ Ô dễ ↓, Ô khó ↑, Ô mồ côi ↑, Chỉ số độ khó ↑ | 2 | **67%** | 41 / 66 | 1.55 | 36% | 2.0 ph |
| 6 | normal | nước | 29 | 10 | 12 | 5 / 5 / 2 (2) | 1.75 | ✅ | 1 | 100% | 99 / 100 | 0.21 | 83% | 1.0 ph |
| 7 | normal | nước + ẩn | 30 | 10 (1 ẩn) | 12 | 5 / 5 / 2 (1) | 1.75 | ✅ | 1 | 100% | 100 / 100 | 0.21 | 82% | 1.0 ph |
| 8 | normal | ẩn | 31 | 10 (2 ẩn) | 10 | 4 / 4 / 2 (2) | 1.80 | ✅ | 1 | 100% | 100 / 100 | 0.20 | 83% | 0.8 ph |
| 9 | normal | nước + ẩn + cổng | 33 | 13 (1 ẩn) | 13 | 6 / 4 / 3 (3) | 1.77 | ✅ | 1 | 100% | 99 / 100 | 0.19 | 84% | 1.0 ph |
| 10 | **hard** | nước + ẩn + cổng | 34 | 8 (2 ẩn) | 16 | 1 / 4 / 11 (9) | 2.63 | ❌ Ô dễ ↓, Ô khó ↑, Ô mồ côi ↑, Chỉ số độ khó ↑ | 3 | **58%** | 16 / 64 | 1.78 | 28% | 2.7 ph |
| 11 | normal | cổng + khóa | 37 | 13 | 13 | 5 / 5 / 3 (3) | 1.85 | ✅ | 1 | 99% | 98 / 100 | 0.20 | 84% | 1.0 ph |
| 12 | normal | nước + cổng + khóa | 41 | 12 | 17 | 5 / 7 / 5 (4) | 2.00 | ✅ | 1 | 97% | 92 / 99 | 0.40 | 72% | 1.4 ph |
| 13 | normal | nước + khóa | 45 | 15 | 18 | 5 / 7 / 6 (5) | 2.06 | ✅ | 1 | 92% | 82 / 95 | 0.77 | 55% | 1.6 ph |
| 14 | normal | nước + khóa | 49 | 14 | 19 | 5 / 7 / 7 (4) | 2.11 | ✅ | 1 | 92% | 76 / 99 | 0.73 | 56% | 1.7 ph |
| 15 | **hard** | nước + cổng | 53 | 13 | 30 | 1 / 11 / 18 (14) | 2.57 | ❌ Ô dễ ↓, Ô khó ↑, Ô mồ côi ↑, Ô ba (3 số) ↓, Chỉ số độ khó ↑ | 2 | **29%** | 0 / 12 | 2.34 | 16% | 7.4 ph |
<!-- table:end -->

Bố cục cơ chế: số bí ẩn 7–10, cổng đôi 9–12 (+ L15), ô khóa 11–14. Hồ nước không tính vào giới hạn 2 cơ chế nên vẫn có ở L9, L10, L12 (L8 và L11 vốn không có hồ).

Ba level boss (5, 10, 15) lệch rule *cố ý*: chúng được làm khó hơn bậc của mình bằng `regen-boss.mjs`. L2 và L3 lệch nhẹ so với dải T1. Level giới thiệu cơ chế (7 ẩn, 9 cổng, 11 khóa) nằm trong dải bậc của mình.

## 2. Nhận xét

0. **Phễu độ khó giữ nguyên sau khi xếp lại cơ chế.** Bot thắng lần đầu (mix), trước → sau: L9 100% → 100%, L10 61% → 58%, L11 97% → 99%, L12 97% → 97%, L13 92% → 92%, L14 91% → 92%, L15 29% → 29%; L7, L8 không đổi. Tỉ lệ Dễ / TB / Khó chỉ lệch ≤ 8 điểm % mỗi level (L9 46/38/15 → 46/31/23, L10 13/27/60 → 6/25/69). L10 được giới hạn khay ở 16 mảnh để không khó hơn bản cũ.
1. **Đường cong vẫn có dạng răng cưa.**
   - Index tăng đều từ 1.64 (L4) lên 2.11 (L14), riêng các level boss vọt lên: 2.25, 2.63, 2.57.
   - Bot cho kết quả cùng dạng: các level thường 92–100% thắng lần đầu, còn L5 / L10 / L15 rơi xuống 67% / 58% / 29%.
2. **L6–L9 gần như không ai thua.** Kể cả Người mới cũng thắng 99–100%, mỗi lượt sai khoảng 0.2 lần. Số bí ẩn (L7–L9) và cổng đôi (L9) *chưa làm khó thêm* theo bot. Đây là chủ ý với level giới thiệu, nhưng đoạn L6–L9 vẫn có thể nhích lên để đường cong đi lên đều giữa hai level boss.
3. **Đoạn L11–L14 tăng đều, đúng ý định.** Sai mỗi lượt: 0.20 (cổng + khóa, giới thiệu) → 0.40 (cổng + khóa) → 0.77 (nước + khóa) → 0.73 (nước + khóa); thắng lần đầu 99% → 97% → 92% → 92%. Ba level giới thiệu (L7, L9, L11) đều ≥ 99%, đạt mục tiêu "màn giới thiệu không quá khó".
4. **L12 vẫn không khó hơn L13–L14** (97% / 0.40) và gần bằng L11. Nếu muốn L12 khó hơn L11, chỉnh lại mục tiêu của L12 trong `regen-mechanics.mjs` (L12 giữ đường đi có cổng, chỉ thêm khóa nên cần sinh lại đường đi nếu đổi tỉ lệ).
5. **L15 vẫn là bức tường.**
   - 30 ô khay, trong đó 14 ô mồ côi. Bot: Người mới 0%, Phổ thông 12% thắng lần đầu, trung bình khoảng 6.6 lượt mới qua, thời gian median hơn 7 phút.
   - Trong career 14 ngày, khoảng 20% bot bỏ game ở L15, và L15 tiêu khoảng 33 booster mỗi lượt qua màn (nhiều nhất cả game).
   - L15 còn lệch rule ô 3 số (3% < 5%) ngoài các mục boss đã lệch. Chưa phải vấn đề lớn, nhưng nên sửa cùng lúc khi làm mềm L15.
6. **L5 và L10 gắt cho người mới:** chỉ 41% và 16% Người mới thắng lần đầu. Có revive và booster nên trong career hầu như không ai bỏ game ở hai level này (L10: 0.4%).

## 3. Cơ chế mới được tính thế nào

| | Rule tĩnh (`level-tool/js/rules.js`) | Bot (`sim/board.mjs`) |
|---|---|---|
| Số bí ẩn | Ô vẫn bị chiếm nhưng *không phải mốc* cho tới khi có ô khay liền kề được đặt (play-through mô phỏng việc mở). Cột Given vẫn đếm nó. | Giống rule tĩnh. Bot **không** dùng phép loại trừ để đoán số ẩn, nên số liệu cho level có "?" là cận trên của độ khó. |
| Cổng đôi | Đầu kia của cổng được thêm vào các vị trí "móc" và vào điều kiện strict (hai đầu là liền kề). | Hai đầu là cạnh liền kề trong đồ thị. |
| Ô khóa | **Không tính** (khóa chỉ đổi thứ tự đặt, không đổi số vị trí kéo vào được). `compile` kiểm `need` ≤ số ô giải được khi chưa mở khóa. | Mảnh nằm sau ổ khóa chờ tới khi đã giải đủ số ô; thả vào ô khóa không phạt. |
| Solver | Số bí ẩn là số ẩn nằm ở một trong các ô "?"; cổng là cạnh; khoảng cách tính trên đồ thị (nước và cổng đều tính). | – |

Bot "người chơi thật" trong panel debug (phím `) đã chạy lại sau lần xếp lại cơ chế này (2026-11-14): thắng cả 15 level qua giao diện thật, không có lỗi console, kể cả tut và màn giới thiệu của L7, L9, L11.

## 4. Đề xuất
- Làm mềm L15 trước tiên (mục tiêu khoảng 50–60% thắng lần đầu theo mix), thêm ô 3 số cho đủ dải, rồi chạy lại `npm run sim` và `analysis-table.mjs --write`.
- Nâng nhẹ độ khó L6–L9 (bớt given hoặc tăng ô Trung bình), nhưng giữ L7, L9 (level giới thiệu) ở mức dễ.
- Nếu muốn dùng bot để đánh giá level có số bí ẩn sát thực tế hơn, cho bot dùng phép loại trừ (tập số bị thiếu).
- Khi đổi level, giữ các luật: không đi xoắn ốc từ L5, chỉ N bắt buộc là given, tối đa 2 trong ba cơ chế mới (số bí ẩn / cổng / khóa) mỗi level, hồ nước không tính, mỗi cơ chế dùng lại ~3 level sau level mở khóa, và chạy `check-mechanics.mjs` trước khi chép vào `src/`.
