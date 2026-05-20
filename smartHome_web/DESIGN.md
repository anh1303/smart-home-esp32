# DESIGN.md — Smart Home Dashboard

> Hướng dẫn thiết kế dành cho AI coding agents (Codex, Cursor, Claude Code...).
> Đây là nguồn chân lý duy nhất về màu sắc, typography, spacing và component.
> **Luôn ưu tiên file này hơn quyết định mặc định của bạn.**

---

## 1. Triết lý thiết kế

Ứng dụng Smart Home cần truyền đạt: **tin cậy, hiện đại, dễ kiểm soát**.

- **Tông màu**: Tối giản + accent xanh lá tươi (teal/green) — gợi cảm giác năng lượng sạch, công nghệ thân thiện
- **Cảm giác**: Chuyên nghiệp nhưng không lạnh lùng. Giống Linear, Vercel nhưng ấm hơn
- **TRÁNH**: Purple gradient, glassmorphism lòe loẹt, neon glow, shadow nặng
- **ĐẠT ĐƯỢC**: Cards gọn, spacing thoáng, icon rõ, trạng thái on/off cực kỳ tường minh

---

## 2. Color Palette

### Primary Colors
```css
--color-brand-primary: #1D9E75;      /* Teal xanh lá — CTA, active state, accent */
--color-brand-light:   #E1F5EE;      /* Teal nhạt — chip on, badge bg */
--color-brand-dark:    #0F6E56;      /* Teal đậm — hover, icon trong card active */
```

### Neutral (background & surface)
```css
--color-bg-page:       #F4F4F1;      /* Nền trang chính — xám ấm nhẹ */
--color-bg-card:       #FFFFFF;      /* Nền card — trắng sạch */
--color-bg-elevated:   #F9F9F7;      /* Surface thứ cấp — input, chip */
--color-border:        rgba(0,0,0,0.08);   /* Border mặc định */
--color-border-hover:  rgba(0,0,0,0.15);   /* Border khi hover */
```

### Text
```css
--color-text-primary:   #1A1A18;     /* Heading, số liệu chính */
--color-text-secondary: #6B6B68;     /* Label, metadata */
--color-text-tertiary:  #9E9E9A;     /* Placeholder, hint */
```

### Semantic
```css
--color-success: #1D9E75;    /* Online, bật, OK */
--color-warning: #EF9F27;    /* Cảnh báo, pin yếu */
--color-danger:  #E24B4A;    /* Offline, lỗi, cảnh báo khẩn */
--color-info:    #378ADD;    /* Thông tin, nhiệt độ, nước */
```

### Dark Mode — chỉ cần override các biến này
```css
[data-theme="dark"] {
  --color-bg-page:      #111110;
  --color-bg-card:      #1C1C1A;
  --color-bg-elevated:  #252523;
  --color-border:       rgba(255,255,255,0.08);
  --color-text-primary: #F0EFEA;
  --color-text-secondary:#9E9E9A;
}
```

---

## 3. Typography

**KHÔNG dùng**: Inter, Roboto, Arial, system-ui mặc định

### Font stack
```css
/* Display / Heading lớn */
--font-display: 'DM Sans', 'Plus Jakarta Sans', sans-serif;

/* Body text */
--font-body: 'IBM Plex Sans', 'DM Sans', sans-serif;

/* Số liệu, sensor data */
--font-mono: 'IBM Plex Mono', 'Fira Code', monospace;
```

### Google Fonts import
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Scale
| Token | Size | Weight | Dùng cho |
|---|---|---|---|
| `--text-2xl` | 28px | 500 | Số liệu lớn (nhiệt độ, kWh) |
| `--text-xl`  | 22px | 500 | Tiêu đề trang |
| `--text-lg`  | 16px | 500 | Heading card, tên phòng |
| `--text-md`  | 14px | 400 | Body chính |
| `--text-sm`  | 13px | 400 | Metadata, label |
| `--text-xs`  | 11px | 400 | Badge, chip nhỏ |

---

## 4. Spacing & Layout

```css
/* Spacing scale */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;

/* Border radius */
--radius-sm: 6px;    /* chip, badge */
--radius-md: 10px;   /* button, input */
--radius-lg: 14px;   /* card */
--radius-xl: 20px;   /* modal, panel lớn */
--radius-full: 9999px; /* toggle, pill */

/* Layout */
--sidebar-width: 240px;
--topbar-height: 60px;
--content-max-width: 1280px;
--card-padding: 16px 20px;
--page-padding: 24px;
```

