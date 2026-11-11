use crate::services::{self, ActiveSession, PollResult, Started, error_message};
use iced::{
    Element, Subscription, Task,
    keyboard::{self, Key, key::Named},
    widget, window,
};
use rubix_core::{DataPaths, Game, Settings};
use rubix_database::Database;
use rubix_platform_windows::{DesktopIntegration, NativeDesktop};
use rubix_ui::{GameForm, Message as Ui, Modal, Model, Page};
use std::{path::PathBuf, time::Duration};

#[derive(Debug)]
pub enum Message {
    Ui(Ui),
    Opened(Result<(Database, Vec<Game>), String>),
    Refreshed(Result<rubix_library::Refresh, String>),
    Mutation(Result<Vec<Game>, String>),
    Started(Result<Started, String>),
    Polled(Result<PollResult, String>),
    Picked(Pick, Option<PathBuf>),
    SettingsSaved(Result<(), String>),
    Notice(Result<String, String>),
    Window(window::Id, window::Event),
    Key(Key, keyboard::Modifiers),
    Tick,
    Shutdown(Result<(), String>),
}
#[derive(Debug, Clone, Copy)]
pub enum Pick {
    Executable,
    Directory,
    Cover,
    SteamRoot,
    EpicRoot,
}
pub struct Application {
    ui: Model,
    paths: DataPaths,
    db: Option<Database>,
    active: Vec<ActiveSession>,
    saving: bool,
    settings_dirty: bool,
    polling: bool,
    closing: Option<window::Id>,
    shutting_down: bool,
    fullscreen: bool,
    safe_mode: bool,
}

