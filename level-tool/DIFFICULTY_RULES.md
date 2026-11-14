# Rule độ khó — Hexablow

> Tài liệu cho GD / level designer. Phần **định nghĩa ô Dễ / Trung bình / Khó** lấy đúng theo yêu cầu gốc;
> phần **bậc level (tier)** là đề xuất của tool để có cái so sánh — GD chỉnh trong thẻ **Luật** của tool hoặc trong `js/rules.js` (`HB.DEFAULT_RULES`).
> Code thực thi rule: [`js/rules.js`](js/rules.js). Báo cáo áp rule (và bot giả lập) lên 15 level hiện có: [`ANALYSIS_15_LEVELS.md`](ANALYSIS_15_LEVELS.md).
>
> Rule này không chỉ dùng trong tool: **gợi ý tự động trong game** (`src/hint.js`) chỉ vào ô khay có ít vị trí nhất theo đúng cách đếm strict ở mục 2,
> và **bot giả lập** (`sim/`) dùng nó làm mức "nhìn là thấy" (depth 0) của người chơi.

---

## 1. Thuật ngữ

| Từ | Nghĩa |
|---|---|
| **Lưới / grid** | Bản đồ hex. Mỗi ô lưới là *trống*, *đã có số*, hoặc *bị chắn* (nước / ngoài bản đồ). |
| **Cơ chế mở rộng** | Số bí ẩn ("?"), cổng đôi, ô khóa — xem mục 10. Chúng đổi cách tính mốc / liền kề nhưng không đổi định nghĩa Dễ / TB / Khó. |
| **Given** | Ô số cho sẵn trên lưới, cố định. |
| **Ô khay / tile** | Một mảnh trong khay (list giải): 1, 2 hoặc 3 số, **giữ nguyên hình dạng, không xoay**. Mảnh 2–3 số được cắt theo *vị trí*, nên có thể chứa số không liên tiếp (vd `2+14`). |
| **Mốc / anchor** | Một số đang nằm trên lưới mà liền kề (n−1 hoặc n+1) với một số của ô khay. Ô khay `5` có mốc nếu `4` hoặc `6` đang trên lưới. |
| **Vị trí kéo vào được** | Một cách đặt *cả ô khay* lên lưới sao cho tạo được cặp liền kề thoả mãn với một mốc (xem mục 2). **Chưa xét đúng/sai.** |

---

## 2. Vị trí kéo vào được (candidate)

Với một ô khay và các số hiện có trên lưới:

1. Với mỗi số `m` trong ô khay có mốc `v` (`v = m−1` hoặc `m+1`, đang trên lưới): lấy 6 ô quanh mốc `v` làm chỗ đặt `m`. Vì ô khay giữ nguyên hình, mỗi chỗ đặt `m` quy ra đúng **một** vị trí đặt cả ô.
2. Gộp các vị trí trùng nhau (từ nhiều mốc / nhiều số) thành **một**.
3. **Loại** vị trí nếu (đúng 3 trường hợp trong yêu cầu gốc):
   - **Bị che** — ô cần đặt đã có số khác (given hoặc ô đã đặt);
   - **Bị chắn** — ô cần đặt là tường / nước / ngoài bản đồ;
   - **Hình dạng** — ô khay 2–3 số có phần *khác* rơi vào chỗ bị che / chắn.
4. **Chế độ đếm** (`tile.anchorMode`):
   - **`strict` (mặc định)** — vị trí còn phải chạm *mọi* số n−1 / n+1 đã có trên lưới (không chỉ một mốc). Ví dụ ô `2` kẹp giữa given `1` và `3`: chỉ đặt được ở ô chạm cả `1` lẫn `3` (tối đa 2 chỗ), chứ không phải mọi ô quanh `1` *hoặc* `3`.
   - **`loose`** — chỉ cần chạm *một* mốc. Đúng nghĩa đen hơn của câu "lắp được một cặp liền kề", nhưng làm ô kẹp giữa hai given bị tính khó oan.
   - Cả hai chế độ đều **luôn chứa vị trí đúng** nếu ô có mốc (lời giải thật luôn chạm đủ hàng xóm của nó).
5. Số vị trí còn lại = **`count`**.

