# Hexablow Bot Simulator

Giả lập người chơi bằng bot để đo **độ khó từng level** và **kinh tế** (xu, booster, revive, cosmetic, IAP) mà không cần playtest thật.
Chạy bằng Node, không cần build, dùng chung luật ô khay / bộ giải với `level-tool/` và đọc trực tiếp `src/levels.json`, `src/economy.json`, `src/shop.json`, `src/cosmetics.json`, `src/collection.json`.

```bash
npm run sim                                    # lab + career, mọi persona (~1 phút)
node sim/run.mjs --plays 200 --bots 300        # nhiều mẫu hơn = số ổn định hơn
node sim/run.mjs --only lab                    # chỉ đo độ khó (nhanh)
node sim/run.mjs --only career --days 30       # chỉ kinh tế, 30 ngày
node sim/run.mjs --persona newbie,casual       # chọn persona
node sim/run.mjs --levels path/to/levels.json  # thử bộ level khác trước khi chép vào src/
node sim/run.mjs --seed 7                      # đổi seed (cùng seed = cùng kết quả)
```
Kết quả: bảng trên console + `sim/out/report.html` (biểu đồ, mở bằng trình duyệt) + `sim/out/report.json` (dữ liệu thô). `sim/out/` không commit.

> Cơ chế level 7+ (số bí ẩn, cổng đôi, ô khóa): `board.mjs` đã xử lý — "?" chiếm ô và không là mốc cho tới khi mở, cổng là cạnh liền kề, mảnh sau ổ khóa chờ đủ số ô đã giải. Bộ suy luận `domains()` vẫn chưa biết rằng số "?" nằm trong tập số bị thiếu (bot không tận dụng phép loại trừ).

## 1. Bot chơi một lượt thế nào (`bot.mjs`, `board.mjs`)

Luật giống `src/game.js`: mảnh giữ nguyên hình, thả vào chỗ nào cũng được miễn mọi ô trống; sai chỗ thì −1 tim (trừ lượt đầu level 1–2), 0 tim thì thua; sao = số tim còn lại (tối thiểu 1).
Thứ tự khay: level 1 cố định, level 2 tăng dần, từ level 3 xáo ngẫu nhiên mỗi lượt.

Mỗi lượt đi, bot:

1. **Liếc** `scan` mảnh đầu khay với độ sâu suy luận `depth`:
   - `depth 0` = "nhìn là thấy": đúng rule ô khay của level tool (vị trí móc vào số n±1 đang có, chế độ strict). Mảnh mồ côi bị bỏ qua.
   - `depth d ≥ 1` = d vòng suy luận: khoảng cách tới số gần nhất, n phải kề n−1/n+1, ô chỉ còn một số nhận được, hình mảnh — cùng logic `level-tool/js/solver.js` nhưng dừng sau d vòng. Độ sâu đủ lớn = giải hoàn hảo.
2. Không mảnh nào chỉ còn 1 chỗ → với xác suất `persist` mỗi bước thì **nghĩ thêm**: nhìn cả khay, rồi tăng độ sâu tới `maxDepth` (mỗi bước tốn thêm `time.think` giây).
3. Còn đúng 1 chỗ → đặt (nhưng **lỡ tay** sai với xác suất `slip`). Còn nhiều chỗ → **bí**: có thể dùng booster, không thì **đoán** một chỗ. Đặt sai thì nhớ chỗ đó với xác suất `memory`.

Booster: *Reveal* lộ số của một ô trống ngẫu nhiên (mảnh chứa số đó thành chắc chắn), *Find* chạm một ô đang phân vân → mảnh của ô đó bay vào, *Picker* đặt đúng mảnh đang bí. Level mở khoá booster (4/6/8) tặng đủ 2 cái và bắt dùng 1, như bài hướng dẫn trong game.

Thời gian ước tính mỗi nước = `base + perPiece × số mảnh nhìn + perCand × log2(1 + số chỗ)` + `think` mỗi lần nghĩ thêm + `mistake` mỗi lần sai.

## 2. Persona (`personas.json` — GD chỉnh trực tiếp, hoặc bằng [config tool](../config-tool/README.md))

