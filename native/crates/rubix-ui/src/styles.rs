use iced::{
    Background, Border, Color, Theme,
    theme::Palette,
    widget::{button, container},
};
use rubix_core::Accent;
pub const BACKGROUND: Color = Color::from_rgb(0.043, 0.047, 0.062);
pub const SURFACE: Color = Color::from_rgb(0.075, 0.080, 0.098);
pub const BORDER: Color = Color::from_rgb(0.15, 0.16, 0.19);
pub const MUTED: Color = Color::from_rgb(0.58, 0.60, 0.66);
pub const TEXT: Color = Color::from_rgb(0.92, 0.93, 0.96);
pub fn theme(accent: Accent) -> Theme {
    let primary = match accent {
        Accent::Purple => Color::from_rgb8(174, 91, 246),
        Accent::Blue => Color::from_rgb8(94, 150, 255),
        Accent::Amber => Color::from_rgb8(237, 177, 76),
    };
    Theme::custom(
        "Rubix",
        Palette {
            background: BACKGROUND,
            text: TEXT,
            primary,
            ..Palette::DARK
        },
    )
}
pub fn panel(_: &Theme) -> container::Style {
    container::Style {
        background: Some(SURFACE.into()),
        border: Border {
            color: BORDER,
            width: 1.0,
            radius: 14.0.into(),
        },
        ..Default::default()
    }
}
pub fn nav(theme: &Theme, status: button::Status, active: bool) -> button::Style {
    let hover = matches!(status, button::Status::Hovered | button::Status::Pressed);
    let primary = theme.palette().primary;
    button::Style {
        background: (active || hover).then_some(Background::Color(if active {
            Color { a: 0.16, ..primary }
        } else {
            Color::from_rgb(0.11, 0.115, 0.14)
        })),
        text_color: if active {
            primary
        } else if hover {
            TEXT
        } else {
            MUTED
        },
        border: Border {
            color: if active {
                Color { a: 0.3, ..primary }
            } else {
                Color::TRANSPARENT
            },
            width: 1.0,
            radius: 9.0.into(),
        },
        ..Default::default()
    }
}