> Rule **không** xét suy luận sâu hơn (vd khoảng cách tới given xa, ô trống bị cô lập). Đó là việc của bộ giải; rule chỉ đo cái người chơi *nhìn thấy ngay* khi cầm ô lên.

### Ví dụ thật (Level 1: given `1,3,6,7`, khay `2`, `4`, `5`)

| Ô | Mốc trên lưới | Vị trí kéo vào được | Phân loại |
|---|---|---|---|
| `2` | `1`, `3` | chỉ ô chạm cả `1` và `3` → **1** | Dễ |
| `4` | `3` (5 chưa có) | 2 ô trống quanh `3` → **2** | Trung bình |
| `5` | `6` (4 chưa có) | 1 ô trống quanh `6` → **1** | Dễ |

(Ở chế độ `loose` ô `2` thành 2 vị trí → Trung bình.)

---

## 3. Phân loại ô khay

| Loại | Điều kiện (`tile`) | Ý nghĩa |
|---|---|---|
| **Dễ** | `count ≤ easyMax` (= **1**) | Chỉ có 1 chỗ kéo vào được, và đó cũng chính là chỗ đúng. |
| **Trung bình** | `easyMax < count ≤ mediumMax` (= **2 – 3**) | Phải chọn giữa 2–3 chỗ. |
| **Khó** | `count > mediumMax` (= **> 3**) | Nhiều hơn 3 chỗ. |
| **Mồ côi** *(bổ sung)* | không có mốc nào trên lưới (`count = 0`) | Chưa có số n±1 nào để bám — chỉ suy ra được từ các ô khác. Tính vào loại `tile.orphanClass` (mặc định **Khó**) và báo riêng. |

Tool hiển thị từng ô với màu xanh (Dễ) / vàng (TB) / đỏ (Khó) / xám (mồ côi); bấm một ô trong bảng để thấy **mọi vị trí kéo vào được** (viền nét đứt, vị trí đúng viền xanh liền) và **lý do các vị trí bị loại** (che / chắn / hình / chặt).

---

## 4. Độ khó của cả level

Tính trên **toàn bộ khay ở trạng thái ban đầu** (chỉ có given trên lưới) — đây là rule chính.

| Chỉ số | Công thức | Dùng để |
|---|---|---|
| `easyPct`, `mediumPct`, `hardPct` | số ô mỗi loại / tổng ô khay (mồ côi tính theo `orphanClass`) | mô tả "mặt" của level |
| `orphanPct` | số ô mồ côi / tổng ô khay | giới hạn ô không có mốc |
| `size3Pct` | số ô 3 số / tổng ô khay | giới hạn độ phức tạp hình dạng |
| **`index`** (Chỉ số độ khó) | `(1·Dễ + 2·TB + 3·Khó) / tổng ô` (trọng số `weights`) | một con số **1.00 – 3.00** để so level với nhau |
| `avgCandidates`, `maxCandidates` | trung bình / lớn nhất của `count` (ô có mốc) | tham khảo |
| `givenPct` | given / tổng ô | tham khảo (không bị ràng buộc) |

### 4.1 Bậc level (đề xuất — **GD chỉnh**)

Mỗi bậc là dải `[min, max]` cho từng chỉ số; level "đạt rule" khi mọi chỉ số nằm trong dải của bậc chứa id của nó.

| Bậc | Level | Dễ | Trung bình | Khó | Mồ côi | Ô ba | Index |
|---|---|---|---|---|---|---|---|
| T1 Làm quen | 1 – 3 | 60 – 100% | 0 – 40% | 0 – 10% | 0 – 10% | 0% | 1.00 – 1.40 |
| T2 Khởi động | 4 – 7 | 35 – 80% | 15 – 50% | 0 – 25% | 0 – 25% | 0 – 25% | 1.20 – 1.80 |
| T3 Trung bình | 8 – 11 | 20 – 55% | 20 – 50% | 10 – 40% | 0 – 35% | 0 – 40% | 1.60 – 2.20 |
| T4 Khó | 12+ | 10 – 40% | 20 – 50% | 25 – 55% | 0 – 45% | 5 – 60% | 1.90 – 2.50 |

Ý tưởng đường cong: **Dễ giảm dần, Khó tăng dần, Index đi lên** theo bậc; level được gắn nhãn `hard` nên nằm ở nửa trên của bậc.
Các dải này là *giả thuyết ban đầu* chưa qua playtest — hãy chỉnh theo cảm giác chơi rồi để tool kiểm lại 15 level.