| Persona | Tỉ trọng | Suy luận | Ghi chú |
|---|---|---|---|
| Người mới `newbie` | 30% | depth 0→1, ít kiên nhẫn, hay quên | dễ nản |
| Phổ thông `casual` | 40% | depth 0→2 | mua booster / xem ads khi còn 1 tim |
| Kỹ tính `thinker` | 20% | depth 1→4, nhớ hết | để dành xu mua cosmetic |
| Cao thủ `expert` | 5% | depth 2→8, nhìn cả khay | không dùng booster |
| Thích booster `spender` | 5% | như casual | dùng booster mỗi khi bí, hay trả tiền |

Các nhóm tham số:
- `skill`: `depth`, `maxDepth`, `persist`, `scan`, `slip`, `memory`.
- `time`: giây cho từng thao tác (xem trên).
- `boosters`: `when` (`never` / `lastHeart` / `stuck`), `minCands` (bí từ bao nhiêu chỗ), `prefer` (thứ tự), `buyProb` (mua bằng xu khi hết), `adProb` (xem ads lấy 1 cái), `maxPerAttempt`, `maxAdsPerDay`.
- `revive`: `prob`, `minFilled` (chỉ revive khi đã điền ≥ x% bảng), `max` lần/level. Giá lấy từ `economy.costs.revive`.
- `shop`: `visitProb` (ghé shop → nhận quà xu hằng ngày, xem cosmetic), `cosmeticProb`, `cosmeticReserve` (xu chừa lại), `iap.starter` / `iap.coinPack` (xác suất trả tiền thật, xét tối đa 1 lần/ngày khi thiếu).
- `career`: `days`, `playDayProb`, `sessionsPerDay`, `minutesPerSession`, `quitAfterFails` (thua liền x lượt thì nghỉ phiên), `replayProb` (chơi lại level chưa 3★), `churnAt` (ngưỡng nản → bỏ game), `dailyClaimProb`.

**Nản / bỏ game:** mỗi lần thua level *mới* +1, mỗi lần thắng −1; vượt ngưỡng `churnAt × (0.6–1.4)` thì bot bỏ game. Thua khi chơi lại không tính.

## 3. Hai chế độ đo

**Lab — độ khó thuần.** Mỗi persona chơi mỗi level `--plays` lần từ trạng thái sạch: không booster, không revive, 3 tim cả ở level 1–2; thua thì chơi lại (tối đa 10 lượt). Đo: tỉ lệ thắng lần đầu, số lượt tới khi thắng, số lần sai, % 3★, thời gian tới khi thắng. "Mix" = trung bình theo tỉ trọng persona.
Cờ tự động: *spike* (tỉ lệ thua lần đầu tăng > 25 điểm so với level trước), level `hard` mà dễ (< 15% thua), level thường mà > 40% thua, thời gian median > 5 phút.

**Career — kinh tế + phễu.** `--bots` bot mỗi persona chơi theo ngày với kinh tế thật: xu khởi đầu, thưởng thắng (lần đầu / chơi lại ×0.3), daily reward 7 ngày + rương streak 7/14/21/28, quà shop 24h, thưởng bộ sưu tập, giá booster, revive tăng dần, cosmetic, IAP. Đo: tỉ lệ tới / qua từng level, thua mỗi lượt, booster & revive mỗi lần qua, bỏ game tại level nào, xu theo ngày, nguồn / tiêu xu, cosmetic đầu tiên (ngày, level), ads, doanh thu mỗi bot.

## 4. Giới hạn — đọc số cho đúng

- Bot là **mô hình**, không phải người thật: dùng để **so sánh tương đối** (level này khó hơn level kia, đổi giá này thì xu dồn nhanh hơn), không phải để dự đoán con số tuyệt đối. Nên hiệu chỉnh tham số persona bằng dữ liệu playtest / analytics khi có.
- Kinh tế được **viết lại** theo `src/progress.js` + `src/main.js` (đọc cùng JSON). Khi đổi *công thức* (không chỉ số trong JSON) trong game thì sửa cả `sim/career.mjs`.
- Chưa mô phỏng: interstitial, Daily Challenge, combo/praise, cảm xúc theo theme.
