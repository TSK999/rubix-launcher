CREATE TABLE games (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
    hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),
    collections TEXT NOT NULL DEFAULT '[]',
    cover TEXT
);
CREATE TABLE installations (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    merge_key TEXT NOT NULL,
    directory TEXT NOT NULL,
    target TEXT NOT NULL,
    UNIQUE(provider, external_id)
);
CREATE INDEX installations_game ON installations(game_id);
CREATE INDEX installations_merge ON installations(merge_key);
CREATE INDEX games_title ON games(title COLLATE NOCASE);
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    checkpoint_at INTEGER NOT NULL,
    elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_seconds >= 0),
    ended_at INTEGER,
    outcome TEXT NOT NULL DEFAULT 'running'
);
CREATE INDEX sessions_game ON sessions(game_id);
CREATE INDEX sessions_running ON sessions(ended_at);
