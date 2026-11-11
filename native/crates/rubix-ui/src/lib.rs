//! Native presentation only. I/O is requested through typed messages.
mod focus;
mod styles;
mod views;
use iced::{Color, widget::text_editor};
use rubix_core::{Accent, Game, Settings, Sort};
use std::{collections::BTreeSet, path::PathBuf};
pub use styles::theme;
pub use views::view;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum Page {
    #[default]
    Home,
    Library,
    Discover,
    Mods,
    Minecraft,
    Downloads,
    Friends,
    Messages,
    Clips,
    Passport,
    Settings,
}
impl Page {
    pub const ALL: [Self; 11] = [
        Self::Home,
        Self::Library,
        Self::Discover,
        Self::Mods,
        Self::Minecraft,
        Self::Downloads,
        Self::Friends,
        Self::Messages,
        Self::Clips,
        Self::Passport,
        Self::Settings,
    ];
    pub fn label(self) -> &'static str {
        match self {
            Self::Home => "Home",
            Self::Library => "Library",
            Self::Discover => "Discover",
            Self::Mods => "Mods",
            Self::Minecraft => "Minecraft",
            Self::Downloads => "Downloads",
            Self::Friends => "Friends",
            Self::Messages => "Messages",
            Self::Clips => "Clips",
            Self::Passport => "Rubix Passport",
            Self::Settings => "Settings",
        }
    }
    pub fn from_saved(s: &str) -> Self {
        Self::ALL
            .into_iter()
            .find(|p| p.label() == s)
            .unwrap_or_default()
    }
}
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum Filter {
    #[default]
    All,
    Favorites,
    Recent,
    Hidden,
}
impl Filter {
    pub fn label(self) -> &'static str {
        match self {
            Self::All => "All games",
            Self::Favorites => "Favorites",
            Self::Recent => "Recently played",
            Self::Hidden => "Hidden",
        }
    }
}

#[derive(Debug, Clone)]
pub enum Message {
    Navigate(Page),
    Query(String),
    Filter(Filter),
    Collection(Option<String>),
    Sort(Sort),
    Scrolled(f32),
    Rescan,
    AddGame,
    DismissModal,
    Title(String),
    Executable(String),
    WorkingDirectory(String),
    Arguments(text_editor::Action),
    PickExecutable,
    PickDirectory,
    PickCover,
    SaveGame,
    Select(String),
    Back,
    Launch(String),
    LaunchOption(String),
    Favorite(String),
    Hide(String),
    AskRemove(String),
    ConfirmRemove(String),
    EditMetadata,
    MetadataTitle(String),
    Collections(String),
    SaveMetadata,
    Accent(Accent),
    Scale(f32),
    DisplayName(String),
    SaveProfile,
    AddSteamRoot,
    AddEpicRoot,
    RemoveRoot(bool, usize),
    OpenDataFolder,
    Diagnostics,
    DismissNotice,
    Fullscreen,
}
#[derive(Default)]
pub struct GameForm {
    pub title: String,
    pub executable: String,
    pub directory: String,
    pub arguments: text_editor::Content,
    pub cover: Option<PathBuf>,
}
pub enum Modal {
    AddGame,
    Remove(String),
    Metadata { title: String, collections: String },
}
pub struct Model {
    pub page: Page,
    pub settings: Settings,
    pub profile_name: String,
    pub games: Vec<Game>,
    pub query: String,
    pub filter: Filter,
    pub collection: Option<String>,
    pub selected: Option<String>,
    pub launch_option: Option<String>,
    pub modal: Option<Modal>,
    pub form: GameForm,
    pub busy: bool,
    pub ready: bool,
    pub notice: Option<String>,
    pub error: bool,
    pub running: BTreeSet<String>,
    pub scroll_y: f32,
    pub width: f32,
    pub height: f32,
}
impl Model {
    pub fn new(settings: Settings) -> Self {
        Self {
            page: Page::from_saved(&settings.last_page),
            width: settings.window_width,
            height: settings.window_height,
            profile_name: settings.display_name.clone(),
            settings,
            games: Vec::new(),
            query: String::new(),
            filter: Filter::All,
            collection: None,
            selected: None,
            launch_option: None,
            modal: None,
            form: GameForm::default(),
            busy: false,
            ready: false,
            notice: None,
            error: false,
            running: BTreeSet::new(),
            scroll_y: 0.0,
        }
    }
    pub fn selected_game(&self) -> Option<&Game> {
        self.selected
            .as_ref()
            .and_then(|id| self.games.iter().find(|g| &g.id == id))
    }
    pub fn filtered_games(&self) -> Vec<&Game> {
        let mut games: Vec<_> = self
            .games
            .iter()
            .filter(|g| {
                let filter = match self.filter {
                    Filter::All => !g.hidden,
                    Filter::Favorites => !g.hidden && g.favorite,
                    Filter::Recent => !g.hidden && g.last_played.is_some(),
                    Filter::Hidden => g.hidden,
                };
                filter
                    && self
                        .collection
                        .as_ref()
                        .is_none_or(|c| g.collections.contains(c))
                    && rubix_library::matches_query(&g.title, &self.query)
            })
            .collect();
        rubix_library::sort_games(
            &mut games,
            if self.filter == Filter::Recent {
                Sort::RecentlyPlayed
            } else {
                self.settings.sort
            },
        );
        games
    }
    pub fn notify(&mut self, text: impl Into<String>, error: bool) {
        self.notice = Some(text.into());
        self.error = error;
    }
    pub fn accent(&self) -> Color {
        match self.settings.accent {
            Accent::Purple => Color::from_rgb8(174, 91, 246),
            Accent::Blue => Color::from_rgb8(94, 150, 255),
            Accent::Amber => Color::from_rgb8(237, 177, 76),
        }
    }
}
pub fn visible_rows(
    total: usize,
    columns: usize,
    offset: f32,
    viewport: f32,
) -> std::ops::Range<usize> {
    let count = total.div_ceil(columns.max(1));
    let first = ((offset.max(0.0) / views::ROW_HEIGHT).floor() as usize)
        .saturating_sub(2)
        .min(count);
    let end = (((offset.max(0.0) + viewport.max(0.0)) / views::ROW_HEIGHT).ceil() as usize + 2)
        .min(count);
    first..end.max(first)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn virtualization_is_bounded() {
        assert!(visible_rows(100_000, 4, 400_000.0, 900.0).len() <= 9);
        assert_eq!(visible_rows(0, 4, 0.0, 900.0), 0..0);
        assert!(visible_rows(3, 4, 99_000.0, 900.0).is_empty());
    }
    #[test]
    fn saved_page_recovers() {
        assert_eq!(Page::from_saved("obsolete"), Page::Home);
    }
}