### 4.2 Chỉ số động (play-through) — chỉ để tham khảo

Tool mô phỏng người chơi tỉnh táo: luôn đặt ô **ít vị trí nhất** vào đúng chỗ, rồi đếm lại (các ô đã đặt thành mốc mới, ô còn lại dần có mốc).
Báo: dãy `count` theo từng bước, **đỉnh** (`peak`, bước khó nhất bắt buộc) và số lần **kẹt** (không ô nào có mốc).
`peak = 1` nghĩa là lúc nào cũng có sẵn một ô "Dễ" để đặt — level không bao giờ ép người chơi cân nhắc giữa nhiều chỗ.
Chưa ràng buộc trong tier; xem mục 6.

---

## 5. Ràng buộc để level hợp lệ (tool kiểm cùng rule)

- Đường đi 1 → N phủ **mọi ô chơi đúng một lần**, hai số liên tiếp luôn kề nhau.
- Mỗi ô khay là 1–3 ô **kề nhau**, không chứa given.
- **Giải được bằng suy luận** (bộ giải propagate: cung nhất quán + "chỉ còn một chỗ" + hình dạng ô khay) — không cần đoán. Level chỉ giải được bằng thử-sai, đa nghiệm hoặc vô nghiệm bị đánh dấu ✗.
- **N bắt buộc là given**; 1 có thể nằm trong khay. Từ level 5 đường giải không được xoắn ốc (xem mục 9).

---

## 6. Điều cần GD quyết

1. **`strict` hay `loose`?** Mặc định `strict` vì `loose` cộng dồn các ô quanh *cả hai* given nên ô kẹp giữa hai given bị tính nhiều vị trí (dễ thành Trung bình / Khó) trong khi thực tế nó thuộc loại dễ nhất. Đổi ở thẻ **Luật** hoặc `tile.anchorMode`.
2. **Ô mồ côi** tính là Khó (mặc định) hay loại khỏi thống kê? (`tile.orphanClass`: `hard` / `medium` / `easy`.)
3. **Ngưỡng** `easyMax = 1`, `mediumMax = 3` (theo yêu cầu gốc) — có thể đổi.
4. **Dải bậc level** ở 4.1 và cách chia bậc theo id level.
5. **Có thêm ràng buộc động** không? Ví dụ "từ T3 trở đi `peak ≥ 2`" để mỗi level có ít nhất một lúc phải cân nhắc.
6. Mảnh **không xoay** (đúng GDD hiện tại). Nếu sau này cho xoay, số vị trí kéo vào được sẽ nhân lên và ngưỡng phải tính lại.

---

## 7. Tham số cấu hình (`HB.DEFAULT_RULES`)

```jsonc
{
  "tile":   { "easyMax": 1, "mediumMax": 3, "anchorMode": "strict", "orphanClass": "hard" },
  "weights":{ "easy": 1, "medium": 2, "hard": 3 },
  "tiers": [
    { "name": "T1 Làm quen", "from": 1, "to": 3,
      "easy": [0.60, 1], "medium": [0, 0.40], "hard": [0, 0.10],
      "orphan": [0, 0.10], "index": [1.00, 1.40], "size3": [0, 0] }
    // ...
  ]
}
```

## 8. Tạo level theo độ khó (thẻ "Tạo level theo độ khó")

Đầu vào: bản đồ hiện tại + **mục tiêu** `{Dễ%, TB%, Khó%}` (lấy trung điểm của một bậc hoặc kéo tay) + sai số, cỡ ô tối đa, dải % given, % mồ côi tối đa, cờ *giữ đường đi / given / cách cắt*.

1. Tìm đường Hamiltonian phủ bản đồ (DFS ngẫu nhiên + Warnsdorff, ưu tiên ít rẽ) — hoặc dùng đường GD đã vẽ.
2. Khởi tạo given (cách đều, luôn có 1 và N) và cách cắt ô; thêm given cho tới khi giải được bằng suy luận.
3. Mô phỏng ủ nhiệt: thêm / bớt / dời given, ghép / tách ô khay; **chỉ nhận trạng thái vẫn giải được**; điểm = tổng lệch của 3 tỉ lệ + phạt vi phạm ràng buộc.
4. Trả tối đa 5 kết quả "trúng mục tiêu" (mỗi tỉ lệ trong sai số); nếu không có thì trả kết quả gần nhất. GD bấm **Áp dụng** rồi chỉnh tay tiếp.

