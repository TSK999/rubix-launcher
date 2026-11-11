use crate::focus::button;
use crate::{Filter, Message, Modal, Model, Page, styles::*, visible_rows};
use iced::{
    Alignment, Element,
    Length::Fill,
    Theme,
    widget::{
        self, button as button_style, column, container, image, pick_list, row, scrollable, slider,
        space, stack, svg, text, text_editor, text_input,
    },
};
use rubix_core::{Accent, Game, LaunchTarget, Sort, format_playtime};
use std::collections::BTreeSet;
pub const ROW_HEIGHT: f32 = 266.0;

fn icon(page: Page) -> Element<'static, Message> {
    let path = match page {
        Page::Home => "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
        Page::Library => "M4 3h4v18H4zM11 3h4v18h-4zM18 4l3 1v16l-3-1z",
        Page::Discover => "m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z",
        Page::Mods => "M12 3 3 8v9l9 5 9-5V8ZM3 8l9 5 9-5M12 13v9M7 5l10 6",
        Page::Minecraft => "M3 7 12 2l9 5v10l-9 5-9-5ZM3 7l9 5 9-5M12 12v10",
        Page::Downloads => "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
        Page::Friends => {
            "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M19 8v6m-3-3h6"
        }
        Page::Messages => "M3 4h18v13H9l-6 4ZM7 8h10M7 12h7",
        Page::Clips => "M3 5h18v15H3ZM3 9h18M7 5l3 4m4-4 3 4m-7 4v4l4-2Z",
        Page::Passport => "M5 3h14v18H5ZM9 8h6m-6 4h6m-6 4h3",
        Page::Settings => {
            "m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3ZM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0"
        }
    };
    svg(svg::Handle::from_memory(format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a4a7b5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="{path}"/></svg>"##).into_bytes())).width(18).height(18).into()
}
fn secondary<'a>(label: &'a str, message: Message) -> crate::focus::ActionButton<'a> {
    button(label)
        .padding([10, 16])
        .on_press(message)
        .style(button_style::secondary)
}
fn heading<'a>(title: &'a str, subtitle: &'a str) -> Element<'a, Message> {
    column![text(title).size(30), text(subtitle).size(14).color(MUTED)]
        .spacing(7)
        .into()
}