pub fn run(
    paths: DataPaths,
    settings: Settings,
    warning: Option<String>,
    safe_mode: bool,
) -> iced::Result {
    let position = match (settings.window_x, settings.window_y) {
        (Some(x), Some(y)) => window::Position::Specific(iced::Point::new(x, y)),
        _ => window::Position::Centered,
    };
    let window_settings = window::Settings {
        size: iced::Size::new(settings.window_width, settings.window_height),
        min_size: Some(iced::Size::new(960.0, 640.0)),
        position,
        exit_on_close_request: false,
        icon: image::load_from_memory(include_bytes!("../../../assets/rubix.ico"))
            .ok()
            .and_then(|image| {
                let rgba = image.into_rgba8();
                let (width, height) = rgba.dimensions();
                window::icon::from_rgba(rgba.into_raw(), width, height).ok()
            }),
        ..Default::default()
    };
    iced::application(
        move || Application::boot(paths.clone(), settings.clone(), warning.clone(), safe_mode),
        Application::update,
        Application::view,
    )
    .title("RUBIX Launcher 2.0 · Alpha")
    .window(window_settings)
    .theme(|app: &Application| rubix_ui::theme(app.ui.settings.accent))
    .scale_factor(|app: &Application| app.ui.settings.scale)
    .subscription(Application::subscription)
    .run()
}
impl Application {
    fn boot(
        paths: DataPaths,
        settings: Settings,
        warning: Option<String>,
        safe_mode: bool,
    ) -> (Self, Task<Message>) {
        let mut app = Self {
            ui: Model::new(settings),
            paths,
            db: None,
            active: Vec::new(),
            saving: false,
            settings_dirty: false,
            polling: false,
            closing: None,
            shutting_down: false,
            fullscreen: false,
            safe_mode,
        };
        if let Some(w) = warning {
            app.ui.notify(w, true);
        }
        app.ui.busy = true;
        let task = app.open_database();
        (app, task)
    }
    fn open_database(&self) -> Task<Message> {
        let path = self.paths.database.clone();
        Task::perform(
            async move {
                let db = Database::open(&path).await?;
                let games = db.games().await?;
                Ok((db, games))
            },
            |r: anyhow::Result<_>| Message::Opened(r.map_err(error_message)),
        )
    }
    fn view(&self) -> Element<'_, Message> {
        rubix_ui::view(&self.ui).map(Message::Ui)
    }
    fn subscription(&self) -> Subscription<Message> {
        let mut subs = vec![
            window::events().map(|(id, e)| Message::Window(id, e)),
            iced::event::listen_with(|event, status, _| match event {
                iced::Event::Keyboard(keyboard::Event::KeyPressed { key, modifiers, .. })
                    if status == iced::event::Status::Ignored =>
                {
                    Some(Message::Key(key, modifiers))
                }
                _ => None,
            }),
        ];
        if !self.active.is_empty() {
            subs.push(iced::time::every(Duration::from_secs(3)).map(|_| Message::Tick));
        }
        Subscription::batch(subs)
    }
    fn persist(&mut self) -> Task<Message> {
        self.settings_dirty = true;
        if self.saving {
            return Task::none();
        }
        self.settings_dirty = false;
        self.saving = true;
        Task::perform(
            services::save_settings(self.ui.settings.clone(), self.paths.settings.clone()),
            |r| Message::SettingsSaved(r.map_err(error_message)),
        )
    }
    fn rescan(&mut self) -> Task<Message> {
        if self.ui.busy {
            return Task::none();
        }
        self.ui.busy = true;
        let Some(db) = self.db.clone() else {
            return self.open_database();
        };
        Task::perform(
            rubix_library::refresh_owned(db, self.ui.settings.clone(), self.paths.artwork.clone()),
            |r| Message::Refreshed(r.map_err(error_message)),
        )
    }
    fn reset_scroll(&mut self) -> Task<Message> {
        self.ui.scroll_y = 0.0;
        widget::operation::snap_to("game-grid", widget::operation::RelativeOffset::START)
    }
    fn pick(&self, kind: Pick) -> Task<Message> {
        Task::perform(
            async move {
                let dialog = rfd::AsyncFileDialog::new().set_title(match kind {
                    Pick::Executable => "Choose game executable",
                    Pick::Cover => "Choose game cover",
                    Pick::Directory => "Choose working folder",
                    Pick::SteamRoot => "Choose Steam library folder",
                    Pick::EpicRoot => "Choose Epic manifest folder",
                });
                let result = match kind {
                    Pick::Executable => {
                        #[cfg(windows)]
                        let dialog = dialog.add_filter("Windows executable", &["exe"]);
                        dialog.pick_file().await
                    }
                    Pick::Cover => {
                        dialog
                            .add_filter("Game artwork", &["png", "jpg", "jpeg", "webp"])
                            .pick_file()
                            .await
                    }
                    _ => dialog.pick_folder().await,
                };
                result.map(|f| f.path().to_path_buf())
            },
            move |p| Message::Picked(kind, p),
        )
    }
    fn maybe_shutdown(&mut self) -> Task<Message> {
        if self.closing.is_some()
            && !self.shutting_down
            && !self.ui.busy
            && !self.saving
            && !self.polling
        {
            self.shutting_down = true;
            return Task::perform(
                services::shutdown(
                    self.db.clone(),
                    self.active.clone(),
                    self.ui.settings.clone(),
                    self.paths.settings.clone(),
                ),
                |r| Message::Shutdown(r.map_err(error_message)),
            );
        }
        Task::none()
    }
    fn update(&mut self, message: Message) -> Task<Message> {
        let task = match message {
            Message::Ui(message) => self.update_ui(message),
            Message::Opened(result) => {
                self.ui.busy = false;
                match result {
                    Ok((db, games)) => {
                        self.db = Some(db);
                        self.ui.games = games;
                        self.ui.ready = true;
                        if !self.safe_mode {
                            return self.rescan();
                        }
                    }
                    Err(e) => self.ui.notify(e, true),
                }
                Task::none()
            }
            Message::Refreshed(result) => {
                self.ui.busy = false;
                match result {
                    Ok(report) => {
                        self.ui.games = report.games;
                        let summary = format!(
                            "Found {} installed games across {} library locations.{}",
                            report.discovered,
                            report.checked_roots,
                            if report.warnings.is_empty() {
                                String::new()
                            } else {
                                format!(" {}", report.warnings.join(" · "))
                            }
                        );
                        self.ui.notify(summary, !report.warnings.is_empty());
                    }
                    Err(e) => self.ui.notify(e, true),
                }
                Task::none()
            }
            Message::Mutation(result) => {
                self.ui.busy = false;
                match result {
                    Ok(games) => {
                        self.ui.games = games;
                        self.ui.modal = None;
                        self.ui.form = GameForm::default();
                        if self.ui.selected_game().is_none() {
                            self.ui.selected = None;
                        }
                        self.ui.notify("Library updated", false);
                    }
                    Err(e) => self.ui.notify(e, true),
                }
                Task::none()
            }
            Message::Started(result) => {
                self.ui.busy = false;
                match result {
                    Ok(started) => {
                        if let Some(session) = started.session {
                            self.ui.running.insert(started.game_id);
                            self.active.push(session);
                            self.ui.notify("Game is running", false);
                        } else {
                            self.ui.notify("Launch request sent to the official launcher. Provider playtime is not tracked in this alpha.",false);
                        }
                    }
                    Err(e) => self.ui.notify(format!("Launch failed: {e}"), true),
                }
                Task::none()
            }
            Message::Polled(result) => {
                self.polling = false;
                match result {
                    Ok(report) => {
                        for (id, status) in report.finished {
                            self.active.retain(|s| s.game_id != id);
                            self.ui.running.remove(&id);
                            tracing::info!("{status}");
                            self.ui.notify(status, false);
                        }
                        self.ui.games = report.games;
                    }
                    Err(e) => self.ui.notify(e, true),
                }
                Task::none()
            }
            Message::Picked(kind, path) => {
                if let Some(path) = path {
                    match kind {
                        Pick::Executable => {
                            self.ui.form.executable = path.to_string_lossy().into_owned();
                            if self.ui.form.title.is_empty() {
                                self.ui.form.title = path
                                    .file_stem()
                                    .unwrap_or_default()
                                    .to_string_lossy()
                                    .into_owned();
                            }
                        }
                        Pick::Directory => {
                            self.ui.form.directory = path.to_string_lossy().into_owned()
                        }
                        Pick::Cover => self.ui.form.cover = Some(path),
                        Pick::SteamRoot => {
                            if !self.ui.settings.steam_roots.contains(&path) {
                                self.ui.settings.steam_roots.push(path);
                            }
                            return self.persist();
                        }
                        Pick::EpicRoot => {
                            if !self.ui.settings.epic_manifest_roots.contains(&path) {
                                self.ui.settings.epic_manifest_roots.push(path);
                            }
                            return self.persist();
                        }
                    }
                }
                Task::none()
            }
            Message::SettingsSaved(result) => {
                self.saving = false;
                if let Err(e) = result {
                    self.ui.notify(e, true);
                }
                if self.settings_dirty {
                    return self.persist();
                }
                Task::none()
            }
            Message::Notice(result) => {
                match result {
                    Ok(s) => self.ui.notify(s, false),
                    Err(e) => self.ui.notify(e, true),
                }
                Task::none()
            }
            Message::Window(id, event) => {
                match event {
                    window::Event::Resized(size) => {
                        self.ui.width = size.width;
                        self.ui.height = size.height;
                        if !self.fullscreen {
                            self.ui.settings.window_width = size.width.max(640.0);
                            self.ui.settings.window_height = size.height.max(480.0);
                            return self.persist();
                        }
                    }
                    window::Event::Moved(pos) => {
                        if !self.fullscreen {
                            self.ui.settings.window_x = Some(pos.x);
                            self.ui.settings.window_y = Some(pos.y);
                            return self.persist();
                        }
                    }
                    window::Event::CloseRequested => self.closing = Some(id),
                    _ => {}
                }
                Task::none()
            }
            Message::Key(key, mods) => match key.as_ref() {
                Key::Named(Named::Tab) => {
                    if mods.shift() {
                        widget::operation::focus_previous()
                    } else {
                        widget::operation::focus_next()
                    }
                }
                Key::Named(Named::Escape) => {
                    if self.ui.modal.is_some() && !self.ui.busy {
                        self.ui.modal = None;
                    } else {
                        self.ui.selected = None;
                    }
                    Task::none()
                }
                Key::Named(Named::F11) => self.update_ui(Ui::Fullscreen),
                Key::Character("f") if mods.command() => widget::operation::focus("library-search"),
                Key::Character("n") if mods.command() => self.update_ui(Ui::AddGame),
                _ => Task::none(),
            },
            Message::Tick => {
                if self.polling || self.shutting_down {
                    Task::none()
                } else if let Some(db) = self.db.clone() {
                    self.polling = true;
                    Task::perform(services::poll(db, self.active.clone()), |r| {
                        Message::Polled(r.map_err(error_message))
                    })
                } else {
                    Task::none()
                }
            }
            Message::Shutdown(result) => match result {
                Ok(()) => {
                    if let Some(id) = self.closing.take() {
                        return window::close(id);
                    }
                    Task::none()
                }
                Err(e) => {
                    self.shutting_down = false;
                    self.closing = None;
                    self.ui
                        .notify(format!("Could not save before closing: {e}"), true);
                    Task::none()
                }
            },
        };
        Task::batch([task, self.maybe_shutdown()])
    }
    fn update_ui(&mut self, message: Ui) -> Task<Message> {
        match message {
            Ui::Navigate(page) => {
                self.ui.page = page;
                self.ui.selected = None;
                self.ui.settings.last_page = page.label().into();
                return Task::batch([self.persist(), self.reset_scroll()]);
            }
            Ui::Query(query) => {
                self.ui.query = query;
                self.ui.page = Page::Library;
                self.ui.selected = None;
                return self.reset_scroll();
            }
            Ui::Filter(filter) => {
                self.ui.filter = filter;
                return self.reset_scroll();
            }
            Ui::Collection(c) => {
                self.ui.collection = c;
                return self.reset_scroll();
            }
            Ui::Sort(sort) => {
                self.ui.settings.sort = sort;
                return Task::batch([self.persist(), self.reset_scroll()]);
            }
            Ui::Scrolled(y) => self.ui.scroll_y = y,
            Ui::Rescan => return self.rescan(),
            Ui::AddGame => {
                if self.ui.ready && !self.ui.busy {
                    self.ui.form = GameForm::default();
                    self.ui.modal = Some(Modal::AddGame);
                    self.ui.notice = None;
                    return widget::operation::focus("manual-title");
                }
            }
            Ui::DismissModal => {
                if !self.ui.busy {
                    self.ui.modal = None;
                }
            }
            Ui::Title(s) => self.ui.form.title = s,
            Ui::Executable(s) => self.ui.form.executable = s,
            Ui::WorkingDirectory(s) => self.ui.form.directory = s,
            Ui::Arguments(action) => self.ui.form.arguments.perform(action),
            Ui::PickExecutable => return self.pick(Pick::Executable),
            Ui::PickDirectory => return self.pick(Pick::Directory),
            Ui::PickCover => return self.pick(Pick::Cover),
            Ui::SaveGame => {
                if self.ui.busy {
                    return Task::none();
                }
                if let Some(db) = self.db.clone() {
                    self.ui.busy = true;
                    let paths = self.paths.clone();
                    let title = self.ui.form.title.clone();
                    let path = PathBuf::from(self.ui.form.executable.trim());
                    let args = self
                        .ui
                        .form
                        .arguments
                        .text()
                        .lines()
                        .filter(|s| !s.is_empty())
                        .map(str::to_owned)
                        .collect();
                    let directory = (!self.ui.form.directory.trim().is_empty())
                        .then(|| PathBuf::from(self.ui.form.directory.trim()));
                    let cover = self.ui.form.cover.clone();
                    return Task::perform(
                        async move {
                            rubix_library::add_manual(
                                &db, &paths, title, path, args, directory, cover,
                            )
                            .await?;
                            db.games().await
                        },
                        |r| Message::Mutation(r.map_err(error_message)),
                    );
                }
            }
            Ui::Select(id) => {
                self.ui.selected = Some(id);
                self.ui.launch_option = None;
            }
            Ui::Back => self.ui.selected = None,
            Ui::LaunchOption(id) => self.ui.launch_option = Some(id),
            Ui::Launch(id) => {
                if self.ui.busy || self.ui.running.contains(&id) {
                    return Task::none();
                }
                if let (Some(db), Some(game)) =
                    (self.db.clone(), self.ui.games.iter().find(|g| g.id == id))
                {
                    let install = self
                        .ui
                        .launch_option
                        .as_ref()
                        .and_then(|selected| game.installations.iter().find(|i| &i.id == selected))
                        .or_else(|| game.installations.iter().find(|i| i.available));
                    if let Some(install) = install {
                        self.ui.busy = true;
                        return Task::perform(
                            services::start(db, id, install.target.clone()),
                            |r| Message::Started(r.map_err(error_message)),
                        );
                    }
                }
            }
            Ui::Favorite(ref id) | Ui::Hide(ref id) => {
                let id = id.clone();
                if self.ui.busy {
                    return Task::none();
                }
                if let (Some(db), Some(game)) =
                    (self.db.clone(), self.ui.games.iter().find(|g| g.id == id))
                {
                    let is_favorite = matches!(message, Ui::Favorite(_));
                    let favorite = if is_favorite {
                        !game.favorite
                    } else {
                        game.favorite
                    };
                    let hidden = if is_favorite {
                        game.hidden
                    } else {
                        !game.hidden
                    };
                    self.ui.busy = true;
                    return Task::perform(
                        async move {
                            db.set_flags(&id, favorite, hidden).await?;
                            db.games().await
                        },
                        |r| Message::Mutation(r.map_err(error_message)),
                    );
                }
            }
            Ui::AskRemove(id) => {
                if self.ui.running.contains(&id) {
                    self.ui
                        .notify("Close this game before removing its library entry.", true);
                } else {
                    self.ui.modal = Some(Modal::Remove(id));
                }
            }
            Ui::ConfirmRemove(id) => {
                if !self.ui.busy
                    && !self.ui.running.contains(&id)
                    && let Some(db) = self.db.clone()
                {
                    self.ui.busy = true;
                    return Task::perform(
                        async move {
                            db.remove_game(&id).await?;
                            db.games().await
                        },
                        |r| Message::Mutation(r.map_err(error_message)),
                    );
                }
            }
            Ui::EditMetadata => {
                if let Some(game) = self.ui.selected_game() {
                    self.ui.modal = Some(Modal::Metadata {
                        title: game.title.clone(),
                        collections: game.collections.join(", "),
                    });
                }
            }
            Ui::MetadataTitle(s) => {
                if let Some(Modal::Metadata { title, .. }) = &mut self.ui.modal {
                    *title = s;
                }
            }
            Ui::Collections(s) => {
                if let Some(Modal::Metadata { collections, .. }) = &mut self.ui.modal {
                    *collections = s;
                }
            }
            Ui::SaveMetadata => {
                if self.ui.busy {
                    return Task::none();
                }
                if let (Some(db), Some(id), Some(Modal::Metadata { title, collections })) =
                    (self.db.clone(), self.ui.selected.clone(), &self.ui.modal)
                {
                    let title = title.clone();
                    let collections: Vec<String> = collections
                        .split(',')
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(str::to_owned)
                        .collect();
                    self.ui.busy = true;
                    return Task::perform(
                        async move {
                            db.set_metadata(&id, &title, &collections, None).await?;
                            db.games().await
                        },
                        |r| Message::Mutation(r.map_err(error_message)),
                    );
                }
            }
            Ui::Accent(accent) => {
                self.ui.settings.accent = accent;
                return self.persist();
            }
            Ui::Scale(scale) => {
                self.ui.settings.scale = scale;
                return Task::batch([self.persist(), self.reset_scroll()]);
            }
            Ui::DisplayName(s) => self.ui.profile_name = s,
            Ui::SaveProfile => {
                let mut next = self.ui.settings.clone();
                next.display_name = self.ui.profile_name.trim().into();
                if let Err(e) = next.validate() {
                    self.ui.notify(e.to_string(), true);
                } else {
                    self.ui.settings = next;
                    return self.persist();
                }
            }
            Ui::AddSteamRoot => return self.pick(Pick::SteamRoot),
            Ui::AddEpicRoot => return self.pick(Pick::EpicRoot),
            Ui::RemoveRoot(steam, index) => {
                let roots = if steam {
                    &mut self.ui.settings.steam_roots
                } else {
                    &mut self.ui.settings.epic_manifest_roots
                };
                if index < roots.len() {
                    roots.remove(index);
                }
                return self.persist();
            }
            Ui::OpenDataFolder => {
                let root = self.paths.root.clone();
                return Task::perform(
                    async move {
                        tokio::task::spawn_blocking(move || NativeDesktop.open_folder(&root))
                            .await??;
                        Ok("Opened data folder".into())
                    },
                    |r: anyhow::Result<_>| Message::Notice(r.map_err(error_message)),
                );
            }
            Ui::Diagnostics => {
                if let Some(db) = self.db.clone() {
                    return Task::perform(
                        async move {
                            Ok(format!(
                                "Database integrity: {}",
                                db.integrity_check().await?
                            ))
                        },
                        |r: anyhow::Result<_>| Message::Notice(r.map_err(error_message)),
                    );
                }
            }
            Ui::DismissNotice => self.ui.notice = None,
            Ui::Fullscreen => {
                self.fullscreen = !self.fullscreen;
                let mode = if self.fullscreen {
                    window::Mode::Fullscreen
                } else {
                    window::Mode::Windowed
                };
                return window::latest().then(move |id| match id {
                    Some(id) => window::set_mode(id, mode),
                    None => Task::none(),
                });
            }
        }
        Task::none()
    }
}
