# Phân tích 15 level hiện tại (2026-11-14)

Nguồn: `src/levels.json` hiện tại. Có hai góc nhìn:
- **Rule tĩnh** ([DIFFICULTY_RULES.md](DIFFICULTY_RULES.md)): đếm số vị trí kéo vào được của từng ô khay, chế độ strict, ô mồ côi tính là Khó.
- **Bot giả lập** ([../sim/README.md](../sim/README.md)): 5 persona chơi thật từng level.

Tạo lại số liệu:
```bash
node level-tool/analyze.mjs --detail   # rule tĩnh
npm run sim                            # bot, xem sim/out/report.html
```
Số của bot lấy từ `--plays 100 --bots 150 --seed 1`. Mix = trung bình theo tỉ trọng persona: Người mới 30%, Phổ thông 40%, Kỹ tính 20%, Cao thủ 5%, Thích booster 5%.

> Các **dải theo bậc** dùng để chấm đạt/lệch là đề xuất ban đầu của tool, chưa được GD duyệt. Cột "Rule" chỉ cho biết level lệch *so với dải đó*.
> Bot là mô hình, nên dùng để so sánh các level với nhau, không nên đọc như số liệu người chơi thật.

## 1. Bảng tổng hợp

Cột Dễ / TB / Khó là số ô khay; số trong ngoặc là ô mồ côi đã tính vào Khó. Cả 15 level đều **giải được bằng suy luận**.

| Lv | Nhãn | Ô | Given | Ô khay | Dễ / TB / Khó | Index | Rule | Đỉnh play-through | Bot: thắng lần đầu (mix) | Người mới / Phổ thông | Sai mỗi lượt | 3★ | Thời gian tới khi thắng |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | normal | 7 | 4 | 3 | 2 / 1 / 0 | 1.33 | ✅ | 1 | 100% | 100 / 100 | 0.04 | 97% | 0.2 ph |
| 2 | normal | 19 | 9 | 10 | 3 / 7 / 0 | 1.70 | ❌ TB ↑ | 1 | 100% | 100 / 100 | 0.15 | 86% | 0.8 ph |
| 3 | normal | 18 | 7 | 8 | 4 / 3 / 1 | 1.63 | ❌ Khó ↑ | 1 | 100% | 100 / 100 | 0.13 | 89% | 0.6 ph |
| 4 | normal | 26 | 9 | 11 | 5 / 5 / 1 (1) | 1.64 | ✅ | 1 | 100% | 100 / 100 | 0.15 | 87% | 0.9 ph |
| 5 | **hard** | 28 | 8 | 16 | 3 / 6 / 7 (7) | 2.25 | ❌ Khó, mồ côi ↑ | 2 | **67%** | 41 / 66 | 1.55 | 36% | 2.0 ph |
| 6 | normal | 29 | 10 | 12 | 5 / 5 / 2 (2) | 1.75 | ✅ | 1 | 100% | 99 / 100 | 0.21 | 83% | 1.0 ph |
| 7 | normal | 30 | 10 | 12 | 5 / 5 / 2 (1) | 1.75 | ✅ | 1 | 100% | 100 / 100 | 0.21 | 82% | 1.0 ph |
| 8 | normal | 31 | 10 | 10 | 4 / 4 / 2 (1) | 1.80 | ✅ | 1 | 100% | 100 / 100 | 0.20 | 83% | 0.8 ph |
| 9 | normal | 33 | 11 | 13 | 5 / 5 / 3 (2) | 1.85 | ✅ | 1 | 99% | 98 / 100 | 0.23 | 82% | 1.0 ph |
| 10 | **hard** | 34 | 8 | 15 | 2 / 5 / 8 (6) | 2.40 | ❌ Khó, mồ côi ↑ | 2 | **61%** | 32 / 60 | 1.75 | 24% | 2.2 ph |
| 11 | normal | 37 | 12 | 17 | 6 / 6 / 5 (1) | 1.94 | ✅ | 1 | 96% | 88 / 100 | 0.46 | 69% | 1.4 ph |
| 12 | normal | 41 | 13 | 17 | 5 / 7 / 5 (5) | 2.00 | ✅ | 2 | 87% | 69 / 91 | 1.03 | 45% | 1.6 ph |
| 13 | normal | 45 | 15 | 18 | 5 / 7 / 6 (5) | 2.06 | ✅ | 1 | 93% | 85 / 94 | 0.73 | 56% | 1.6 ph |
| 14 | normal | 49 | 14 | 19 | 5 / 7 / 7 (4) | 2.11 | ✅ | 1 | 92% | 74 / 99 | 0.82 | 52% | 1.8 ph |
| 15 | **hard** | 53 | 13 | 30 | 2 / 9 / 19 (14) | 2.57 | ❌ Khó, mồ côi ↑ | 3 | **31%** | 1 / 15 | 2.38 | 14% | 7.3 ph |

Theo rule tĩnh, **10 / 15 level đạt dải bậc**. Ba level boss (5, 10, 15) lệch *cố ý*: chúng được làm khó hơn bậc của mình bằng `regen-boss.mjs`. L2 và L3 lệch nhẹ so với dải T1.

## 2. Nhận xét

1. **Đường cong có dạng răng cưa.**
   - Index tăng đều từ 1.64 (L4) lên 2.11 (L14), riêng các level boss vọt lên: 2.25, 2.40, 2.57.
   - Bot cho kết quả cùng dạng: các level thường gần 100% thắng lần đầu, còn L5 / L10 / L15 rơi xuống 67% / 61% / 31%.
2. **L6–L9 gần như không ai thua.** Kể cả Người mới cũng thắng gần 100%, mỗi lượt sai khoảng 0.2 lần. Ngay sau L5, đoạn này có thể khó hơn một chút để đường cong đi lên đều.
3. **L15 là bức tường.**
   - 30 ô khay, trong đó 14 ô mồ côi. Đỉnh play-through là 3 (có lúc phải chọn giữa 3 chỗ dù đã chơi tối ưu).
   - Bot: Người mới 1%, Phổ thông 15% thắng lần đầu, trung bình khoảng 7 lượt mới qua, thời gian median hơn 7 phút.
   - Trong career 14 ngày, khoảng 24% bot bỏ game ở L15, và phần lớn booster của cả game được tiêu ở đây.
   - Nên giảm bớt (thêm given, ít mồ côi hơn) hoặc chèn thêm level đệm trước nó.
4. **L5 và L10 gắt cho người mới:** chỉ 41% và 32% Người mới thắng lần đầu. Vì có revive và booster (Reveal mở ở L4) nên trong career gần như không ai bỏ game ở hai level này. Mức này chấp nhận được với level boss, nhưng cần theo dõi khi có dữ liệu thật.
5. **L12 khó hơn L13–L14** về số lần sai (1.03 so với 0.7–0.8): có 5 ô mồ côi và đỉnh play-through là 2. Có thể đổi chỗ, hoặc làm L12 dễ đi một chút.

## 3. Đề xuất
- Làm mềm L15 trước tiên (mục tiêu khoảng 50–60% thắng lần đầu theo mix), rồi chạy lại `npm run sim`.
- Nâng nhẹ độ khó L6–L9 (bớt given hoặc tăng ô Trung bình) để đường cong đi lên đều giữa hai level boss.
- Khi đổi level, giữ hai luật: không đi xoắn ốc từ L5, và chỉ N bắt buộc là given.