pub fn view(model: &Model) -> Element<'_, Message> {
    let content = if model.selected_game().is_some() {
        detail(model)
    } else {
        match model.page {
            Page::Home => home(model),
            Page::Library => library(model),
            Page::Settings => settings(model),
            Page::Passport => passport(model),
            Page::Discover => discover(),
            _ => unavailable(model.page),
        }
    };
    let top = row![
        text_input("Search your games…", &model.query)
            .id("library-search")
            .on_input(Message::Query)
            .padding(12)
            .width(Fill),
        secondary(
            if model.busy { "Scanning…" } else { "Rescan" },
            Message::Rescan
        ),
        button("+ Add game")
            .padding([11, 17])
            .on_press_maybe((model.ready && !model.busy).then_some(Message::AddGame))
    ]
    .spacing(12)
    .align_y(Alignment::Center);
    let mut main = column![top].spacing(22);
    if let Some(notice) = &model.notice {
        main = main.push(
            container(
                row![
                    text(notice).size(13).width(Fill).color(if model.error {
                        iced::Color::from_rgb8(252, 145, 145)
                    } else {
                        TEXT
                    }),
                    button("Dismiss")
                        .on_press(Message::DismissNotice)
                        .style(button_style::text)
                ]
                .spacing(12)
                .align_y(Alignment::Center),
            )
            .padding(12)
            .width(Fill)
            .style(panel),
        );
    }
    main = main.push(content);
    let base = row![
        sidebar(model),
        container(main).padding(28).width(Fill).height(Fill)
    ]
    .height(Fill);
    if let Some(modal) = &model.modal {
        let backdrop = container(
            container(modal_view(model, modal))
                .max_width(630)
                .padding(26)
                .style(panel),
        )
        .center_x(Fill)
        .center_y(Fill)
        .width(Fill)
        .height(Fill)
        .style(|_| container::Style {
            background: Some(iced::Color::from_rgba(0.0, 0.0, 0.0, 0.78).into()),
            ..Default::default()
        });
        stack![crate::focus::inert(base), widget::opaque(backdrop)].into()
    } else {
        base.into()
    }
}
fn sidebar(model: &Model) -> Element<'_, Message> {
    let brand = row![
        container(text("R").size(25).color(model.accent()))
            .width(38)
            .height(38)
            .center_x(38)
            .center_y(38)
            .style(panel),
        column![
            text("RUBIX").size(22),
            text("LAUNCHER 2.0").size(9).color(MUTED)
        ]
        .spacing(2)
    ]
    .spacing(12)
    .align_y(Alignment::Center);
    let mut nav = column![
        brand,
        space().height(18),
        text("LIBRARY").size(10).color(MUTED)
    ]
    .spacing(7);
    for page in Page::ALL {
        if page == Page::Friends {
            nav = nav
                .push(space().height(14))
                .push(text("CONNECT").size(10).color(MUTED));
        }
        if page == Page::Settings {
            nav = nav.push(space().height(14));
        }
        let active = model.page == page && model.selected.is_none();
        let mut item = row![icon(page), text(page.label()).size(14).width(Fill)]
            .spacing(12)
            .align_y(Alignment::Center);
        if page == Page::Library {
            item = item.push(
                text(model.games.iter().filter(|g| !g.hidden).count())
                    .size(11)
                    .color(MUTED),
            );
        }
        nav = nav.push(
            button(item)
                .width(Fill)
                .padding([11, 12])
                .on_press(Message::Navigate(page))
                .style(move |t, s| crate::styles::nav(t, s, active)),
        );
    }
    let footer = column![
        text(&model.settings.display_name).size(14),
        text("Local profile").size(11).color(MUTED),
        space().height(9),
        text("2.0.0 alpha · native Rust").size(10).color(MUTED)
    ]
    .spacing(4);
    container(column![scrollable(nav).height(Fill), footer].spacing(20))
        .padding([25, 18])
        .width(226)
        .height(Fill)
        .style(|_| container::Style {
            background: Some(SURFACE.into()),
            border: iced::Border {
                color: BORDER,
                width: 1.0,
                ..Default::default()
            },
            ..Default::default()
        })
        .into()
}
fn home(model: &Model) -> Element<'_, Message> {
    let installed = model
        .games
        .iter()
        .filter(|g| g.installations.iter().any(|i| i.available))
        .count();
    let total: u64 = model.games.iter().map(|g| g.total_seconds).sum();
    let stat = |value: String, label: &'static str| -> Element<'_, Message> {
        container(column![text(value).size(27), text(label).size(12).color(MUTED)].spacing(6))
            .padding(22)
            .width(Fill)
            .style(panel)
            .into()
    };
    let mut content = column![
        heading("Your library", "Installed games, in one place."),
        row![
            stat(model.games.len().to_string(), "Games"),
            stat(installed.to_string(), "Installed"),
            stat(format_playtime(total), "Recorded playtime")
        ]
        .spacing(14)
    ]
    .spacing(25);
    if model.games.is_empty() {
        content = content.push(empty(
            "Ready when you are",
            "Add an executable or rescan your Steam and Epic libraries.",
            Some(("Add a game", Message::AddGame)),
        ));
    } else {
        content = content.push(row![
            text("Jump back in").size(20).width(Fill),
            button("View library")
                .on_press(Message::Navigate(Page::Library))
                .style(button_style::text)
        ]);
        let mut recent: Vec<_> = model.games.iter().filter(|g| !g.hidden).collect();
        rubix_library::sort_games(&mut recent, Sort::RecentlyPlayed);
        let columns = card_columns(model);
        let shown = recent.len().min(columns);
        let mut cards = row![].spacing(16);
        for game in recent.into_iter().take(columns) {
            cards = cards.push(card(model, game));
        }
        for _ in shown..columns {
            cards = cards.push(space().width(Fill));
        }
        content = content.push(cards);
        content=content.push(text("Playtime is measured for directly launched executables. Storefront launchers manage their own game processes.").size(12).color(MUTED));
    }
    scrollable(content).height(Fill).into()
}
fn card_columns(model: &Model) -> usize {
    (((model.width / model.settings.scale - 282.0) / 210.0).floor() as usize).clamp(1, 6)
}
fn library(model: &Model) -> Element<'_, Message> {
    let games = model.filtered_games();
    let columns = card_columns(model);
    let mut filters = row![].spacing(6);
    for f in [
        Filter::All,
        Filter::Favorites,
        Filter::Recent,
        Filter::Hidden,
    ] {
        filters = filters.push(
            button(text(f.label()).size(12))
                .padding([9, 12])
                .on_press(Message::Filter(f))
                .style(move |t, s| crate::styles::nav(t, s, model.filter == f)),
        );
    }
    let mut collection_buttons = row![
        button("All collections")
            .on_press(Message::Collection(None))
            .style(button_style::text)
    ]
    .spacing(6);
    let collections: BTreeSet<_> = model
        .games
        .iter()
        .flat_map(|g| g.collections.iter())
        .collect();
    for collection in collections {
        collection_buttons = collection_buttons.push(
            button(text(collection).size(12))
                .on_press(Message::Collection(Some(collection.clone())))
                .style(button_style::text),
        );
    }
    let title = row![
        text("Library").size(30).width(Fill),
        text(format!("{} games", games.len())).size(12).color(MUTED),
        pick_list(
            [Sort::Title, Sort::RecentlyPlayed, Sort::Playtime],
            Some(model.settings.sort),
            Message::Sort
        )
        .text_size(12)
    ]
    .spacing(12)
    .align_y(Alignment::Center);
    if games.is_empty() {
        return column![
            title,
            filters,
            empty(
                "No games here yet",
                "Try a different search or collection, or add a game.",
                Some(("Add a game", Message::AddGame))
            )
        ]
        .spacing(18)
        .into();
    }
    let range = visible_rows(
        games.len(),
        columns,
        model.scroll_y,
        model.height / model.settings.scale,
    );
    let total_rows = games.len().div_ceil(columns);
    let mut grid = column![space().height(range.start as f32 * ROW_HEIGHT)];
    for r in range.clone() {
        let mut cards = row![].spacing(16).height(ROW_HEIGHT);
        for game in games.iter().skip(r * columns).take(columns) {
            cards = cards.push(card(model, game));
        }
        for _ in (games.len() - r * columns).min(columns)..columns {
            cards = cards.push(space().width(Fill));
        }
        grid = grid.push(cards);
    }
    grid = grid.push(space().height((total_rows - range.end) as f32 * ROW_HEIGHT));
    column![
        title,
        filters,
        scrollable(collection_buttons).direction(scrollable::Direction::Horizontal(
            scrollable::Scrollbar::default()
        )),
        scrollable(grid)
            .id("game-grid")
            .on_scroll(|v| Message::Scrolled(v.absolute_offset().y))
            .height(Fill)
    ]
    .spacing(16)
    .into()
}
fn card<'a>(model: &'a Model, game: &'a Game) -> Element<'a, Message> {
    let artwork: Element<'a, Message> = if let Some(path) = &game.cover {
        image(image::Handle::from_path(path))
            .width(Fill)
            .height(156)
            .content_fit(iced::ContentFit::Cover)
            .into()
    } else {
        container(
            column![
                text(game.title.chars().next().unwrap_or('R').to_string())
                    .size(46)
                    .color(model.accent()),
                text("No cover selected").size(10).color(MUTED)
            ]
            .align_x(Alignment::Center)
            .spacing(8),
        )
        .width(Fill)
        .height(156)
        .center_x(Fill)
        .center_y(156)
        .style(|_| container::Style {
            background: Some(iced::Color::from_rgb(0.10, 0.10, 0.14).into()),
            ..Default::default()
        })
        .into()
    };
    let status = if model.running.contains(&game.id) {
        "Running"
    } else if game.installations.iter().any(|i| i.available) {
        "Ready to play"
    } else {
        "Missing installation"
    };
    let provider = game
        .installations
        .first()
        .map_or("Custom game", |i| i.provider.label());
    let title = if game.title.chars().count() > 25 {
        game.title.chars().take(23).chain("…".chars()).collect()
    } else {
        game.title.clone()
    };
    let body = column![
        artwork,
        container(
            column![
                text(title).size(15),
                text(provider).size(11).color(MUTED),
                row![
                    text(status).size(10).color(MUTED).width(Fill),
                    text(if game.favorite { "♥" } else { "" }).color(model.accent())
                ]
            ]
            .spacing(6)
        )
        .padding(13)
    ];
    button(body)
        .on_press(Message::Select(game.id.clone()))
        .padding(0)
        .height(249)
        .width(Fill)
        .style(|theme: &Theme, status| button_style::Style {
            border: iced::Border {
                color: if matches!(status, button_style::Status::Hovered) {
                    theme.palette().primary
                } else {
                    BORDER
                },
                width: 1.0,
                radius: 12.0.into(),
            },
            background: Some(SURFACE.into()),
            text_color: TEXT,
            ..Default::default()
        })
        .into()
}
fn detail(model: &Model) -> Element<'_, Message> {
    let game = model.selected_game().unwrap();
    let selected = model
        .launch_option
        .as_ref()
        .and_then(|id| game.installations.iter().find(|i| &i.id == id))
        .or_else(|| game.installations.iter().find(|i| i.available))
        .or_else(|| game.installations.first());
    let running = model.running.contains(&game.id);
    let mut options = column![text("Launch options").size(18)].spacing(10);
    for install in &game.installations {
        let active = selected.is_some_and(|s| s.id == install.id);
        let label = format!(
            "{}   {}",
            if active { "●" } else { "○" },
            install.provider.label()
        );
        options = options.push(
            button(text(label).size(13))
                .padding(10)
                .on_press(Message::LaunchOption(install.id.clone()))
                .style(button_style::secondary),
        );
    }
    let status = if running {
        "Running"
    } else if selected.is_some_and(|i| i.available) {
        "Ready to play"
    } else {
        "Missing installation"
    };
    let mut body = column![
        secondary("← Back", Message::Back),
        space().height(8),
        text(&game.title).size(36),
        text(status).size(13).color(model.accent()),
        row![
            button(if running { "Running" } else { "Play" })
                .padding([13, 36])
                .on_press_maybe(
                    (!running && !model.busy && selected.is_some_and(|i| i.available))
                        .then_some(Message::Launch(game.id.clone()))
                ),
            secondary(
                if game.favorite {
                    "♥ Favorited"
                } else {
                    "♡ Favorite"
                },
                Message::Favorite(game.id.clone())
            ),
            secondary("Edit", Message::EditMetadata)
        ]
        .spacing(10),
        text(format!(
            "Recorded playtime: {}",
            format_playtime(game.total_seconds)
        ))
        .size(14)
        .color(MUTED),
        options
    ]
    .spacing(18);
    if let Some(install) = selected {
        body = body.push(
            text(install.install_directory.to_string_lossy().into_owned())
                .size(12)
                .color(MUTED),
        );
        if !matches!(install.target, LaunchTarget::Executable { .. }) {
            body=body.push(text("Opens the official launcher. Playtime tracking for this provider is not available yet.").size(12).color(MUTED));
        }
    }
    if !game.collections.is_empty() {
        body = body.push(text(format!("Collections: {}", game.collections.join(", "))).size(13));
    }
    body = body.push(
        row![
            secondary(
                if game.hidden { "Unhide" } else { "Hide" },
                Message::Hide(game.id.clone())
            ),
            button("Remove from library")
                .on_press(Message::AskRemove(game.id.clone()))
                .style(button_style::text)
        ]
        .spacing(8),
    );
    scrollable(body).height(Fill).into()
}
fn provider<'a>(name: &'a str, info: &'a str, status: &'a str) -> Element<'a, Message> {
    container(
        row![
            column![text(name).size(16), text(info).size(12).color(MUTED)]
                .spacing(6)
                .width(Fill),
            text(status).size(11).color(MUTED)
        ]
        .align_y(Alignment::Center),
    )
    .padding(19)
    .width(Fill)
    .style(panel)
    .into()
}
fn discover<'a>() -> Element<'a, Message> {
    column![
        heading(
            "Discover installed games",
            "Read local installation records from your official launchers."
        ),
        provider("Steam", "Local libraries and app manifests", "Available"),
        provider("Epic Games", "Local installation manifests", "Available"),
        provider(
            "EA app",
            "Native adapter is not implemented in this build",
            "Unavailable"
        ),
        provider(
            "Xbox / PC Game Pass",
            "Windows package integration is not implemented yet",
            "Unavailable"
        ),
        provider(
            "Riot Games",
            "Official client integration is not implemented yet",
            "Unavailable"
        )
    ]
    .spacing(15)
    .into()
}
fn unavailable<'a>(page: Page) -> Element<'a, Message> {
    let detail = match page {
        Page::Mods => {
            "Mod installation, profiles and provider browsing are not available in this build."
        }
        Page::Minecraft => {
            "Microsoft sign-in, verified downloads and instance launching are not implemented yet."
        }
        Page::Friends | Page::Messages => {
            "Rubix cloud accounts and the social backend are not connected in this build."
        }
        Page::Downloads => "Managed downloads, pause/resume and recovery are not implemented yet.",
        Page::Clips => "Gameplay capture and clip management are not implemented yet.",
        _ => "This feature is not implemented yet.",
    };
    column![
        heading(page.label(), "Not available in this alpha"),
        empty(
            "Still being built",
            detail,
            Some(("Open library", Message::Navigate(Page::Library)))
        )
    ]
    .spacing(25)
    .into()
}
fn passport(model: &Model) -> Element<'_, Message> {
    let total: u64 = model.games.iter().map(|g| g.total_seconds).sum();
    column![heading("Rubix Passport","Your local player profile"),container(column![text(&model.settings.display_name).size(32),text("Local profile").color(model.accent()),text(format!("{} games · {} recorded",model.games.len(),format_playtime(total))).size(15),text("Cloud profiles, external achievements and friends are not connected in this build.").size(13).color(MUTED),secondary("Edit profile",Message::Navigate(Page::Settings))].spacing(18)).padding(28).width(Fill).style(panel)].spacing(25).into()
}
fn settings(model: &Model) -> Element<'_, Message> {
    let mut roots = column![
        text("Steam scan locations").size(17),
        text("Default Steam locations are checked automatically.")
            .size(12)
            .color(MUTED)
    ]
    .spacing(10);
    for (i, path) in model.settings.steam_roots.iter().enumerate() {
        roots = roots.push(
            row![
                text(path.to_string_lossy().into_owned())
                    .size(12)
                    .width(Fill),
                button("Remove")
                    .on_press(Message::RemoveRoot(true, i))
                    .style(button_style::text)
            ]
            .spacing(8),
        );
    }
    roots = roots
        .push(secondary("+ Add Steam folder", Message::AddSteamRoot))
        .push(space().height(10))
        .push(text("Epic manifest locations").size(17));
    for (i, path) in model.settings.epic_manifest_roots.iter().enumerate() {
        roots = roots.push(row![
            text(path.to_string_lossy().into_owned())
                .size(12)
                .width(Fill),
            button("Remove")
                .on_press(Message::RemoveRoot(false, i))
                .style(button_style::text)
        ]);
    }
    roots = roots.push(secondary("+ Add manifest folder", Message::AddEpicRoot));
    let body=column![heading("Settings","Changes are saved on this computer."),container(column![text("Local profile").size(18),row![text_input("Display name",&model.profile_name).on_input(Message::DisplayName).padding(10),secondary("Save name",Message::SaveProfile)].spacing(12),text("Appearance").size(18),row![text("Accent").width(Fill),pick_list([Accent::Purple,Accent::Blue,Accent::Amber],Some(model.settings.accent),Message::Accent)].align_y(Alignment::Center),row![text(format!("Interface scale: {:.0}%",model.settings.scale*100.0)).width(190),slider(0.8..=1.6,model.settings.scale,Message::Scale).step(0.05_f32)].spacing(20).align_y(Alignment::Center),secondary("Toggle fullscreen · F11",Message::Fullscreen)].spacing(20)).padding(23).width(Fill).style(panel),container(roots).padding(23).width(Fill).style(panel),container(column![text("Privacy & local data").size(18),text("This alpha makes no network requests and collects no telemetry. Locally installed games work without signing in.").size(13).color(MUTED),row![secondary("Open data folder",Message::OpenDataFolder),secondary("Check database",Message::Diagnostics)].spacing(12)].spacing(15)).padding(23).width(Fill).style(panel)].spacing(22);
    scrollable(body).height(Fill).into()
}
fn empty<'a>(
    title: &'a str,
    subtitle: &'a str,
    action: Option<(&'a str, Message)>,
) -> Element<'a, Message> {
    let mut body = column![text(title).size(23), text(subtitle).size(14).color(MUTED)]
        .spacing(14)
        .align_x(Alignment::Center);
    if let Some((label, msg)) = action {
        body = body.push(button(label).padding([11, 20]).on_press(msg));
    }
    container(body)
        .width(Fill)
        .padding([45, 30])
        .style(panel)
        .into()
}
fn modal_view<'a>(model: &'a Model, modal: &'a Modal) -> Element<'a, Message> {
    let body: Element<'a, Message> = match modal {
        Modal::AddGame => column![
            text("Add a game").size(25),
            text("Choose an executable already installed on your computer.").size(13).color(MUTED),
            text_input("Game name", &model.form.title).id("manual-title").on_input(Message::Title).padding(11),
            row![text_input("Executable", &model.form.executable).on_input(Message::Executable).padding(11), secondary("Browse", Message::PickExecutable)].spacing(8),
            row![text_input("Working folder (optional)", &model.form.directory).on_input(Message::WorkingDirectory).padding(11), secondary("Browse", Message::PickDirectory)].spacing(8),
            text("Launch arguments · one per line").size(12).color(MUTED),
            text_editor(&model.form.arguments).on_action(Message::Arguments).height(90),
            row![secondary(if model.form.cover.is_some() { "Change cover" } else { "Choose cover" }, Message::PickCover), space().width(Fill), secondary("Cancel", Message::DismissModal), button("Add game").padding([10,18]).on_press_maybe((!model.busy && !model.form.title.trim().is_empty() && !model.form.executable.trim().is_empty()).then_some(Message::SaveGame))].spacing(9)
        ].spacing(14).into(),
        Modal::Remove(id) => column![
            text("Remove from library?").size(25),
            text("This removes the library entry and its recorded playtime. Your installed game files stay in place.").size(14).color(MUTED),
            row![secondary("Cancel",Message::DismissModal),button("Remove").on_press_maybe((!model.busy).then_some(Message::ConfirmRemove(id.clone()))).padding([10,18]).style(button_style::danger)].spacing(12)
        ].spacing(20).into(),
        Modal::Metadata { title, collections } => column![
            text("Game details").size(25),
            text_input("Game name",title).on_input(Message::MetadataTitle).padding(11),
            text("Collections · separate names with commas").size(12).color(MUTED),
            text_input("For example: Racing, With friends",collections).on_input(Message::Collections).padding(11),
            row![secondary("Cancel",Message::DismissModal),button("Save").padding([10,18]).on_press_maybe((!model.busy).then_some(Message::SaveMetadata))].spacing(12)
        ].spacing(17).into(),
    };
    if model.error
        && let Some(notice) = &model.notice
    {
        column![
            text(notice)
                .size(13)
                .color(iced::Color::from_rgb8(252, 145, 145)),
            body
        ]
        .spacing(14)
        .into()
    } else {
        body
    }
}
