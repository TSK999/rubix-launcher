use anyhow::Result;
use rubix_core::{DataPaths, Discovery, Game, LaunchTarget, Provider, Settings};
use rubix_database::Database;
use std::time::Instant;

pub async fn run(command: &str, paths: DataPaths, settings: Settings) -> Result<()> {
    let started = Instant::now();
    let db = Database::open(&paths.database).await?;
    let report = match command {
        "--scan" => {
            let result = rubix_library::refresh(&db, settings, paths.artwork.clone()).await?;
            serde_json::json!({"games":result.games,"warnings":result.warnings,"checked_roots":result.checked_roots})
        }
        "--benchmark" => {
            let search_started = Instant::now();
            let fixture: Vec<String> = (0..10000).map(|i| format!("Fixture Game {i}")).collect();
            let prepare_ms = search_started.elapsed().as_secs_f64() * 1000.0;
            let start = Instant::now();
            let hits = fixture
                .iter()
                .filter(|t| rubix_library::matches_query(t, "fix game 999"))
                .count();
            let search_ms = start.elapsed().as_secs_f64() * 1000.0;
            // Synthetic records are confined to an explicitly separate benchmark database.
            let bench_path = paths.root.join("synthetic-benchmark.db");
            let bench = Database::open(&bench_path).await?;
            let games: Vec<_> = (1..=1000)
                .map(|i| Discovery {
                    provider: Provider::Steam,
                    external_id: i.to_string(),
                    title: format!("Synthetic fixture {i}"),
                    install_directory: paths.root.join(format!("fixture-{i}")),
                    target: LaunchTarget::Steam { app_id: i },
                    cover: None,
                })
                .collect();
            let start = Instant::now();
            bench.import(&games).await?;
            let import_ms = start.elapsed().as_secs_f64() * 1000.0;
            let start = Instant::now();
            let loaded: Vec<Game> = bench.games().await?;
            let load_ms = start.elapsed().as_secs_f64() * 1000.0;
            bench.close().await;
            serde_json::json!({"kind":"synthetic_headless_release_benchmark","platform":std::env::consts::OS,"arch":std::env::consts::ARCH,"search_records":fixture.len(),"fixture_prepare_ms":prepare_ms,"search_ms":search_ms,"search_hits":hits,"database_records":loaded.len(),"import_ms":import_ms,"load_ms":load_ms,"gui_startup_ms":null,"windows_idle_working_set_mb":null})
        }
        _ => {
            serde_json::json!({"version":env!("CARGO_PKG_VERSION"),"integrity_check":db.integrity_check().await?,"games":db.games().await?.len(),"database_open_ms":started.elapsed().as_secs_f64()*1000.0,"frontend":"iced/wgpu","network_services":false})
        }
    };
    let text = serde_json::to_string_pretty(&report)?;
    println!("{text}");
    std::fs::write(
        paths.root.join(match command {
            "--benchmark" => "benchmark.json",
            "--scan" => "scan.json",
            _ => "self-check.json",
        }),
        format!("{text}\n"),
    )?;
    db.close().await;
    Ok(())
}