### Grid system
```css
/* Dashboard grid */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

/* Rooms grid */
.rooms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
```

---

## 5. Components

### Card
```css
.card {
  background: var(--color-bg-card);
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--card-padding);
  transition: border-color 0.15s;
}
.card:hover { border-color: var(--color-border-hover); }
.card.active { border: 1.5px solid var(--color-brand-primary); }
```

### Toggle (On/Off)
```css
.toggle {
  width: 40px; height: 24px;
  border-radius: var(--radius-full);
  border: none; cursor: pointer;
  transition: background 0.2s;
  position: relative;
}
.toggle[data-on="true"]  { background: var(--color-brand-primary); }
.toggle[data-on="false"] { background: var(--color-border-hover); }
.toggle::after {
  content: ''; width: 18px; height: 18px;
  border-radius: 50%; background: #fff;
  position: absolute; top: 3px;
  transition: left 0.2s;
}
.toggle[data-on="true"]::after  { left: 19px; }
.toggle[data-on="false"]::after { left: 3px; }
```

### Chip / Badge
```css
.chip { font-size: 11px; padding: 3px 9px; border-radius: var(--radius-full); }
.chip-default { background: var(--color-bg-elevated); color: var(--color-text-secondary); }
.chip-on      { background: var(--color-brand-light); color: var(--color-brand-dark); }
.chip-warning { background: #FAEEDA; color: #854F0B; }
.chip-danger  { background: #FCEBEB; color: #A32D2D; }
```

### Stat card
```css
.stat-card {
  background: var(--color-bg-card);
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
}
.stat-card .label { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 4px; }
.stat-card .value { font-size: 26px; font-weight: 500; font-family: var(--font-mono); }
.stat-card .delta { font-size: 12px; margin-top: 2px; }
.delta-pos { color: var(--color-success); }
.delta-neg { color: var(--color-danger); }
```

### Room icon
```css
.room-icon {
  width: 38px; height: 38px;
  border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
}
/* Màu theo loại phòng */
.room-living  { background: #E1F5EE; color: #0F6E56; }
.room-bedroom { background: #E6F1FB; color: #185FA5; }
.room-kitchen { background: #FAEEDA; color: #854F0B; }
.room-bathroom{ background: #EEEDFE; color: #534AB7; }
.room-garage  { background: #F1EFE8; color: #5F5E5A; }
```

### Button
```css
.btn {
  padding: 8px 16px; border-radius: var(--radius-md);
  font-size: 14px; font-weight: 500; cursor: pointer;
  border: 0.5px solid var(--color-border-hover);
  background: transparent; color: var(--color-text-primary);
  transition: background 0.15s, transform 0.1s;
}
.btn:hover   { background: var(--color-bg-elevated); }
.btn:active  { transform: scale(0.98); }
.btn-primary {
  background: var(--color-brand-primary);
  color: #fff; border-color: transparent;
}
.btn-primary:hover { background: var(--color-brand-dark); }
```

### Slider (nhiệt độ, độ sáng)
```css
input[type=range] {
  -webkit-appearance: none; width: 100%; height: 4px;
  border-radius: 4px; background: var(--color-bg-elevated);
  outline: none;
}
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 18px; height: 18px;
  border-radius: 50%; background: var(--color-brand-primary);
  cursor: pointer; border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
}
```

---

## 6. Icons

Dùng **Tabler Icons** (outline style) — free, SVG/webfont.

```html
<!-- CDN webfont -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">

<!-- Sử dụng -->
<i class="ti ti-smart-home"></i>
<i class="ti ti-bulb"></i>
<i class="ti ti-temperature"></i>
<i class="ti ti-bolt"></i>
<i class="ti ti-camera"></i>
<i class="ti ti-lock"></i>
<i class="ti ti-wind"></i>
<i class="ti ti-droplet"></i>
```

Icon mapping theo phòng/thiết bị:
| Thiết bị | Icon |
|---|---|
| Đèn | `ti-bulb` |
| Điều hoà | `ti-air-conditioning` |
| TV | `ti-device-tv` |
| Camera | `ti-camera` |
| Khóa cửa | `ti-lock` |
| Cửa sổ/Rèm | `ti-blinds` |
| Nhiệt độ | `ti-temperature` |
| Độ ẩm | `ti-droplet` |
| Điện | `ti-bolt` |
| WiFi | `ti-wifi` |
| Quạt | `ti-propeller` |

---

## 7. Motion & Animation

