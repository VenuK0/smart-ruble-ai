import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon, Circle, Rectangle
from matplotlib import font_manager

plt.rcParams["font.family"] = "DejaVu Sans"
NAVY, INK, RED = "#1E3A8A", "#0F172A", "#B91C1C"
FS = 15.5   # pt: около 22 px при 100 dpi


class Canvas:
    def __init__(self, w, h):
        self.fig = plt.figure(figsize=(w, h), dpi=100)
        self.ax = self.fig.add_axes([0, 0, 1, 1])
        self.ax.set_xlim(0, w); self.ax.set_ylim(0, h); self.ax.axis("off")
        self.w, self.h = w, h
        self.n = {}

    def lane_v(self, x0, x1, y0, y1, name, color, hh=0.5):
        self.ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, fc=color, ec="#94A3B8", lw=1.2, zorder=0))
        self.ax.add_patch(Rectangle((x0, y1 - hh), x1 - x0, hh, fc="white", ec="#94A3B8", lw=1.2, zorder=1, alpha=0.9))
        self.ax.text((x0 + x1) / 2, y1 - hh / 2, name, ha="center", va="center", fontsize=FS - 1.5, fontweight="bold", color=INK, zorder=2)

    def lane_h(self, x0, x1, y0, y1, name, color, hw=1.7):
        self.ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, fc=color, ec="#94A3B8", lw=1.2, zorder=0))
        self.ax.add_patch(Rectangle((x0, y0), hw, y1 - y0, fc="white", ec="#94A3B8", lw=1.2, zorder=1, alpha=0.9))
        self.ax.text(x0 + hw / 2, (y0 + y1) / 2, name, ha="center", va="center", fontsize=FS - 2, fontweight="bold", color=INK, zorder=2, rotation=0)

    def box(self, key, cx, cy, w, h, text, ec=NAVY, fc="white"):
        self.ax.add_patch(FancyBboxPatch((cx - w / 2, cy - h / 2), w, h, boxstyle="round,pad=0,rounding_size=0.12", fc=fc, ec=ec, lw=2, zorder=3))
        self.ax.text(cx, cy, text, ha="center", va="center", fontsize=FS, color=INK, zorder=4, linespacing=1.15)
        self.n[key] = (cx, cy, w, h)

    def diamond(self, key, cx, cy, w, h, text):
        self.ax.add_patch(Polygon([(cx, cy + h / 2), (cx + w / 2, cy), (cx, cy - h / 2), (cx - w / 2, cy)], fc="white", ec=NAVY, lw=2, zorder=3))
        self.ax.text(cx, cy, text, ha="center", va="center", fontsize=FS - 1.5, color=INK, zorder=4, linespacing=1.1)
        self.n[key] = (cx, cy, w, h)

    def dot(self, key, cx, cy, r=0.11, end=False):
        if end:
            self.ax.add_patch(Circle((cx, cy), r + 0.05, fc="white", ec=INK, lw=2, zorder=3))
        self.ax.add_patch(Circle((cx, cy), r, fc=INK, ec=INK, zorder=4))
        self.n[key] = (cx, cy, 2 * r, 2 * r)

    def pt(self, key, side):
        cx, cy, w, h = self.n[key]
        return {"t": (cx, cy + h / 2), "b": (cx, cy - h / 2), "l": (cx - w / 2, cy), "r": (cx + w / 2, cy)}[side]

    def arrow(self, pts, label=None, color=NAVY, lpos=0, ldx=0.1, ldy=0.1, lha="left"):
        xs, ys = zip(*pts)
        self.ax.plot(xs[:-1] + (xs[-1],), ys[:-1] + (ys[-1],), color=color, lw=2.2, zorder=2, solid_joinstyle="round")
        (x1, y1), (x2, y2) = pts[-2], pts[-1]
        self.ax.annotate("", xy=(x2, y2), xytext=(x1, y1), arrowprops=dict(arrowstyle="-|>", color=color, lw=2.2, mutation_scale=18), zorder=5)
        if label:
            (a, b), (c, d) = pts[lpos], pts[lpos + 1]
            self.ax.text((a + c) / 2 + ldx, (b + d) / 2 + ldy, label, fontsize=FS - 2.5, color=color, ha=lha, va="bottom", zorder=6,
                         bbox=dict(fc="white", ec="none", pad=1.5, alpha=0.85))

    def vh(self, a, b, ymid=None, **kw):
        """от низа a вниз, затем по горизонтали, затем вниз к верху b"""
        p, q = self.pt(a, "b"), self.pt(b, "t")
        ym = ymid if ymid is not None else (p[1] + q[1]) / 2
        pts = [p, (p[0], ym), (q[0], ym), q] if abs(p[0] - q[0]) > 1e-6 else [p, q]
        self.arrow(pts, **kw)

    def save(self, path):
        self.fig.savefig(path, dpi=100, facecolor="white")
        plt.close(self.fig)