---

## 9. Luật đường đi & given (bắt buộc từ level 5)

1. **Không xoắn ốc.** Đường giải không được đi dần từ vòng ngoài vào tâm (hay ngược lại) — quá dễ đoán, level nào cũng giống nhau.
   Tool đo bằng `HB.spiralScore` / `HB.isSpiral` (`js/model.js`): |tương quan(bước, vòng)| > 0.45 hoặc số lần đổi hướng vòng < N/6 ⇒ xoắn ốc.
   `compile` cảnh báo, `autoPath`/`generate` tự loại đường xoắn ốc. Kiểm tra / sinh lại: `node level-tool/regen-paths.mjs [fromId=5] [--check]`.
2. **Chỉ số cuối N bắt buộc là given.** Số 1 *không* bắt buộc — có thể nằm trong khay; generator (`freeStart`, mặc định bật) tự quyết ngẫu nhiên, miễn đạt độ khó của bậc.

---

## 10. Cơ chế mở rộng (từ level 7) và ảnh hưởng tới rule

Ngoài hồ nước còn ba cơ chế (mỗi level tối đa **2** trong ba cơ chế mới (số bí ẩn / cổng / khóa), hồ nước không tính; xem GDD §6.1). Rule tĩnh và bộ giải xử lý như sau:

| Cơ chế | Trong định nghĩa "vị trí kéo vào được" (mục 2) | Trong bộ giải (mục 5) |
|---|---|---|
| **Số bí ẩn** (`mystery`) | Ô vẫn *che* (bị chiếm) nhưng số của nó **không phải mốc** — ô khay `n±1` của nó không có mốc từ ô này. Trong play-through, ô "?" mở ra (thành mốc) ngay khi một ô khay chứa `n−1` hoặc `n+1` được đặt. | Số bí ẩn là *số ẩn nằm ở một trong các ô "?"* (suy ra bằng loại trừ: là số không có trong khay và không phải given hiện); các số khác không được dùng ô "?". Đường đi vẫn phải giải được. |
| **Cổng đôi** (`portals`) | Đầu kia của cổng được thêm vào 6 ô quanh mốc làm chỗ đặt, và điều kiện *strict* coi hai đầu cổng là **liền kề**. | Hai đầu cổng là một cạnh của đồ thị; khoảng cách cắt tỉa tính trên đồ thị (nước và cổng đều tính). Đường giải **bắt buộc đi qua** mọi cổng. |
| **Ô khóa** (`locks`) | **Không tính.** Khóa chỉ đổi thứ tự đặt (ô chưa mở không nhận mảnh), không đổi số vị trí kéo vào được. | Không ảnh hưởng. `compile` kiểm `need` ≤ số ô giải được khi chưa mở khóa. |

Các chỉ số mục 4 vẫn dùng nguyên: `givenPct` đếm cả given bị che; ô khay không bao giờ chứa số bí ẩn (nó là given). Luật bổ sung cho level có cơ chế:
- Số cuối N **không** được là số bí ẩn; mỗi "?" phải có ít nhất một ô khay liền kề (n−1 hoặc n+1) để có thể mở.
- Mỗi cổng phải được lời giải dùng (n và n+1 nằm ở hai đầu) và hai đầu không liền kề.
- Ô khóa không phải given; cơ chế chỉ xuất hiện từ level mở khóa của nó (số bí ẩn 7, cổng 9, ô khóa 11).
- Mỗi cơ chế được dùng lại ở 3 level liên tiếp ngay sau level mở khóa (số bí ẩn 8–10, cổng 10–12, ô khóa 12–14); chỗ hai cơ chế mới chồng nhau thì bỏ hồ nước. Bảng xếp nằm trong `PLAN` của `regen-mechanics.mjs`; việc xếp lại không đổi phễu độ khó (tỉ lệ Dễ / TB / Khó và bot thắng lần đầu mỗi level giữ gần như cũ).
- Kiểm bằng `node level-tool/check-mechanics.mjs`.