```css
/* Transition mặc định */
.card, .btn, .toggle, .room-icon {
  transition: all 0.15s ease;
}

/* Fade in khi load trang */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-in {
  animation: fadeUp 0.3s ease forwards;
}

/* Stagger cho danh sách card */
.card:nth-child(1) { animation-delay: 0ms; }
.card:nth-child(2) { animation-delay: 60ms; }
.card:nth-child(3) { animation-delay: 120ms; }
.card:nth-child(4) { animation-delay: 180ms; }

/* Pulse cho thiết bị đang hoạt động */
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
.status-dot.active { animation: pulse-dot 2s ease infinite; }
```

**Quy tắc motion:**
- Chỉ animate khi có ý nghĩa (toggle on/off, load lần đầu, cảnh báo)
- Duration: 150ms cho hover/toggle, 300ms cho card load, 200ms cho transition trang
- Easing: `ease` hoặc `cubic-bezier(0.16,1,0.3,1)` — không dùng `linear`

---

## 8. Layout tổng thể

```
┌─────────────────────────────────────────┐
│  Sidebar (240px)  │  Main content        │
│                   │  ┌─ Topbar ─────────┐│
│  Logo             │  │ Title + Controls  ││
│  ─────────────    │  └──────────────────┘│
│  Nav items        │  ┌─ Stat cards ─────┐│
│  - Dashboard      │  │ [4 metrics]       ││
│  - Phòng          │  └──────────────────┘│
│  - Thiết bị       │  ┌─ Main grid ──────┐│
│  - Camera         │  │ Rooms | Side panel││
│  - Cài đặt        │  └──────────────────┘│
│  ─────────────    │  ┌─ Bottom row ─────┐│
│  Nhiệt độ widget  │  │ Temp | Camera     ││
│  Năng lượng       │  └──────────────────┘│
└─────────────────────────────────────────┘
```

### Responsive breakpoints
```css
/* Mobile */
@media (max-width: 768px) {
  .sidebar { display: none; }  /* hoặc bottom nav */
  .stats   { grid-template-columns: 1fr 1fr; }
  .main-grid { grid-template-columns: 1fr; }
}

/* Tablet */
@media (max-width: 1024px) {
  .sidebar { width: 64px; }  /* collapsed — chỉ hiện icon */
  .stats   { grid-template-columns: repeat(2, 1fr); }
}
```

---

## 9. Trạng thái thiết bị

Mọi thiết bị đều có 4 trạng thái — render nhất quán:

| Trạng thái | Màu | Label |
|---|---|---|
| **Online + Bật** | Teal green `#1D9E75` | chip xanh, toggle xanh |
| **Online + Tắt** | Gray `#9E9E9A` | chip gray, toggle gray |
| **Offline** | Red `#E24B4A` | badge đỏ, icon mờ 40% |
| **Cảnh báo** | Amber `#EF9F27` | badge vàng, icon nhấp nháy |

---

## 10. Do's & Don'ts

### ✅ Làm
- Dùng `font-family: var(--font-mono)` cho mọi số liệu cảm biến (nhiệt độ, kWh, %)
- Card có trạng thái active dùng `border: 1.5px solid var(--color-brand-primary)` — không đổi màu nền
- Toggle luôn label rõ: aria-label="bật đèn phòng khách"
- Spacing giữa các card: `gap: 10px` — không ít hơn
- Icon trong room-icon: **luôn outline**, không dùng filled

### ❌ Không làm
- Không dùng `box-shadow` nặng (chỉ dùng `0 1px 3px rgba(0,0,0,0.06)` nếu cần)
- Không dùng gradient trên button hay card
- Không hardcode màu hex trực tiếp — luôn qua CSS variable
- Không dùng `font-weight: 700` — tối đa `600` cho heading
- Không dùng animation liên tục trừ `status-dot.active`
- Không để text dưới 11px

---

## 11. Ví dụ prompt cho Codex

```
Dùng DESIGN.md này làm nguồn thiết kế duy nhất.
Tạo [component/trang] với:
- Màu sắc đúng theo color palette section 2
- Font DM Sans + IBM Plex Mono như section 3
- Spacing và border-radius đúng section 4
- Component styles đúng section 5
- Icon từ Tabler Icons section 6
- Trạng thái thiết bị đúng section 9
Ưu tiên teal (#1D9E75) làm accent chính.
```

---

*DESIGN.md này được tạo cho Smart Home App · Cập nhật lần cuối: 05/2026*