# ---------------- TO BE ----------------
def to_be(path):
    W, H = 16.6, 8.8
    c = Canvas(W, H)
    lw = W / 4
    names = ["Грантополучатель", "SmartRubleAI", "Платформа цифрового рубля", "Служба финконтроля"]
    cols = ["#F1F5F9", "#DBEAFE", "#DCFCE7", "#FEF3C7"]
    for i in range(4):
        c.lane_v(i * lw, (i + 1) * lw, 0, H, names[i], cols[i])
    X = [lw * (i + 0.5) for i in range(4)]
    bw, bh = 3.5, 0.62
    c.dot("s", X[0], 7.95, 0.1)
    c.box("n1", X[0], 7.4, bw, bh, "Загрузка сметы гранта")
    c.box("n2", X[1], 6.6, bw, bh, "Извлечение статей\nи лимитов сметы")
    c.box("n3", X[2], 5.8, bw, bh, "Контракт из шаблона,\nзачисление средств")
    c.box("n4", X[0], 5.0, bw, bh, "Оплата цифровым рублём,\nкасса передаёт корзину")
    c.box("n5", X[1], 4.2, bw, bh, "Классификация позиций\n(категория, уверенность)")
    c.diamond("d", X[1], 3.2, 2.6, 0.9, "Вердикт\nпо позиции?")
    c.box("n6", X[2], 1.95, bw, bh, "Контракт исполняет\nплатёж")
    c.box("n7", X[3], 1.95, bw, bh, "Ручная проверка\nспорной позиции")
    c.box("n8", X[0], 1.95, bw, bh, "Оплата личными\nсредствами", ec=RED)
    c.box("n9", X[1], 0.95, bw, bh, "Журнал решений,\nфоновый антифрод")
    c.box("n10", X[3], 0.95, bw, bh, "Алерт и проверка")
    c.dot("e", X[1], 0.2, 0.08, end=True)
    c.arrow([c.pt("s", "b"), c.pt("n1", "t")])
    c.vh("n1", "n2"); c.vh("n2", "n3"); c.vh("n3", "n4"); c.vh("n4", "n5")
    c.arrow([c.pt("n5", "b"), c.pt("d", "t")])
    r = c.pt("d", "r"); t6 = c.pt("n6", "t")
    c.arrow([r, (t6[0], r[1]), t6], "Одобрить", ldx=0.1, ldy=0.05)
    l = c.pt("d", "l"); t8 = c.pt("n8", "t")
    c.arrow([l, (t8[0], l[1]), t8], "Отказать", color=RED, ldx=-0.1, ldy=0.05, lha="right")
    b = c.pt("d", "b"); t7 = c.pt("n7", "t")
    c.arrow([b, (b[0], 2.5), (t7[0], 2.5), t7], "На проверку", lpos=1, ldx=0.5, ldy=0.05, lha="left")
    j = c.pt("n9", "t")
    for k in ("n6", "n8", "n7"):
        p = c.pt(k, "b")
        c.arrow([p, (p[0], 1.45), (j[0], 1.45), j] if k != "n7" else [p, (p[0], 1.45), (j[0] + 0.0, 1.45)], color=NAVY) if k != "n7" else c.ax.plot([p[0], p[0], j[0]], [p[1], 1.45, 1.45], color=NAVY, lw=2.2, zorder=2)
    c.arrow([c.pt("n9", "r"), c.pt("n10", "l")], "подозрит. продавец", ldx=0, ldy=0.05, lha="center")
    c.arrow([c.pt("n9", "b"), c.pt("e", "t")])
    c.save(path)


if __name__ == "__main__":
    to_be("/home/claude/smart-ruble-ai/docs/uml/to_be_activity.png")


def as_is(path):
    W, H = 16.6, 5.0
    c = Canvas(W, H)
    c.lane_h(0, W, 3.0, 5.0, "Гранто-\nполучатель", "#F1F5F9", 1.7)
    c.lane_h(0, W, 0, 3.0, "Бухгалтерия\nвуза", "#FEF3C7", 1.7)
    bw, bh = 2.3, 0.8
    y1, y2 = 4.0, 1.5
    c.dot("s", 2.3, y1, 0.1)
    c.box("a1", 3.8, y1, bw, bh, "Покупка,\nполучение чека")
    c.box("a2", 6.3, y1, bw, bh, "Сбор чеков\nи документов")
    c.box("a3", 8.8, y1, bw, bh, "Отчёт\nв Excel")
    c.box("b1", 8.8, y2, bw, bh, "Приём чеков\nи сметы")
    c.box("b2", 11.3, y2, 2.4, bh, "Ручная сверка\nсо сметой")
    c.diamond("d", 13.5, y2, 1.9, 1.3, "Всё по\nсмете?")
    c.box("ok", 15.5, 2.45, 1.9, bh, "Закрытие\nотчёта")
    c.box("bad", 15.5, 0.55, 1.9, 0.8, "НЕЦЕЛЕВОЙ\nРАСХОД", ec=RED, fc="#FEF2F2")
    c.arrow([c.pt("s", "r"), c.pt("a1", "l")])
    c.arrow([c.pt("a1", "r"), c.pt("a2", "l")])
    c.arrow([c.pt("a2", "r"), c.pt("a3", "l")])
    c.arrow([c.pt("a3", "b"), c.pt("b1", "t")])
    c.arrow([c.pt("b1", "r"), c.pt("b2", "l")])
    c.arrow([c.pt("b2", "r"), c.pt("d", "l")])
    t = c.pt("d", "t"); l = c.pt("ok", "l")
    c.arrow([t, (t[0], l[1]), l], "Да", lpos=0, ldx=0.1, ldy=0.0)
    b = c.pt("d", "b"); l2 = c.pt("bad", "l")
    c.arrow([b, (b[0], l2[1]), l2], "Нет", color=RED, lpos=0, ldx=0.1, ldy=-0.3)
    c.ax.text(12.4, 0.35, "Деньги уже у продавца", fontsize=FS - 2.5, color=RED, ha="right")
    c.save(path)


if __name__ == "__main__":
    d = "/home/claude/smart-ruble-ai/docs/uml/"
    to_be(d + "to_be_activity.png"); as_is(d + "as_is_activity.png")
